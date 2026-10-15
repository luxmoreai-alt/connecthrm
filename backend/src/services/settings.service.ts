import { SettingsRepository } from '../repositories/settings.repository';
import { ApiError } from '../utils/apiError';
import { WorkdayOverrideType } from '../entities/WorkdayOverride.entity';
import { NotificationService } from './notification.service';

interface UpdateSettingsInput {
  companyName?: string;
  companyAddress?: string | null;
  companyLogoUrl?: string | null;
  cinNumber?: string | null;
  gstNumber?: string | null;
  payslipAdditionalFields?: Array<{ label: string; value: string }>;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  halfDayMinMinutes?: number;
  fullDayMinMinutes?: number;
  weekOffDays?: string;
  alternateSaturdayOffRule?: string;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  officeRadiusMeters?: number | null;
  geoFenceRequired?: boolean;
  allowRemoteAttendance?: boolean;
}

interface HolidayInput {
  date: string;
  name: string;
}

interface WorkdayOverrideInput {
  date: string;
  type: 'WORKING_DAY' | 'NON_WORKING_DAY';
  reason: string;
}

export class SettingsService {
  private repo: SettingsRepository;
  private notifications = new NotificationService();

  constructor() {
    this.repo = new SettingsRepository();
  }

  async getSettings() {
    let settings = await this.repo.getSettings();
    if (!settings) {
      settings = await this.repo.upsertSettings({});
    }
    return this.formatSettings(settings);
  }

  async updateSettings(input: UpdateSettingsInput) {
    const existing = await this.repo.getSettings();
    const merged = {
      ...(existing ?? {}),
      ...input,
    } as Partial<UpdateSettingsInput>;

    const isAccessUpdate =
      Object.prototype.hasOwnProperty.call(input, 'officeLatitude') ||
      Object.prototype.hasOwnProperty.call(input, 'officeLongitude') ||
      Object.prototype.hasOwnProperty.call(input, 'officeRadiusMeters') ||
      Object.prototype.hasOwnProperty.call(input, 'geoFenceRequired') ||
      Object.prototype.hasOwnProperty.call(input, 'allowRemoteAttendance');

    if (
      merged.halfDayMinMinutes != null &&
      merged.fullDayMinMinutes != null &&
      Number(merged.halfDayMinMinutes) > Number(merged.fullDayMinMinutes)
    ) {
      throw ApiError.badRequest(
        'Half-day reference minutes cannot exceed required full-day presence minutes',
        'INVALID_ATTENDANCE_MINUTES',
      );
    }

    if (merged.workStartTime && merged.workEndTime && merged.workStartTime === merged.workEndTime) {
      throw ApiError.badRequest(
        'Work start time and work end time must be different',
        'INVALID_OFFICE_TIMINGS',
      );
    }

    if (isAccessUpdate) {
      const geoFenceRequired = Boolean(merged.geoFenceRequired);
      const allowRemoteAttendance = Boolean(merged.allowRemoteAttendance);

      if (!geoFenceRequired && !allowRemoteAttendance) {
        throw ApiError.badRequest(
          'At least one attendance access mode must be enabled (Geo-fence or Remote)',
          'ATTENDANCE_ACCESS_MODE_REQUIRED',
        );
      }

      if (geoFenceRequired) {
        const hasValidLatitude =
          merged.officeLatitude != null && Number.isFinite(Number(merged.officeLatitude));
        const hasValidLongitude =
          merged.officeLongitude != null && Number.isFinite(Number(merged.officeLongitude));
        const hasValidRadius =
          merged.officeRadiusMeters != null && Number(merged.officeRadiusMeters) > 0;

        if (!hasValidLatitude || !hasValidLongitude || !hasValidRadius) {
          throw ApiError.badRequest(
            'Latitude, longitude, and radius are required when geo-fence is enabled',
            'GEOFENCE_LOCATION_REQUIRED',
          );
        }
      }
    }

    const settings = await this.repo.upsertSettings(input as any);
    return this.formatSettings(settings);
  }

  // ── Holidays ──

  async listHolidays() {
    const holidays = await this.repo.findAllHolidays();
    return {
      data: holidays.map((h) => this.formatHoliday(h)),
      total: holidays.length,
    };
  }

  async createHoliday(input: HolidayInput) {
    const existing = await this.repo.findHolidayByDate(input.date);
    if (existing) {
      throw ApiError.conflict(
        `A holiday already exists on ${input.date}`,
        'HOLIDAY_DUPLICATE_DATE',
      );
    }
    const holiday = await this.repo.createHoliday(input);
    return this.formatHoliday(holiday);
  }

  async updateHoliday(id: string, input: HolidayInput) {
    const existing = await this.repo.findHolidayById(id);
    if (!existing) {
      throw ApiError.notFound('Holiday not found', 'HOLIDAY_NOT_FOUND');
    }

    // Check duplicate date (excluding current)
    const duplicate = await this.repo.findHolidayByDate(input.date);
    if (duplicate && duplicate.id !== id) {
      throw ApiError.conflict(
        `A holiday already exists on ${input.date}`,
        'HOLIDAY_DUPLICATE_DATE',
      );
    }

    await this.repo.updateHoliday(id, input);
    const updated = await this.repo.findHolidayById(id);
    return this.formatHoliday(updated!);
  }

  async deleteHoliday(id: string) {
    const existing = await this.repo.findHolidayById(id);
    if (!existing) {
      throw ApiError.notFound('Holiday not found', 'HOLIDAY_NOT_FOUND');
    }
    await this.repo.deleteHoliday(id);
  }

  async listWorkdayOverrides(year?: number) {
    const rows = await this.repo.findAllWorkdayOverrides();
    return rows
      .filter((row) => !year || row.date.startsWith(`${year}-`))
      .map((row) => this.formatWorkdayOverride(row));
  }

  async saveWorkdayOverride(input: WorkdayOverrideInput, updatedBy: string) {
    const existing = await this.repo.findWorkdayOverrideByDate(input.date);
    const saved = await this.repo.saveWorkdayOverride({
      ...(existing ?? {}),
      date: input.date,
      type: input.type as WorkdayOverrideType,
      reason: input.reason.trim(),
      updatedBy,
    });
    const readableDate = new Date(`${input.date}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', weekday: 'long',
    });
    const title = input.type === WorkdayOverrideType.WORKING_DAY
      ? `${readableDate} is a working day`
      : `${readableDate} is a non-working day`;
    await this.notifications.notifyAll(
      'WORKDAY_UPDATE',
      title,
      input.reason.trim(),
      '/employee/holidays',
    );
    return this.formatWorkdayOverride(saved);
  }

  async deleteWorkdayOverride(id: string) {
    const existing = await this.repo.findWorkdayOverrideById(id);
    if (!existing) throw ApiError.notFound('Workday update not found', 'WORKDAY_OVERRIDE_NOT_FOUND');
    await this.repo.deleteWorkdayOverride(id);
  }

  private formatSettings(s: any) {
    return {
      id: s.id,
      companyName: s.companyName || 'Connect HR',
      companyAddress: s.companyAddress || '',
      companyLogoUrl: s.companyLogoUrl || null,
      cinNumber: s.cinNumber || '',
      gstNumber: s.gstNumber || '',
      payslipAdditionalFields: Array.isArray(s.payslipAdditionalFields) ? s.payslipAdditionalFields : [],
      workStartTime: s.workStartTime,
      workEndTime: s.workEndTime,
      lateGraceMinutes: s.lateGraceMinutes,
      halfDayMinMinutes: s.halfDayMinMinutes,
      fullDayMinMinutes: s.fullDayMinMinutes,
      weekOffDays: s.weekOffDays,
      alternateSaturdayOffRule: s.alternateSaturdayOffRule,
      officeLatitude: s.officeLatitude != null ? parseFloat(s.officeLatitude) : null,
      officeLongitude: s.officeLongitude != null ? parseFloat(s.officeLongitude) : null,
      officeRadiusMeters: s.officeRadiusMeters,
      geoFenceRequired: s.geoFenceRequired ?? true,
      allowRemoteAttendance: s.allowRemoteAttendance ?? false,
      updatedAt: s.updatedAt,
    };
  }

  private formatHoliday(h: any) {
    return {
      id: h.id,
      date: h.date,
      name: h.name,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    };
  }

  private formatWorkdayOverride(row: any) {
    return {
      id: row.id,
      date: row.date,
      type: row.type,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}


import { AttendanceV2Repository } from '../repositories/attendanceV2.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { LeaveRepository } from '../repositories/leave.repository';
import { Attendance, AttendanceStatus } from '../entities/Attendance.entity';
import { AttendancePolicy } from '../entities/AttendancePolicy.entity';
import { AttendancePunch, PunchSource, PunchType } from '../entities/AttendancePunch.entity';
import { AttendanceRegularizationRequest } from '../entities/AttendanceRegularizationRequest.entity';
import { AttendancePermissionRequest } from '../entities/AttendancePermissionRequest.entity';
import { AttendanceEmployeePolicyOverride } from '../entities/AttendanceEmployeePolicyOverride.entity';
import { AlternateSaturdayRule, OrgSettings } from '../entities/OrgSettings.entity';
import { LeavePolicy } from '../entities/LeavePolicy.entity';
import { ApiError } from '../utils/apiError';
import {
  AttendanceAccessMode,
  AttendanceDayType,
  AttendanceRequestStatus,
  AttendanceRegularizationRequestType,
  type AttendanceClassificationConfig,
  type AttendancePermissionConfig,
  type AttendanceRegularizationConfig,
} from '../attendance/attendance.enums';
import { buildDefaultAttendancePolicy } from '../attendance/defaultAttendancePolicy';
import { env } from '../config/env';
import { AppDataSource } from '../config/database';
import { ShiftAssignment } from '../entities/ShiftAssignment.entity';

interface GeoInput {
  latitude?: number;
  longitude?: number;
}

interface PunchActionInput extends GeoInput {
  punchType: PunchType;
  source?: PunchSource;
  remarks?: string;
  punchedAt?: string;
  isManualOverride?: boolean;
  photoUrl?: string;
}

interface StartWorkInput extends GeoInput {
  source?: PunchSource;
  photoUrl?: string;
}

interface EndWorkInput extends GeoInput {
  source?: PunchSource;
  eodDescription?: string;
}

interface SessionSummary {
  inTime: Date;
  outTime: Date | null;
  workedMinutes: number;
  breakAfterMinutes: number;
  sessionOrder: number;
  isAutoClosed: boolean;
  metadata: Record<string, unknown>;
}

interface SavePolicyInput {
  defaultPolicyName?: string;
  effectiveFrom?: string;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  halfDayMinMinutes?: number;
  fullDayMinMinutes?: number;
  overtimeMinMinutes?: number;
  maxEarlyOutToleranceMinutes?: number;
  allowMultiplePunchSessions?: boolean;
  autoCloseOpenSessionAtEndOfDay?: boolean;
  minimumPunchGapMinutes?: number;
  officeLatitude?: number | null;
  officeLongitude?: number | null;
  allowedRadiusMeters?: number | null;
  geoFenceRequired?: boolean;
  allowAdminOverrideForGeoFenceMiss?: boolean;
  allowRemotePunch?: boolean;
  defaultAttendanceMode?: AttendanceAccessMode;
  requireRemotePunchReason?: boolean;
  allowEmployeePolicyOverride?: boolean;
  captureLocationOnEveryPunch?: boolean;
  weekOffDays?: string;
  alternateSaturdayOffRule?: AlternateSaturdayRule;
  classificationConfig?: Partial<AttendanceClassificationConfig>;
  permissionConfig?: Partial<AttendancePermissionConfig>;
  regularizationConfig?: Partial<AttendanceRegularizationConfig>;
  policyPrecedenceConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ReviewRequestInput {
  approved: boolean;
  adminRemarks?: string;
}

interface MonthlyQuery {
  year: number;
  month: number;
}

interface AccessPolicyResolution {
  attendanceMode: AttendanceAccessMode;
  remoteAllowed: boolean;
  geoFenceRequired: boolean;
  geoFenceExempt: boolean;
  employeeOverrideApplied: boolean;
  overrideSource: 'ORG_POLICY' | 'EMPLOYEE_OVERRIDE';
}

const DEFAULT_SUMMARY_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.HALF_DAY,
  AttendanceStatus.LOP,
  AttendanceStatus.LEAVE,
  AttendanceStatus.HOLIDAY,
  AttendanceStatus.WEEK_OFF,
  AttendanceStatus.NOT_STARTED,
  AttendanceStatus.LATE,
  AttendanceStatus.PERMISSION,
  AttendanceStatus.REGULARIZED,
];

export class AttendanceService {
  private repo: AttendanceV2Repository;
  private settingsRepo: SettingsRepository;
  private leaveRepo: LeaveRepository;
  private shiftAssignmentRepo = AppDataSource.getRepository(ShiftAssignment);

  constructor() {
    this.repo = new AttendanceV2Repository();
    this.settingsRepo = new SettingsRepository();
    this.leaveRepo = new LeaveRepository();
  }

  async getActivePolicy() {
    const policy = await this.ensureActivePolicy();
    return this.mapPolicy(policy);
  }

  async listPolicyVersions() {
    const rows = await this.repo.listPolicyVersions();
    return rows.map((row) => this.mapPolicy(row));
  }

  async savePolicy(input: SavePolicyInput, actorId?: string) {
    const currentPolicy = await this.ensureActivePolicy();
    const merged = this.mergePolicyInput(currentPolicy, input);
    this.validatePolicyPayload(merged);

    const created = await this.repo.createPolicyVersion({
      ...merged,
      metadata: {
        ...(merged.metadata ?? {}),
        updatedBy: actorId ?? null,
      },
    });

    await this.repo.createAuditLog({
      actorId: actorId ?? null,
      actionType: 'ATTENDANCE_POLICY_UPDATED',
      targetType: 'ATTENDANCE_POLICY',
      targetId: created.id,
      beforeData: this.mapPolicy(currentPolicy),
      afterData: this.mapPolicy(created),
      metadata: {
        previousVersion: currentPolicy.version,
        newVersion: created.version,
      },
    });

    return this.mapPolicy(created);
  }

  async getTodayAttendance(employeeId: string) {
    return this.getTodayState(employeeId);
  }

  async getTodayState(employeeId: string) {
    const policy = await this.ensureActivePolicy();
    const now = new Date();
    const date = await this.resolveAttendanceDate(employeeId, now);
    const state = await this.buildDayState(employeeId, date, policy, false);
    const accessPolicy = await this.resolveAccessPolicy(employeeId, date, policy);
    const canPunchIn = state.nextPunchType === PunchType.CHECK_IN;

    let reasonCode = 'READY';
    let reasonMessage = 'Attendance action available';

    if (state.dayType === AttendanceDayType.HOLIDAY) {
      reasonCode = 'HOLIDAY';
      reasonMessage = 'Today is configured as a holiday';
    } else if (state.dayType === AttendanceDayType.WEEK_OFF) {
      reasonCode = 'WEEK_OFF';
      reasonMessage = 'Today is a weekly off day';
    } else if (state.dayType === AttendanceDayType.LEAVE) {
      reasonCode = 'ON_LEAVE';
      reasonMessage = 'Approved leave exists for today';
    } else if (state.dayType === ('PRE_JOINING' as AttendanceDayType)) {
      reasonCode = 'PRE_JOINING';
      reasonMessage = 'Attendance will start from your date of joining';
    } else if (state.shiftAssignment?.shift) {
      reasonMessage = `${state.shiftAssignment.shift.name}: scheduled login ${state.workStartTime.slice(0, 5)}`;
    }

    const canPunchToday = state.dayType === AttendanceDayType.WORKING;

    return {
      date,
      dayType: state.dayType,
      workStartTime: state.workStartTime,
      workEndTime: state.workEndTime,
      scheduleSource: state.shiftAssignment ? 'ALLOCATED_SHIFT' : 'ORG_DEFAULT',
      assignedShift: state.shiftAssignment
        ? {
            id: state.shiftAssignment.shift.id,
            code: state.shiftAssignment.shift.code,
            name: state.shiftAssignment.shift.name,
            startTime: state.shiftAssignment.shift.startTime,
            endTime: state.shiftAssignment.shift.endTime,
            color: state.shiftAssignment.shift.color,
            isNightShift: state.shiftAssignment.shift.isNightShift,
            note: state.shiftAssignment.note,
          }
        : null,
      lateGraceMinutes: policy.lateGraceMinutes,
      checkInWindowMinutes: policy.minimumPunchGapMinutes,
      canStartWork: canPunchToday && canPunchIn,
      canPunchToday,
      isTooLate: false,
      reasonCode,
      reasonMessage,
      todayStatus: state.record.status,
      overrideActive: Boolean(state.record.startWorkOverrideEnabled),
      nextPunchType: state.nextPunchType,
      nextPunchAction:
        state.nextPunchType === PunchType.CHECK_IN ? 'PUNCH_IN' : 'PUNCH_OUT',
      geoFence: {
        required: accessPolicy.geoFenceRequired,
        hasOfficeCoordinates:
          policy.officeLatitude != null &&
          policy.officeLongitude != null &&
          policy.allowedRadiusMeters != null,
        allowedRadiusMeters: policy.allowedRadiusMeters,
      },
      accessPolicy,
      sessions: state.sessions.map((session) => ({
        inTime: session.inTime,
        outTime: session.outTime,
        workedMinutes: session.workedMinutes,
        breakAfterMinutes: session.breakAfterMinutes,
        sessionOrder: session.sessionOrder,
        isAutoClosed: session.isAutoClosed,
      })),
      attendance: this.mapAttendanceRecord(state.record),
    };
  }
  async punchAction(employeeId: string, input: PunchActionInput) {
    const policy = await this.ensureActivePolicy();
    const punchedAt = input.punchedAt ? new Date(input.punchedAt) : new Date();
    if (Number.isNaN(punchedAt.getTime())) {
      throw ApiError.badRequest('Invalid punchedAt timestamp', 'INVALID_PUNCH_TIMESTAMP');
    }

    if (input.punchType === PunchType.CHECK_IN && !input.photoUrl) {
      throw ApiError.badRequest(
        'A live camera photo is required to punch in',
        'PUNCH_IN_PHOTO_REQUIRED',
      );
    }

    const date = await this.resolveAttendanceDate(employeeId, punchedAt);
    const stateBefore = await this.buildDayState(employeeId, date, policy, false);
    const accessPolicy = await this.resolveAccessPolicy(employeeId, date, policy);

    if (stateBefore.dayType === AttendanceDayType.HOLIDAY) {
      throw ApiError.badRequest('Punch is disabled for holidays', 'PUNCH_BLOCKED_HOLIDAY');
    }
    if (stateBefore.dayType === AttendanceDayType.WEEK_OFF) {
      throw ApiError.badRequest('Punch is disabled for weekly off days', 'PUNCH_BLOCKED_WEEKLY_OFF');
    }
    if (stateBefore.dayType === AttendanceDayType.LEAVE) {
      throw ApiError.badRequest('Punch is disabled on approved leave days', 'PUNCH_BLOCKED_LEAVE');
    }
    if (stateBefore.dayType === ('PRE_JOINING' as AttendanceDayType)) {
      throw ApiError.badRequest(
        'Punch is disabled before joining date',
        'PUNCH_BLOCKED_PRE_JOINING',
      );
    }

    if (stateBefore.nextPunchType !== input.punchType) {
      throw ApiError.badRequest(
        `Invalid punch sequence. Expected ${stateBefore.nextPunchType} next`,
        'INVALID_PUNCH_SEQUENCE',
      );
    }

    if (!policy.allowMultiplePunchSessions && stateBefore.punches.length >= 2) {
      throw ApiError.badRequest(
        'Multiple punch sessions are disabled by attendance policy',
        'MULTI_SESSION_DISABLED',
      );
    }

    const geo = this.validateGeoFence(policy, accessPolicy, input, false, input.remarks);
    const sessionOrder =
      input.punchType === PunchType.CHECK_IN
        ? stateBefore.sessions.length + 1
        : Math.max(1, stateBefore.sessions.length);

    await this.repo.createPunch({
      employeeId,
      type: input.punchType,
      time: punchedAt,
      punchDate: date,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isInsideOffice: geo.withinGeoFence,
      source: input.source ?? PunchSource.WEB,
      remarks: input.remarks ?? null,
      photoUrl: input.photoUrl ?? null,
      isManualOverride: Boolean(input.isManualOverride),
      sessionOrder,
      policyViolation: geo.policyViolation,
      metadata: {
        distanceMeters: geo.distanceMeters,
      },
    });

    const recomputed = await this.buildDayState(employeeId, date, policy, true, {
      eodDescription: input.punchType === PunchType.CHECK_OUT ? input.remarks : undefined,
    });

    await this.repo.createAuditLog({
      actorId: employeeId,
      actionType: input.punchType === PunchType.CHECK_IN ? 'PUNCH_IN' : 'PUNCH_OUT',
      targetType: 'ATTENDANCE',
      targetId: recomputed.record.id,
      beforeData: {
        status: stateBefore.record.status,
        totalWorkMinutes: stateBefore.record.totalWorkMinutes,
      },
      afterData: {
        status: recomputed.record.status,
        totalWorkMinutes: recomputed.record.totalWorkMinutes,
      },
      metadata: {
        date,
        source: input.source ?? PunchSource.WEB,
      },
    });

    return {
      attendance: this.mapAttendanceRecord(recomputed.record),
      nextPunchType: recomputed.nextPunchType,
      sessions: recomputed.sessions,
      geoFence: {
        withinGeoFence: geo.withinGeoFence,
        distanceMeters: geo.distanceMeters,
      },
    };
  }

  async startWork(employeeId: string, input: StartWorkInput = {}) {
    const result = await this.punchAction(employeeId, {
      punchType: PunchType.CHECK_IN,
      latitude: input.latitude,
      longitude: input.longitude,
      source: input.source ?? PunchSource.WEB,
      photoUrl: input.photoUrl,
    });
    return result.attendance;
  }

  async endWork(employeeId: string, input: EndWorkInput = {}) {
    const result = await this.punchAction(employeeId, {
      punchType: PunchType.CHECK_OUT,
      latitude: input.latitude,
      longitude: input.longitude,
      source: input.source ?? PunchSource.WEB,
      remarks: input.eodDescription,
    });
    return result.attendance;
  }

  async getHistory(employeeId: string, days = 30) {
    const boundedDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 180) : 30;
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - boundedDays + 1);
    const startDate = this.toDateKey(start);
    const endDate = this.toDateKey(today);

    const records = await this.repo.findMonthlyDayRecords(employeeId, startDate, endDate);
    const map = new Map<string, Attendance>();
    records.forEach((record) => map.set(record.date, record));

    const policy = await this.ensureActivePolicy();
    const response: any[] = [];

    for (let i = 0; i < boundedDays; i++) {
      const dateObj = new Date(start);
      dateObj.setDate(start.getDate() + i);
      const date = this.toDateKey(dateObj);
      const existing = map.get(date);
      if (existing) {
        response.push(this.mapAttendanceRecord(existing));
        continue;
      }
      const state = await this.buildDayState(employeeId, date, policy, false);
      response.push(this.mapAttendanceRecord(state.record));
    }

    return response.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async getEmployeeMonthlyAttendance(employeeId: string, query: MonthlyQuery) {
    const { startDate, endDate, monthDays } = this.getMonthBounds(query.year, query.month);
    const policy = await this.ensureActivePolicy();
    const [stored, profile] = await Promise.all([
      this.repo.findMonthlyDayRecords(employeeId, startDate, endDate),
      this.repo.findEmployeeProfileByUserId(employeeId),
    ]);
    const map = new Map<string, Attendance>();
    stored.forEach((row) => map.set(row.date, row));
    const joiningDate = profile?.dateOfJoining ?? null;

    const days: any[] = [];
    for (let d = 1; d <= monthDays; d++) {
      const date = this.toDateKey(new Date(query.year, query.month - 1, d));
      if (joiningDate && date < joiningDate) {
        days.push(
          this.mapAttendanceRecord({
            id: null as any,
            employeeId,
            date,
            firstCheckInAt: null,
            lastCheckOutAt: null,
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            earlyOutMinutes: 0,
            overtimeMinutes: 0,
            punchSessionsCount: 0,
            status: AttendanceStatus.NOT_STARTED,
            lateMinutes: 0,
            dayType: 'PRE_JOINING',
            missingPunch: false,
            geoFenceIssue: false,
            permissionMinutesApplied: 0,
            regularized: false,
            appliedPolicyId: policy.id,
            policyVersion: policy.version,
            statusReason: 'BEFORE_JOINING_DATE',
            derivedSummary: {
              preJoining: true,
              joiningDate,
            },
            isManualOverride: false,
            overrideReason: null,
            eodDescription: null,
            locationValidated: false,
            checkInLatitude: null,
            checkInLongitude: null,
            checkOutLatitude: null,
            checkOutLongitude: null,
            startWorkOverrideEnabled: false,
            overrideValidUntil: null,
            overrideSetBy: null,
            overrideSetAt: null,
            isAutoClosed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as Attendance),
        );
        continue;
      }
      const row = map.get(date);
      if (row) {
        days.push(this.mapAttendanceRecord(row));
        continue;
      }
      const state = await this.buildDayState(employeeId, date, policy, false);
      days.push(this.mapAttendanceRecord(state.record));
    }

    const summary = this.buildStatusSummary(days.map((day) => day.status));
    return {
      year: query.year,
      month: query.month,
      policy: this.mapPolicy(policy),
      summary,
      days,
      context: {
        joiningDate,
      },
    };
  }

  async recomputeEmployeeDateRange(employeeId: string, startDate: string, endDate: string) {
    this.assertDate(startDate);
    this.assertDate(endDate);
    if (startDate > endDate) {
      throw ApiError.badRequest(
        'End date cannot be before start date',
        'ATTENDANCE_RECOMPUTE_INVALID_RANGE',
      );
    }

    const policy = await this.ensureActivePolicy();
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    let processed = 0;

    while (cursor.getTime() <= end.getTime()) {
      const date = this.toDateKey(cursor);
      await this.buildDayState(employeeId, date, policy, true);
      processed += 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      employeeId,
      startDate,
      endDate,
      processedDates: processed,
    };
  }

  async getDayDetails(employeeId: string, date: string) {
    this.assertDate(date);
    const policy = await this.ensureActivePolicy();
    const state = await this.buildDayState(employeeId, date, policy, false);
    const accessPolicy = await this.resolveAccessPolicy(employeeId, date, policy);
    const [regularizations, permissions] = await Promise.all([
      this.repo.findRegularizationRequests({ employeeId, date }),
      this.repo.findPermissionRequests({ employeeId, date }),
    ]);
    const actionEligibility = this.buildDayActionEligibility(state.record, regularizations, permissions);

    return {
      date,
      attendance: this.mapAttendanceRecord(state.record),
      sessions: state.sessions,
      punches: state.punches,
      nextPunchType: state.nextPunchType,
      accessPolicy,
      actionEligibility,
      dayContext: this.buildDayContextLabel(state.record),
    };
  }

  async createRegularizationRequest(
    employeeId: string,
    input: {
      date: string;
      requestType: AttendanceRegularizationRequestType;
      requestedInTime?: string;
      requestedOutTime?: string;
      reason: string;
    },
  ) {
    this.assertDate(input.date);

    const policy = await this.ensureActivePolicy();
    const rule = this.getRegularizationConfig(policy);
    if (!rule.regularizationEnabled) {
      throw ApiError.badRequest(
        'Regularization is disabled by attendance policy',
        'REGULARIZATION_DISABLED',
      );
    }

    if (rule.reasonRequired && !input.reason.trim()) {
      throw ApiError.badRequest('Reason is required for regularization', 'REGULARIZATION_REASON_REQUIRED');
    }

    const backDays = this.daysDiff(input.date, this.toDateKey(new Date()));
    if (backDays > rule.maxRegularizationBackDays) {
      throw ApiError.badRequest(
        `Regularization can be raised only within ${rule.maxRegularizationBackDays} days`,
        'REGULARIZATION_WINDOW_EXCEEDED',
      );
    }

    const { monthStart, monthEnd } = this.getMonthRange(input.date);
    const monthly = await this.repo.findRegularizationRequests({
      employeeId,
      monthStart,
      monthEnd,
    });

    const activeCount = monthly.filter((row) => row.status !== AttendanceRequestStatus.REJECTED).length;
    if (activeCount >= rule.maxRegularizationsPerMonth) {
      throw ApiError.badRequest(
        `Monthly regularization limit (${rule.maxRegularizationsPerMonth}) reached`,
        'REGULARIZATION_LIMIT_REACHED',
      );
    }

    const initialStatus = rule.regularizationApprovalRequired
      ? AttendanceRequestStatus.PENDING
      : AttendanceRequestStatus.APPROVED;

    const created = await this.repo.createRegularizationRequest({
      employeeId,
      date: input.date,
      requestType: input.requestType,
      requestedInTime: input.requestedInTime ? new Date(input.requestedInTime) : null,
      requestedOutTime: input.requestedOutTime ? new Date(input.requestedOutTime) : null,
      reason: input.reason.trim(),
      status: initialStatus,
      reviewedBy: initialStatus === AttendanceRequestStatus.APPROVED ? employeeId : null,
      reviewedAt: initialStatus === AttendanceRequestStatus.APPROVED ? new Date() : null,
      metadata: {
        autoApproved: !rule.regularizationApprovalRequired,
      },
    });

    if (created.status === AttendanceRequestStatus.APPROVED) {
      await this.buildDayState(employeeId, input.date, policy, true, { forceRecomputeManualOverride: true });
    }

    await this.repo.createAuditLog({
      actorId: employeeId,
      actionType: 'REGULARIZATION_REQUEST_CREATED',
      targetType: 'ATTENDANCE_REGULARIZATION_REQUEST',
      targetId: created.id,
      afterData: created as any,
      metadata: {
        date: input.date,
      },
    });

    return this.mapRegularizationRequest(created);
  }

  async listMyRegularizationRequests(employeeId: string, status?: AttendanceRequestStatus | string) {
    const rows = await this.repo.findRegularizationRequests({ employeeId, status });
    return rows.map((row) => this.mapRegularizationRequest(row));
  }
  async createPermissionRequest(
    employeeId: string,
    input: {
      date: string;
      fromTime: string;
      toTime: string;
      reason: string;
    },
  ) {
    this.assertDate(input.date);
    this.assertTime(input.fromTime);
    this.assertTime(input.toTime);

    const policy = await this.ensureActivePolicy();
    const rule = this.getPermissionConfig(policy);
    if (!rule.permissionEnabled) {
      throw ApiError.badRequest('Permission is disabled by attendance policy', 'PERMISSION_DISABLED');
    }

    if (rule.permissionReasonRequired && !input.reason.trim()) {
      throw ApiError.badRequest('Reason is required for permission', 'PERMISSION_REASON_REQUIRED');
    }

    const totalMinutes = this.minutesBetweenTime(input.fromTime, input.toTime);
    if (totalMinutes <= 0) {
      throw ApiError.badRequest('toTime must be after fromTime', 'INVALID_PERMISSION_TIME_RANGE');
    }

    if (totalMinutes % Math.max(1, rule.minPermissionUnitMinutes) !== 0) {
      throw ApiError.badRequest(
        `Permission duration must be in multiples of ${rule.minPermissionUnitMinutes} minutes`,
        'PERMISSION_UNIT_INVALID',
      );
    }

    const { monthStart, monthEnd } = this.getMonthRange(input.date);
    const monthly = await this.repo.findPermissionRequests({ employeeId, monthStart, monthEnd });
    const notRejected = monthly.filter((row) => row.status !== AttendanceRequestStatus.REJECTED);

    if (notRejected.length >= rule.maxPermissionRequestsPerMonth) {
      throw ApiError.badRequest(
        `Monthly permission request limit (${rule.maxPermissionRequestsPerMonth}) reached`,
        'PERMISSION_REQUEST_LIMIT_REACHED',
      );
    }

    const usedHours = notRejected.reduce((sum, row) => sum + row.totalMinutes, 0) / 60;
    if (usedHours + totalMinutes / 60 > rule.maxPermissionHoursPerMonth) {
      throw ApiError.badRequest(
        `Monthly permission hour limit (${rule.maxPermissionHoursPerMonth}) exceeded`,
        'PERMISSION_HOUR_LIMIT_REACHED',
      );
    }

    const initialStatus = rule.permissionApprovalRequired
      ? AttendanceRequestStatus.PENDING
      : AttendanceRequestStatus.APPROVED;

    const created = await this.repo.createPermissionRequest({
      employeeId,
      date: input.date,
      fromTime: input.fromTime,
      toTime: input.toTime,
      totalMinutes,
      reason: input.reason.trim(),
      status: initialStatus,
      reviewedBy: initialStatus === AttendanceRequestStatus.APPROVED ? employeeId : null,
      reviewedAt: initialStatus === AttendanceRequestStatus.APPROVED ? new Date() : null,
      appliedMinutes:
        initialStatus === AttendanceRequestStatus.APPROVED && rule.canPermissionConvertShortage
          ? totalMinutes
          : 0,
      metadata: {
        autoApproved: !rule.permissionApprovalRequired,
      },
    });

    if (created.status === AttendanceRequestStatus.APPROVED) {
      await this.buildDayState(employeeId, input.date, policy, true, { forceRecomputeManualOverride: true });
    }

    await this.repo.createAuditLog({
      actorId: employeeId,
      actionType: 'PERMISSION_REQUEST_CREATED',
      targetType: 'ATTENDANCE_PERMISSION_REQUEST',
      targetId: created.id,
      afterData: created as any,
      metadata: {
        date: input.date,
      },
    });

    return this.mapPermissionRequest(created);
  }

  async listMyPermissionRequests(employeeId: string, status?: AttendanceRequestStatus | string) {
    const rows = await this.repo.findPermissionRequests({ employeeId, status });
    return rows.map((row) => this.mapPermissionRequest(row));
  }

  async getAdminPendingRequests() {
    const [pendingRegularizations, pendingPermissions] = await Promise.all([
      this.repo.findRegularizationRequests({ status: AttendanceRequestStatus.PENDING }),
      this.repo.findPermissionRequests({ status: AttendanceRequestStatus.PENDING }),
    ]);

    const employeeIds = Array.from(
      new Set([
        ...pendingRegularizations.map((row) => row.employeeId),
        ...pendingPermissions.map((row) => row.employeeId),
      ]),
    );

    const employees = await Promise.all(employeeIds.map((id) => this.repo.findEmployeeById(id)));
    const employeeMap = new Map<string, any>();
    employees.forEach((employee) => {
      if (employee) employeeMap.set(employee.id, employee);
    });

    return {
      regularizations: pendingRegularizations.map((row) => ({
        ...this.mapRegularizationRequest(row),
        employeeName: this.getEmployeeName(employeeMap.get(row.employeeId)),
        employeeCode: employeeMap.get(row.employeeId)?.empId ?? null,
      })),
      permissions: pendingPermissions.map((row) => ({
        ...this.mapPermissionRequest(row),
        employeeName: this.getEmployeeName(employeeMap.get(row.employeeId)),
        employeeCode: employeeMap.get(row.employeeId)?.empId ?? null,
      })),
    };
  }

  async listEmployeeAccessOverrides(search?: string) {
    const rows = await this.repo.listEmployeeAccessOverrides({
      search: search?.trim() || undefined,
      activeOnly: false,
    });
    return rows.map((row) => this.mapAccessOverride(row));
  }

  async getEmployeeAccessOverride(employeeId: string) {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const row = await this.repo.getEmployeeAccessOverride(employeeId);
    return {
      employeeId,
      employeeName: this.getEmployeeName(employee),
      employeeCode: employee.empId ?? null,
      override: row ? this.mapAccessOverride(row) : null,
    };
  }

  async saveEmployeeAccessOverride(
    employeeId: string,
    actorId: string,
    input: {
      overrideMode?: AttendanceAccessMode;
      geoFenceExempt?: boolean;
      remotePunchAllowed?: boolean | null;
      reason?: string;
      effectiveFrom?: string;
      effectiveUntil?: string;
      active?: boolean;
    },
  ) {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    if (
      input.effectiveFrom &&
      input.effectiveUntil &&
      input.effectiveUntil < input.effectiveFrom
    ) {
      throw ApiError.badRequest(
        'effectiveUntil must be greater than or equal to effectiveFrom',
        'INVALID_OVERRIDE_EFFECTIVE_RANGE',
      );
    }

    const policy = await this.ensureActivePolicy();
    if (!policy.allowEmployeePolicyOverride) {
      throw ApiError.badRequest(
        'Employee attendance policy overrides are disabled',
        'EMPLOYEE_OVERRIDE_DISABLED',
      );
    }

    const saved = await this.repo.saveEmployeeAccessOverride(employeeId, {
      overrideMode: input.overrideMode ?? AttendanceAccessMode.ORG_DEFAULT,
      geoFenceExempt: Boolean(input.geoFenceExempt),
      remotePunchAllowed:
        input.remotePunchAllowed === null || input.remotePunchAllowed === undefined
          ? null
          : Boolean(input.remotePunchAllowed),
      reason: input.reason?.trim() || null,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveUntil: input.effectiveUntil ?? null,
      active: input.active ?? true,
      updatedBy: actorId,
      metadata: {
        updatedBy: actorId,
      },
    });

    await this.repo.createAuditLog({
      actorId,
      actionType: 'ATTENDANCE_EMPLOYEE_OVERRIDE_SAVED',
      targetType: 'ATTENDANCE_EMPLOYEE_POLICY_OVERRIDE',
      targetId: saved.id,
      afterData: this.mapAccessOverride(saved),
      metadata: {
        employeeId,
      },
    });

    const hydrated = await this.repo.getEmployeeAccessOverride(employeeId);
    return this.mapAccessOverride(hydrated ?? saved);
  }

  async clearEmployeeAccessOverride(employeeId: string, actorId: string) {
    const existing = await this.repo.getEmployeeAccessOverride(employeeId);
    if (!existing) {
      throw ApiError.notFound(
        'Attendance access override not found',
        'ATTENDANCE_OVERRIDE_NOT_FOUND',
      );
    }

    const saved = await this.repo.saveEmployeeAccessOverride(employeeId, {
      overrideMode: AttendanceAccessMode.ORG_DEFAULT,
      geoFenceExempt: false,
      remotePunchAllowed: null,
      active: false,
      updatedBy: actorId,
      reason: existing.reason,
      metadata: {
        clearedBy: actorId,
        clearedAt: new Date().toISOString(),
      },
    });

    await this.repo.createAuditLog({
      actorId,
      actionType: 'ATTENDANCE_EMPLOYEE_OVERRIDE_CLEARED',
      targetType: 'ATTENDANCE_EMPLOYEE_POLICY_OVERRIDE',
      targetId: saved.id,
      beforeData: this.mapAccessOverride(existing),
      afterData: this.mapAccessOverride(saved),
      metadata: { employeeId },
    });

    const hydrated = await this.repo.getEmployeeAccessOverride(employeeId);
    return this.mapAccessOverride(hydrated ?? saved);
  }

  async reviewRegularizationRequest(
    requestId: string,
    actorId: string,
    input: ReviewRequestInput,
  ) {
    const request = await this.repo.findRegularizationById(requestId);
    if (!request) {
      throw ApiError.notFound('Regularization request not found', 'REGULARIZATION_REQUEST_NOT_FOUND');
    }
    if (request.status !== AttendanceRequestStatus.PENDING) {
      throw ApiError.badRequest('Request has already been reviewed', 'REQUEST_ALREADY_REVIEWED');
    }

    request.status = input.approved
      ? AttendanceRequestStatus.APPROVED
      : AttendanceRequestStatus.REJECTED;
    request.reviewedBy = actorId;
    request.reviewedAt = new Date();
    request.adminRemarks = input.adminRemarks?.trim() || null;

    const saved = await this.repo.saveRegularization(request);
    const policy = await this.ensureActivePolicy();

    if (saved.status === AttendanceRequestStatus.APPROVED) {
      await this.buildDayState(saved.employeeId, saved.date, policy, true, {
        forceRecomputeManualOverride: true,
      });
    }

    await this.repo.createAuditLog({
      actorId,
      actionType: 'REGULARIZATION_REQUEST_REVIEWED',
      targetType: 'ATTENDANCE_REGULARIZATION_REQUEST',
      targetId: saved.id,
      afterData: this.mapRegularizationRequest(saved),
      metadata: {
        approved: input.approved,
      },
    });

    return this.mapRegularizationRequest(saved);
  }

  async reviewPermissionRequest(requestId: string, actorId: string, input: ReviewRequestInput) {
    const request = await this.repo.findPermissionById(requestId);
    if (!request) {
      throw ApiError.notFound('Permission request not found', 'PERMISSION_REQUEST_NOT_FOUND');
    }
    if (request.status !== AttendanceRequestStatus.PENDING) {
      throw ApiError.badRequest('Request has already been reviewed', 'REQUEST_ALREADY_REVIEWED');
    }

    const policy = await this.ensureActivePolicy();
    const permissionConfig = this.getPermissionConfig(policy);

    request.status = input.approved
      ? AttendanceRequestStatus.APPROVED
      : AttendanceRequestStatus.REJECTED;
    request.reviewedBy = actorId;
    request.reviewedAt = new Date();
    request.adminRemarks = input.adminRemarks?.trim() || null;
    request.appliedMinutes = input.approved && permissionConfig.canPermissionConvertShortage
      ? request.totalMinutes
      : 0;

    const saved = await this.repo.savePermission(request);

    if (saved.status === AttendanceRequestStatus.APPROVED) {
      await this.buildDayState(saved.employeeId, saved.date, policy, true, {
        forceRecomputeManualOverride: true,
      });
    }

    await this.repo.createAuditLog({
      actorId,
      actionType: 'PERMISSION_REQUEST_REVIEWED',
      targetType: 'ATTENDANCE_PERMISSION_REQUEST',
      targetId: saved.id,
      afterData: this.mapPermissionRequest(saved),
      metadata: {
        approved: input.approved,
      },
    });

    return this.mapPermissionRequest(saved);
  }

  async getAdminAttendance(date: string, status?: string, search?: string, department?: string) {
    this.assertDate(date);
    const policy = await this.ensureActivePolicy();

    const employees = await this.repo.findActiveEmployees();
    const [dayRecords, leaves, holiday, profileMap, pendingRegularizations, pendingPermissions] = await Promise.all([
      this.repo.findDayRecordsByDate(date),
      this.repo.findApprovedLeavesForDate(date),
      this.repo.findHolidayByDate(date),
      this.repo.findEmployeeProfilesMap(employees.map((row) => row.id)),
      this.repo.findRegularizationRequests({ date, status: AttendanceRequestStatus.PENDING }),
      this.repo.findPermissionRequests({ date, status: AttendanceRequestStatus.PENDING }),
    ]);

    const dayRecordMap = new Map<string, Attendance>();
    dayRecords.forEach((row) => dayRecordMap.set(row.employeeId, row));

    const leaveMap = new Map<string, boolean>();
    leaves.forEach((row) => leaveMap.set(row.employeeId, true));
    const pendingRegularizationMap = new Map<string, number>();
    pendingRegularizations.forEach((row) => {
      pendingRegularizationMap.set(
        row.employeeId,
        (pendingRegularizationMap.get(row.employeeId) ?? 0) + 1,
      );
    });
    const pendingPermissionMap = new Map<string, number>();
    pendingPermissions.forEach((row) => {
      pendingPermissionMap.set(
        row.employeeId,
        (pendingPermissionMap.get(row.employeeId) ?? 0) + 1,
      );
    });

    const rows: any[] = [];
    for (const employee of employees) {
      const profile = profileMap.get(employee.id) ?? null;
      if (department && profile?.department !== department) continue;

      const fullName = this.getEmployeeName(employee);
      const searchText = `${fullName} ${employee.email ?? ''} ${employee.empId ?? ''}`.toLowerCase();
      if (search && !searchText.includes(search.toLowerCase())) continue;

      let day = dayRecordMap.get(employee.id);
      if (!day) {
        const isPreJoining = Boolean(profile?.dateOfJoining && date < profile.dateOfJoining);
        const syntheticDayType = isPreJoining
          ? ('PRE_JOINING' as AttendanceDayType)
          : holiday
            ? AttendanceDayType.HOLIDAY
            : leaveMap.has(employee.id)
              ? AttendanceDayType.LEAVE
              : this.isWeeklyOff(new Date(`${date}T00:00:00`), policy)
                ? AttendanceDayType.WEEK_OFF
                : AttendanceDayType.WORKING;

        const syntheticStatus =
          syntheticDayType === ('PRE_JOINING' as AttendanceDayType)
            ? AttendanceStatus.NOT_STARTED
            : syntheticDayType === AttendanceDayType.HOLIDAY
            ? AttendanceStatus.HOLIDAY
            : syntheticDayType === AttendanceDayType.WEEK_OFF
              ? AttendanceStatus.WEEK_OFF
              : syntheticDayType === AttendanceDayType.LEAVE
                ? AttendanceStatus.LEAVE
                : AttendanceStatus.NOT_STARTED;

        day = {
          id: null as any,
          employeeId: employee.id,
          date,
          firstCheckInAt: null,
          lastCheckOutAt: null,
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          earlyOutMinutes: 0,
          overtimeMinutes: 0,
          punchSessionsCount: 0,
          status: syntheticStatus,
          lateMinutes: 0,
          dayType: syntheticDayType,
          missingPunch: false,
          geoFenceIssue: false,
          permissionMinutesApplied: 0,
          regularized: false,
          appliedPolicyId: policy.id,
          policyVersion: policy.version,
          statusReason:
            syntheticDayType === ('PRE_JOINING' as AttendanceDayType)
              ? 'BEFORE_JOINING_DATE'
              : syntheticStatus,
          derivedSummary: {
            preJoining: syntheticDayType === ('PRE_JOINING' as AttendanceDayType),
            joiningDate: profile?.dateOfJoining ?? null,
          },
          isManualOverride: false,
          overrideReason: null,
          eodDescription: null,
          locationValidated: false,
          checkInLatitude: null,
          checkInLongitude: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          startWorkOverrideEnabled: false,
          overrideValidUntil: null,
          overrideSetBy: null,
          overrideSetAt: null,
          isAutoClosed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: employee as any,
        } as Attendance;
      }

      // Older rows and synthetic rows may still contain NOT_STARTED/LOP while a
      // working day is already due or an employee is actively checked in. Keep
      // the daily admin view aligned with the live attendance rules.
      if (day.dayType === AttendanceDayType.WORKING && date <= this.toDateKey(new Date())) {
        const hasActiveCheckIn = Boolean(day.firstCheckInAt && day.missingPunch);
        if (hasActiveCheckIn && date === this.toDateKey(new Date())) {
          const checkedInLate = day.lateMinutes > 0;
          day = {
            ...day,
            status: checkedInLate ? AttendanceStatus.HALF_DAY : AttendanceStatus.PRESENT,
            statusReason: checkedInLate ? 'LATE_CHECK_IN_HALF_DAY' : 'WORK_IN_PROGRESS',
          } as Attendance;
        } else if (day.status === AttendanceStatus.NOT_STARTED && !day.firstCheckInAt) {
          day = {
            ...day,
            status: AttendanceStatus.LOP,
            statusReason: 'NO_PUNCH',
          } as Attendance;
        }
      }

      const normalized = this.mapAdminAttendanceRecord(day, employee, profile, {
        pendingRegularizationCount: pendingRegularizationMap.get(employee.id) ?? 0,
        pendingPermissionCount: pendingPermissionMap.get(employee.id) ?? 0,
      });
      if (status && normalized.status !== status) continue;
      rows.push(normalized);
    }

    const summary = this.buildStatusSummary(rows.map((row) => row.status));

    return {
      date,
      summary,
      records: rows,
    };
  }
  async getAdminEmployeeAttendance(employeeId: string, days = 30) {
    return this.getHistory(employeeId, days);
  }

  async getAdminDayDetails(employeeId: string, date: string) {
    this.assertDate(date);
    const [employee, profile, policy, regularizations, permissions, dayDetail] = await Promise.all([
      this.repo.findEmployeeById(employeeId),
      this.repo.findEmployeeProfileByUserId(employeeId),
      this.ensureActivePolicy(),
      this.repo.findRegularizationRequests({ employeeId, date }),
      this.repo.findPermissionRequests({ employeeId, date }),
      this.getDayDetails(employeeId, date),
    ]);

    if (!employee) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    return {
      ...dayDetail,
      employee: {
        id: employee.id,
        name: this.getEmployeeName(employee),
        employeeCode: employee.empId ?? null,
        email: employee.email ?? null,
        department: profile?.department ?? null,
        designation: profile?.designation ?? null,
      },
      policySummary: {
        policyName: policy.defaultPolicyName,
        version: policy.version,
        workStartTime: policy.workStartTime,
        workEndTime: policy.workEndTime,
        halfDayMinMinutes: policy.halfDayMinMinutes,
        fullDayMinMinutes: policy.fullDayMinMinutes,
        lateGraceMinutes: policy.lateGraceMinutes,
      },
      requests: {
        regularizations: regularizations.map((row) => this.mapRegularizationRequest(row)),
        permissions: permissions.map((row) => this.mapPermissionRequest(row)),
      },
    };
  }

  async getAdminMonthlySummary(employeeId: string, query: MonthlyQuery) {
    const monthly = await this.getEmployeeMonthlyAttendance(employeeId, query);
    const dayRows = monthly.days;
    const lopDays = dayRows.filter(
      (row) => row.status === AttendanceStatus.LOP || row.status === AttendanceStatus.ABSENT,
    ).length;

    return {
      ...monthly,
      metrics: {
        presentDays: dayRows.filter((row) => row.status === AttendanceStatus.PRESENT).length,
        lateDays: dayRows.filter((row) => row.status === AttendanceStatus.LATE).length,
        absentDays: 0,
        halfDays: dayRows.filter((row) => row.status === AttendanceStatus.HALF_DAY).length,
        permissionDays: dayRows.filter((row) => row.status === AttendanceStatus.PERMISSION).length,
        regularizedDays: dayRows.filter((row) => row.status === AttendanceStatus.REGULARIZED).length,
        lopDays,
        overtimeDays: dayRows.filter((row) => row.status === AttendanceStatus.OVERTIME).length,
      },
    };
  }

  async overrideStatus(employeeId: string, date: string, status: AttendanceStatus, reason: string) {
    this.assertDate(date);
    const day = await this.repo.upsertDayRecord(employeeId, date, {
      status,
      isManualOverride: true,
      overrideReason: reason,
      statusReason: 'ADMIN_OVERRIDE',
      dayType: AttendanceDayType.WORKING,
    });

    await this.repo.createAuditLog({
      actorId: null,
      actionType: 'ATTENDANCE_STATUS_OVERRIDDEN',
      targetType: 'ATTENDANCE',
      targetId: day.id,
      afterData: this.mapAttendanceRecord(day),
      metadata: {
        reason,
        status,
      },
    });

    return this.mapAttendanceRecord(day);
  }

  async manualEntry(
    employeeId: string,
    date: string,
    input: {
      firstCheckInAt?: string;
      lastCheckOutAt?: string;
      status?: AttendanceStatus;
      reason?: string;
    },
  ) {
    this.assertDate(date);

    const firstCheckInAt = input.firstCheckInAt ? new Date(input.firstCheckInAt) : null;
    const lastCheckOutAt = input.lastCheckOutAt ? new Date(input.lastCheckOutAt) : null;

    if (
      firstCheckInAt &&
      lastCheckOutAt &&
      firstCheckInAt.getTime() > lastCheckOutAt.getTime()
    ) {
      throw ApiError.badRequest('Check-out cannot be before check-in', 'INVALID_MANUAL_TIMINGS');
    }

    const totalWorkMinutes =
      firstCheckInAt && lastCheckOutAt
        ? Math.max(0, Math.round((lastCheckOutAt.getTime() - firstCheckInAt.getTime()) / 60000))
        : 0;

    const day = await this.repo.upsertDayRecord(employeeId, date, {
      firstCheckInAt,
      lastCheckOutAt,
      totalWorkMinutes,
      totalBreakMinutes: 0,
      punchSessionsCount: firstCheckInAt ? 1 : 0,
      status: input.status ?? (totalWorkMinutes > 0 ? AttendanceStatus.PRESENT : AttendanceStatus.LOP),
      statusReason: input.reason?.trim() || 'MANUAL_ENTRY',
      overrideReason: input.reason?.trim() || null,
      isManualOverride: true,
      regularized: false,
      permissionMinutesApplied: 0,
      lateMinutes: 0,
      missingPunch: Boolean(firstCheckInAt && !lastCheckOutAt),
      dayType: AttendanceDayType.WORKING,
    });

    if (firstCheckInAt) {
      await this.repo.replaceSessions(day.id, employeeId, date, [
        {
          inTime: firstCheckInAt,
          outTime: lastCheckOutAt,
          workedMinutes: totalWorkMinutes,
          breakAfterMinutes: 0,
          sessionOrder: 1,
          isAutoClosed: false,
          metadata: { source: 'MANUAL_ENTRY' },
        },
      ]);
    } else {
      await this.repo.replaceSessions(day.id, employeeId, date, []);
    }

    return this.mapAttendanceRecord(day);
  }

  async reEnableStartWork(
    employeeId: string,
    actorId: string,
    input: { reason?: string; validUntil?: string },
  ) {
    const date = this.toDateKey(new Date());
    const validUntil = input.validUntil ? new Date(input.validUntil) : this.endOfToday();

    const day = await this.repo.upsertDayRecord(employeeId, date, {
      startWorkOverrideEnabled: true,
      overrideSetBy: actorId,
      overrideSetAt: new Date(),
      overrideValidUntil: validUntil,
      overrideReason: input.reason?.trim() || 'Admin re-enabled start work',
    });

    await this.repo.createAuditLog({
      actorId,
      actionType: 'START_WORK_RE_ENABLED',
      targetType: 'ATTENDANCE',
      targetId: day.id,
      metadata: {
        employeeId,
        validUntil,
      },
    });

    return this.mapAttendanceRecord(day);
  }

  private async ensureActivePolicy(): Promise<AttendancePolicy> {
    const [existing, org, leavePolicy] = await Promise.all([
      this.repo.getActivePolicy(),
      this.settingsRepo.getSettings(),
      this.leaveRepo.getPolicy(),
    ]);
    if (existing) {
      return this.applyPrimarySourceOverrides(existing, org, leavePolicy);
    }

    const defaults = buildDefaultAttendancePolicy({
      workStartTime: org?.workStartTime,
      workEndTime: org?.workEndTime,
      lateGraceMinutes: org?.lateGraceMinutes,
      halfDayMinMinutes: org?.halfDayMinMinutes,
      fullDayMinMinutes: org?.fullDayMinMinutes,
      officeLatitude: org?.officeLatitude ?? null,
      officeLongitude: org?.officeLongitude ?? null,
      officeRadiusMeters: org?.officeRadiusMeters ?? null,
      weekOffDays: org?.weekOffDays,
      alternateSaturdayOffRule: org?.alternateSaturdayOffRule,
    });

    const created = await this.repo.createPolicyVersion(defaults);
    return this.applyPrimarySourceOverrides(created, org, leavePolicy);
  }

  private applyPrimarySourceOverrides(
    policy: AttendancePolicy,
    org: OrgSettings | null,
    leavePolicy: LeavePolicy | null,
  ): AttendancePolicy {
    const merged = this.mergePolicyDefaults(policy);

    if (org) {
      merged.workStartTime = org.workStartTime ?? merged.workStartTime;
      merged.workEndTime = org.workEndTime ?? merged.workEndTime;
      merged.lateGraceMinutes = org.lateGraceMinutes ?? merged.lateGraceMinutes;
      merged.halfDayMinMinutes = org.halfDayMinMinutes ?? merged.halfDayMinMinutes;
      merged.fullDayMinMinutes = org.fullDayMinMinutes ?? merged.fullDayMinMinutes;
      merged.weekOffDays = org.weekOffDays ?? merged.weekOffDays;
      merged.alternateSaturdayOffRule =
        org.alternateSaturdayOffRule ?? merged.alternateSaturdayOffRule;
      merged.officeLatitude =
        org.officeLatitude != null ? Number(org.officeLatitude) : null;
      merged.officeLongitude =
        org.officeLongitude != null ? Number(org.officeLongitude) : null;
      merged.allowedRadiusMeters = org.officeRadiusMeters ?? null;

      const geoFenceConfigured =
        merged.officeLatitude != null &&
        merged.officeLongitude != null &&
        merged.allowedRadiusMeters != null &&
        merged.allowedRadiusMeters > 0;

      merged.geoFenceRequired = Boolean(org.geoFenceRequired);
      merged.allowRemotePunch = Boolean(org.allowRemoteAttendance);

      if (merged.geoFenceRequired && !geoFenceConfigured) {
        // Defensive fallback for legacy/misaligned records.
        merged.geoFenceRequired = false;
      }

      if (!merged.geoFenceRequired && !merged.allowRemotePunch) {
        // Keep attendance operable if both flags are disabled accidentally.
        merged.allowRemotePunch = true;
      }

      merged.defaultAttendanceMode =
        merged.geoFenceRequired && merged.allowRemotePunch
          ? AttendanceAccessMode.HYBRID
          : merged.geoFenceRequired
            ? AttendanceAccessMode.GEO_FENCE_ONLY
            : AttendanceAccessMode.REMOTE_ALLOWED;
    }

    merged.classificationConfig = {
      ...this.getClassificationConfig(merged),
      presentMinMinutes: merged.fullDayMinMinutes,
      halfDayMinMinutes: merged.halfDayMinMinutes,
    };

    if (leavePolicy) {
      merged.permissionConfig = {
        ...this.getPermissionConfig(merged),
        permissionEnabled: Boolean(leavePolicy.allowPermissionHours),
        maxPermissionHoursPerMonth: Number(leavePolicy.maxPermissionHoursPerMonth),
        maxPermissionRequestsPerMonth: Number(leavePolicy.maxPermissionRequestsPerMonth),
      };
      merged.regularizationConfig = {
        ...this.getRegularizationConfig(merged),
        maxRegularizationsPerMonth: Number(leavePolicy.maxRegularizationsPerMonth),
      };
    }

    return merged;
  }

  private mergePolicyDefaults(policy: AttendancePolicy): AttendancePolicy {
    const defaults = buildDefaultAttendancePolicy();
    policy.defaultAttendanceMode = this.resolvePolicyMode(policy) ?? defaults.defaultAttendanceMode;
    policy.requireRemotePunchReason =
      policy.requireRemotePunchReason ?? defaults.requireRemotePunchReason;
    policy.allowEmployeePolicyOverride =
      policy.allowEmployeePolicyOverride ?? defaults.allowEmployeePolicyOverride;
    policy.classificationConfig = {
      ...defaults.classificationConfig,
      ...(policy.classificationConfig ?? {}),
    };
    policy.permissionConfig = {
      ...defaults.permissionConfig,
      ...(policy.permissionConfig ?? {}),
    };
    policy.regularizationConfig = {
      ...defaults.regularizationConfig,
      ...(policy.regularizationConfig ?? {}),
    };
    policy.policyPrecedenceConfig = {
      ...(defaults.policyPrecedenceConfig ?? {}),
      ...(policy.policyPrecedenceConfig ?? {}),
    };
    return policy;
  }

  private mergePolicyInput(current: AttendancePolicy, input: SavePolicyInput): AttendancePolicy {
    const merged = this.mergePolicyDefaults({ ...current } as AttendancePolicy);
    Object.assign(merged, {
      defaultPolicyName: input.defaultPolicyName ?? merged.defaultPolicyName,
      effectiveFrom: input.effectiveFrom ?? this.toDateKey(new Date()),
      workStartTime: input.workStartTime ?? merged.workStartTime,
      workEndTime: input.workEndTime ?? merged.workEndTime,
      lateGraceMinutes: input.lateGraceMinutes ?? merged.lateGraceMinutes,
      halfDayMinMinutes: input.halfDayMinMinutes ?? merged.halfDayMinMinutes,
      fullDayMinMinutes: input.fullDayMinMinutes ?? merged.fullDayMinMinutes,
      overtimeMinMinutes: input.overtimeMinMinutes ?? merged.overtimeMinMinutes,
      maxEarlyOutToleranceMinutes:
        input.maxEarlyOutToleranceMinutes ?? merged.maxEarlyOutToleranceMinutes,
      allowMultiplePunchSessions:
        input.allowMultiplePunchSessions ?? merged.allowMultiplePunchSessions,
      autoCloseOpenSessionAtEndOfDay:
        input.autoCloseOpenSessionAtEndOfDay ?? merged.autoCloseOpenSessionAtEndOfDay,
      minimumPunchGapMinutes: input.minimumPunchGapMinutes ?? merged.minimumPunchGapMinutes,
      officeLatitude: input.officeLatitude ?? merged.officeLatitude,
      officeLongitude: input.officeLongitude ?? merged.officeLongitude,
      allowedRadiusMeters: input.allowedRadiusMeters ?? merged.allowedRadiusMeters,
      geoFenceRequired: input.geoFenceRequired ?? merged.geoFenceRequired,
      allowAdminOverrideForGeoFenceMiss:
        input.allowAdminOverrideForGeoFenceMiss ?? merged.allowAdminOverrideForGeoFenceMiss,
      allowRemotePunch: input.allowRemotePunch ?? merged.allowRemotePunch,
      defaultAttendanceMode:
        input.defaultAttendanceMode ?? (merged.defaultAttendanceMode as AttendanceAccessMode),
      requireRemotePunchReason:
        input.requireRemotePunchReason ?? merged.requireRemotePunchReason,
      allowEmployeePolicyOverride:
        input.allowEmployeePolicyOverride ?? merged.allowEmployeePolicyOverride,
      captureLocationOnEveryPunch:
        input.captureLocationOnEveryPunch ?? merged.captureLocationOnEveryPunch,
      weekOffDays: input.weekOffDays ?? merged.weekOffDays,
      alternateSaturdayOffRule:
        input.alternateSaturdayOffRule ?? merged.alternateSaturdayOffRule,
      classificationConfig: {
        ...this.getClassificationConfig(merged),
        ...(input.classificationConfig ?? {}),
      },
      permissionConfig: {
        ...this.getPermissionConfig(merged),
        ...(input.permissionConfig ?? {}),
      },
      regularizationConfig: {
        ...this.getRegularizationConfig(merged),
        ...(input.regularizationConfig ?? {}),
      },
      policyPrecedenceConfig: {
        ...(merged.policyPrecedenceConfig ?? {}),
        ...(input.policyPrecedenceConfig ?? {}),
      },
      metadata: {
        ...(merged.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    });

    const mode = merged.defaultAttendanceMode as AttendanceAccessMode;
    if (mode === AttendanceAccessMode.GEO_FENCE_ONLY) {
      merged.geoFenceRequired = true;
      merged.allowRemotePunch = false;
    } else if (mode === AttendanceAccessMode.REMOTE_ALLOWED) {
      merged.geoFenceRequired = false;
      merged.allowRemotePunch = true;
    } else if (mode === AttendanceAccessMode.HYBRID) {
      merged.geoFenceRequired = true;
      merged.allowRemotePunch = true;
    }

    return merged;
  }

  private validatePolicyPayload(policy: AttendancePolicy) {
    this.assertTime(policy.workStartTime);
    this.assertTime(policy.workEndTime);

    if (policy.fullDayMinMinutes <= 0 || policy.halfDayMinMinutes <= 0) {
      throw ApiError.badRequest('Full day and half day thresholds must be positive', 'INVALID_DAY_THRESHOLDS');
    }
    if (policy.halfDayMinMinutes > policy.fullDayMinMinutes) {
      throw ApiError.badRequest('Half-day minutes cannot exceed full-day minutes', 'INVALID_HALF_DAY_THRESHOLD');
    }
    if (policy.minimumPunchGapMinutes < 0) {
      throw ApiError.badRequest('minimumPunchGapMinutes cannot be negative', 'INVALID_MIN_PUNCH_GAP');
    }
    if (policy.allowedRadiusMeters != null && policy.allowedRadiusMeters <= 0) {
      throw ApiError.badRequest('allowedRadiusMeters must be greater than 0', 'INVALID_GEOFENCE_RADIUS');
    }
    if (
      ![
        AttendanceAccessMode.GEO_FENCE_ONLY,
        AttendanceAccessMode.REMOTE_ALLOWED,
        AttendanceAccessMode.HYBRID,
      ].includes(policy.defaultAttendanceMode as AttendanceAccessMode)
    ) {
      throw ApiError.badRequest(
        'Invalid defaultAttendanceMode',
        'INVALID_ATTENDANCE_ACCESS_MODE',
      );
    }

    const permission = this.getPermissionConfig(policy);
    if (permission.maxPermissionHoursPerMonth < 0 || permission.maxPermissionRequestsPerMonth < 0) {
      throw ApiError.badRequest('Permission limits cannot be negative', 'INVALID_PERMISSION_LIMITS');
    }

    const regularization = this.getRegularizationConfig(policy);
    if (regularization.maxRegularizationsPerMonth < 0 || regularization.maxRegularizationBackDays < 0) {
      throw ApiError.badRequest('Regularization limits cannot be negative', 'INVALID_REGULARIZATION_LIMITS');
    }
  }
  private async buildDayState(
    employeeId: string,
    date: string,
    policy: AttendancePolicy,
    persist: boolean,
    options?: {
      eodDescription?: string;
      forceRecomputeManualOverride?: boolean;
    },
  ) {
    const [existing, leave, holiday, approvedPermission, approvedRegularization, punches, profile, shiftAssignment] =
      await Promise.all([
      this.repo.findDayRecord(employeeId, date),
      this.repo.findApprovedLeaveForEmployeeDate(employeeId, date),
      this.repo.findHolidayByDate(date),
      this.repo.findApprovedPermissionForDate(employeeId, date),
      this.repo.findApprovedRegularizationForDate(employeeId, date),
      this.repo.findPunchesByEmployeeAndDate(employeeId, this.startOfDay(date), this.endOfDay(date), date),
      this.repo.findEmployeeProfileByUserId(employeeId),
      this.shiftAssignmentRepo.findOne({
        where: { employeeId, shiftDate: date },
        relations: { shift: true },
      }),
    ]);

    const dayPolicy = shiftAssignment?.shift
      ? ({
          ...policy,
          workStartTime: shiftAssignment.shift.startTime,
          workEndTime: shiftAssignment.shift.endTime,
        } as AttendancePolicy)
      : policy;

    if (existing?.isManualOverride && !options?.forceRecomputeManualOverride) {
      const sessions = await this.repo.findSessionsByAttendanceId(existing.id);
      return {
        record: existing,
        sessions: sessions.map((row) => ({
          inTime: row.inTime,
          outTime: row.outTime,
          workedMinutes: row.workedMinutes,
          breakAfterMinutes: row.breakAfterMinutes,
          sessionOrder: row.sessionOrder,
          isAutoClosed: row.isAutoClosed,
          metadata: row.metadata,
        })),
        punches,
        dayType: existing.dayType,
        nextPunchType: this.getExpectedNextPunchType(punches),
        workStartTime: dayPolicy.workStartTime,
        workEndTime: dayPolicy.workEndTime,
        shiftAssignment,
      };
    }

    let dayType =
      profile?.dateOfJoining && date < profile.dateOfJoining
        ? ('PRE_JOINING' as AttendanceDayType)
        : this.resolveDayType(date, dayPolicy, {
            holidayApplied: Boolean(holiday),
            leaveApplied: Boolean(leave),
          });

    // A deliberate shift assignment turns an otherwise weekly-off day into a
    // working day. Holiday and approved-leave precedence remain unchanged.
    if (shiftAssignment && dayType === AttendanceDayType.WEEK_OFF) {
      dayType = AttendanceDayType.WORKING;
    }

    const sessions = this.buildSessions(date, punches, dayPolicy);
    const patchedSessions = this.applyRegularizationToSessions(sessions, approvedRegularization, date);

    const stats = this.calculateDayStats(
      date,
      patchedSessions,
      dayPolicy,
      approvedPermission,
      approvedRegularization,
    );
    const accessPolicy = await this.resolveAccessPolicy(employeeId, date, policy);

    const statusResult = this.deriveFinalStatus({
      date,
      dayType,
      stats,
      policy: dayPolicy,
      hasPunches: punches.length > 0,
      hasRegularization: Boolean(approvedRegularization),
      hasPermission: stats.permissionMinutesApplied > 0,
    });

    const payload: Partial<Attendance> = {
      employeeId,
      date,
      firstCheckInAt: stats.firstPunchIn,
      lastCheckOutAt: stats.lastPunchOut,
      totalWorkMinutes: stats.totalWorkedMinutes,
      totalBreakMinutes: stats.totalBreakMinutes,
      earlyOutMinutes: stats.earlyOutMinutes,
      overtimeMinutes: stats.overtimeMinutes,
      punchSessionsCount: patchedSessions.length,
      lateMinutes: stats.lateByMinutes,
      dayType,
      missingPunch: stats.missingPunch,
      geoFenceIssue: punches.some(
        (punch) => punch.policyViolation || (accessPolicy.geoFenceRequired && !punch.isInsideOffice),
      ),
      permissionMinutesApplied: stats.permissionMinutesApplied,
      regularized: Boolean(approvedRegularization),
      appliedPolicyId: policy.id,
      policyVersion: policy.version,
      status: statusResult.status,
      statusReason: statusResult.reason,
      derivedSummary: {
        preJoining: dayType === ('PRE_JOINING' as AttendanceDayType),
        joiningDate: profile?.dateOfJoining ?? null,
        sessions: patchedSessions.length,
        leaveApplied: Boolean(leave),
        leaveType: leave ? leave.approvedLeaveType ?? leave.leaveType : null,
        holidayApplied: Boolean(holiday),
        holidayName: holiday?.name ?? null,
        weeklyOffApplied: dayType === AttendanceDayType.WEEK_OFF,
        permissionApplied: stats.permissionMinutesApplied,
        regularizationApplied: Boolean(approvedRegularization),
        shiftAssignmentId: shiftAssignment?.id ?? null,
        shiftCode: shiftAssignment?.shift?.code ?? null,
        scheduledStartTime: dayPolicy.workStartTime,
        scheduledEndTime: dayPolicy.workEndTime,
      },
      isAutoClosed: patchedSessions.some((session) => session.isAutoClosed),
      locationValidated:
        punches.length > 0
          ? accessPolicy.geoFenceRequired
            ? punches.every((p) => p.isInsideOffice)
            : true
          : false,
      checkInLatitude: punches.find((punch) => punch.type === PunchType.CHECK_IN)?.latitude ?? null,
      checkInLongitude: punches.find((punch) => punch.type === PunchType.CHECK_IN)?.longitude ?? null,
      checkOutLatitude:
        [...punches]
          .reverse()
          .find((punch) => punch.type === PunchType.CHECK_OUT)?.latitude ?? null,
      checkOutLongitude:
        [...punches]
          .reverse()
          .find((punch) => punch.type === PunchType.CHECK_OUT)?.longitude ?? null,
      eodDescription: options?.eodDescription ?? existing?.eodDescription ?? null,
      isManualOverride: false,
      overrideReason: existing?.overrideReason ?? null,
      startWorkOverrideEnabled:
        existing?.startWorkOverrideEnabled &&
        (!existing.overrideValidUntil || existing.overrideValidUntil.getTime() > Date.now()),
      overrideValidUntil: existing?.overrideValidUntil ?? null,
      overrideSetAt: existing?.overrideSetAt ?? null,
      overrideSetBy: existing?.overrideSetBy ?? null,
    };

    let record: Attendance;
    if (persist) {
      record = await this.repo.upsertDayRecord(employeeId, date, payload);
      await this.repo.replaceSessions(
        record.id,
        employeeId,
        date,
        patchedSessions.map((session) => ({
          inTime: session.inTime,
          outTime: session.outTime,
          workedMinutes: session.workedMinutes,
          breakAfterMinutes: session.breakAfterMinutes,
          sessionOrder: session.sessionOrder,
          isAutoClosed: session.isAutoClosed,
          metadata: session.metadata,
        })),
      );
    } else {
      record = {
        ...(existing ?? {}),
        ...payload,
      } as Attendance;
    }

    return {
      record,
      sessions: patchedSessions,
      punches,
      dayType,
      nextPunchType: this.getExpectedNextPunchType(punches),
      workStartTime: dayPolicy.workStartTime,
      workEndTime: dayPolicy.workEndTime,
      shiftAssignment,
    };
  }

  private resolveDayType(
    date: string,
    policy: AttendancePolicy,
    flags: { holidayApplied: boolean; leaveApplied: boolean },
  ): AttendanceDayType {
    const classification = this.getClassificationConfig(policy);
    const weeklyOff = this.isWeeklyOff(new Date(`${date}T00:00:00`), policy);

    if (classification.holidayPrecedence && flags.holidayApplied) return AttendanceDayType.HOLIDAY;
    if (classification.leavePrecedence && flags.leaveApplied) return AttendanceDayType.LEAVE;
    if (classification.weeklyOffPrecedence && weeklyOff) return AttendanceDayType.WEEK_OFF;

    if (flags.holidayApplied) return AttendanceDayType.HOLIDAY;
    if (flags.leaveApplied) return AttendanceDayType.LEAVE;
    if (weeklyOff) return AttendanceDayType.WEEK_OFF;
    return AttendanceDayType.WORKING;
  }

  private buildSessions(date: string, punches: AttendancePunch[], policy: AttendancePolicy): SessionSummary[] {
    const sessions: SessionSummary[] = [];
    let openIn: Date | null = null;
    let order = 1;

    for (const punch of punches) {
      if (punch.type === PunchType.CHECK_IN) {
        if (openIn) {
          sessions.push({
            inTime: openIn,
            outTime: null,
            workedMinutes: 0,
            breakAfterMinutes: 0,
            sessionOrder: order,
            isAutoClosed: false,
            metadata: { missingOutPunch: true },
          });
          order += 1;
        }
        openIn = punch.time;
      } else if (punch.type === PunchType.CHECK_OUT) {
        if (!openIn) {
          sessions.push({
            inTime: punch.time,
            outTime: punch.time,
            workedMinutes: 0,
            breakAfterMinutes: 0,
            sessionOrder: order,
            isAutoClosed: false,
            metadata: { unmatchedOutPunch: true },
          });
          order += 1;
          continue;
        }

        const worked = Math.max(0, this.minutesBetween(openIn, punch.time));
        sessions.push({
          inTime: openIn,
          outTime: punch.time,
          workedMinutes: worked,
          breakAfterMinutes: 0,
          sessionOrder: order,
          isAutoClosed: false,
          metadata: {},
        });
        order += 1;
        openIn = null;
      }
    }

    if (openIn) {
      const shouldAutoClose = this.shouldAutoCloseSession(date, policy);
      if (shouldAutoClose) {
        const closeTime = this.resolveAutoCloseTime(date, policy);
        sessions.push({
          inTime: openIn,
          outTime: closeTime,
          workedMinutes: Math.max(0, this.minutesBetween(openIn, closeTime)),
          breakAfterMinutes: 0,
          sessionOrder: order,
          isAutoClosed: true,
          metadata: { autoClosed: true },
        });
      } else {
        sessions.push({
          inTime: openIn,
          outTime: null,
          workedMinutes: 0,
          breakAfterMinutes: 0,
          sessionOrder: order,
          isAutoClosed: false,
          metadata: { openSession: true },
        });
      }
    }

    for (let i = 0; i < sessions.length - 1; i++) {
      const current = sessions[i];
      const next = sessions[i + 1];
      if (current.outTime) {
        current.breakAfterMinutes = Math.max(0, this.minutesBetween(current.outTime, next.inTime));
      }
    }

    return sessions;
  }
  private applyRegularizationToSessions(
    sessions: SessionSummary[],
    regularization: AttendanceRegularizationRequest | null,
    date: string,
  ) {
    if (!regularization || regularization.status !== AttendanceRequestStatus.APPROVED) {
      return sessions;
    }

    const result = [...sessions];

    if (regularization.requestedInTime) {
      if (result.length === 0) {
        result.push({
          inTime: regularization.requestedInTime,
          outTime: regularization.requestedOutTime ?? null,
          workedMinutes: regularization.requestedOutTime
            ? Math.max(0, this.minutesBetween(regularization.requestedInTime, regularization.requestedOutTime))
            : 0,
          breakAfterMinutes: 0,
          sessionOrder: 1,
          isAutoClosed: false,
          metadata: { regularized: true },
        });
      } else {
        result[0] = {
          ...result[0],
          inTime: regularization.requestedInTime,
          workedMinutes:
            result[0].outTime
              ? Math.max(0, this.minutesBetween(regularization.requestedInTime, result[0].outTime))
              : 0,
          metadata: {
            ...result[0].metadata,
            regularizedInTime: true,
          },
        };
      }
    }

    if (regularization.requestedOutTime && result.length > 0) {
      const lastIndex = result.length - 1;
      const last = result[lastIndex];
      result[lastIndex] = {
        ...last,
        outTime: regularization.requestedOutTime,
        workedMinutes: Math.max(0, this.minutesBetween(last.inTime, regularization.requestedOutTime)),
        metadata: {
          ...last.metadata,
          regularizedOutTime: true,
        },
      };
    }

    for (let i = 0; i < result.length - 1; i++) {
      const current = result[i];
      const next = result[i + 1];
      current.breakAfterMinutes = current.outTime
        ? Math.max(0, this.minutesBetween(current.outTime, next.inTime))
        : 0;
    }

    if (result.length > 0) {
      result.forEach((session, index) => {
        session.sessionOrder = index + 1;
      });
    }

    if (result.length === 0 && regularization.requestedInTime) {
      return [
        {
          inTime: regularization.requestedInTime,
          outTime: regularization.requestedOutTime,
          workedMinutes:
            regularization.requestedOutTime
              ? Math.max(
                  0,
                  this.minutesBetween(regularization.requestedInTime, regularization.requestedOutTime),
                )
              : 0,
          breakAfterMinutes: 0,
          sessionOrder: 1,
          isAutoClosed: false,
          metadata: { regularized: true, date },
        },
      ];
    }

    return result;
  }

  private calculateDayStats(
    date: string,
    sessions: SessionSummary[],
    policy: AttendancePolicy,
    permissionRequests: AttendancePermissionRequest[],
    regularization: AttendanceRegularizationRequest | null,
  ) {
    const now = new Date();
    const isToday = date === this.toDateKey(now);

    let totalWorkedMinutes = 0;
    let totalBreakMinutes = 0;
    let firstPunchIn: Date | null = null;
    let lastPunchOut: Date | null = null;
    let missingPunch = false;

    sessions.forEach((session, index) => {
      if (!firstPunchIn || firstPunchIn.getTime() > session.inTime.getTime()) {
        firstPunchIn = session.inTime;
      }

      if (session.outTime) {
        lastPunchOut = session.outTime;
        totalWorkedMinutes += session.workedMinutes;
      } else if (isToday) {
        totalWorkedMinutes += Math.max(0, this.minutesBetween(session.inTime, now));
        missingPunch = true;
      } else {
        missingPunch = true;
      }

      if (index < sessions.length - 1) {
        totalBreakMinutes += session.breakAfterMinutes;
      }
    });

    const shiftStart = this.combineDateTime(date, policy.workStartTime);
    const shiftEnd = this.scheduledShiftEnd(date, policy.workStartTime, policy.workEndTime);

    const lateByMinutes = firstPunchIn
      ? Math.max(0, this.minutesBetween(this.addMinutes(shiftStart, policy.lateGraceMinutes), firstPunchIn))
      : 0;

    // There is no checkout grace: leaving before the configured office end
    // time is an early-out and therefore receives half-day treatment.
    const earlyOutMinutes = lastPunchOut
      ? Math.max(0, this.minutesBetween(lastPunchOut, shiftEnd))
      : 0;

    const permissionMinutesAvailable = permissionRequests.reduce((sum, request) => {
      return sum + (request.appliedMinutes > 0 ? request.appliedMinutes : request.totalMinutes);
    }, 0);

    const permissionConfig = this.getPermissionConfig(policy);
    const shortageAgainstFullDay = Math.max(0, policy.fullDayMinMinutes - totalWorkedMinutes);
    const permissionMinutesApplied = permissionConfig.canPermissionConvertShortage
      ? Math.min(permissionMinutesAvailable, shortageAgainstFullDay)
      : 0;

    const effectiveWorked = totalWorkedMinutes + permissionMinutesApplied;
    const overtimeMinutes = Math.max(0, effectiveWorked - policy.fullDayMinMinutes);

    if (
      sessions.some(
        (session) =>
          session.outTime == null ||
          session.isAutoClosed ||
          Boolean(session.metadata?.missingOutPunch) ||
          Boolean(session.metadata?.unmatchedOutPunch),
      )
    ) {
      missingPunch = true;
    }

    if (regularization && regularization.status === AttendanceRequestStatus.APPROVED) {
      missingPunch = false;
    }

    return {
      firstPunchIn,
      lastPunchOut,
      totalWorkedMinutes,
      totalBreakMinutes,
      lateByMinutes,
      earlyOutMinutes,
      overtimeMinutes,
      permissionMinutesApplied,
      effectiveWorked,
      missingPunch,
      hasOpenSession: sessions.some((session) => session.outTime == null),
    };
  }

  private deriveFinalStatus(params: {
    date: string;
    dayType: AttendanceDayType;
    stats: {
      effectiveWorked: number;
      lateByMinutes: number;
      earlyOutMinutes: number;
      overtimeMinutes: number;
      permissionMinutesApplied: number;
      missingPunch: boolean;
      hasOpenSession: boolean;
    };
    policy: AttendancePolicy;
    hasPunches: boolean;
    hasRegularization: boolean;
    hasPermission: boolean;
  }): { status: AttendanceStatus; reason: string } {
    if (params.dayType === AttendanceDayType.HOLIDAY) {
      return { status: AttendanceStatus.HOLIDAY, reason: 'HOLIDAY_PRECEDENCE' };
    }
    if (params.dayType === AttendanceDayType.WEEK_OFF) {
      return { status: AttendanceStatus.WEEK_OFF, reason: 'WEEKLY_OFF_PRECEDENCE' };
    }
    if (params.dayType === AttendanceDayType.LEAVE) {
      return { status: AttendanceStatus.LEAVE, reason: 'LEAVE_PRECEDENCE' };
    }
    if (params.dayType === ('PRE_JOINING' as AttendanceDayType)) {
      return { status: AttendanceStatus.NOT_STARTED, reason: 'BEFORE_JOINING_DATE' };
    }

    if (!params.hasPunches) {
      const today = this.toDateKey(new Date());
      if (params.date > today) {
        return { status: AttendanceStatus.NOT_STARTED, reason: 'FUTURE_DATE' };
      }
      return { status: AttendanceStatus.LOP, reason: 'NO_PUNCH' };
    }

    // A check-in beyond the configured grace period is a half day. Approved
    // regularization can move the effective first-in time back within the
    // allowed window and will naturally clear lateByMinutes.
    if (params.stats.lateByMinutes > 0) {
      return { status: AttendanceStatus.HALF_DAY, reason: 'LATE_CHECK_IN_HALF_DAY' };
    }

    // Do not classify an active shift as LOP simply because the employee has
    // not yet accumulated the full-day threshold. Final hours are evaluated
    // after checkout/end-of-day.
    if (params.date === this.toDateKey(new Date()) && params.stats.hasOpenSession) {
      return { status: AttendanceStatus.PRESENT, reason: 'WORK_IN_PROGRESS' };
    }

    // Once an employee has punched in, every failed full-day condition is a
    // half day: early checkout, missing checkout, or fewer required work
    // minutes. A complete no-punch day remains full LOP above.
    let status = AttendanceStatus.PRESENT;
    let reason = 'FULL_DAY_REQUIREMENTS_MET';
    if (params.stats.missingPunch) {
      status = AttendanceStatus.HALF_DAY;
      reason = 'MISSING_CHECK_OUT_HALF_DAY';
    } else if (params.stats.earlyOutMinutes > 0) {
      status = AttendanceStatus.HALF_DAY;
      reason = 'EARLY_CHECK_OUT_HALF_DAY';
    } else if (params.stats.effectiveWorked < params.policy.fullDayMinMinutes) {
      status = AttendanceStatus.HALF_DAY;
      reason = 'INSUFFICIENT_WORK_HOURS_HALF_DAY';
    }

    if (params.hasPermission && params.stats.permissionMinutesApplied > 0) {
      reason = status === AttendanceStatus.PRESENT
        ? 'FULL_DAY_PERMISSION_ADJUSTED'
        : `${reason}_PERMISSION_ADJUSTED`;
    }
    if (params.hasRegularization) {
      reason = status === AttendanceStatus.PRESENT
        ? 'FULL_DAY_REGULARIZED'
        : `${reason}_REGULARIZED`;
    }

    return { status, reason };
  }

  private validateGeoFence(
    policy: AttendancePolicy,
    accessPolicy: AccessPolicyResolution,
    input: GeoInput,
    isAdminOverride: boolean,
    remarks?: string,
  ) {
    const hasCoords = input.latitude != null && input.longitude != null;
    const hasOfficeCoordinates =
      policy.officeLatitude != null &&
      policy.officeLongitude != null &&
      policy.allowedRadiusMeters != null;

    if (accessPolicy.remoteAllowed && policy.requireRemotePunchReason && !hasCoords) {
      if (!remarks?.trim()) {
        throw ApiError.badRequest(
          'Reason is required for remote punch',
          'REMOTE_PUNCH_REASON_REQUIRED',
        );
      }
    }

    if (!accessPolicy.geoFenceRequired) {
      if (!hasCoords || !hasOfficeCoordinates) {
        return {
          withinGeoFence: true,
          distanceMeters: null as number | null,
          policyViolation: false,
        };
      }

      const relaxedDistance = this.calculateDistanceMeters(
        input.latitude!,
        input.longitude!,
        Number(policy.officeLatitude),
        Number(policy.officeLongitude),
      );
      return {
        withinGeoFence: relaxedDistance <= (policy.allowedRadiusMeters ?? 0),
        distanceMeters: relaxedDistance,
        policyViolation: false,
      };
    }

    if (!hasCoords) {
      if (accessPolicy.remoteAllowed || isAdminOverride) {
        return {
          withinGeoFence: false,
          distanceMeters: null,
          policyViolation: false,
        };
      }
      throw ApiError.badRequest(
        'Location is required for punching as per attendance policy',
        'PUNCH_LOCATION_REQUIRED',
      );
    }

    if (
      !hasOfficeCoordinates
    ) {
      if (accessPolicy.remoteAllowed || isAdminOverride) {
        return {
          withinGeoFence: true,
          distanceMeters: null,
          policyViolation: false,
        };
      }
      throw ApiError.badRequest(
        'Office geo-fence is not configured. Contact administrator',
        'GEOFENCE_NOT_CONFIGURED',
      );
    }

    const distance = this.calculateDistanceMeters(
      input.latitude!,
      input.longitude!,
      Number(policy.officeLatitude),
      Number(policy.officeLongitude),
    );

    const allowedRadius = policy.allowedRadiusMeters ?? 0;
    if (distance <= allowedRadius) {
      return {
        withinGeoFence: true,
        distanceMeters: distance,
        policyViolation: false,
      };
    }

    if (accessPolicy.remoteAllowed || isAdminOverride) {
      return {
        withinGeoFence: false,
        distanceMeters: distance,
        policyViolation: false,
      };
    }

    throw ApiError.badRequest(
      `Punch blocked. You are ${Math.round(distance)}m away from office (allowed ${allowedRadius}m)`,
      'PUNCH_OUTSIDE_GEOFENCE',
    );
  }
  private getExpectedNextPunchType(punches: AttendancePunch[]): PunchType {
    if (punches.length === 0) return PunchType.CHECK_IN;
    const latest = punches[punches.length - 1];
    return latest.type === PunchType.CHECK_IN ? PunchType.CHECK_OUT : PunchType.CHECK_IN;
  }

  private getClassificationConfig(policy: AttendancePolicy): AttendanceClassificationConfig {
    return policy.classificationConfig;
  }

  private getPermissionConfig(policy: AttendancePolicy): AttendancePermissionConfig {
    return policy.permissionConfig;
  }

  private getRegularizationConfig(policy: AttendancePolicy): AttendanceRegularizationConfig {
    return policy.regularizationConfig;
  }

  private resolvePolicyMode(policy: AttendancePolicy): AttendanceAccessMode {
    const explicit = policy.defaultAttendanceMode as AttendanceAccessMode | undefined;
    if (
      explicit &&
      [
        AttendanceAccessMode.GEO_FENCE_ONLY,
        AttendanceAccessMode.REMOTE_ALLOWED,
        AttendanceAccessMode.HYBRID,
      ].includes(explicit)
    ) {
      return explicit;
    }

    // Backward compatibility with old boolean flags.
    if (policy.geoFenceRequired && policy.allowRemotePunch) return AttendanceAccessMode.HYBRID;
    if (policy.geoFenceRequired) return AttendanceAccessMode.GEO_FENCE_ONLY;
    return AttendanceAccessMode.REMOTE_ALLOWED;
  }

  private async resolveAccessPolicy(
    employeeId: string,
    date: string,
    policy: AttendancePolicy,
  ): Promise<AccessPolicyResolution> {
    const orgMode = this.resolvePolicyMode(policy);
    let mode = orgMode;
    let employeeOverrideApplied = false;
    let geoFenceExempt = false;
    let remoteAllowed = mode !== AttendanceAccessMode.GEO_FENCE_ONLY;
    let overrideSource: AccessPolicyResolution['overrideSource'] = 'ORG_POLICY';

    if (policy.allowEmployeePolicyOverride) {
      const override = await this.repo.getEffectiveEmployeeAccessOverride(employeeId, date);
      if (override && override.active) {
        employeeOverrideApplied = true;
        overrideSource = 'EMPLOYEE_OVERRIDE';
        if (
          override.overrideMode &&
          override.overrideMode !== AttendanceAccessMode.ORG_DEFAULT &&
          [
            AttendanceAccessMode.GEO_FENCE_ONLY,
            AttendanceAccessMode.REMOTE_ALLOWED,
            AttendanceAccessMode.HYBRID,
          ].includes(override.overrideMode as AttendanceAccessMode)
        ) {
          mode = override.overrideMode as AttendanceAccessMode;
        }
        geoFenceExempt = Boolean(override.geoFenceExempt);
        if (override.remotePunchAllowed !== null && override.remotePunchAllowed !== undefined) {
          remoteAllowed = Boolean(override.remotePunchAllowed);
        } else {
          remoteAllowed = mode !== AttendanceAccessMode.GEO_FENCE_ONLY;
        }
      }
    }

    const geoFenceRequired =
      mode === AttendanceAccessMode.GEO_FENCE_ONLY && !geoFenceExempt;

    return {
      attendanceMode: mode,
      remoteAllowed,
      geoFenceRequired,
      geoFenceExempt,
      employeeOverrideApplied,
      overrideSource,
    };
  }

  private shouldAutoCloseSession(date: string, policy: AttendancePolicy) {
    if (!policy.autoCloseOpenSessionAtEndOfDay) return false;
    const now = new Date();
    const day = new Date(`${date}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (day.getTime() < today.getTime()) return true;
    const shiftEnd = this.scheduledShiftEnd(date, policy.workStartTime, policy.workEndTime);
    return now.getTime() > shiftEnd.getTime();
  }

  private resolveAutoCloseTime(date: string, policy: AttendancePolicy) {
    return this.scheduledShiftEnd(date, policy.workStartTime, policy.workEndTime);
  }

  private isWeeklyOff(date: Date, policy: AttendancePolicy): boolean {
    const configuredDays = (policy.weekOffDays || '')
      .split(',')
      .map((day) => day.trim().toUpperCase())
      .filter(Boolean);

    const dayName = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ][date.getDay()];

    if (dayName === 'SATURDAY' && policy.alternateSaturdayOffRule !== AlternateSaturdayRule.NONE) {
      const saturdayOrder = Math.floor((date.getDate() - 1) / 7) + 1;
      if (policy.alternateSaturdayOffRule === AlternateSaturdayRule.SECOND_FOURTH) {
        return saturdayOrder === 2 || saturdayOrder === 4;
      }
      if (policy.alternateSaturdayOffRule === AlternateSaturdayRule.FIRST_THIRD) {
        return saturdayOrder === 1 || saturdayOrder === 3;
      }
    }

    return configuredDays.includes(dayName);
  }

  private mapPolicy(policy: AttendancePolicy) {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      defaultPolicyName: policy.defaultPolicyName,
      version: policy.version,
      active: policy.active,
      effectiveFrom: policy.effectiveFrom,
      workStartTime: policy.workStartTime,
      workEndTime: policy.workEndTime,
      lateGraceMinutes: policy.lateGraceMinutes,
      halfDayMinMinutes: policy.halfDayMinMinutes,
      fullDayMinMinutes: policy.fullDayMinMinutes,
      overtimeMinMinutes: policy.overtimeMinMinutes,
      maxEarlyOutToleranceMinutes: policy.maxEarlyOutToleranceMinutes,
      allowMultiplePunchSessions: policy.allowMultiplePunchSessions,
      autoCloseOpenSessionAtEndOfDay: policy.autoCloseOpenSessionAtEndOfDay,
      minimumPunchGapMinutes: policy.minimumPunchGapMinutes,
      officeLatitude: policy.officeLatitude != null ? Number(policy.officeLatitude) : null,
      officeLongitude: policy.officeLongitude != null ? Number(policy.officeLongitude) : null,
      allowedRadiusMeters: policy.allowedRadiusMeters,
      geoFenceRequired: policy.geoFenceRequired,
      allowAdminOverrideForGeoFenceMiss: policy.allowAdminOverrideForGeoFenceMiss,
      allowRemotePunch: policy.allowRemotePunch,
      defaultAttendanceMode: policy.defaultAttendanceMode as AttendanceAccessMode,
      requireRemotePunchReason: policy.requireRemotePunchReason,
      allowEmployeePolicyOverride: policy.allowEmployeePolicyOverride,
      captureLocationOnEveryPunch: policy.captureLocationOnEveryPunch,
      weekOffDays: policy.weekOffDays,
      alternateSaturdayOffRule: policy.alternateSaturdayOffRule,
      classificationConfig: this.getClassificationConfig(policy),
      permissionConfig: this.getPermissionConfig(policy),
      regularizationConfig: this.getRegularizationConfig(policy),
      policyPrecedenceConfig: policy.policyPrecedenceConfig,
      metadata: policy.metadata,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  private mapAttendanceRecord(record: Attendance) {
    return {
      id: record.id,
      employeeId: record.employeeId,
      date: record.date,
      firstCheckInAt: record.firstCheckInAt,
      lastCheckOutAt: record.lastCheckOutAt,
      totalWorkMinutes: record.totalWorkMinutes,
      totalBreakMinutes: record.totalBreakMinutes,
      earlyOutMinutes: record.earlyOutMinutes,
      overtimeMinutes: record.overtimeMinutes,
      punchSessionsCount: record.punchSessionsCount,
      status: record.status,
      lateMinutes: record.lateMinutes,
      dayType: record.dayType,
      missingPunch: record.missingPunch,
      geoFenceIssue: record.geoFenceIssue,
      permissionMinutesApplied: record.permissionMinutesApplied,
      regularized: record.regularized,
      appliedPolicyId: record.appliedPolicyId,
      policyVersion: record.policyVersion,
      statusReason: record.statusReason,
      derivedSummary: record.derivedSummary,
      isManualOverride: record.isManualOverride,
      overrideReason: record.overrideReason,
      eodDescription: record.eodDescription,
      locationValidated: record.locationValidated,
      checkInLatitude: record.checkInLatitude,
      checkInLongitude: record.checkInLongitude,
      checkOutLatitude: record.checkOutLatitude,
      checkOutLongitude: record.checkOutLongitude,
      startWorkOverrideEnabled: record.startWorkOverrideEnabled,
      overrideValidUntil: record.overrideValidUntil,
      overrideSetBy: record.overrideSetBy,
      overrideSetAt: record.overrideSetAt,
      isAutoClosed: record.isAutoClosed,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapAdminAttendanceRecord(
    record: Attendance,
    employee: any,
    profile: any,
    extra?: {
      pendingRegularizationCount?: number;
      pendingPermissionCount?: number;
    },
  ) {
    const data = this.mapAttendanceRecord(record);
    return {
      ...data,
      employeeName: this.getEmployeeName(employee),
      employeeCode: employee.empId ?? null,
      email: employee.email ?? null,
      department: profile?.department ?? null,
      designation: profile?.designation ?? null,
      pendingRegularizationCount: extra?.pendingRegularizationCount ?? 0,
      pendingPermissionCount: extra?.pendingPermissionCount ?? 0,
    };
  }
  private mapRegularizationRequest(request: AttendanceRegularizationRequest) {
    return {
      id: request.id,
      employeeId: request.employeeId,
      date: request.date,
      requestType: request.requestType,
      requestedInTime: request.requestedInTime,
      requestedOutTime: request.requestedOutTime,
      reason: request.reason,
      status: request.status,
      adminRemarks: request.adminRemarks,
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt,
      metadata: request.metadata,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private mapPermissionRequest(request: AttendancePermissionRequest) {
    return {
      id: request.id,
      employeeId: request.employeeId,
      date: request.date,
      fromTime: request.fromTime,
      toTime: request.toTime,
      totalMinutes: request.totalMinutes,
      appliedMinutes: request.appliedMinutes,
      reason: request.reason,
      status: request.status,
      adminRemarks: request.adminRemarks,
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt,
      metadata: request.metadata,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private mapAccessOverride(row: AttendanceEmployeePolicyOverride) {
    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: this.getEmployeeName(row.employee),
      employeeCode: row.employee?.empId ?? null,
      overrideMode: row.overrideMode,
      geoFenceExempt: row.geoFenceExempt,
      remotePunchAllowed: row.remotePunchAllowed,
      reason: row.reason,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil,
      active: row.active,
      updatedBy: row.updatedBy,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private buildDayActionEligibility(
    attendance: Attendance,
    regularizations: AttendanceRegularizationRequest[],
    permissions: AttendancePermissionRequest[],
  ) {
    const today = this.toDateKey(new Date());
    const isFutureDate = attendance.date > today;
    const nonWorkingDay =
      attendance.dayType === AttendanceDayType.HOLIDAY ||
      attendance.dayType === AttendanceDayType.WEEK_OFF ||
      attendance.dayType === AttendanceDayType.LEAVE ||
      attendance.dayType === ('PRE_JOINING' as AttendanceDayType);

    const issueStatuses: AttendanceStatus[] = [
      AttendanceStatus.LATE,
      AttendanceStatus.ABSENT,
      AttendanceStatus.HALF_DAY,
      AttendanceStatus.LOP,
      AttendanceStatus.MISSING_PUNCH,
      AttendanceStatus.EARLY_OUT,
      AttendanceStatus.NOT_STARTED,
    ];

    const needsAttention =
      issueStatuses.includes(attendance.status) ||
      attendance.geoFenceIssue ||
      attendance.missingPunch;

    const latestRegularization = regularizations[0] ?? null;
    const latestPermission = permissions[0] ?? null;

    return {
      canRequestRegularization: !isFutureDate && !nonWorkingDay && needsAttention,
      canRequestPermission: !isFutureDate && !nonWorkingDay && needsAttention,
      hideActions: isFutureDate || nonWorkingDay || !needsAttention,
      reasonCode: isFutureDate
        ? 'FUTURE_DATE'
        : nonWorkingDay
        ? 'NON_WORKING_DAY'
        : needsAttention
          ? 'ATTENDANCE_ISSUE'
          : 'NO_ACTION_REQUIRED',
      existingRegularization: latestRegularization
        ? {
            id: latestRegularization.id,
            status: latestRegularization.status,
            requestType: latestRegularization.requestType,
          }
        : null,
      existingPermission: latestPermission
        ? {
            id: latestPermission.id,
            status: latestPermission.status,
            totalMinutes: latestPermission.totalMinutes,
          }
        : null,
    };
  }

  private buildDayContextLabel(attendance: Attendance) {
    if (attendance.dayType === 'PRE_JOINING') {
      return {
        type: 'PRE_JOINING',
        label: 'Before Joining Date',
        description: 'Attendance is not applicable before your date of joining.',
      };
    }
    if (attendance.dayType === AttendanceDayType.HOLIDAY) {
      return {
        type: 'HOLIDAY',
        label: 'Holiday',
        description:
          (attendance.derivedSummary?.holidayName as string) ||
          'Organization holiday',
      };
    }
    if (attendance.dayType === AttendanceDayType.WEEK_OFF) {
      return {
        type: 'WEEK_OFF',
        label: 'Weekly Off',
        description: 'Configured weekly off day',
      };
    }
    if (attendance.dayType === AttendanceDayType.LEAVE) {
      return {
        type: 'LEAVE',
        label: 'Approved Leave',
        description:
          (attendance.derivedSummary?.leaveType as string) || 'Approved leave',
      };
    }
    return {
      type: 'WORKING',
      label: 'Working Day',
      description: 'Attendance is tracked for this day.',
    };
  }

  private buildStatusSummary(statuses: string[]) {
    const summary: Record<string, number> = {};
    DEFAULT_SUMMARY_STATUSES.forEach((status) => {
      summary[status] = 0;
    });
    statuses.forEach((status) => {
      const normalized =
        status === AttendanceStatus.ABSENT || status === AttendanceStatus.MISSING_PUNCH
          ? AttendanceStatus.LOP
          : status;
      summary[normalized] = (summary[normalized] ?? 0) + 1;
    });
    delete summary[AttendanceStatus.ABSENT];
    delete summary[AttendanceStatus.MISSING_PUNCH];
    return summary;
  }

  private getEmployeeName(employee: any): string {
    if (!employee) return '-';
    const firstName = employee.firstName ?? '';
    const lastName = employee.lastName ?? '';
    const full = `${firstName} ${lastName}`.trim();
    return full || employee.email || '-';
  }

  private assertDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw ApiError.badRequest('Date must be in YYYY-MM-DD format', 'INVALID_DATE_FORMAT');
    }
  }

  private assertTime(time: string) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
      throw ApiError.badRequest('Invalid time format, expected HH:mm or HH:mm:ss', 'INVALID_TIME_FORMAT');
    }
  }

  private toDateKey(date: Date) {
    const parts = this.getTimeZoneParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private async resolveAttendanceDate(employeeId: string, instant: Date): Promise<string> {
    const currentDate = this.toDateKey(instant);
    const currentStart = this.startOfDay(currentDate);
    const previousInstant = new Date(currentStart.getTime() - 60 * 60 * 1000);
    const previousDate = this.toDateKey(previousInstant);
    const previousShift = await this.shiftAssignmentRepo.findOne({
      where: { employeeId, shiftDate: previousDate },
      relations: { shift: true },
    });

    if (previousShift?.shift?.isNightShift) {
      const shiftStart = this.combineDateTime(previousDate, previousShift.shift.startTime);
      const shiftEnd = this.scheduledShiftEnd(
        previousDate,
        previousShift.shift.startTime,
        previousShift.shift.endTime,
      );
      const checkoutGraceEnd = new Date(shiftEnd.getTime() + 6 * 60 * 60 * 1000);
      if (instant.getTime() >= shiftStart.getTime() && instant.getTime() <= checkoutGraceEnd.getTime()) {
        return previousDate;
      }
    }

    return currentDate;
  }

  private scheduledShiftEnd(date: string, startTime: string, endTime: string): Date {
    const start = this.combineDateTime(date, startTime);
    const end = this.combineDateTime(date, endTime);
    if (end.getTime() <= start.getTime()) {
      end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
    }
    return end;
  }

  private startOfDay(date: string) {
    return this.combineDateTime(date, '00:00:00');
  }

  private endOfDay(date: string) {
    const end = this.combineDateTime(date, '23:59:59');
    end.setMilliseconds(999);
    return end;
  }

  private endOfToday() {
    return this.endOfDay(this.toDateKey(new Date()));
  }

  private combineDateTime(date: string, time: string) {
    const [year, month, day] = date.split('-').map((value) => Number(value));
    const [hour, minute, second = 0] = time.split(':').map((value) => Number(value));
    const desiredUtcWallTime = Date.UTC(year, month - 1, day, hour, minute, second);

    // Convert the configured organization wall-clock time into an absolute
    // instant without changing how PostgreSQL timestamp columns are parsed.
    let result = new Date(desiredUtcWallTime);
    for (let pass = 0; pass < 2; pass += 1) {
      const zoned = this.getTimeZoneParts(result);
      const representedAsUtc = Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
        zoned.second,
      );
      const offset = representedAsUtc - result.getTime();
      result = new Date(desiredUtcWallTime - offset);
    }
    return result;
  }

  private getTimeZoneParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: env.APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
      minute: value('minute'),
      second: value('second'),
    };
  }

  private addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60000);
  }

  private minutesBetween(start: Date, end: Date) {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  private minutesBetweenTime(fromTime: string, toTime: string) {
    const [fh, fm] = fromTime.split(':').map((v) => parseInt(v, 10));
    const [th, tm] = toTime.split(':').map((v) => parseInt(v, 10));
    return th * 60 + tm - (fh * 60 + fm);
  }

  private getMonthBounds(year: number, month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw ApiError.badRequest('Invalid year/month', 'INVALID_MONTH_QUERY');
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      startDate: this.toDateKey(start),
      endDate: this.toDateKey(end),
      monthDays: end.getDate(),
    };
  }

  private getMonthRange(date: string) {
    const d = new Date(`${date}T00:00:00`);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      monthStart: this.toDateKey(start),
      monthEnd: this.toDateKey(end),
    };
  }

  private daysDiff(fromDate: string, toDate: string) {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const to = new Date(`${toDate}T00:00:00`).getTime();
    return Math.max(0, Math.floor((to - from) / (24 * 60 * 60 * 1000)));
  }

  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }
}


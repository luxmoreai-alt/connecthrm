import { LeaveRepository } from '../repositories/leave.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { EmailService } from './email.service';
import { ApiError } from '../utils/apiError';
import {
  LeaveType,
  RequestMode,
  HalfDaySession,
  LeaveStatus,
  LeaveRequest,
} from '../entities/LeaveRequest.entity';
import { LeavePolicySlab } from '../entities/LeavePolicySlab.entity';
import { AttendanceService } from './attendance.service';
import { AlternateSaturdayRule } from '../entities/OrgSettings.entity';
import { NotificationService } from './notification.service';
import { WorkdayOverrideType } from '../entities/WorkdayOverride.entity';

// ── Input types ──

interface ApplyLeaveInput {
  leaveType: string;
  requestMode: string;
  startDate?: string;
  endDate?: string;
  date?: string;
  halfDaySession?: string;
  fromTime?: string;
  toTime?: string;
  reason: string;
}

export class LeaveService {
  private leaveRepo: LeaveRepository;
  private employeeRepo: EmployeeRepository;
  private settingsRepo: SettingsRepository;
  private emailService: EmailService;
  private attendanceService: AttendanceService;
  private notificationService: NotificationService;

  constructor() {
    this.leaveRepo = new LeaveRepository();
    this.employeeRepo = new EmployeeRepository();
    this.settingsRepo = new SettingsRepository();
    this.emailService = new EmailService();
    this.attendanceService = new AttendanceService();
    this.notificationService = new NotificationService();
  }

  // ══════════════════════════════════════════════════════
  //  Utility: Probation & Service Year Calculations
  // ══════════════════════════════════════════════════════

  private getYearsOfService(dateOfJoining: string, referenceDate = new Date()): number {
    const doj = new Date(dateOfJoining);
    const now = referenceDate;
    let years = now.getFullYear() - doj.getFullYear();
    const monthDiff = now.getMonth() - doj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < doj.getDate())) {
      years--;
    }
    return Math.max(0, years);
  }

  private getMonthsOfService(dateOfJoining: string, referenceDate = new Date()): number {
    const doj = new Date(dateOfJoining);
    const now = referenceDate;
    let months = (now.getFullYear() - doj.getFullYear()) * 12 + (now.getMonth() - doj.getMonth());
    if (now.getDate() < doj.getDate()) months--;
    return Math.max(0, months);
  }

  private isInProbation(
    dateOfJoining: string,
    probationMonths: number,
    referenceDate = new Date(),
  ): boolean {
    return this.getMonthsOfService(dateOfJoining, referenceDate) < probationMonths;
  }

  private getApplicableSlab(slabs: LeavePolicySlab[], yearsOfService: number): LeavePolicySlab | null {
    // Sort by minYearsOfService ascending
    const sorted = [...slabs].sort((a, b) => a.minYearsOfService - b.minYearsOfService);
    for (const slab of sorted) {
      const max = slab.maxYearsOfService;
      if (yearsOfService >= slab.minYearsOfService && (max == null || yearsOfService < max)) {
        return slab;
      }
    }
    // Fallback: return the highest slab if years exceed all
    return sorted.length > 0 ? sorted[sorted.length - 1] : null;
  }

  private countBusinessDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    let count = 0;
    const current = new Date(s);
    while (current <= e) {
      count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private calculatePermissionHours(fromTime: string, toTime: string): number {
    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = toTime.split(':').map(Number);
    const fromMinutes = fh * 60 + fm;
    const toMinutes = th * 60 + tm;
    return Math.max(0, (toMinutes - fromMinutes) / 60);
  }

  private listDatesInRange(startDate: string, endDate: string): string[] {
    const result: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (cursor.getTime() <= end.getTime()) {
      result.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private toDateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private addMonthsToDateKey(dateStr: string, months: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    return this.toDateKey(new Date(targetYear, normalizedMonth, Math.min(day, lastDay)));
  }

  private addDaysToDateKey(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T00:00:00`);
    date.setDate(date.getDate() + days);
    return this.toDateKey(date);
  }

  private getWholeMonthsBetween(anchorDate: string, referenceDate: string): number {
    const [anchorYear, anchorMonth] = anchorDate.split('-').map(Number);
    const [referenceYear, referenceMonth] = referenceDate.split('-').map(Number);
    let months = (referenceYear - anchorYear) * 12 + (referenceMonth - anchorMonth);
    if (referenceDate < this.addMonthsToDateKey(anchorDate, months)) months -= 1;
    return months;
  }

  private getLeaveCycle(dateOfJoining: string, probationMonths: number, referenceDate: string) {
    const eligibilityDate = this.addMonthsToDateKey(dateOfJoining, probationMonths);
    if (referenceDate < eligibilityDate) {
      return { eligibilityDate, cycle: null };
    }

    const monthsSinceEligibility = this.getWholeMonthsBetween(eligibilityDate, referenceDate);
    const cycleIndex = Math.floor(monthsSinceEligibility / 12);
    const monthIndex = monthsSinceEligibility % 12;
    const cycleStart = this.addMonthsToDateKey(eligibilityDate, cycleIndex * 12);
    const cycleEnd = this.addDaysToDateKey(this.addMonthsToDateKey(cycleStart, 12), -1);
    const monthStart = this.addMonthsToDateKey(cycleStart, monthIndex);
    const monthEnd = this.addDaysToDateKey(this.addMonthsToDateKey(monthStart, 1), -1);

    return {
      eligibilityDate,
      cycle: {
        cycleStart,
        cycleEnd,
        monthStart,
        monthEnd,
        accrualMonth: monthIndex + 1,
      },
    };
  }

  private getRequestDaysWithinRange(request: LeaveRequest, startDate: string, endDate: string): number {
    if (request.requestMode === RequestMode.PERMISSION) return 0;
    if (request.requestMode === RequestMode.HALF_DAY) {
      return request.date && request.date >= startDate && request.date <= endDate
        ? Number(request.totalDays ?? 0.5)
        : 0;
    }

    if (!request.startDate || !request.endDate) return 0;
    const overlapStart = request.startDate > startDate ? request.startDate : startDate;
    const overlapEnd = request.endDate < endDate ? request.endDate : endDate;
    return overlapStart <= overlapEnd ? this.countBusinessDays(overlapStart, overlapEnd) : 0;
  }

  private roundLeaveDays(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isWeeklyOffDate(
    dateStr: string,
    weekOffDaysRaw: string,
    alternateSaturdayOffRule: AlternateSaturdayRule,
  ): boolean {
    const date = new Date(`${dateStr}T00:00:00`);
    const configuredDays = (weekOffDaysRaw || '')
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

    if (dayName === 'SATURDAY' && alternateSaturdayOffRule !== AlternateSaturdayRule.NONE) {
      const saturdayOrder = Math.floor((date.getDate() - 1) / 7) + 1;
      if (alternateSaturdayOffRule === AlternateSaturdayRule.SECOND_FOURTH) {
        return saturdayOrder === 2 || saturdayOrder === 4;
      }
      if (alternateSaturdayOffRule === AlternateSaturdayRule.FIRST_THIRD) {
        return saturdayOrder === 1 || saturdayOrder === 3;
      }
    }

    return configuredDays.includes(dayName);
  }

  private getRequestRange(request: LeaveRequest): { startDate: string; endDate: string } {
    if (request.requestMode === RequestMode.FULL_DAY) {
      return { startDate: request.startDate!, endDate: request.endDate! };
    }
    return { startDate: request.date!, endDate: request.date! };
  }

  private getEffectiveLeaveType(request: LeaveRequest): LeaveType {
    return request.approvedLeaveType ?? request.leaveType;
  }

  // ══════════════════════════════════════════════════════
  //  Employee: Get Summary
  // ══════════════════════════════════════════════════════

  async getEmployeeSummary(userId: string, referenceDate = this.toDateKey(new Date())) {
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) throw ApiError.notFound('Employee profile not found', 'PROFILE_NOT_FOUND');

    const policy = await this.leaveRepo.getPolicyWithSlabs();
    if (!policy) {
      return this.buildEmptySummary(profile.dateOfJoining, profile.user);
    }

    const reference = new Date(`${referenceDate}T00:00:00`);
    const yearsOfService = this.getYearsOfService(profile.dateOfJoining, reference);
    const monthsOfService = this.getMonthsOfService(profile.dateOfJoining, reference);
    const { eligibilityDate, cycle } = this.getLeaveCycle(
      profile.dateOfJoining,
      policy.probationPeriodMonths,
      referenceDate,
    );
    const inProbation = !cycle;
    const slab = this.getApplicableSlab(policy.slabs ?? [], yearsOfService);

    const approved = cycle
      ? await this.leaveRepo.findApprovedByEmployeeAndRange(userId, cycle.cycleStart, cycle.cycleEnd)
      : [];

    let usedCL = 0;
    let usedSL = 0;
    let usedEL = 0;
    let usedLOP = 0;
    for (const request of approved) {
      const effectiveType = this.getEffectiveLeaveType(request);
      if (effectiveType === LeaveType.CL) {
        usedCL += this.getRequestDaysWithinRange(request, cycle!.cycleStart, cycle!.cycleEnd);
      } else if (effectiveType === LeaveType.SL) {
        usedSL += this.getRequestDaysWithinRange(request, cycle!.monthStart, cycle!.monthEnd);
      } else if (effectiveType === LeaveType.EL) {
        usedEL += this.getRequestDaysWithinRange(request, cycle!.monthStart, cycle!.monthEnd);
      } else if (effectiveType === LeaveType.LOP) {
        usedLOP += this.getRequestDaysWithinRange(request, cycle!.cycleStart, cycle!.cycleEnd);
      }
    }

    // Permission hours used this month
    const now = reference;
    const permissions = await this.leaveRepo.findPermissionsByEmployeeAndMonth(
      userId, now.getFullYear(), now.getMonth() + 1,
    );
    const usedPermissionHours = permissions.reduce(
      (sum, p) => sum + Number(p.totalHours ?? 0), 0,
    );

    const annualEntitlement = slab
      ? {
          cl: Number(slab.casualLeavePerYear),
          sl: Number(slab.sickLeavePerYear),
          el: Number(slab.earnedLeavePerYear),
        }
      : { cl: 0, sl: 0, el: 0 };
    const monthlyEntitlement = {
      cl: this.roundLeaveDays(annualEntitlement.cl / 12),
      sl: this.roundLeaveDays(annualEntitlement.sl / 12),
      el: this.roundLeaveDays(annualEntitlement.el / 12),
    };
    const entitlement = cycle
      ? {
          cl: this.roundLeaveDays((annualEntitlement.cl * cycle.accrualMonth) / 12),
          sl: monthlyEntitlement.sl,
          el: monthlyEntitlement.el,
        }
      : { cl: 0, sl: 0, el: 0 };

    return {
      employeeId: userId,
      employeeName: `${profile.user.firstName} ${profile.user.lastName}`,
      empId: profile.user.empId,
      dateOfJoining: profile.dateOfJoining,
      department: profile.department,
      designation: profile.designation,
      yearsOfService,
      monthsOfService,
      inProbation,
      probationEndsOn: eligibilityDate,
      leaveEligibilityDate: eligibilityDate,
      leaveCycleStart: cycle?.cycleStart ?? null,
      leaveCycleEnd: cycle?.cycleEnd ?? null,
      leaveMonthStart: cycle?.monthStart ?? null,
      leaveMonthEnd: cycle?.monthEnd ?? null,
      currentAccrualMonth: cycle?.accrualMonth ?? 0,
      probationLeaveAllowed: false,
      allowHalfDayLeave: policy.allowHalfDayLeave,
      allowPermissionHours: policy.allowPermissionHours,
      maxPermissionHoursPerMonth: Number(policy.maxPermissionHoursPerMonth),
      maxPermissionRequestsPerMonth: Number(policy.maxPermissionRequestsPerMonth),
      maxRegularizationsPerMonth: Number(policy.maxRegularizationsPerMonth),
      annualEntitlement,
      monthlyEntitlement,
      entitlement,
      used: {
        cl: this.roundLeaveDays(usedCL),
        sl: this.roundLeaveDays(usedSL),
        el: this.roundLeaveDays(usedEL),
        lop: this.roundLeaveDays(usedLOP),
      },
      balance: {
        cl: this.roundLeaveDays(Math.max(0, entitlement.cl - usedCL)),
        sl: this.roundLeaveDays(Math.max(0, entitlement.sl - usedSL)),
        el: this.roundLeaveDays(Math.max(0, entitlement.el - usedEL)),
      },
      carryForward: { cl: 'WITHIN_LEAVE_YEAR', sl: 'NONE_MONTHLY_RESET', el: 'NONE_MONTHLY_RESET' },
      permissionHoursUsedThisMonth: usedPermissionHours,
      currentSlab: slab
        ? {
            minYears: slab.minYearsOfService,
            maxYears: slab.maxYearsOfService,
            cl: slab.casualLeavePerYear,
            sl: slab.sickLeavePerYear,
            el: slab.earnedLeavePerYear,
          }
        : null,
    };
  }

  private buildEmptySummary(dateOfJoining: string, user: any) {
    return {
      employeeId: user.id,
      employeeName: `${user.firstName} ${user.lastName}`,
      empId: user.empId,
      dateOfJoining,
      department: '',
      designation: '',
      yearsOfService: this.getYearsOfService(dateOfJoining),
      monthsOfService: this.getMonthsOfService(dateOfJoining),
      inProbation: true,
      probationEndsOn: null,
      leaveEligibilityDate: null,
      leaveCycleStart: null,
      leaveCycleEnd: null,
      leaveMonthStart: null,
      leaveMonthEnd: null,
      currentAccrualMonth: 0,
      probationLeaveAllowed: false,
      allowHalfDayLeave: false,
      allowPermissionHours: false,
      maxPermissionHoursPerMonth: 0,
      maxPermissionRequestsPerMonth: 0,
      maxRegularizationsPerMonth: 0,
      annualEntitlement: { cl: 0, sl: 0, el: 0 },
      monthlyEntitlement: { cl: 0, sl: 0, el: 0 },
      entitlement: { cl: 0, sl: 0, el: 0 },
      used: { cl: 0, sl: 0, el: 0, lop: 0 },
      balance: { cl: 0, sl: 0, el: 0 },
      carryForward: { cl: 'WITHIN_LEAVE_YEAR', sl: 'NONE_MONTHLY_RESET', el: 'NONE_MONTHLY_RESET' },
      permissionHoursUsedThisMonth: 0,
      currentSlab: null,
    };
  }

  // ══════════════════════════════════════════════════════
  //  Employee: Get Policies
  // ══════════════════════════════════════════════════════

  async getEmployeePolicies(userId: string) {
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) throw ApiError.notFound('Employee profile not found', 'PROFILE_NOT_FOUND');

    const policy = await this.leaveRepo.getPolicyWithSlabs();
    if (!policy) {
      return { policy: null, slabs: [], applicableSlab: null };
    }

    const yearsOfService = this.getYearsOfService(profile.dateOfJoining);
    const slab = this.getApplicableSlab(policy.slabs ?? [], yearsOfService);

    return {
      policy: {
        probationPeriodMonths: policy.probationPeriodMonths,
        probationLeaveAllowed: false,
        allowHalfDayLeave: policy.allowHalfDayLeave,
        allowPermissionHours: policy.allowPermissionHours,
        maxPermissionHoursPerMonth: Number(policy.maxPermissionHoursPerMonth),
        maxPermissionRequestsPerMonth: Number(policy.maxPermissionRequestsPerMonth),
        maxRegularizationsPerMonth: Number(policy.maxRegularizationsPerMonth),
      },
      slabs: (policy.slabs ?? []).map((s) => ({
        minYears: s.minYearsOfService,
        maxYears: s.maxYearsOfService,
        cl: s.casualLeavePerYear,
        sl: s.sickLeavePerYear,
        el: s.earnedLeavePerYear,
      })),
      applicableSlab: slab
        ? {
            minYears: slab.minYearsOfService,
            maxYears: slab.maxYearsOfService,
            cl: slab.casualLeavePerYear,
            sl: slab.sickLeavePerYear,
            el: slab.earnedLeavePerYear,
          }
        : null,
    };
  }

  // ══════════════════════════════════════════════════════
  //  Employee: Apply Leave
  // ══════════════════════════════════════════════════════

  async applyLeave(userId: string, input: ApplyLeaveInput) {
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) throw ApiError.notFound('Employee profile not found', 'PROFILE_NOT_FOUND');

    const policy = await this.leaveRepo.getPolicyWithSlabs();
    if (!policy) throw ApiError.badRequest('Leave policy not configured', 'LEAVE_POLICY_NOT_FOUND');

    const requestMode = input.requestMode as RequestMode;
    const leaveType =
      requestMode === RequestMode.PERMISSION
        ? LeaveType.PERMISSION
        : (input.leaveType as LeaveType);
    if (requestMode === RequestMode.HALF_DAY && !policy.allowHalfDayLeave) {
      throw ApiError.badRequest('Half-day leave is not allowed', 'LEAVE_HALF_DAY_NOT_ALLOWED');
    }
    if (requestMode === RequestMode.PERMISSION) {
      if (!policy.allowPermissionHours) {
        throw ApiError.badRequest('Permission hours are not allowed', 'LEAVE_PERMISSION_NOT_ALLOWED');
      }
      if (!input.fromTime || !input.toTime || !input.date) {
        throw ApiError.badRequest(
          'Permission requires date, fromTime and toTime',
          'LEAVE_PERMISSION_MISSING_FIELDS',
        );
      }
    }

    let totalDays: number | null = null;
    let totalHours: number | null = null;
    let checkStartDate: string;
    let checkEndDate: string;

    if (requestMode === RequestMode.FULL_DAY) {
      if (!input.startDate || !input.endDate) {
        throw ApiError.badRequest(
          'Full day leave requires startDate and endDate',
          'LEAVE_DATES_REQUIRED',
        );
      }
      if (input.startDate > input.endDate) {
        throw ApiError.badRequest('End date cannot be before start date', 'LEAVE_INVALID_DATE_RANGE');
      }
      totalDays = this.countBusinessDays(input.startDate, input.endDate);
      checkStartDate = input.startDate;
      checkEndDate = input.endDate;
    } else if (requestMode === RequestMode.HALF_DAY) {
      if (!input.date || !input.halfDaySession) {
        throw ApiError.badRequest('Half day leave requires date and session', 'LEAVE_HALF_DAY_MISSING');
      }
      totalDays = 0.5;
      checkStartDate = input.date;
      checkEndDate = input.date;
    } else {
      totalHours = this.calculatePermissionHours(input.fromTime!, input.toTime!);
      if (totalHours <= 0) {
        throw ApiError.badRequest('Invalid permission time range', 'LEAVE_INVALID_PERMISSION_TIME');
      }
      const permissionDate = new Date(`${input.date!}T00:00:00`);
      const permissions = await this.leaveRepo.findPermissionsByEmployeeAndMonth(
        userId,
        permissionDate.getFullYear(),
        permissionDate.getMonth() + 1,
      );
      const usedHours = permissions.reduce((s, p) => s + Number(p.totalHours ?? 0), 0);
      if (usedHours + totalHours > Number(policy.maxPermissionHoursPerMonth)) {
        throw ApiError.badRequest(
          `Monthly permission limit is ${policy.maxPermissionHoursPerMonth} hours. You have used ${usedHours.toFixed(1)} hours.`,
          'LEAVE_PERMISSION_LIMIT_EXCEEDED',
        );
      }
      checkStartDate = input.date!;
      checkEndDate = input.date!;
    }

    if (checkStartDate < profile.dateOfJoining) {
      throw ApiError.badRequest(
        'Leave cannot be applied for dates before joining date',
        'LEAVE_BEFORE_JOINING_DATE',
      );
    }

    const leaveCycle = this.getLeaveCycle(
      profile.dateOfJoining,
      policy.probationPeriodMonths,
      checkEndDate,
    );
    if (this.isPaidLeaveType(leaveType)) {
      if (checkStartDate < leaveCycle.eligibilityDate || !leaveCycle.cycle) {
        throw ApiError.badRequest(
          `Paid leave is available only after probation is completed on ${leaveCycle.eligibilityDate}`,
          'LEAVE_NOT_AVAILABLE_DURING_PROBATION',
        );
      }
      if (leaveType === LeaveType.CL && checkStartDate < leaveCycle.cycle.cycleStart) {
        throw ApiError.badRequest(
          'Casual Leave cannot cross leave-year boundaries. Please submit separate requests.',
          'LEAVE_CROSSES_LEAVE_YEAR',
        );
      }
      if (
        (leaveType === LeaveType.SL || leaveType === LeaveType.EL) &&
        checkStartDate < leaveCycle.cycle.monthStart
      ) {
        throw ApiError.badRequest(
          'Sick Leave and Emergency Leave cannot cross monthly reset boundaries. Please submit separate requests.',
          'LEAVE_CROSSES_MONTHLY_RESET',
        );
      }
    }

    const settings = await this.settingsRepo.getSettings();
    const datesToValidate = this.listDatesInRange(checkStartDate, checkEndDate);
    const [holidayRows, overrideRows] = await Promise.all([
      Promise.all(datesToValidate.map((date) => this.settingsRepo.findHolidayByDate(date))),
      Promise.all(datesToValidate.map((date) => this.settingsRepo.findWorkdayOverrideByDate(date))),
    ]);
    const overrideMap = new Map(overrideRows.filter(Boolean).map((row) => [row!.date, row!]));
    const nonWorkingOverride = overrideRows.find((row) => row?.type === WorkdayOverrideType.NON_WORKING_DAY);
    if (nonWorkingOverride) {
      throw ApiError.badRequest(
        `Leave cannot be applied on ${nonWorkingOverride.date}: ${nonWorkingOverride.reason}`,
        'LEAVE_NON_WORKING_DAY_NOT_ALLOWED',
      );
    }
    const holidayHit = holidayRows.find((row) => row && overrideMap.get(row.date)?.type !== WorkdayOverrideType.WORKING_DAY);
    if (holidayHit) {
      throw ApiError.badRequest(
        `Leave cannot be applied on holiday (${holidayHit.name} - ${holidayHit.date})`,
        'LEAVE_HOLIDAY_NOT_ALLOWED',
      );
    }
    if (
      settings &&
      datesToValidate.some((date) =>
        overrideMap.get(date)?.type !== WorkdayOverrideType.WORKING_DAY &&
        this.isWeeklyOffDate(date, settings.weekOffDays, settings.alternateSaturdayOffRule),
      )
    ) {
      throw ApiError.badRequest(
        'Leave cannot be applied on configured weekly-off days',
        'LEAVE_WEEKLY_OFF_NOT_ALLOWED',
      );
    }

    if (
      leaveType !== LeaveType.LOP &&
      leaveType !== LeaveType.PERMISSION &&
      totalDays
    ) {
      const summary = await this.getEmployeeSummary(userId, checkEndDate);
      const balanceKey = leaveType.toLowerCase() as 'cl' | 'sl' | 'el';
      const available = summary.balance[balanceKey] ?? 0;
      if (totalDays > available) {
        throw ApiError.badRequest(
          `Insufficient ${leaveType} balance. Available: ${available}, Requested: ${totalDays}`,
          'LEAVE_INSUFFICIENT_BALANCE',
        );
      }
    }

    const overlapping = await this.leaveRepo.findOverlapping(userId, checkStartDate, checkEndDate);
    if (overlapping.length > 0) {
      throw ApiError.conflict(
        'Leave request overlaps with an existing request',
        'LEAVE_OVERLAP',
      );
    }

    const suggestedLeaveType = leaveType;
    const treatmentNote = null;

    const requestReferenceDate = new Date(`${checkEndDate}T00:00:00`);
    const inProbation = this.isInProbation(
      profile.dateOfJoining,
      policy.probationPeriodMonths,
      requestReferenceDate,
    );
    const yearsOfService = this.getYearsOfService(profile.dateOfJoining, requestReferenceDate);
    const slab = this.getApplicableSlab(policy.slabs ?? [], yearsOfService);
    const policySnapshot = {
      probationPeriodMonths: policy.probationPeriodMonths,
      probationLeaveAllowed: false,
      inProbation,
      leaveEligibilityDate: leaveCycle.eligibilityDate,
      leaveCycleStart: leaveCycle.cycle?.cycleStart ?? null,
      leaveCycleEnd: leaveCycle.cycle?.cycleEnd ?? null,
      leaveMonthStart: leaveCycle.cycle?.monthStart ?? null,
      leaveMonthEnd: leaveCycle.cycle?.monthEnd ?? null,
      carryForward: { cl: 'WITHIN_LEAVE_YEAR', sl: 'NONE_MONTHLY_RESET', el: 'NONE_MONTHLY_RESET' },
      yearsOfService,
      suggestedLeaveType,
      treatmentNote,
      slab: slab
        ? { cl: slab.casualLeavePerYear, sl: slab.sickLeavePerYear, el: slab.earnedLeavePerYear }
        : null,
    };

    const request = await this.leaveRepo.createRequest({
      employeeId: userId,
      leaveType,
      approvedLeaveType: null,
      finalAttendanceCode: null,
      suggestedLeaveType,
      treatmentNote,
      requestMode,
      startDate: requestMode === RequestMode.FULL_DAY ? input.startDate! : null,
      endDate: requestMode === RequestMode.FULL_DAY ? input.endDate! : null,
      date: requestMode !== RequestMode.FULL_DAY ? input.date! : null,
      halfDaySession: requestMode === RequestMode.HALF_DAY ? (input.halfDaySession as HalfDaySession) : null,
      fromTime: requestMode === RequestMode.PERMISSION ? input.fromTime! : null,
      toTime: requestMode === RequestMode.PERMISSION ? input.toTime! : null,
      totalDays,
      totalHours,
      reason: input.reason,
      status: LeaveStatus.PENDING,
      policySnapshot,
    });

    await this.sendLeaveAppliedEmails(profile.user, request).catch((err) =>
      console.error('Failed to send leave applied email', (err as Error).message),
    );
    const employeeName = `${profile.user.firstName} ${profile.user.lastName}`;
    await this.notificationService.notifyAdmins(
      'LEAVE_REQUEST',
      'New leave request',
      `${employeeName} applied for ${String(leaveType).replace(/_/g, ' ')} leave.`,
      '/admin/leave',
    ).catch((err) => console.error('Failed to create leave notification', err.message));

    return this.formatRequest(request, profile.user);
  }

  // ══════════════════════════════════════════════════════
  //  Employee: Cancel Leave
  // ══════════════════════════════════════════════════════

  async cancelLeave(userId: string, requestId: string) {
    const request = await this.leaveRepo.findRequestById(requestId);
    if (!request) throw ApiError.notFound('Leave request not found', 'LEAVE_NOT_FOUND');
    if (request.employeeId !== userId) throw ApiError.forbidden('Not your leave request', 'LEAVE_FORBIDDEN');
    if (request.status !== LeaveStatus.PENDING) {
      throw ApiError.badRequest('Only pending requests can be cancelled', 'LEAVE_CANNOT_CANCEL');
    }

    request.status = LeaveStatus.CANCELLED;
    await this.leaveRepo.saveRequest(request);
    await this.notificationService.notifyAdmins(
      'LEAVE_CANCELLED',
      'Leave request cancelled',
      'An employee cancelled a pending leave request.',
      '/admin/leave',
    ).catch((err) => console.error('Failed to create leave notification', err.message));
    return this.formatRequest(request);
  }

  // ══════════════════════════════════════════════════════
  //  Employee: History
  // ══════════════════════════════════════════════════════

  async getEmployeeHistory(userId: string) {
    const requests = await this.leaveRepo.findRequestsByEmployee(userId);
    return requests.map((r) => this.formatRequest(r));
  }

  // ══════════════════════════════════════════════════════
  //  Admin: Get Requests
  // ══════════════════════════════════════════════════════

  async getAdminRequests(filters: {
    status?: string;
    leaveType?: string;
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const requests = await this.leaveRepo.findAllRequests({
      status: filters.status,
      leaveType: filters.leaveType,
      employeeId: filters.employeeId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    // Enrich with employee details
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const profile = await this.employeeRepo.findByUserId(r.employeeId);
        const user = profile?.user;
        const inProbation = profile
          ? await this.checkEmployeeProbation(r.employeeId)
          : false;

        const formatted = {
          ...this.formatRequest(r, user),
          department: profile?.department ?? null,
          inProbation,
        };
        return formatted;
      }),
    );

    // Apply search filter client-side
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const filtered = enriched.filter(
        (r) =>
          r.employeeName?.toLowerCase().includes(search) ||
          r.employeeCode?.toLowerCase().includes(search),
      );
      return {
        requests: filtered,
        summary: {
          total: filtered.length,
          pending: filtered.filter((r) => r.status === LeaveStatus.PENDING).length,
          approved: filtered.filter((r) => r.status === LeaveStatus.APPROVED).length,
          rejected: filtered.filter((r) => r.status === LeaveStatus.REJECTED).length,
        },
      };
    }

    // Count summary
    const summary = {
      total: enriched.length,
      pending: enriched.filter((r) => r.status === LeaveStatus.PENDING).length,
      approved: enriched.filter((r) => r.status === LeaveStatus.APPROVED).length,
      rejected: enriched.filter((r) => r.status === LeaveStatus.REJECTED).length,
    };

    return { requests: enriched, summary };
  }

  private async checkEmployeeProbation(userId: string): Promise<boolean> {
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) return false;
    const policy = await this.leaveRepo.getPolicy();
    if (!policy) return true;
    return this.isInProbation(profile.dateOfJoining, policy.probationPeriodMonths);
  }


  private isPaidLeaveType(type: LeaveType): boolean {
    return type === LeaveType.CL || type === LeaveType.SL || type === LeaveType.EL;
  }

  private async resolveFinalApprovalLeaveType(
    request: LeaveRequest,
    overrideLeaveType?: LeaveType,
  ): Promise<LeaveType> {
    if (overrideLeaveType) return overrideLeaveType;
    if (request.requestMode === RequestMode.PERMISSION || request.leaveType === LeaveType.PERMISSION) {
      return LeaveType.PERMISSION;
    }

    const profile = await this.employeeRepo.findByUserId(request.employeeId);
    const policy = await this.leaveRepo.getPolicy();
    if (!profile || !policy) {
      return request.suggestedLeaveType ?? request.leaveType;
    }

    const requestRange = this.getRequestRange(request);
    const eligibilityDate = this.addMonthsToDateKey(
      profile.dateOfJoining,
      policy.probationPeriodMonths,
    );
    if (requestRange.startDate < eligibilityDate && request.leaveType !== LeaveType.LOP) {
      return LeaveType.LOP;
    }
    return request.leaveType;
  }

  private async validateBalanceForApprovedTreatment(
    request: LeaveRequest,
    finalLeaveType: LeaveType,
  ): Promise<void> {
    if (!this.isPaidLeaveType(finalLeaveType) || !request.totalDays) return;

    const profile = await this.employeeRepo.findByUserId(request.employeeId);
    const policy = await this.leaveRepo.getPolicyWithSlabs();
    if (!profile || !policy) {
      throw ApiError.badRequest('Leave policy or employee profile is unavailable', 'LEAVE_POLICY_NOT_FOUND');
    }

    const range = this.getRequestRange(request);
    const leaveCycle = this.getLeaveCycle(
      profile.dateOfJoining,
      policy.probationPeriodMonths,
      range.endDate,
    );
    if (range.startDate < leaveCycle.eligibilityDate || !leaveCycle.cycle) {
      throw ApiError.badRequest(
        `Paid leave is available only after probation is completed on ${leaveCycle.eligibilityDate}`,
        'LEAVE_NOT_AVAILABLE_DURING_PROBATION',
      );
    }
    if (finalLeaveType === LeaveType.CL && range.startDate < leaveCycle.cycle.cycleStart) {
      throw ApiError.badRequest(
        'Casual Leave cannot cross leave-year boundaries',
        'LEAVE_CROSSES_LEAVE_YEAR',
      );
    }
    if (
      (finalLeaveType === LeaveType.SL || finalLeaveType === LeaveType.EL) &&
      range.startDate < leaveCycle.cycle.monthStart
    ) {
      throw ApiError.badRequest(
        'Sick Leave and Emergency Leave cannot cross monthly reset boundaries',
        'LEAVE_CROSSES_MONTHLY_RESET',
      );
    }

    const summary = await this.getEmployeeSummary(request.employeeId, range.endDate);
    const balanceKey = finalLeaveType.toLowerCase() as 'cl' | 'sl' | 'el';
    const available = summary.balance[balanceKey] ?? 0;
    if (Number(request.totalDays) > available) {
      throw ApiError.badRequest(
        `Insufficient ${finalLeaveType} balance for approval. Available: ${available}, Requested: ${Number(request.totalDays)}`,
        'LEAVE_INSUFFICIENT_BALANCE_APPROVAL',
      );
    }
  }

  private async syncAttendanceForLeaveRequest(request: LeaveRequest) {
    const { startDate, endDate } = this.getRequestRange(request);
    await this.attendanceService.recomputeEmployeeDateRange(request.employeeId, startDate, endDate);
  }

  // ══════════════════════════════════════════════════════
  //  Admin: Approve / Reject / Override
  // ══════════════════════════════════════════════════════

  async approveRequest(
    requestId: string,
    adminId: string,
    remarks?: string,
    approvedLeaveTypeInput?: string,
  ) {
    const request = await this.leaveRepo.findRequestById(requestId);
    if (!request) throw ApiError.notFound('Leave request not found', 'LEAVE_NOT_FOUND');
    if (request.status !== LeaveStatus.PENDING) {
      throw ApiError.badRequest('Only pending requests can be approved', 'LEAVE_NOT_PENDING');
    }

    const approvedLeaveType = await this.resolveFinalApprovalLeaveType(
      request,
      approvedLeaveTypeInput as LeaveType | undefined,
    );
    if (request.requestMode !== RequestMode.PERMISSION && approvedLeaveType === LeaveType.PERMISSION) {
      throw ApiError.badRequest(
        'Permission treatment can only be used for permission requests',
        'LEAVE_INVALID_FINAL_TREATMENT',
      );
    }
    if (request.requestMode === RequestMode.PERMISSION && approvedLeaveType !== LeaveType.PERMISSION) {
      throw ApiError.badRequest(
        'Permission requests can only be approved as permission',
        'LEAVE_INVALID_FINAL_TREATMENT',
      );
    }
    await this.validateBalanceForApprovedTreatment(request, approvedLeaveType);

    request.status = LeaveStatus.APPROVED;
    request.approvedLeaveType = approvedLeaveType;
    request.finalAttendanceCode = approvedLeaveType;
    request.approvedBy = adminId;
    request.approvedAt = new Date();
    if (remarks) request.adminRemarks = remarks;
    await this.leaveRepo.saveRequest(request);
    await this.syncAttendanceForLeaveRequest(request);

    // Send email
    const profile = await this.employeeRepo.findByUserId(request.employeeId);
    if (profile?.user) {
      await this.sendLeaveStatusEmail(profile.user, request, 'approved').catch((err) =>
        console.error('Failed to send approval email', (err as Error).message),
      );
    }
    await this.notificationService.notifyUser(
      request.employeeId,
      'LEAVE_APPROVED',
      'Leave request approved',
      `Your leave request was approved as ${String(approvedLeaveType).replace(/_/g, ' ')}.`,
      '/employee/leave',
    ).catch((err) => console.error('Failed to create leave notification', err.message));

    return this.formatRequest(request, profile?.user);
  }

  async rejectRequest(requestId: string, adminId: string, remarks?: string) {
    const request = await this.leaveRepo.findRequestById(requestId);
    if (!request) throw ApiError.notFound('Leave request not found', 'LEAVE_NOT_FOUND');
    if (request.status !== LeaveStatus.PENDING) {
      throw ApiError.badRequest('Only pending requests can be rejected', 'LEAVE_NOT_PENDING');
    }

    request.status = LeaveStatus.REJECTED;
    request.approvedLeaveType = null;
    request.finalAttendanceCode = null;
    request.approvedBy = adminId;
    request.approvedAt = new Date();
    if (remarks) request.adminRemarks = remarks;
    await this.leaveRepo.saveRequest(request);
    await this.syncAttendanceForLeaveRequest(request);

    const profile = await this.employeeRepo.findByUserId(request.employeeId);
    if (profile?.user) {
      await this.sendLeaveStatusEmail(profile.user, request, 'rejected').catch((err) =>
        console.error('Failed to send rejection email', (err as Error).message),
      );
    }
    await this.notificationService.notifyUser(
      request.employeeId,
      'LEAVE_REJECTED',
      'Leave request rejected',
      remarks ? `Your leave request was rejected: ${remarks}` : 'Your leave request was rejected by HR.',
      '/employee/leave',
    ).catch((err) => console.error('Failed to create leave notification', err.message));

    return this.formatRequest(request, profile?.user);
  }

  async overrideRequest(
    requestId: string,
    adminId: string,
    data: { status: string; remarks?: string; leaveType?: string; approvedLeaveType?: string },
  ) {
    const request = await this.leaveRepo.findRequestById(requestId);
    if (!request) throw ApiError.notFound('Leave request not found', 'LEAVE_NOT_FOUND');

    request.status = data.status as LeaveStatus;
    request.approvedBy = request.status === LeaveStatus.PENDING ? null : adminId;
    request.approvedAt = request.status === LeaveStatus.PENDING ? null : new Date();
    if (data.remarks) request.adminRemarks = data.remarks;
    const overrideTypeInput = (data.approvedLeaveType ?? data.leaveType) as LeaveType | undefined;

    if (request.status === LeaveStatus.APPROVED) {
      const approvedLeaveType = await this.resolveFinalApprovalLeaveType(request, overrideTypeInput);
      if (request.requestMode !== RequestMode.PERMISSION && approvedLeaveType === LeaveType.PERMISSION) {
        throw ApiError.badRequest(
          'Permission treatment can only be used for permission requests',
          'LEAVE_INVALID_FINAL_TREATMENT',
        );
      }
      if (request.requestMode === RequestMode.PERMISSION && approvedLeaveType !== LeaveType.PERMISSION) {
        throw ApiError.badRequest(
          'Permission requests can only be approved as permission',
          'LEAVE_INVALID_FINAL_TREATMENT',
        );
      }
      await this.validateBalanceForApprovedTreatment(request, approvedLeaveType);
      request.approvedLeaveType = approvedLeaveType;
      request.finalAttendanceCode = approvedLeaveType;
    } else {
      request.approvedLeaveType = null;
      request.finalAttendanceCode = null;
    }

    await this.leaveRepo.saveRequest(request);
    await this.syncAttendanceForLeaveRequest(request);

    if (request.status === LeaveStatus.APPROVED || request.status === LeaveStatus.REJECTED) {
      const profile = await this.employeeRepo.findByUserId(request.employeeId);
      if (profile?.user) {
        const action = request.status === LeaveStatus.APPROVED ? 'approved' : 'rejected';
        await this.sendLeaveStatusEmail(profile.user, request, action).catch((err) =>
          console.error('Failed to send override status email', (err as Error).message),
        );
      }
      const approved = request.status === LeaveStatus.APPROVED;
      await this.notificationService.notifyUser(
        request.employeeId,
        approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        approved ? 'Leave request approved' : 'Leave request rejected',
        approved ? 'HR approved your leave request.' : 'HR rejected your leave request.',
        '/employee/leave',
      ).catch((err) => console.error('Failed to create leave notification', err.message));
    }

    return this.formatRequest(request);
  }

  // ══════════════════════════════════════════════════════
  //  Admin: Policy Management
  // ══════════════════════════════════════════════════════

  async getLeavePolicy() {
    const policy = await this.leaveRepo.getPolicyWithSlabs();
    if (!policy) return { policy: null, slabs: [] };

    return {
      policy: {
        id: policy.id,
        probationPeriodMonths: policy.probationPeriodMonths,
        probationLeaveAllowed: false,
        allowHalfDayLeave: policy.allowHalfDayLeave,
        allowPermissionHours: policy.allowPermissionHours,
        maxPermissionHoursPerMonth: Number(policy.maxPermissionHoursPerMonth),
        maxPermissionRequestsPerMonth: Number(policy.maxPermissionRequestsPerMonth),
        maxRegularizationsPerMonth: Number(policy.maxRegularizationsPerMonth),
      },
      slabs: (policy.slabs ?? [])
        .sort((a, b) => a.minYearsOfService - b.minYearsOfService)
        .map((s) => ({
          id: s.id,
          minYearsOfService: s.minYearsOfService,
          maxYearsOfService: s.maxYearsOfService,
          casualLeavePerYear: s.casualLeavePerYear,
          sickLeavePerYear: s.sickLeavePerYear,
          earnedLeavePerYear: s.earnedLeavePerYear,
        })),
    };
  }

  async updateLeavePolicy(input: {
    probationPeriodMonths?: number;
    probationLeaveAllowed?: boolean;
    allowHalfDayLeave?: boolean;
    allowPermissionHours?: boolean;
    maxPermissionHoursPerMonth?: number;
    maxPermissionRequestsPerMonth?: number;
    maxRegularizationsPerMonth?: number;
    slabs?: Array<{
      minYearsOfService: number;
      maxYearsOfService: number | null;
      casualLeavePerYear: number;
      sickLeavePerYear: number;
      earnedLeavePerYear: number;
    }>;
  }) {
    const { slabs, ...policyFields } = input;
    policyFields.probationLeaveAllowed = false;

    const policy = await this.leaveRepo.upsertPolicy(policyFields as any);

    if (slabs) {
      await this.leaveRepo.replaceSlabs(policy.id, slabs as any);
    }

    return this.getLeavePolicy();
  }

  // ══════════════════════════════════════════════════════
  //  Admin: Get Single Request Details
  // ══════════════════════════════════════════════════════

  async getRequestDetail(requestId: string) {
    const request = await this.leaveRepo.findRequestById(requestId);
    if (!request) throw ApiError.notFound('Leave request not found', 'LEAVE_NOT_FOUND');

    const profile = await this.employeeRepo.findByUserId(request.employeeId);
    return this.formatRequest(request, profile?.user);
  }

  // ══════════════════════════════════════════════════════
  //  Email helpers
  // ══════════════════════════════════════════════════════

  private async sendLeaveAppliedEmails(user: any, request: LeaveRequest) {
    const dateRange = this.getDateRangeString(request);
    const daysOrHours = request.totalHours
      ? `${Number(request.totalHours).toFixed(1)} hours`
      : `${Number(request.totalDays)} day(s)`;

    // To employee
    await this.emailService.sendGenericEmail(
      user.email,
      'Leave Request Submitted',
      'leaveApplied',
      {
        firstName: user.firstName,
        leaveType: request.leaveType,
        requestedLeaveType: request.leaveType,
        suggestedLeaveType: request.suggestedLeaveType ?? request.leaveType,
        requestMode: request.requestMode.replace('_', ' '),
        dateRange,
        daysOrHours,
        reason: request.reason,
        treatmentNote: request.treatmentNote || 'Request will follow organization leave policy during approval.',
        status: 'PENDING',
        statusTitle: 'Request received',
        statusMessage: 'Your leave request is now with the HR team for review.',
        statusAccent: '#B7791F',
        statusSoft: '#FFF8E1',
        statusIcon: '... ',
        year: new Date().getFullYear().toString(),
      },
    );
  }

  private async sendLeaveStatusEmail(user: any, request: LeaveRequest, action: 'approved' | 'rejected') {
    const dateRange = this.getDateRangeString(request);
    const daysOrHours = request.totalHours
      ? `${Number(request.totalHours).toFixed(1)} hours`
      : `${Number(request.totalDays)} day(s)`;

    await this.emailService.sendGenericEmail(
      user.email,
      `Leave Request ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      'leaveStatus',
      {
        firstName: user.firstName,
        leaveType: request.leaveType,
        requestedLeaveType: request.leaveType,
        approvedLeaveType: request.approvedLeaveType ?? '-',
        finalAttendanceCode: request.finalAttendanceCode ?? '-',
        requestMode: request.requestMode.replace('_', ' '),
        dateRange,
        daysOrHours,
        status: action.toUpperCase(),
        statusClass: action,
        statusTitle: action === 'approved' ? 'Your leave is approved' : 'Your leave was not approved',
        statusMessage: action === 'approved'
          ? 'Your request has been reviewed and approved by HR.'
          : 'Your request has been reviewed and rejected by HR.',
        statusAccent: action === 'approved' ? '#0D7C47' : '#C41E3A',
        statusSoft: action === 'approved' ? '#E6F9F0' : '#FEE7E7',
        statusIcon: action === 'approved' ? 'OK' : '!',
        adminRemarks: request.adminRemarks || 'No remarks',
        year: new Date().getFullYear().toString(),
      },
    );
  }

  private getDateRangeString(request: LeaveRequest): string {
    const formatDate = (value: string | null): string => {
      if (!value) return '-';
      return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    };
    if (request.requestMode === RequestMode.FULL_DAY) {
      return request.startDate === request.endDate
        ? formatDate(request.startDate)
        : `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
    }
    if (request.requestMode === RequestMode.HALF_DAY) {
      return `${formatDate(request.date)} (${request.halfDaySession === HalfDaySession.FN ? 'First half' : 'Second half'})`;
    }
    return `${formatDate(request.date)} (${request.fromTime?.slice(0, 5)} - ${request.toTime?.slice(0, 5)})`;
  }

  // ══════════════════════════════════════════════════════
  //  Formatter
  // ══════════════════════════════════════════════════════

  private formatRequest(r: LeaveRequest, user?: any) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: user ? `${user.firstName} ${user.lastName}` : null,
      employeeCode: user?.empId ?? null,
      leaveType: r.leaveType,
      requestedLeaveType: r.leaveType,
      approvedLeaveType: r.approvedLeaveType,
      finalAttendanceCode: r.finalAttendanceCode,
      suggestedLeaveType: r.suggestedLeaveType,
      treatmentNote: r.treatmentNote,
      requestMode: r.requestMode,
      startDate: r.startDate,
      endDate: r.endDate,
      date: r.date,
      halfDaySession: r.halfDaySession,
      fromTime: r.fromTime,
      toTime: r.toTime,
      totalDays: r.totalDays ? Number(r.totalDays) : null,
      totalHours: r.totalHours ? Number(r.totalHours) : null,
      reason: r.reason,
      adminRemarks: r.adminRemarks,
      status: r.status,
      policySnapshot: r.policySnapshot,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

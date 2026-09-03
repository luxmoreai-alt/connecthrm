import { AppDataSource } from '../config/database';
import { AttendanceRepository } from '../repositories/attendance.repository';
import { LeaveRepository } from '../repositories/leave.repository';
import { PayrollRepository } from '../repositories/payroll.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { LeaveStatus } from '../entities/LeaveRequest.entity';
import { PayrollRecordStatus } from '../entities/PayrollRecord.entity';
import { UserRole } from '../entities/User.entity';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { PersonalDetails } from '../entities/PersonalDetails.entity';
import { EmployeeSalaryStructure } from '../entities/EmployeeSalaryStructure.entity';
import { SalaryStructureStatus } from '../salary/salary.enums';

const attendanceRepo = new AttendanceRepository();
const leaveRepo = new LeaveRepository();
const payrollRepo = new PayrollRepository();
const settingsRepo = new SettingsRepository();

export class DashboardService {
  async getSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const [
      activeEmployees,
      todaySummary,
      pendingLeaveCount,
      payrollRecords,
      payrollRuns,
      holidays,
      todayAttendance,
      departmentHeadcount,
      attendanceTrend,
      salaryStructures,
    ] = await Promise.all([
      attendanceRepo.findAllActiveEmployees(),
      attendanceRepo.getDateSummary(today),
      leaveRepo.countByStatus(LeaveStatus.PENDING),
      payrollRepo.findRecords({ year: currentYear, month: currentMonth }),
      payrollRepo.findRuns({ year: currentYear, month: currentMonth }),
      settingsRepo.findAllHolidays(),
      attendanceRepo.findByDateFiltered(today),
      this.getDepartmentHeadcount(),
      this.getAttendanceTrend(14),
      AppDataSource.getRepository(EmployeeSalaryStructure).find({
        where: { status: SalaryStructureStatus.ACTIVE },
        relations: ['employee'],
        order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
      }),
    ]);

    const totalEmployees = activeEmployees.length;
    const presentToday = todaySummary.PRESENT + todaySummary.LATE;
    const presentPct = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;
    const lateArrivals = todaySummary.LATE;

    const completedRecords = payrollRecords.filter(
      (r) => r.status === PayrollRecordStatus.GENERATED || r.status === PayrollRecordStatus.EMAILED,
    );
    const failedRecords = payrollRecords.filter((r) => r.status === PayrollRecordStatus.FAILED);
    const draftRecords = payrollRecords.filter((r) => r.status === PayrollRecordStatus.DRAFT);
    const emailedRecords = payrollRecords.filter((r) => r.status === PayrollRecordStatus.EMAILED);
    const latestPayrollRun = payrollRuns[0] ?? null;
    const totalPayout = completedRecords.reduce((sum, r) => sum + Number(r.netPay), 0);
    const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
    const completedSalaryByEmployee = new Map<string, number>();
    for (const record of completedRecords) {
      if (activeEmployeeIds.has(record.employeeId) && !completedSalaryByEmployee.has(record.employeeId)) {
        completedSalaryByEmployee.set(record.employeeId, Number(record.netPay || 0));
      }
    }
    const configuredSalaryByEmployee = new Map<string, number>();
    for (const structure of salaryStructures) {
      if (!activeEmployeeIds.has(structure.employeeId) || configuredSalaryByEmployee.has(structure.employeeId)) continue;
      const configuredNetPay = Number(structure.summary?.netPay);
      configuredSalaryByEmployee.set(
        structure.employeeId,
        Number.isFinite(configuredNetPay) ? configuredNetPay : Number(structure.monthlyCtc || 0),
      );
    }
    let overallMonthlySalary = 0;
    let salaryEmployeeCount = 0;
    for (const employeeId of activeEmployeeIds) {
      const amount = completedSalaryByEmployee.get(employeeId) ?? configuredSalaryByEmployee.get(employeeId);
      if (amount === undefined) continue;
      overallMonthlySalary += amount;
      salaryEmployeeCount += 1;
    }
    const currentMonthSalary = {
      amount: overallMonthlySalary,
      processedAmount: totalPayout,
      employeeCount: salaryEmployeeCount,
      totalEmployees,
      isFinal: totalEmployees > 0 && completedSalaryByEmployee.size >= totalEmployees,
      month: now.toLocaleString('en', { month: 'short' }),
      year: currentYear,
    };

    let payrollStatus: 'NOT_RUN' | 'PENDING' | 'PARTIAL' | 'COMPLETED' = 'NOT_RUN';
    if (completedRecords.length === 0 && payrollRecords.length === 0 && !latestPayrollRun) {
      payrollStatus = 'NOT_RUN';
    } else if (completedRecords.length === 0) {
      payrollStatus = 'PENDING';
    } else if (totalEmployees > 0 && completedRecords.length < totalEmployees) {
      payrollStatus = 'PARTIAL';
    } else {
      payrollStatus = 'COMPLETED';
    }

    const runProcessedCount =
      latestPayrollRun && latestPayrollRun.processedCount > 0 ? latestPayrollRun.processedCount : 0;
    const progressNumerator = runProcessedCount > 0 ? runProcessedCount : completedRecords.length;
    const payrollProgressPercent =
      totalEmployees > 0 && progressNumerator > 0
        ? Math.min(100, Math.round((progressNumerator / totalEmployees) * 100))
        : null;

    const payrollStatusLabelMap: Record<typeof payrollStatus, string> = {
      NOT_RUN: 'Not Run',
      PENDING: 'Pending',
      PARTIAL: 'Partially Processed',
      COMPLETED: 'Completed',
    };

    const monthLabel = now.toLocaleString('en', { month: 'short' });
    const payrollMonth = `${monthLabel} ${currentYear}`;

    const payrollProcessed = {
      status: payrollStatus,
      statusLabel: payrollStatusLabelMap[payrollStatus],
      progressPercent:
        payrollStatus === 'PARTIAL' || payrollStatus === 'COMPLETED' ? payrollProgressPercent : null,
      expectedEmployees: totalEmployees,
      totalRecords: payrollRecords.length,
      generatedCount: completedRecords.length,
      failedCount: failedRecords.length,
      draftCount: draftRecords.length,
      emailedCount: emailedRecords.length,
      totalPayout,
      month: monthLabel,
      year: currentYear,
      isRun: payrollStatus !== 'NOT_RUN',
      latestRunStatus: latestPayrollRun?.status ?? null,
    };

    const payrollMeta =
      totalEmployees > 0
        ? `${payrollProcessed.generatedCount}/${totalEmployees} employees`
        : 'No active employees';

    const kpiStats = [
      {
        label: 'Total Employees',
        value: String(totalEmployees),
        change: `${departmentHeadcount.length} departments`,
        changeType: 'neutral' as const,
        icon: 'Users',
        progress: null,
        caption: 'Active workforce',
      },
      {
        label: 'Present Today',
        value: String(presentToday),
        change: `${presentPct.toFixed(1)}% attendance`,
        changeType: presentToday > 0 ? ('up' as const) : ('neutral' as const),
        icon: 'UserCheck',
        progress: totalEmployees > 0 ? Math.round(presentPct) : null,
        caption: `${todaySummary.LATE} late arrivals`,
      },
      {
        label: 'This Month Salary',
        value: new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(currentMonthSalary.amount),
        change: `${currentMonthSalary.employeeCount}/${totalEmployees} employees`,
        changeType: 'neutral' as const,
        icon: 'Wallet',
        progress: null,
        caption: `${payrollMonth} · ${currentMonthSalary.isFinal ? 'Final net payroll' : 'Projected net salary'}`,
      },
      {
        label: 'Payroll Processed',
        value: payrollProcessed.statusLabel,
        change: payrollMeta,
        changeType:
          payrollStatus === 'COMPLETED'
            ? ('up' as const)
            : payrollStatus === 'NOT_RUN'
              ? ('neutral' as const)
              : ('down' as const),
        icon: 'Wallet',
        progress: payrollProcessed.progressPercent,
        caption: payrollMonth,
      },
      {
        label: 'Late Arrivals',
        value: String(lateArrivals),
        change:
          totalEmployees > 0 ? `${((lateArrivals / totalEmployees) * 100).toFixed(1)}% of workforce` : '',
        changeType: lateArrivals > 0 ? ('down' as const) : ('up' as const),
        icon: 'Clock',
        progress: null,
        caption: today,
      },
    ];

    const attendanceBreakdown = {
      present: todaySummary.PRESENT + todaySummary.LATE,
      halfDay: todaySummary.HALF_DAY,
      leave: todaySummary.LEAVE,
      lop: todaySummary.LOP,
      weekOff: todaySummary.WEEK_OFF,
      holiday: todaySummary.HOLIDAY,
      absent: todaySummary.ABSENT,
      late: todaySummary.LATE,
      total: Object.values(todaySummary).reduce((sum, value) => sum + Number(value || 0), 0),
      date: today,
    };

    const recentAttendance = todayAttendance.slice(0, 10).map((a) => {
      const emp = a.employee;
      const checkIn = a.firstCheckInAt
        ? new Date(a.firstCheckInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '-';
      const checkOut = a.lastCheckOutAt
        ? new Date(a.lastCheckOutAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '-';

      const statusMap: Record<string, string> = {
        PRESENT: 'Present',
        LATE: 'Late',
        ABSENT: 'Absent',
        HALF_DAY: 'Half Day',
        LEAVE: 'Leave',
        HOLIDAY: 'Holiday',
        WEEK_OFF: 'Week Off',
        LOP: 'LOP',
        NOT_STARTED: 'Absent',
        MISSED_CHECK_IN: 'Absent',
      };

      return {
        id: emp?.empId ?? a.employeeId.slice(0, 8),
        name: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        department: '',
        date: new Date(today).toLocaleDateString('en', { month: 'short', day: '2-digit' }),
        checkIn,
        checkOut,
        status: statusMap[a.status] ?? 'Absent',
      };
    });

    if (recentAttendance.length > 0) {
      const profileRepo = AppDataSource.getRepository(EmployeeProfile);
      const profiles = await profileRepo.find({ relations: ['user'] });
      const profileMap = new Map<string, EmployeeProfile>();
      for (const p of profiles) {
        profileMap.set(p.userId, p);
      }
      for (const rec of recentAttendance) {
        const att = todayAttendance.find(
          (a) => a.employee?.empId === rec.id || a.employeeId.slice(0, 8) === rec.id,
        );
        if (att) {
          const profile = profileMap.get(att.employeeId);
          rec.department = profile?.department ?? '';
        }
      }
    }

    const upcomingHolidays = holidays
      .filter((h) => h.date >= today)
      .slice(0, 4)
      .map((h) => {
        const d = new Date(`${h.date}T00:00:00`);
        return {
          name: h.name,
          date: d.toLocaleDateString('en', { month: 'short', day: '2-digit' }),
          day: d.toLocaleDateString('en', { weekday: 'long' }),
        };
      });

    const announcements = upcomingHolidays.slice(0, 2).map((h) => ({
      title: `Holiday - ${h.name}`,
      date: h.date,
      type: 'holiday' as const,
    }));

    return {
      kpiStats,
      payrollProcessed,
      currentMonthSalary,
      attendanceTrend,
      departmentData: departmentHeadcount,
      attendanceBreakdown,
      pendingLeaveCount,
      recentAttendance,
      announcements,
      upcomingHolidays,
    };
  }

  private async getAttendanceTrend(days: number) {
    const results: { date: string; present: number; absent: number; late: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const summary = await attendanceRepo.getDateSummary(dateStr);

      results.push({
        date: d.toLocaleDateString('en', { month: 'short', day: '2-digit' }),
        present: summary.PRESENT + summary.LATE,
        absent: summary.ABSENT + summary.HALF_DAY,
        late: summary.LATE,
      });
    }

    return results;
  }

  private async getDepartmentHeadcount() {
    const profileRepo = AppDataSource.getRepository(EmployeeProfile);
    const rows: { department: string; count: string }[] = await profileRepo
      .createQueryBuilder('ep')
      .innerJoin('ep.user', 'u')
      .select('ep.department', 'department')
      .addSelect('COUNT(*)', 'count')
      .where('u.isActive = true')
      .andWhere('u.role = :role', { role: UserRole.EMPLOYEE })
      .groupBy('ep.department')
      .orderBy('count', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      department: r.department,
      count: parseInt(r.count, 10),
    }));
  }

  async getUpcomingBirthdays(days = 30) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const personalRepo = AppDataSource.getRepository(PersonalDetails);
    const records = await personalRepo
      .createQueryBuilder('pd')
      .innerJoinAndSelect('pd.user', 'u')
      .leftJoin(EmployeeProfile, 'ep', 'ep.userId = u.id')
      .addSelect('ep.department', 'department')
      .addSelect('ep.designation', 'designation')
      .where('pd.dateOfBirth IS NOT NULL')
      .andWhere('u.isActive = true')
      .andWhere('u.role = :role', { role: UserRole.EMPLOYEE })
      .getRawAndEntities();

    const currentYear = today.getFullYear();
    const results: {
      employeeId: string;
      employeeCode: string;
      fullName: string;
      department: string;
      designation: string;
      dateOfBirth: string;
      birthdayThisYear: string;
      daysLeft: number;
    }[] = [];

    for (let i = 0; i < records.entities.length; i++) {
      const pd = records.entities[i];
      const raw = records.raw[i];
      if (!pd.dateOfBirth) continue;

      const dob = new Date(`${pd.dateOfBirth}T00:00:00`);
      let bday = new Date(currentYear, dob.getMonth(), dob.getDate());

      if (bday.toISOString().slice(0, 10) < todayStr) {
        bday = new Date(currentYear + 1, dob.getMonth(), dob.getDate());
      }

      const bdayStr = bday.toISOString().slice(0, 10);
      const diffMs = bday.getTime() - new Date(`${todayStr}T00:00:00`).getTime();
      const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft > days) continue;

      results.push({
        employeeId: pd.userId,
        employeeCode: pd.user?.empId ?? '',
        fullName: pd.user ? `${pd.user.firstName} ${pd.user.lastName}` : '',
        department: raw.department ?? '',
        designation: raw.designation ?? '',
        dateOfBirth: pd.dateOfBirth,
        birthdayThisYear: bdayStr,
        daysLeft,
      });
    }

    results.sort((a, b) => a.daysLeft - b.daysLeft);
    return results;
  }

  async getUpcomingHolidays(limit = 4) {
    const today = new Date().toISOString().slice(0, 10);
    const holidays = await settingsRepo.findAllHolidays();

    return holidays
      .filter((h) => h.date >= today)
      .slice(0, limit)
      .map((h) => {
        const d = new Date(`${h.date}T00:00:00`);
        const diffMs = d.getTime() - new Date(`${today}T00:00:00`).getTime();
        const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
        return {
          id: h.id,
          name: h.name,
          date: h.date,
          dayName: d.toLocaleDateString('en', { weekday: 'long' }),
          daysLeft,
        };
      });
  }

  async getHolidayCalendar(year = new Date().getFullYear()) {
    const holidays = await settingsRepo.findAllHolidays();
    const yearPrefix = `${year}-`;

    return holidays
      .filter((holiday) => holiday.date.startsWith(yearPrefix))
      .map((holiday) => {
        const date = new Date(`${holiday.date}T00:00:00`);
        return {
          id: holiday.id,
          name: holiday.name,
          date: holiday.date,
          dayName: date.toLocaleDateString('en', { weekday: 'long' }),
        };
      });
  }
}

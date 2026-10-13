import { Between, In, Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AttendancePolicy } from '../entities/AttendancePolicy.entity';
import { Attendance } from '../entities/Attendance.entity';
import { AttendancePunch } from '../entities/AttendancePunch.entity';
import { AttendanceSession } from '../entities/AttendanceSession.entity';
import { AttendanceRegularizationRequest } from '../entities/AttendanceRegularizationRequest.entity';
import { AttendancePermissionRequest } from '../entities/AttendancePermissionRequest.entity';
import { AttendanceAuditLog } from '../entities/AttendanceAuditLog.entity';
import { DEFAULT_ORGANIZATION_ID } from '../attendance/attendance.enums';
import { LeaveRequest, LeaveStatus, RequestMode } from '../entities/LeaveRequest.entity';
import { Holiday } from '../entities/Holiday.entity';
import { User, UserRole } from '../entities/User.entity';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { AttendanceEmployeePolicyOverride } from '../entities/AttendanceEmployeePolicyOverride.entity';

export class AttendanceV2Repository {
  private policyRepo: Repository<AttendancePolicy>;
  private dayRepo: Repository<Attendance>;
  private punchRepo: Repository<AttendancePunch>;
  private sessionRepo: Repository<AttendanceSession>;
  private regularizationRepo: Repository<AttendanceRegularizationRequest>;
  private permissionRepo: Repository<AttendancePermissionRequest>;
  private auditRepo: Repository<AttendanceAuditLog>;
  private accessOverrideRepo: Repository<AttendanceEmployeePolicyOverride>;
  private leaveRepo: Repository<LeaveRequest>;
  private holidayRepo: Repository<Holiday>;
  private userRepo: Repository<User>;
  private profileRepo: Repository<EmployeeProfile>;

  constructor() {
    this.policyRepo = AppDataSource.getRepository(AttendancePolicy);
    this.dayRepo = AppDataSource.getRepository(Attendance);
    this.punchRepo = AppDataSource.getRepository(AttendancePunch);
    this.sessionRepo = AppDataSource.getRepository(AttendanceSession);
    this.regularizationRepo = AppDataSource.getRepository(
      AttendanceRegularizationRequest,
    );
    this.permissionRepo = AppDataSource.getRepository(AttendancePermissionRequest);
    this.auditRepo = AppDataSource.getRepository(AttendanceAuditLog);
    this.accessOverrideRepo = AppDataSource.getRepository(AttendanceEmployeePolicyOverride);
    this.leaveRepo = AppDataSource.getRepository(LeaveRequest);
    this.holidayRepo = AppDataSource.getRepository(Holiday);
    this.userRepo = AppDataSource.getRepository(User);
    this.profileRepo = AppDataSource.getRepository(EmployeeProfile);
  }

  async getActivePolicy(
    organizationId = DEFAULT_ORGANIZATION_ID,
  ): Promise<AttendancePolicy | null> {
    return this.policyRepo.findOne({
      where: { organizationId, active: true },
      order: { version: 'DESC' },
    });
  }

  async listPolicyVersions(
    organizationId = DEFAULT_ORGANIZATION_ID,
  ): Promise<AttendancePolicy[]> {
    return this.policyRepo.find({
      where: { organizationId },
      order: { version: 'DESC' },
    });
  }

  async createPolicyVersion(input: Partial<AttendancePolicy>): Promise<AttendancePolicy> {
    return AppDataSource.transaction(async (manager) => {
      const orgId = input.organizationId || DEFAULT_ORGANIZATION_ID;
      await manager.getRepository(AttendancePolicy).update(
        { organizationId: orgId, active: true },
        { active: false },
      );
      const latest = await manager.getRepository(AttendancePolicy).findOne({
        where: { organizationId: orgId },
        order: { version: 'DESC' },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      const created = manager.getRepository(AttendancePolicy).create({
        ...input,
        organizationId: orgId,
        version: nextVersion,
        active: true,
      });
      return manager.getRepository(AttendancePolicy).save(created);
    });
  }

  async findDayRecord(employeeId: string, date: string): Promise<Attendance | null> {
    return this.dayRepo.findOne({ where: { employeeId, date } });
  }

  async findDayRecordById(id: string): Promise<Attendance | null> {
    return this.dayRepo.findOne({ where: { id }, relations: ['employee'] });
  }

  async saveDayRecord(data: Partial<Attendance>): Promise<Attendance> {
    const entity = this.dayRepo.create(data);
    return this.dayRepo.save(entity);
  }

  async upsertDayRecord(
    employeeId: string,
    date: string,
    data: Partial<Attendance>,
  ): Promise<Attendance> {
    const existing = await this.findDayRecord(employeeId, date);
    if (existing) {
      Object.assign(existing, data);
      return this.dayRepo.save(existing);
    }
    return this.saveDayRecord({ employeeId, date, ...data });
  }

  async findMonthlyDayRecords(
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<Attendance[]> {
    return this.dayRepo.find({
      where: { employeeId, date: Between(startDate, endDate) },
      order: { date: 'ASC' },
    });
  }

  async findDailyDayRecords(
    date: string,
    filters?: { employeeId?: string; department?: string; status?: string; search?: string },
  ): Promise<Array<Attendance & { employee: User; profile: EmployeeProfile | null }>> {
    const qb = this.dayRepo
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.employee', User, 'u', 'u.id = a.employeeId')
      .leftJoinAndMapOne('a.profile', EmployeeProfile, 'p', 'p.userId = a.employeeId')
      .where('a.date = :date', { date });

    if (filters?.employeeId) qb.andWhere('a.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.department) qb.andWhere('p.department = :department', { department: filters.department });
    if (filters?.status) qb.andWhere('a.status = :status', { status: filters.status });
    if (filters?.search) {
      qb.andWhere(
        '(u."firstName" ILIKE :q OR u."lastName" ILIKE :q OR u."empId" ILIKE :q OR u.email ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    return qb.orderBy('u.firstName', 'ASC').getMany() as any;
  }

  async findDayRecordsByDate(date: string): Promise<Attendance[]> {
    return this.dayRepo.find({ where: { date } });
  }

  async findPunchesByEmployeeAndDate(
    employeeId: string,
    start: Date,
    end: Date,
    punchDate?: string,
  ): Promise<AttendancePunch[]> {
    if (!punchDate) {
      return this.punchRepo.find({
        where: { employeeId, time: Between(start, end) },
        order: { time: 'ASC' },
      });
    }

    return this.punchRepo
      .createQueryBuilder('punch')
      .where('punch."employeeId" = :employeeId', { employeeId })
      .andWhere(
        '(punch."punchDate" = :punchDate OR (punch."punchDate" IS NULL AND punch.time BETWEEN :start AND :end))',
        { punchDate, start, end },
      )
      .orderBy('punch.time', 'ASC')
      .getMany();
  }

  async findLatestPunchForDate(
    employeeId: string,
    start: Date,
    end: Date,
  ): Promise<AttendancePunch | null> {
    return this.punchRepo.findOne({
      where: { employeeId, time: Between(start, end) },
      order: { time: 'DESC' },
    });
  }

  async createPunch(data: Partial<AttendancePunch>): Promise<AttendancePunch> {
    const entity = this.punchRepo.create(data);
    return this.punchRepo.save(entity);
  }

  async replaceSessions(
    attendanceId: string,
    employeeId: string,
    date: string,
    sessions: Array<Partial<AttendanceSession>>,
  ): Promise<AttendanceSession[]> {
    await this.sessionRepo.delete({ attendanceId });
    if (sessions.length === 0) return [];
    const entities = sessions.map((session) =>
      this.sessionRepo.create({
        ...session,
        attendanceId,
        employeeId,
        date,
      }),
    );
    return this.sessionRepo.save(entities);
  }

  async findSessionsByAttendanceId(attendanceId: string): Promise<AttendanceSession[]> {
    return this.sessionRepo.find({
      where: { attendanceId },
      order: { sessionOrder: 'ASC' },
    });
  }

  async createRegularizationRequest(
    data: Partial<AttendanceRegularizationRequest>,
  ): Promise<AttendanceRegularizationRequest> {
    const entity = this.regularizationRepo.create(data);
    return this.regularizationRepo.save(entity);
  }

  async findRegularizationById(
    id: string,
  ): Promise<AttendanceRegularizationRequest | null> {
    return this.regularizationRepo.findOne({ where: { id } });
  }

  async saveRegularization(
    entity: AttendanceRegularizationRequest,
  ): Promise<AttendanceRegularizationRequest> {
    return this.regularizationRepo.save(entity);
  }

  async findRegularizationRequests(filters: {
    employeeId?: string;
    status?: string;
    monthStart?: string;
    monthEnd?: string;
    date?: string;
  }): Promise<AttendanceRegularizationRequest[]> {
    const qb = this.regularizationRepo.createQueryBuilder('r');
    if (filters.employeeId) qb.andWhere('r.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.date) qb.andWhere('r.date = :date', { date: filters.date });
    if (filters.monthStart && filters.monthEnd) {
      qb.andWhere('r.date BETWEEN :s AND :e', { s: filters.monthStart, e: filters.monthEnd });
    }
    return qb.orderBy('r.createdAt', 'DESC').getMany();
  }

  async findApprovedRegularizationForDate(
    employeeId: string,
    date: string,
  ): Promise<AttendanceRegularizationRequest | null> {
    return this.regularizationRepo.findOne({
      where: { employeeId, date, status: 'APPROVED' as any },
      order: { reviewedAt: 'DESC' },
    });
  }

  async createPermissionRequest(
    data: Partial<AttendancePermissionRequest>,
  ): Promise<AttendancePermissionRequest> {
    const entity = this.permissionRepo.create(data);
    return this.permissionRepo.save(entity);
  }

  async findPermissionById(id: string): Promise<AttendancePermissionRequest | null> {
    return this.permissionRepo.findOne({ where: { id } });
  }

  async savePermission(
    entity: AttendancePermissionRequest,
  ): Promise<AttendancePermissionRequest> {
    return this.permissionRepo.save(entity);
  }

  async findPermissionRequests(filters: {
    employeeId?: string;
    status?: string;
    monthStart?: string;
    monthEnd?: string;
    date?: string;
  }): Promise<AttendancePermissionRequest[]> {
    const qb = this.permissionRepo.createQueryBuilder('p');
    if (filters.employeeId) qb.andWhere('p.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.date) qb.andWhere('p.date = :date', { date: filters.date });
    if (filters.monthStart && filters.monthEnd) {
      qb.andWhere('p.date BETWEEN :s AND :e', { s: filters.monthStart, e: filters.monthEnd });
    }
    return qb.orderBy('p.createdAt', 'DESC').getMany();
  }

  async findApprovedPermissionForDate(
    employeeId: string,
    date: string,
  ): Promise<AttendancePermissionRequest[]> {
    return this.permissionRepo.find({
      where: { employeeId, date, status: 'APPROVED' as any },
      order: { reviewedAt: 'DESC' },
    });
  }

  async findApprovedLeaveForEmployeeDate(
    employeeId: string,
    date: string,
  ): Promise<LeaveRequest | null> {
    return this.leaveRepo
      .createQueryBuilder('l')
      .where('l.employeeId = :employeeId', { employeeId })
      .andWhere('l.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere(
        `(
          (l.requestMode = :fullDay AND l.startDate <= :date AND l.endDate >= :date)
          OR
          (l.requestMode != :fullDay AND l.date = :date)
        )`,
        { fullDay: RequestMode.FULL_DAY, date },
      )
      .orderBy('l.createdAt', 'DESC')
      .getOne();
  }

  async findApprovedLeavesForDate(date: string): Promise<LeaveRequest[]> {
    return this.leaveRepo
      .createQueryBuilder('l')
      .where('l.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere(
        `(
          (l.requestMode = :fullDay AND l.startDate <= :date AND l.endDate >= :date)
          OR
          (l.requestMode != :fullDay AND l.date = :date)
        )`,
        { fullDay: RequestMode.FULL_DAY, date },
      )
      .getMany();
  }

  async findHolidayByDate(date: string): Promise<Holiday | null> {
    return this.holidayRepo.findOne({ where: { date } });
  }

  async findEmployeeById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findEmployeeProfileByUserId(userId: string): Promise<EmployeeProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  async findActiveEmployees(): Promise<User[]> {
    return this.userRepo.find({
      where: { role: UserRole.EMPLOYEE, isActive: true },
      order: { firstName: 'ASC' },
    });
  }

  async findEmployeeProfilesMap(
    userIds: string[],
  ): Promise<Map<string, EmployeeProfile>> {
    if (userIds.length === 0) return new Map<string, EmployeeProfile>();
    const rows = await this.profileRepo.find({
      where: { userId: In(userIds) },
    });
    const map = new Map<string, EmployeeProfile>();
    for (const row of rows) map.set(row.userId, row);
    return map;
  }

  async createAuditLog(data: Partial<AttendanceAuditLog>): Promise<AttendanceAuditLog> {
    const entity = this.auditRepo.create(data);
    return this.auditRepo.save(entity);
  }

  async getEmployeeAccessOverride(
    employeeId: string,
  ): Promise<AttendanceEmployeePolicyOverride | null> {
    return this.accessOverrideRepo.findOne({
      where: { employeeId },
      relations: ['employee'],
    });
  }

  async getEffectiveEmployeeAccessOverride(
    employeeId: string,
    date: string,
  ): Promise<AttendanceEmployeePolicyOverride | null> {
    return this.accessOverrideRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.employee', 'employee')
      .where('o.employeeId = :employeeId', { employeeId })
      .andWhere('o.active = true')
      .andWhere('(o.effectiveFrom IS NULL OR o.effectiveFrom <= :date)', { date })
      .andWhere('(o.effectiveUntil IS NULL OR o.effectiveUntil >= :date)', { date })
      .orderBy('o.updatedAt', 'DESC')
      .getOne();
  }

  async saveEmployeeAccessOverride(
    employeeId: string,
    data: Partial<AttendanceEmployeePolicyOverride>,
  ): Promise<AttendanceEmployeePolicyOverride> {
    const existing = await this.accessOverrideRepo.findOne({ where: { employeeId } });
    if (existing) {
      Object.assign(existing, data);
      return this.accessOverrideRepo.save(existing);
    }
    const entity = this.accessOverrideRepo.create({
      employeeId,
      ...data,
    });
    return this.accessOverrideRepo.save(entity);
  }

  async listEmployeeAccessOverrides(filters?: {
    search?: string;
    activeOnly?: boolean;
  }): Promise<AttendanceEmployeePolicyOverride[]> {
    const qb = this.accessOverrideRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.employee', 'employee');

    if (filters?.activeOnly) {
      qb.andWhere('o.active = true');
    }

    if (filters?.search) {
      qb.andWhere(
        '(employee."firstName" ILIKE :q OR employee."lastName" ILIKE :q OR employee."empId" ILIKE :q OR employee.email ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    return qb.orderBy('o.updatedAt', 'DESC').getMany();
  }
}

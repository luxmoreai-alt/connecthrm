import { Between, In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { ShiftAssignment } from '../entities/ShiftAssignment.entity';
import { ShiftDefinition } from '../entities/ShiftDefinition.entity';
import { User, UserRole } from '../entities/User.entity';
import { ApiError } from '../utils/apiError';

export interface ShiftDayInput {
  date: string;
  shiftId: string | null;
  note?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value?: string): Date {
  if (!value || !DATE_PATTERN.test(value)) {
    throw ApiError.badRequest('weekStart must use YYYY-MM-DD format', 'INVALID_WEEK_START');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw ApiError.badRequest('Invalid week start date', 'INVALID_WEEK_START');
  }
  return parsed;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekRange(requestedStart?: string) {
  const input = requestedStart ? parseDate(requestedStart) : new Date();
  const normalized = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = normalized.getUTCDay();
  normalized.setUTCDate(normalized.getUTCDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(normalized);
  end.setUTCDate(end.getUTCDate() + 6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const current = new Date(normalized);
    current.setUTCDate(current.getUTCDate() + index);
    return dateKey(current);
  });
  return { weekStart: dateKey(normalized), weekEnd: dateKey(end), days };
}

function serializeShift(shift: ShiftDefinition) {
  return {
    id: shift.id,
    code: shift.code,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    color: shift.color,
    isNightShift: shift.isNightShift,
  };
}

export class ShiftService {
  private definitionRepository = AppDataSource.getRepository(ShiftDefinition);
  private assignmentRepository = AppDataSource.getRepository(ShiftAssignment);
  private userRepository = AppDataSource.getRepository(User);

  async getDefinitions() {
    const shifts = await this.definitionRepository.find({
      where: { isActive: true },
      order: { startTime: 'ASC', name: 'ASC' },
    });
    return shifts.map(serializeShift);
  }

  async getEmployeeWeek(employeeId: string, requestedStart?: string) {
    const range = weekRange(requestedStart);
    const employee = await this.userRepository.findOne({
      where: { id: employeeId, isActive: true, deletedAt: IsNull() },
      relations: { employeeProfile: true },
    });
    if (!employee) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');

    const assignments = await this.assignmentRepository.find({
      where: { employeeId, shiftDate: Between(range.weekStart, range.weekEnd) },
      relations: { shift: true },
      order: { shiftDate: 'ASC' },
    });
    const byDate = new Map(assignments.map((item) => [item.shiftDate, item]));

    return {
      ...range,
      employee: {
        id: employee.id,
        empId: employee.empId,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        department: employee.employeeProfile?.department || '',
        designation: employee.employeeProfile?.designation || '',
        defaultShiftSchedule: employee.employeeProfile?.shiftSchedule || '',
      },
      assignments: range.days.map((date) => {
        const assignment = byDate.get(date);
        return {
          date,
          assignmentId: assignment?.id || null,
          shift: assignment?.shift ? serializeShift(assignment.shift) : null,
          note: assignment?.note || '',
        };
      }),
    };
  }

  async getAdminWeek(requestedStart?: string) {
    const range = weekRange(requestedStart);
    const [definitions, employees, assignments] = await Promise.all([
      this.getDefinitions(),
      this.userRepository.find({
        where: { role: UserRole.EMPLOYEE, isActive: true, deletedAt: IsNull() },
        relations: { employeeProfile: true },
        order: { firstName: 'ASC', lastName: 'ASC' },
      }),
      this.assignmentRepository.find({
        where: { shiftDate: Between(range.weekStart, range.weekEnd) },
        relations: { shift: true },
        order: { shiftDate: 'ASC' },
      }),
    ]);

    const byEmployee = new Map<string, Map<string, ShiftAssignment>>();
    assignments.forEach((assignment) => {
      if (!byEmployee.has(assignment.employeeId)) byEmployee.set(assignment.employeeId, new Map());
      byEmployee.get(assignment.employeeId)!.set(assignment.shiftDate, assignment);
    });

    return {
      ...range,
      definitions,
      employees: employees.map((employee) => ({
        id: employee.id,
        empId: employee.empId,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        department: employee.employeeProfile?.department || '',
        designation: employee.employeeProfile?.designation || '',
        defaultShiftSchedule: employee.employeeProfile?.shiftSchedule || '',
        assignments: range.days.map((date) => {
          const assignment = byEmployee.get(employee.id)?.get(date);
          return {
            date,
            assignmentId: assignment?.id || null,
            shift: assignment?.shift ? serializeShift(assignment.shift) : null,
            note: assignment?.note || '',
          };
        }),
      })),
    };
  }

  async saveEmployeeWeek(employeeId: string, adminId: string, requestedStart: string, days: ShiftDayInput[]) {
    const range = weekRange(requestedStart);
    const employee = await this.userRepository.findOne({
      where: { id: employeeId, role: UserRole.EMPLOYEE, isActive: true, deletedAt: IsNull() },
    });
    if (!employee) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');

    const uniqueDates = new Set(days.map((item) => item.date));
    if (uniqueDates.size !== days.length || days.some((item) => !range.days.includes(item.date))) {
      throw ApiError.badRequest('Assignments must contain unique dates within the selected week', 'INVALID_SHIFT_DATES');
    }

    const shiftIds = [...new Set(days.map((item) => item.shiftId).filter((id): id is string => Boolean(id)))];
    if (shiftIds.length) {
      const validShifts = await this.definitionRepository.find({ where: { id: In(shiftIds), isActive: true } });
      if (validShifts.length !== shiftIds.length) {
        throw ApiError.badRequest('One or more selected shifts are unavailable', 'INVALID_SHIFT');
      }
    }

    await AppDataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ShiftAssignment);
      await repository.delete({ employeeId, shiftDate: Between(range.weekStart, range.weekEnd) });
      const selected = days.filter((item): item is ShiftDayInput & { shiftId: string } => Boolean(item.shiftId));
      if (selected.length) {
        await repository.save(selected.map((item) => repository.create({
          employeeId,
          shiftDate: item.date,
          shiftId: item.shiftId,
          note: (item.note || '').trim().slice(0, 300),
          assignedBy: adminId,
        })));
      }
    });

    return this.getEmployeeWeek(employeeId, range.weekStart);
  }
}

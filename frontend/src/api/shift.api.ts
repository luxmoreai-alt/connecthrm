import { api } from "@/lib/api";

export interface ShiftDefinition {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  isNightShift: boolean;
}

export interface ShiftAssignmentDay {
  date: string;
  assignmentId: string | null;
  shift: ShiftDefinition | null;
  note: string;
}

export interface ShiftEmployee {
  id: string;
  empId: string | null;
  name: string;
  department: string;
  designation: string;
  defaultShiftSchedule: string;
}

export interface EmployeeShiftWeek {
  weekStart: string;
  weekEnd: string;
  days: string[];
  employee: ShiftEmployee;
  assignments: ShiftAssignmentDay[];
}

export interface AdminShiftEmployee extends ShiftEmployee {
  assignments: ShiftAssignmentDay[];
}

export interface AdminShiftWeek {
  weekStart: string;
  weekEnd: string;
  days: string[];
  definitions: ShiftDefinition[];
  employees: AdminShiftEmployee[];
}

export interface SaveShiftDay {
  date: string;
  shiftId: string | null;
  note?: string;
}

export const shiftApi = {
  getMyWeek: (weekStart: string) =>
    api.get<EmployeeShiftWeek>(`/shifts/me/week?weekStart=${encodeURIComponent(weekStart)}`),
  getAdminWeek: (weekStart: string) =>
    api.get<AdminShiftWeek>(`/shifts/admin/week?weekStart=${encodeURIComponent(weekStart)}`),
  saveEmployeeWeek: (employeeId: string, weekStart: string, assignments: SaveShiftDay[]) =>
    api.put<EmployeeShiftWeek>(`/shifts/admin/week/${employeeId}`, { weekStart, assignments }),
};

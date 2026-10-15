import { api } from "@/lib/api";

export interface ProfileData {
  id: string;
  empId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  employeeTourCompleted: boolean;

  department: string;
  designation: string;
  employmentType: string;
  dateOfJoining: string;
  reportingManager: string;
  shiftSchedule: string;

  mobileNumber: string;
  whatsappNumber: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  bloodGroup: string;
  maritalStatus: string;

  currentAddressLine1: string;
  currentCity: string;
  currentState: string;
  currentPincode: string;
  currentCountry: string;

  emergencyContactPerson: string;
  emergencyContactNumber: string;
  emergencyContactRelationship: string;
}

export interface UpcomingBirthday {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  designation: string;
  dateOfBirth: string;
  birthdayThisYear: string;
  daysLeft: number;
}

export interface UpcomingHoliday {
  id: string;
  name: string;
  date: string;
  dayName: string;
  daysLeft: number;
}

export interface HolidayCalendarEntry {
  id: string;
  name: string;
  date: string;
  dayName: string;
}

export interface WorkdayUpdate {
  id: string;
  date: string;
  type: "WORKING_DAY" | "NON_WORKING_DAY";
  reason: string;
  updatedAt: string;
}

export const profileApi = {
  getMe: () => api.get<ProfileData>("/profile/me"),

  updateMe: (data: Record<string, unknown>) =>
    api.patch<ProfileData>("/profile/me", data),

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => api.post("/profile/change-password", data),

  setTourCompleted: (completed: boolean) =>
    api.put<{ employeeTourCompleted: boolean }>("/profile/tour-status", { completed }),
};

export const sharedDashboardApi = {
  getUpcomingBirthdays: (days = 30) =>
    api.get<UpcomingBirthday[]>(`/dashboard/upcoming-birthdays?days=${days}`),

  getUpcomingHolidays: (limit = 4) =>
    api.get<UpcomingHoliday[]>(`/dashboard/upcoming-holidays?limit=${limit}`),

  getHolidayCalendar: (year = new Date().getFullYear()) =>
    api.get<HolidayCalendarEntry[]>(`/dashboard/holidays?year=${year}`),

  getWorkdayUpdates: (year = new Date().getFullYear()) =>
    api.get<WorkdayUpdate[]>(`/dashboard/workday-updates?year=${year}`),
};

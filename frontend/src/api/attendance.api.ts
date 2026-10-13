import { api } from "@/lib/api";

export type AttendanceStatusType =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "HALF_DAY"
  | "LEAVE"
  | "HOLIDAY"
  | "WEEK_OFF"
  | "NOT_STARTED"
  | "MISSED_CHECK_IN"
  | "PERMISSION"
  | "REGULARIZED"
  | "LOP"
  | "MISSING_PUNCH"
  | "EARLY_OUT"
  | "OVERTIME";

export type AttendancePunchType = "CHECK_IN" | "CHECK_OUT";
export type AttendancePunchSource = "WEB" | "MOBILE" | "KIOSK" | "ADMIN";
export type AttendanceAccessMode =
  | "GEO_FENCE_ONLY"
  | "REMOTE_ALLOWED"
  | "HYBRID"
  | "ORG_DEFAULT";

export interface AttendanceRecord {
  id: string | null;
  employeeId: string;
  date: string;
  firstCheckInAt: string | null;
  lastCheckOutAt: string | null;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  punchSessionsCount: number;
  status: AttendanceStatusType;
  lateMinutes: number;
  dayType: "WORKING" | "HOLIDAY" | "WEEK_OFF" | "LEAVE" | string;
  missingPunch: boolean;
  geoFenceIssue: boolean;
  permissionMinutesApplied: number;
  regularized: boolean;
  statusReason: string | null;
  derivedSummary: Record<string, unknown>;
  isManualOverride: boolean;
  overrideReason: string | null;
  eodDescription: string | null;
  locationValidated: boolean;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  startWorkOverrideEnabled: boolean;
  overrideValidUntil: string | null;
  overrideSetBy: string | null;
  overrideSetAt: string | null;
  isAutoClosed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceSessionSummary {
  inTime: string;
  outTime: string | null;
  workedMinutes: number;
  breakAfterMinutes: number;
  sessionOrder: number;
  isAutoClosed: boolean;
}

export interface AttendancePunchEvent {
  id: string;
  employeeId: string;
  type: AttendancePunchType;
  time: string;
  punchDate: string;
  latitude: number | null;
  longitude: number | null;
  isInsideOffice: boolean;
  source: AttendancePunchSource;
  remarks: string | null;
  photoUrl: string | null;
  isManualOverride: boolean;
  sessionOrder: number;
  policyViolation: boolean;
  metadata: Record<string, unknown>;
}

export interface TodayAttendanceResponse {
  date: string;
  dayType: "WORKING" | "HOLIDAY" | "WEEK_OFF" | "LEAVE" | string;
  workStartTime: string;
  workEndTime: string;
  scheduleSource?: "ALLOCATED_SHIFT" | "ORG_DEFAULT";
  assignedShift?: {
    id: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    color: string;
    isNightShift: boolean;
    note: string;
  } | null;
  lateGraceMinutes: number;
  checkInWindowMinutes: number;
  canStartWork: boolean;
  canPunchToday?: boolean;
  isTooLate: boolean;
  reasonCode: string;
  reasonMessage: string;
  todayStatus: AttendanceStatusType;
  overrideActive: boolean;
  nextPunchType: AttendancePunchType;
  nextPunchAction?: "PUNCH_IN" | "PUNCH_OUT";
  geoFence: {
    required: boolean;
    hasOfficeCoordinates: boolean;
    allowedRadiusMeters: number | null;
  };
  accessPolicy?: {
    attendanceMode: AttendanceAccessMode;
    remoteAllowed: boolean;
    geoFenceRequired: boolean;
    geoFenceExempt: boolean;
    employeeOverrideApplied: boolean;
    overrideSource: "ORG_POLICY" | "EMPLOYEE_OVERRIDE";
  };
  sessions: AttendanceSessionSummary[];
  attendance: AttendanceRecord | null;
}

export interface PunchActionResult {
  attendance: AttendanceRecord;
  nextPunchType: AttendancePunchType;
  sessions: AttendanceSessionSummary[];
  geoFence: {
    withinGeoFence: boolean;
    distanceMeters: number | null;
  };
}

export interface AttendancePolicy {
  id: string;
  organizationId: string;
  defaultPolicyName: string;
  version: number;
  active: boolean;
  effectiveFrom: string;
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  halfDayMinMinutes: number;
  fullDayMinMinutes: number;
  overtimeMinMinutes: number;
  maxEarlyOutToleranceMinutes: number;
  allowMultiplePunchSessions: boolean;
  autoCloseOpenSessionAtEndOfDay: boolean;
  minimumPunchGapMinutes: number;
  officeLatitude: number | null;
  officeLongitude: number | null;
  allowedRadiusMeters: number | null;
  geoFenceRequired: boolean;
  allowAdminOverrideForGeoFenceMiss: boolean;
  allowRemotePunch: boolean;
  defaultAttendanceMode: Exclude<AttendanceAccessMode, "ORG_DEFAULT">;
  requireRemotePunchReason: boolean;
  allowEmployeePolicyOverride: boolean;
  captureLocationOnEveryPunch: boolean;
  weekOffDays: string;
  alternateSaturdayOffRule: "NONE" | "SECOND_FOURTH" | "FIRST_THIRD";
  classificationConfig: {
    presentMinMinutes: number;
    halfDayMinMinutes: number;
    absentBelowHalfDay: boolean;
    lopBelowHalfDay: boolean;
    markLateByGrace: boolean;
    markEarlyOut: boolean;
    earlyOutToleranceMinutes: number;
    missingPunchStatus: "MISSING_PUNCH" | "ABSENT";
    holidayPrecedence: boolean;
    leavePrecedence: boolean;
    weeklyOffPrecedence: boolean;
  };
  permissionConfig: {
    permissionEnabled: boolean;
    maxPermissionHoursPerMonth: number;
    maxPermissionRequestsPerMonth: number;
    minPermissionUnitMinutes: number;
    permissionApprovalRequired: boolean;
    canPermissionConvertShortage: boolean;
    permissionAllowedDuringProbation: boolean;
    permissionReasonRequired: boolean;
  };
  regularizationConfig: {
    regularizationEnabled: boolean;
    maxRegularizationsPerMonth: number;
    maxRegularizationBackDays: number;
    regularizationApprovalRequired: boolean;
    allowRegularizationForMissingPunch: boolean;
    allowRegularizationForLatePunch: boolean;
    allowRegularizationForGeoFenceFailure: boolean;
    reasonRequired: boolean;
  };
  policyPrecedenceConfig: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegularizationRequest {
  id: string;
  employeeId: string;
  date: string;
  requestType:
    | "MISSING_PUNCH_IN"
    | "MISSING_PUNCH_OUT"
    | "LATE_PUNCH"
    | "EARLY_OUT"
    | "GEOFENCE_FAILURE"
    | "INCORRECT_STATUS"
    | "OTHER";
  requestedInTime: string | null;
  requestedOutTime: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  adminRemarks: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  employeeName?: string;
  employeeCode?: string;
}

export interface PermissionRequest {
  id: string;
  employeeId: string;
  date: string;
  fromTime: string;
  toTime: string;
  totalMinutes: number;
  appliedMinutes: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  adminRemarks: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  employeeName?: string;
  employeeCode?: string;
}

export interface AdminAttendanceRecord extends AttendanceRecord {
  employeeName: string;
  employeeCode: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  pendingRegularizationCount?: number;
  pendingPermissionCount?: number;
}

export interface AdminAttendanceResponse {
  date: string;
  summary: Record<string, number>;
  records: AdminAttendanceRecord[];
}

export interface MonthlyAttendanceResponse {
  year: number;
  month: number;
  policy: AttendancePolicy;
  summary: Record<string, number>;
  days: AttendanceRecord[];
  metrics?: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    halfDays: number;
    permissionDays: number;
    regularizedDays: number;
    lopDays: number;
    overtimeDays: number;
  };
  context?: {
    joiningDate: string | null;
  };
}

export interface AttendanceDayDetailsResponse {
  date: string;
  attendance: AttendanceRecord;
  sessions: AttendanceSessionSummary[];
  punches: AttendancePunchEvent[];
  nextPunchType: AttendancePunchType;
  accessPolicy?: {
    attendanceMode: AttendanceAccessMode;
    remoteAllowed: boolean;
    geoFenceRequired: boolean;
    geoFenceExempt: boolean;
    employeeOverrideApplied: boolean;
    overrideSource: "ORG_POLICY" | "EMPLOYEE_OVERRIDE";
  };
  actionEligibility?: {
    canRequestRegularization: boolean;
    canRequestPermission: boolean;
    hideActions: boolean;
    reasonCode: string;
    existingRegularization?: {
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
      requestType: RegularizationRequest["requestType"];
    } | null;
    existingPermission?: {
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
      totalMinutes: number;
    } | null;
  };
  dayContext?: {
    type: string;
    label: string;
    description: string;
  };
}

export interface AdminAttendanceDayDetailsResponse extends AttendanceDayDetailsResponse {
  employee: {
    id: string;
    name: string;
    employeeCode: string | null;
    email: string | null;
    department: string | null;
    designation: string | null;
  };
  policySummary: {
    policyName: string;
    version: number;
    workStartTime: string;
    workEndTime: string;
    halfDayMinMinutes: number;
    fullDayMinMinutes: number;
    lateGraceMinutes: number;
  };
  requests: {
    regularizations: RegularizationRequest[];
    permissions: PermissionRequest[];
  };
}

export interface EmployeeAttendanceAccessOverride {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  overrideMode: AttendanceAccessMode;
  geoFenceExempt: boolean;
  remotePunchAllowed: boolean | null;
  reason: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  active: boolean;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const attendanceApi = {
  getMyToday: () => api.get<TodayAttendanceResponse>("/attendance/me/today"),
  getMyState: () => api.get<TodayAttendanceResponse>("/attendance/me/state"),

  punchAction: (data: {
    punchType: AttendancePunchType;
    latitude?: number;
    longitude?: number;
    source?: AttendancePunchSource;
    remarks?: string;
    punchedAt?: string;
    photo?: File;
  }) => {
    const formData = new FormData();
    formData.append("punchType", data.punchType);
    if (data.latitude != null) formData.append("latitude", String(data.latitude));
    if (data.longitude != null) formData.append("longitude", String(data.longitude));
    if (data.source) formData.append("source", data.source);
    if (data.remarks) formData.append("remarks", data.remarks);
    if (data.punchedAt) formData.append("punchedAt", data.punchedAt);
    if (data.photo) formData.append("photo", data.photo, data.photo.name);
    return api.postFormData<PunchActionResult>("/attendance/me/punch", formData);
  },

  startWork: (data: {
    photo: File;
    latitude?: number;
    longitude?: number;
    source?: AttendancePunchSource;
  }) => {
    const formData = new FormData();
    formData.append("photo", data.photo, data.photo.name);
    if (data.latitude != null) formData.append("latitude", String(data.latitude));
    if (data.longitude != null) formData.append("longitude", String(data.longitude));
    if (data.source) formData.append("source", data.source);
    return api.postFormData<AttendanceRecord>("/attendance/me/start-work", formData);
  },

  endWork: (data?: { latitude?: number; longitude?: number; source?: AttendancePunchSource; eodDescription?: string }) =>
    api.post<AttendanceRecord>("/attendance/me/end-work", data ?? {}),

  getMyHistory: (days = 30) =>
    api.get<AttendanceRecord[]>(`/attendance/me/history?days=${days}`),

  getMyMonthlyAttendance: (year: number, month: number) =>
    api.get<MonthlyAttendanceResponse>(`/attendance/me/monthly?year=${year}&month=${month}`),

  getMyDayAttendance: (date: string) =>
    api.get<AttendanceDayDetailsResponse>(`/attendance/me/day?date=${encodeURIComponent(date)}`),

  createRegularization: (payload: {
    date: string;
    requestType: RegularizationRequest["requestType"];
    requestedInTime?: string;
    requestedOutTime?: string;
    reason: string;
  }) => api.post<RegularizationRequest>("/attendance/me/regularizations", payload),

  listMyRegularizations: (status?: string) =>
    api.get<RegularizationRequest[]>(
      `/attendance/me/regularizations${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),

  createPermission: (payload: {
    date: string;
    fromTime: string;
    toTime: string;
    reason: string;
  }) => api.post<PermissionRequest>("/attendance/me/permissions", payload),

  listMyPermissions: (status?: string) =>
    api.get<PermissionRequest[]>(
      `/attendance/me/permissions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),

  getAdminAttendance: (date: string, status?: string, search?: string, department?: string) => {
    const params = new URLSearchParams({ date });
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    if (department) params.append("department", department);
    return api.get<AdminAttendanceResponse>(`/attendance/admin?${params.toString()}`);
  },

  getAdminEmployeeAttendance: (employeeId: string, days = 30) =>
    api.get<AttendanceRecord[]>(`/attendance/admin/${employeeId}?days=${days}`),

  getAdminEmployeeDay: (employeeId: string, date: string) =>
    api.get<AdminAttendanceDayDetailsResponse>(
      `/attendance/admin/${employeeId}/day?date=${encodeURIComponent(date)}`,
    ),

  getAdminEmployeeMonthly: (employeeId: string, year: number, month: number) =>
    api.get<MonthlyAttendanceResponse>(
      `/attendance/admin/${employeeId}/monthly?year=${year}&month=${month}`,
    ),

  getAdminPendingRequests: () =>
    api.get<{ regularizations: RegularizationRequest[]; permissions: PermissionRequest[] }>(
      "/attendance/admin/pending-requests",
    ),

  listEmployeeAccessOverrides: (search?: string) =>
    api.get<EmployeeAttendanceAccessOverride[]>(
      `/attendance/admin/access-overrides${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),

  getEmployeeAccessOverride: (employeeId: string) =>
    api.get<{
      employeeId: string;
      employeeName: string;
      employeeCode: string | null;
      override: EmployeeAttendanceAccessOverride | null;
    }>(`/attendance/admin/access-overrides/${employeeId}`),

  saveEmployeeAccessOverride: (
    employeeId: string,
    payload: {
      overrideMode?: AttendanceAccessMode;
      geoFenceExempt?: boolean;
      remotePunchAllowed?: boolean | null;
      reason?: string;
      effectiveFrom?: string;
      effectiveUntil?: string;
      active?: boolean;
    },
  ) => api.put<EmployeeAttendanceAccessOverride>(`/attendance/admin/access-overrides/${employeeId}`, payload),

  clearEmployeeAccessOverride: (employeeId: string) =>
    api.delete<EmployeeAttendanceAccessOverride>(`/attendance/admin/access-overrides/${employeeId}`),

  reviewRegularization: (requestId: string, payload: { approved: boolean; adminRemarks?: string }) =>
    api.patch<RegularizationRequest>(`/attendance/admin/regularizations/${requestId}/review`, payload),

  reviewPermission: (requestId: string, payload: { approved: boolean; adminRemarks?: string }) =>
    api.patch<PermissionRequest>(`/attendance/admin/permissions/${requestId}/review`, payload),

  overrideStatus: (employeeId: string, data: { date: string; status: AttendanceStatusType; reason: string }) =>
    api.patch<AdminAttendanceRecord>(`/attendance/admin/${employeeId}/status`, data),

  manualEntry: (
    employeeId: string,
    data: {
      date: string;
      firstCheckInAt?: string;
      lastCheckOutAt?: string;
      status?: AttendanceStatusType;
      reason?: string;
    },
  ) => api.patch<AdminAttendanceRecord>(`/attendance/admin/${employeeId}/manual-entry`, data),

  reEnableStartWork: (employeeId: string, data?: { reason?: string; validUntil?: string }) =>
    api.patch(`/attendance/admin/${employeeId}/re-enable-start-work`, data ?? {}),
};


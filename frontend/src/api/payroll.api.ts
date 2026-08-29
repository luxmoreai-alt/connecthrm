import { api, API_BASE } from "@/lib/api";

// ─── Types ───

export interface PayrollComponent {
  name: string;
  amount: number;
}

export interface PayrollPreview {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  email: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  month: number;
  year: number;
  earnings: PayrollComponent[];
  deductions: PayrollComponent[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  workingDays: number;
  eligibleWorkingDays: number;
  payableDays: number;
  presentDays: number;
  leaveDays: number;
  lopDays: number;
  weekOffDays?: number;
  holidayDays?: number;
  totalWorkedMinutes?: number;
  totalBreakMinutes?: number;
  totalLateMinutes?: number;
  permissionHours?: number;
  permissionCount?: number;
  regularizationCount?: number;
  bankAccount: string;
  uan: string;
  pfEmployeeContribution: number;
  pfEmployerContribution: number;
}

export interface PayrollRecord {
  id: string;
  payrollRunId: string | null;
  employeeId: string;
  month: number;
  year: number;
  employeeSnapshot: {
    employeeName?: string;
    employeeCode?: string;
    email?: string;
    designation?: string;
    department?: string;
    [key: string]: unknown;
  };
  attendanceSnapshot: Record<string, unknown>;
  earnings: PayrollComponent[];
  deductions: PayrollComponent[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  workingDays: number;
  eligibleWorkingDays: number;
  payableDays: number;
  presentDays: number;
  leaveDays: number;
  lopDays: number;
  status: "DRAFT" | "GENERATED" | "EMAILED" | "FAILED";
  source: "MANUAL" | "BULK_UPLOAD" | "SYSTEM_AUTO";
  remarks: string | null;
  hasPayslip: boolean;
  payslipFileName: string | null;
  isReleased: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  runType?: "BULK_UPLOAD" | "SYSTEM_BULK";
  totalEmployees: number;
  successCount: number;
  failedCount: number;
  skippedCount?: number;
  processedCount?: number;
  emailedCount?: number;
  portalPublishedCount?: number;
  errorSummary?: Array<{ employeeId?: string; employeeCode?: string; message: string }>;
  resultSummary?: Record<string, unknown>;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface PayrollRunDetail extends PayrollRun {
  records: PayrollRecord[];
}

export interface ImportJobStatus {
  id: string;
  payrollRunId: string;
  originalFileName: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  status: string;
  progressPercentage: number;
  errorSummary: { row: number; employeeId?: string; message: string }[];
  createdAt: string;
}

export interface PayrollSummary {
  totalRecords: number;
  generated: number;
  emailed: number;
  draft: number;
  failed: number;
  totalPayout: number;
}

export interface BulkGenerateResponse {
  runId: string;
  totalEmployees: number;
  status: string;
}

export interface DispatchRunResponse {
  runId: string;
  totalRecords: number;
  emailed: number;
  portalPublished: number;
  failed: number;
  errors: Array<{ employeeId?: string; employeeCode?: string; message: string }>;
}

// ─── API ───

const BASE = "/payroll";

export const payrollApi = {
  // Admin
  preview: (data: { employeeId: string; month: number; year: number }) =>
    api.post<PayrollPreview>(`${BASE}/preview`, data),

  generate: (data: {
    employeeId: string;
    month: number;
    year: number;
    earnings: PayrollComponent[];
    deductions: PayrollComponent[];
    workingDays?: number;
    payableDays?: number;
    presentDays?: number;
    leaveDays?: number;
    lopDays?: number;
    remarks?: string;
  }) => api.post<PayrollRecord>(`${BASE}/generate`, data),

  bulkImport: (formData: FormData) =>
    api.postFormData<{ runId: string; jobId: string; totalRows: number; parseErrors: number }>(
      `${BASE}/import`,
      formData,
    ),

  importStatus: (jobId: string) =>
    api.get<ImportJobStatus>(`${BASE}/import/${jobId}`),

  summary: (month: number, year: number) =>
    api.get<PayrollSummary>(`${BASE}/summary?month=${month}&year=${year}`),

  listRuns: (filters?: { month?: number; year?: number }) => {
    const params = new URLSearchParams();
    if (filters?.month) params.set("month", String(filters.month));
    if (filters?.year) params.set("year", String(filters.year));
    const qs = params.toString();
    return api.get<PayrollRun[]>(`${BASE}/runs${qs ? `?${qs}` : ""}`);
  },

  runDetail: (runId: string) => api.get<PayrollRunDetail>(`${BASE}/runs/${runId}`),

  bulkGenerate: (data: {
    month: number;
    year: number;
    employeeIds?: string[];
    overwriteExisting?: boolean;
  }) => api.post<BulkGenerateResponse>(`${BASE}/runs/system-generate`, data),

  dispatchRun: (
    runId: string,
    data: { sendEmail: boolean; publishToPortal: boolean; retryFailedOnly?: boolean },
  ) => api.post<DispatchRunResponse>(`${BASE}/runs/${runId}/dispatch`, data),

  listRecords: (filters?: { month?: number; year?: number; status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.month) params.set("month", String(filters.month));
    if (filters?.year) params.set("year", String(filters.year));
    if (filters?.status) params.set("status", filters.status);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    return api.get<PayrollRecord[]>(`${BASE}/records${qs ? `?${qs}` : ""}`);
  },

  getRecord: (id: string) => api.get<PayrollRecord>(`${BASE}/records/${id}`),

  deleteRecord: (id: string) =>
    api.delete<{ id: string; employeeId: string; month: number; year: number }>(
      `${BASE}/records/${id}`,
    ),

  emailPayslip: (id: string) => api.post(`${BASE}/records/${id}/email`),

  releasePayslip: (id: string) =>
    api.post<PayrollRecord>(`${BASE}/records/${id}/release`),

  downloadTemplate: () => `${API_BASE}${BASE}/template`,

  downloadTemplateFile: () =>
    api.downloadBlob(`${BASE}/template`, 'payroll_template.xlsx'),

  downloadSamplePayslip: () =>
    api.downloadBlob(`${BASE}/sample-payslip`, 'sample_payslip.pdf'),

  downloadAttendanceReport: (params: { employeeId: string; month: number; year: number }) =>
    api.downloadBlob(
      `${BASE}/reports/attendance?employeeId=${params.employeeId}&month=${params.month}&year=${params.year}`,
      `attendance_report_${params.year}_${String(params.month).padStart(2, "0")}.xlsx`,
    ),

  downloadSalaryReport: (params: { month: number; year: number }) =>
    api.downloadBlob(
      `${BASE}/reports/salary?month=${params.month}&year=${params.year}`,
      `salary_report_${params.year}_${String(params.month).padStart(2, "0")}.xlsx`,
    ),

  downloadPayslipUrl: (id: string) =>
    `${API_BASE}${BASE}/records/${id}/download`,

  downloadPayslip: (id: string, fileName?: string) =>
    api.downloadBlob(`${BASE}/records/${id}/download`, fileName || `payslip_${id}.pdf`),

  downloadMyPayslipPdf: (id: string) =>
    api.downloadBlob(`${BASE}/my-payslips/${id}/download`, `payslip_${id}.pdf`),

  // Employee
  myPayslips: (year?: number) => {
    const qs = year ? `?year=${year}` : "";
    return api.get<PayrollRecord[]>(`${BASE}/my-payslips${qs}`);
  },

  myPayslipDetail: (id: string) =>
    api.get<PayrollRecord>(`${BASE}/my-payslips/${id}`),

  myPayslipDownloadUrl: (id: string) =>
    `${API_BASE}${BASE}/my-payslips/${id}/download`,
};

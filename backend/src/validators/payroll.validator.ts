import { z } from 'zod';

const payrollComponent = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
});

export const previewPayrollSchema = z.object({
  employeeId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
});

export const generateManualSchema = z.object({
  employeeId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
  earnings: z.array(payrollComponent).min(1),
  deductions: z.array(payrollComponent).default([]),
  workingDays: z.number().min(0).optional(),
  payableDays: z.number().min(0).optional(),
  presentDays: z.number().min(0).optional(),
  leaveDays: z.number().min(0).optional(),
  lopDays: z.number().min(0).optional(),
  remarks: z.string().max(500).optional(),
});

export const bulkImportSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
});

export const bulkGenerateSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2099),
  overwriteExisting: z.boolean().optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
});

export const runDispatchSchema = z.object({
  sendEmail: z.boolean().default(true),
  publishToPortal: z.boolean().default(true),
  retryFailedOnly: z.boolean().default(false),
  emailSubject: z.string().trim().min(1).max(150).refine((value) => !/[\r\n]/.test(value), 'Subject cannot contain line breaks').optional(),
  emailMessage: z.string().trim().min(1).max(2000).optional(),
});

export const emailPayslipSchema = z.object({
  subject: z.string().trim().min(1).max(150).refine((value) => !/[\r\n]/.test(value), 'Subject cannot contain line breaks').optional(),
  message: z.string().trim().min(1).max(2000).optional(),
});

export const listRecordsSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  status: z.enum(['DRAFT', 'GENERATED', 'EMAILED', 'FAILED']).optional(),
  search: z.string().max(100).optional(),
});

export const listPayslipsSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099).optional(),
});

export const summarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2099),
});

export const attendanceReportSchema = z.object({
  employeeId: z.string().uuid(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2099),
});

export const salaryReportSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2099),
});

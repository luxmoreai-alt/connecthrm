import { Request, Response } from 'express';
import { PayrollService } from '../services/payroll.service';
import { PayrollRecordStatus } from '../entities/PayrollRecord.entity';
import {
  previewPayrollSchema,
  generateManualSchema,
  bulkImportSchema,
  bulkGenerateSchema,
  runDispatchSchema,
  listRecordsSchema,
  listPayslipsSchema,
  summarySchema,
  attendanceReportSchema,
  salaryReportSchema,
} from '../validators/payroll.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const payrollService = new PayrollService();

export class PayrollController {
  static async downloadSamplePayslip(_req: Request, res: Response): Promise<void> {
    const pdf = await payrollService.getSamplePayslipPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  }

  // ─── Admin: Preview payroll ───
  static async preview(req: Request, res: Response): Promise<void> {
    const parsed = previewPayrollSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.previewPayroll(
      parsed.data.employeeId,
      parsed.data.month,
      parsed.data.year,
    );
    ApiResponse.success(res, 'Payroll preview generated', result);
  }

  // ─── Admin: Generate single payroll ───
  static async generateManual(req: Request, res: Response): Promise<void> {
    const parsed = generateManualSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.generateManual({
      ...parsed.data,
      adminId: (req as any).user?.id,
    });
    ApiResponse.success(res, 'Payroll generated successfully', result, 201);
  }

  // ─── Admin: Bulk import ───
  static async bulkImport(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw ApiError.badRequest('Excel file is required', 'FILE_REQUIRED');
    }

    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const parsed = bulkImportSchema.safeParse({ month, year });
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }

    const result = await payrollService.startBulkImport(
      req.file.path,
      req.file.originalname,
      parsed.data.month,
      parsed.data.year,
      (req as any).user?.id,
    );
    ApiResponse.success(res, 'Bulk import started', result, 202);
  }

  // ─── Admin: Import job status ───
  static async importStatus(req: Request, res: Response): Promise<void> {
    const result = await payrollService.getImportJobStatus(req.params.jobId as string);
    ApiResponse.success(res, 'Import job status', result);
  }

  // ─── Admin: Summary ───
  static async summary(req: Request, res: Response): Promise<void> {
    const parsed = summarySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest('month and year query params are required', 'VALIDATION_ERROR');
    }
    const result = await payrollService.getSummary(parsed.data.month, parsed.data.year);
    ApiResponse.success(res, 'Payroll summary', result);
  }

  // ─── Admin: List runs ───
  static async listRuns(req: Request, res: Response): Promise<void> {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const result = await payrollService.listRuns({ month, year });
    ApiResponse.success(res, 'Payroll runs', result);
  }

  static async runDetail(req: Request, res: Response): Promise<void> {
    const result = await payrollService.getRunDetails(req.params.id as string);
    ApiResponse.success(res, 'Payroll run detail', result);
  }

  static async bulkGenerate(req: Request, res: Response): Promise<void> {
    const parsed = bulkGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.startSystemBulkGenerate({
      ...parsed.data,
      adminId: (req as any).user?.id,
    });
    ApiResponse.success(res, 'Bulk payroll generation started', result, 202);
  }

  static async dispatchRun(req: Request, res: Response): Promise<void> {
    const parsed = runDispatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.dispatchRun(req.params.id as string, parsed.data);
    ApiResponse.success(res, 'Payslip dispatch completed', result);
  }

  // ─── Admin: List records ───
  static async listRecords(req: Request, res: Response): Promise<void> {
    const parsed = listRecordsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.listRecords({
      ...parsed.data,
      status: parsed.data.status as PayrollRecordStatus | undefined,
    });
    ApiResponse.success(res, 'Payroll records', result);
  }

  // ─── Admin: Get record detail ───
  static async getRecord(req: Request, res: Response): Promise<void> {
    const result = await payrollService.getRecord(req.params.id as string);
    ApiResponse.success(res, 'Payroll record', result);
  }

  static async deleteRecord(req: Request, res: Response): Promise<void> {
    const result = await payrollService.deleteRecord(req.params.id as string);
    ApiResponse.success(res, 'Payslip deleted successfully', result);
  }

  // ─── Admin: Email payslip ───
  static async emailPayslip(req: Request, res: Response): Promise<void> {
    const result = await payrollService.emailPayslip(req.params.id as string);
    ApiResponse.success(res, result.message, null);
  }

  static async releasePayslip(req: Request, res: Response): Promise<void> {
    const result = await payrollService.releasePayslip(req.params.id as string);
    ApiResponse.success(res, 'Payslip released to employee portal', result);
  }

  // ─── Admin: Download template ───
  static async downloadTemplate(_req: Request, res: Response): Promise<void> {
    const buffer = payrollService.generateExcelTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payroll_template.xlsx');
    res.send(buffer);
  }

  static async attendanceReport(req: Request, res: Response): Promise<void> {
    const parsed = attendanceReportSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.exportAttendanceReport(
      parsed.data.employeeId,
      parsed.data.month,
      parsed.data.year,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
    res.send(result.buffer);
  }

  static async salaryReport(req: Request, res: Response): Promise<void> {
    const parsed = salaryReportSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await payrollService.exportSalaryReport(
      parsed.data.month,
      parsed.data.year,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
    res.send(result.buffer);
  }

  // ─── Admin/Employee: Download payslip PDF ───
  static async downloadPayslip(req: Request, res: Response): Promise<void> {
    const pdf = await payrollService.getPayslipPdf(req.params.id as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  }

  // ─── Employee: My payslips ───
  static async myPayslips(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) throw ApiError.unauthorized('Not authenticated');
    const parsed = listPayslipsSchema.safeParse(req.query);
    const year = parsed.success ? parsed.data.year : undefined;
    const result = await payrollService.getEmployeePayslips(userId, year);
    ApiResponse.success(res, 'Your payslips', result);
  }

  // ─── Employee: My payslip detail ───
  static async myPayslipDetail(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) throw ApiError.unauthorized('Not authenticated');
    const record = await payrollService.getRecord(req.params.id as string);
    if (record.employeeId !== userId) {
      throw ApiError.forbidden('Not your payslip');
    }
    if (!record.isReleased) throw ApiError.forbidden('This payslip has not been released yet');
    ApiResponse.success(res, 'Payslip detail', record);
  }

  // ─── Employee: Download my payslip ───
  static async downloadMyPayslip(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) throw ApiError.unauthorized('Not authenticated');
    const record = await payrollService.getRecord(req.params.id as string);
    if (record.employeeId !== userId) {
      throw ApiError.forbidden('Not your payslip');
    }
    if (!record.isReleased) throw ApiError.forbidden('This payslip has not been released yet');
    const pdf = await payrollService.getPayslipPdf(req.params.id as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  }
}

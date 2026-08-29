import fs from 'fs';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User.entity';
import { EmployeeProfile } from '../entities/EmployeeProfile.entity';
import { SalaryDetails } from '../entities/SalaryDetails.entity';
import { EmployeeSalaryStructure } from '../entities/EmployeeSalaryStructure.entity';
import { Attendance, AttendanceStatus } from '../entities/Attendance.entity';
import {
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  RequestMode,
} from '../entities/LeaveRequest.entity';
import { PayrollRecord, PayrollRecordStatus, PayrollSource, PayrollComponent } from '../entities/PayrollRecord.entity';
import { PayrollRunStatus, PayrollRunType } from '../entities/PayrollRun.entity';
import { ImportJobStatus } from '../entities/PayrollImportJob.entity';
import { PayrollRepository } from '../repositories/payroll.repository';
import { generatePayslipPdf, PayslipData } from './pdf.service';
import { parsePayrollExcel, ParsedRow } from './excel.service';
import { OrgSettings, AlternateSaturdayRule } from '../entities/OrgSettings.entity';
import { Holiday } from '../entities/Holiday.entity';
import { ApiError } from '../utils/apiError';
import { env } from '../config/env';
import { transporter } from '../config/mail';
import {
  SalaryComponentCategory,
  StatutoryComponentSide,
  StatutoryType,
} from '../salary/salary.enums';
import { NotificationService } from './notification.service';

interface AttendanceComputation {
  workingDays: number;
  eligibleWorkingDays: number;
  payableDays: number;
  presentDays: number;
  leaveDays: number;
  lopDays: number;
  weekOffDays: number;
  holidayDays: number;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  totalLateMinutes: number;
  permissionHours: number;
  permissionCount: number;
  regularizationCount: number;
}

interface ComputedPayrollData {
  user: User;
  profile: EmployeeProfile | null;
  salary: SalaryDetails | null;
  salaryStructure: EmployeeSalaryStructure | null;
  attendance: AttendanceComputation;
  earnings: PayrollComponent[];
  deductions: PayrollComponent[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  bankAccount: string;
  uan: string;
  pfNo: string;
  esiNo: string;
  pfEmployeeContribution: number;
  pfEmployerContribution: number;
}

export class PayrollService {
  private repo: PayrollRepository;

  constructor() {
    this.repo = new PayrollRepository();
  }

  // ─── Preview payroll for a single employee (auto-fill from system data) ───

  async previewPayroll(employeeId: string, month: number, year: number) {
    const computed = await this.computeEmployeePayrollData(employeeId, month, year);

    return {
      employeeId: computed.user.id,
      employeeName: `${computed.user.firstName} ${computed.user.lastName}`,
      employeeCode: computed.user.empId || '',
      email: computed.user.email,
      designation: computed.profile?.designation || '',
      department: computed.profile?.department || '',
      dateOfJoining: computed.profile?.dateOfJoining || '',
      month,
      year,
      earnings: computed.earnings,
      deductions: computed.deductions,
      grossEarnings: computed.grossEarnings,
      totalDeductions: computed.totalDeductions,
      netPay: computed.netPay,
      ...computed.attendance,
      bankAccount: computed.bankAccount,
      uan: computed.uan,
      pfNo: computed.pfNo,
      esiNo: computed.esiNo,
      pfEmployeeContribution: computed.pfEmployeeContribution,
      pfEmployerContribution: computed.pfEmployerContribution,
    };
  }

  // ─── Generate single manual payroll ───

  async generateManual(input: {
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
    adminId?: string;
  }) {
    const computed = await this.computeEmployeePayrollData(
      input.employeeId,
      input.month,
      input.year,
    );
    const { user, profile, salary, salaryStructure, attendance } = computed;

    // Check for duplicate
    const existing = await this.repo.findExistingRecord(input.employeeId, input.month, input.year);
    if (existing && existing.status !== PayrollRecordStatus.DRAFT) {
      // A serverless PDF error may have saved the payroll record before its
      // document metadata. Repair that partial generation safely on retry.
      if (!existing.payslipDocument) {
        await this.generateAndAttachPdf(
          existing,
          (existing.employeeSnapshot || {}) as Record<string, unknown>,
        );
        return this.formatRecord(await this.repo.findRecordById(existing.id) as PayrollRecord);
      }
      throw ApiError.conflict(
        `Payroll already generated for ${user.firstName} ${user.lastName} — ${input.month}/${input.year}`,
        'PAYROLL_DUPLICATE',
      );
    }

    const grossEarnings = round2(input.earnings.reduce((s, e) => s + e.amount, 0));
    const totalDeductions = round2(input.deductions.reduce((s, d) => s + d.amount, 0));
    const netPay = round2(grossEarnings - totalDeductions);

    const bankingInfo = (salaryStructure?.bankingInfo || {}) as Record<string, unknown>;
    const employeeSnapshot = {
      employeeName: `${user.firstName} ${user.lastName}`,
      employeeCode: user.empId || '',
      email: user.email,
      designation: profile?.designation || '',
      department: profile?.department || '',
      dateOfJoining: profile?.dateOfJoining || '',
      bankAccount:
        String(bankingInfo.accountNumber || '') || salary?.accountNumber || '',
      uan: String(bankingInfo.uanNumber || '') || salary?.uanNumber || '',
      pfNo: String(bankingInfo.pfNumber || '') || '',
      esiNo: String(bankingInfo.esiNumber || '') || '',
      pfEmployerContribution: computed.pfEmployerContribution,
    };

    const record = existing
      ? Object.assign(existing, {
          earnings: input.earnings,
          deductions: input.deductions,
          grossEarnings,
          totalDeductions,
          netPay,
          workingDays: input.workingDays ?? attendance.workingDays,
          eligibleWorkingDays: attendance.eligibleWorkingDays,
          payableDays: input.payableDays ?? attendance.payableDays,
          presentDays: input.presentDays ?? attendance.presentDays,
          leaveDays: input.leaveDays ?? attendance.leaveDays,
          lopDays: input.lopDays ?? attendance.lopDays,
          employeeSnapshot,
          attendanceSnapshot: attendance as unknown as Record<string, unknown>,
          source: PayrollSource.MANUAL,
          status: PayrollRecordStatus.GENERATED,
          remarks: input.remarks || null,
        })
      : await this.repo.createRecord({
          employeeId: input.employeeId,
          month: input.month,
          year: input.year,
          earnings: input.earnings,
          deductions: input.deductions,
          grossEarnings,
          totalDeductions,
          netPay,
          workingDays: input.workingDays ?? attendance.workingDays,
          eligibleWorkingDays: attendance.eligibleWorkingDays,
          payableDays: input.payableDays ?? attendance.payableDays,
          presentDays: input.presentDays ?? attendance.presentDays,
          leaveDays: input.leaveDays ?? attendance.leaveDays,
          lopDays: input.lopDays ?? attendance.lopDays,
          employeeSnapshot,
          attendanceSnapshot: attendance as unknown as Record<string, unknown>,
          source: PayrollSource.MANUAL,
          status: PayrollRecordStatus.GENERATED,
          remarks: input.remarks || null,
        });

    const saved = existing ? await this.repo.saveRecord(record) : record;

    // Generate PDF
    await this.generateAndAttachPdf(saved, employeeSnapshot);

    return this.formatRecord(await this.repo.findRecordById(saved.id) as PayrollRecord);
  }

  // ─── Bulk import ───

  async startBulkImport(filePath: string, originalFileName: string, month: number, year: number, adminId?: string) {
    // Create payroll run
    const run = await this.repo.createRun({
      month,
      year,
      runType: PayrollRunType.BULK_UPLOAD,
      status: PayrollRunStatus.PROCESSING,
      createdBy: adminId || null,
    });

    // Parse Excel
    const parseResult = parsePayrollExcel(filePath);

    // Create import job
    const job = await this.repo.createJob({
      payrollRunId: run.id,
      originalFileName,
      filePath,
      totalRows: parseResult.totalRows,
      status: ImportJobStatus.PROCESSING,
      errorSummary: parseResult.errors,
      failedRows: parseResult.errors.length,
    });

    // Process asynchronously
    this.processBulkInBackground(run.id, job.id, parseResult.rows, month, year).catch((err) =>
      console.error('Bulk payroll processing error:', err),
    );

    return { runId: run.id, jobId: job.id, totalRows: parseResult.totalRows, parseErrors: parseResult.errors.length };
  }

  private async processBulkInBackground(
    runId: string,
    jobId: string,
    rows: ParsedRow[],
    month: number,
    year: number,
  ) {
    const BATCH_SIZE = 20;
    let successCount = 0;
    let failedCount = 0;
    const errors: { row: number; employeeId?: string; message: string }[] = [];

    const job = await this.repo.findJobById(jobId);
    const existingErrors = job?.errorSummary || [];
    errors.push(...existingErrors);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        try {
          await this.processOneRow(row, month, year, runId);
          successCount++;
        } catch (err: any) {
          failedCount++;
          errors.push({
            row: row.rowNumber,
            employeeId: row.employeeId || row.employeeCode || row.email,
            message: err.message || 'Unknown error',
          });
        }
      }

      // Update progress
      const processed = Math.min(i + BATCH_SIZE, rows.length);
      const pct = Math.round((processed / rows.length) * 100);
      await this.repo.updateJob(jobId, {
        processedRows: processed,
        successRows: successCount,
        failedRows: failedCount + (existingErrors.length),
        progressPercentage: pct,
        errorSummary: errors,
      } as any);
    }

    // Finalize
    const finalStatus =
      failedCount === 0 && existingErrors.length === 0
        ? ImportJobStatus.COMPLETED
        : successCount === 0
          ? ImportJobStatus.FAILED
          : ImportJobStatus.PARTIAL_SUCCESS;

    await this.repo.updateJob(jobId, {
      status: finalStatus,
      processedRows: rows.length,
      successRows: successCount,
      failedRows: failedCount + existingErrors.length,
      progressPercentage: 100,
      errorSummary: errors,
    } as any);

    const runStatus =
      finalStatus === ImportJobStatus.COMPLETED
        ? PayrollRunStatus.COMPLETED
        : finalStatus === ImportJobStatus.FAILED
          ? PayrollRunStatus.FAILED
          : PayrollRunStatus.PARTIAL_SUCCESS;

    await this.repo.updateRun(runId, {
      status: runStatus,
      totalEmployees: rows.length,
      successCount,
      failedCount: failedCount + existingErrors.length,
      processedCount: rows.length,
      skippedCount: 0,
      errorSummary: errors,
      resultSummary: {
        source: PayrollRunType.BULK_UPLOAD,
        parseErrors: existingErrors.length,
      },
      completedAt: new Date(),
    } as any);
  }

  private async processOneRow(row: ParsedRow, month: number, year: number, runId: string) {
    // Resolve employee
    const user = await this.findUserByRow(row);
    if (!user) throw new Error(`Employee not found for row ${row.rowNumber}`);

    const { profile, salary, salaryStructure } = await this.resolveEmployeeData(user.id);
    const attendance = await this.computeAttendance(user.id, month, year, profile?.dateOfJoining);

    // Smart merge: Excel fields override system, missing fields fallback to system
    const earnings = this.mergeEarnings(row.earnings, salary, salaryStructure);
    const deductions = this.mergeDeductions(row.deductions, salary, salaryStructure);

    // Determine effective LOP days (Excel override or system computed)
    const effectiveLopDays = row.lopDays ?? attendance.lopDays;

    // Auto-add LOP deduction if applicable (same logic as previewPayroll)
    if (effectiveLopDays > 0) {
      const basic = earnings.find((e) => e.name.toLowerCase() === 'basic');
      const effectiveEligibleDays = row.workingDays ?? attendance.eligibleWorkingDays;
      if (basic && effectiveEligibleDays > 0) {
        const perDaySalary = basic.amount / effectiveEligibleDays;
        const lopDeduction = round2(perDaySalary * effectiveLopDays);
        const idx = deductions.findIndex((d) => d.name === 'LOP Deduction' || d.name === 'Lop Deduction');
        if (idx >= 0) deductions.splice(idx, 1);
        deductions.push({ name: 'LOP Deduction', amount: lopDeduction });
      }
    }

    // Auto-add PF Employee Contribution if applicable and not already present
    const pfEmployeeContribution = this.extractPfEmployeeContribution(salary, salaryStructure);
    if (pfEmployeeContribution > 0 && !deductions.some((d) => d.name.toLowerCase().includes('pf'))) {
      deductions.push({ name: 'PF (Employee)', amount: pfEmployeeContribution });
    }

    // Determine employer PF: Excel value overrides system value
    const pfEmployerContribution =
      row.pfEmployerContribution != null
        ? round2(row.pfEmployerContribution)
        : this.extractPfEmployerContribution(salary, salaryStructure);

    const grossEarnings = round2(earnings.reduce((s, e) => s + e.amount, 0));
    const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));
    const netPay = round2(grossEarnings - totalDeductions);

    const bankingInfo = (salaryStructure?.bankingInfo || {}) as Record<string, unknown>;
    const employeeSnapshot = {
      employeeName: `${user.firstName} ${user.lastName}`,
      employeeCode: user.empId || '',
      email: user.email,
      designation: profile?.designation || '',
      department: profile?.department || '',
      dateOfJoining: profile?.dateOfJoining || '',
      bankAccount: String(bankingInfo.accountNumber || '') || salary?.accountNumber || '',
      uan: String(bankingInfo.uanNumber || '') || salary?.uanNumber || '',
      pfNo: String(bankingInfo.pfNumber || '') || '',
      esiNo: String(bankingInfo.esiNumber || '') || '',
      pfEmployerContribution,
    };

    // Check for existing
    const existing = await this.repo.findExistingRecord(user.id, month, year);
    if (existing && existing.status !== PayrollRecordStatus.DRAFT) {
      throw new Error(`Payroll already exists for ${user.empId || user.email} — ${month}/${year}`);
    }

    const recordData = {
      payrollRunId: runId,
      employeeId: user.id,
      month,
      year,
      earnings,
      deductions,
      grossEarnings,
      totalDeductions,
      netPay,
      workingDays: row.workingDays ?? attendance.workingDays,
      eligibleWorkingDays: attendance.eligibleWorkingDays,
      payableDays: row.payableDays ?? attendance.payableDays,
      presentDays: row.presentDays ?? attendance.presentDays,
      leaveDays: row.leaveDays ?? attendance.leaveDays,
      lopDays: effectiveLopDays,
      employeeSnapshot,
      attendanceSnapshot: attendance as unknown as Record<string, unknown>,
      source: PayrollSource.BULK_UPLOAD,
      status: PayrollRecordStatus.GENERATED,
    };

    const record = existing
      ? await this.repo.saveRecord(Object.assign(existing, recordData))
      : await this.repo.createRecord(recordData);

    // Generate PDF
    await this.generateAndAttachPdf(record, employeeSnapshot);
  }

  // ─── PDF generation helper ───

  private async generateAndAttachPdf(
    record: PayrollRecord,
    snapshot: Record<string, unknown>,
  ) {
    // Get company details from OrgSettings
    let companyName = 'Connect HR';
    let companyAddress = '';
    let companyLogo: string | undefined;
    let cinNumber = '';
    let gstNumber = '';
    let additionalCompanyFields: Array<{ label: string; value: string }> = [];
    try {
      const orgRepo = AppDataSource.getRepository(OrgSettings);
      const org = await orgRepo.findOne({ where: {} });
      if (org) {
        companyName = org.companyName || 'Connect HR';
        companyAddress = org.companyAddress || '';
        companyLogo = org.companyLogoUrl || undefined;
        cinNumber = org.cinNumber || '';
        gstNumber = org.gstNumber || '';
        additionalCompanyFields = org.payslipAdditionalFields || [];
      }
    } catch {
      // use defaults
    }

    const data: PayslipData = {
      companyName,
      companyAddress,
      companyLogo,
      cinNumber,
      gstNumber,
      additionalCompanyFields,
      employeeName: String(snapshot.employeeName || ''),
      employeeCode: String(snapshot.employeeCode || ''),
      designation: String(snapshot.designation || ''),
      department: String(snapshot.department || ''),
      dateOfJoining: String(snapshot.dateOfJoining || ''),
      bankAccount: String(snapshot.bankAccount || ''),
      uan: String(snapshot.uan || ''),
      pfNo: String(snapshot.pfNo || ''),
      esiNo: String(snapshot.esiNo || ''),
      month: record.month,
      year: record.year,
      workingDays: Number(record.workingDays) || 0,
      eligibleWorkingDays: Number(record.eligibleWorkingDays) || Number(record.workingDays) || 0,
      payableDays: Number(record.payableDays) || 0,
      presentDays: Number(record.presentDays) || 0,
      leaveDays: Number(record.leaveDays) || 0,
      lopDays: Number(record.lopDays) || 0,
      weekOffDays: Number((record.attendanceSnapshot as any)?.weekOffDays || 0),
      holidayDays: Number((record.attendanceSnapshot as any)?.holidayDays || 0),
      earnings: record.earnings,
      deductions: record.deductions,
      grossEarnings: Number(record.grossEarnings),
      totalDeductions: Number(record.totalDeductions),
      netPay: Number(record.netPay),
      pfEmployerContribution: Number(snapshot.pfEmployerContribution) || 0,
    };

    const fileName = `payslip_${String(snapshot.employeeCode || record.employeeId).replace(/[^a-zA-Z0-9]/g, '_')}_${record.month}_${record.year}.pdf`;
    // The PDF is generated on demand by getPayslipPdf(). Keeping only metadata
    // here avoids depending on a temporary serverless filesystem during save.

    // Check if document already exists
    const existingDoc = await this.repo.findDocByRecordId(record.id);
    if (existingDoc) {
      await this.repo.updateDocument(existingDoc.id, {
        fileName,
        filePath: 'generated-on-demand',
      } as any);
    } else {
      await this.repo.createDocument({
        payrollRecordId: record.id,
        fileName,
        filePath: 'generated-on-demand',
      });
    }
  }

  // ─── Email payslip ───

  async getPayslipPdf(recordId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const record = await this.repo.findRecordById(recordId);
    if (!record) throw ApiError.notFound('Payroll record not found');
    if (record.status === PayrollRecordStatus.DRAFT) {
      throw ApiError.badRequest('Cannot download a draft payslip');
    }

    const snapshot = (record.employeeSnapshot || {}) as Record<string, unknown>;
    let companyName = 'Connect HR';
    let companyAddress = '';
    let companyLogo: string | undefined;
    let cinNumber = '';
    let gstNumber = '';
    let additionalCompanyFields: Array<{ label: string; value: string }> = [];
    try {
      const org = await AppDataSource.getRepository(OrgSettings).findOne({ where: {} });
      if (org) {
        companyName = org.companyName || 'Connect HR';
        companyAddress = org.companyAddress || '';
        companyLogo = org.companyLogoUrl || undefined;
        cinNumber = org.cinNumber || '';
        gstNumber = org.gstNumber || '';
        additionalCompanyFields = org.payslipAdditionalFields || [];
      }
    } catch { /* use defaults */ }

    const data: PayslipData = {
      companyName,
      companyAddress,
      companyLogo,
      cinNumber,
      gstNumber,
      additionalCompanyFields,
      employeeName: String(snapshot.employeeName || ''),
      employeeCode: String(snapshot.employeeCode || ''),
      designation: String(snapshot.designation || ''),
      department: String(snapshot.department || ''),
      dateOfJoining: String(snapshot.dateOfJoining || ''),
      bankAccount: String(snapshot.bankAccount || ''),
      uan: String(snapshot.uan || ''),
      pfNo: String(snapshot.pfNo || ''),
      esiNo: String(snapshot.esiNo || ''),
      month: record.month,
      year: record.year,
      workingDays: Number(record.workingDays) || 0,
      eligibleWorkingDays: Number(record.eligibleWorkingDays) || Number(record.workingDays) || 0,
      payableDays: Number(record.payableDays) || 0,
      presentDays: Number(record.presentDays) || 0,
      leaveDays: Number(record.leaveDays) || 0,
      lopDays: Number(record.lopDays) || 0,
      weekOffDays: Number((record.attendanceSnapshot as any)?.weekOffDays || 0),
      holidayDays: Number((record.attendanceSnapshot as any)?.holidayDays || 0),
      earnings: record.earnings || [],
      deductions: record.deductions || [],
      grossEarnings: Number(record.grossEarnings),
      totalDeductions: Number(record.totalDeductions),
      netPay: Number(record.netPay),
      pfEmployerContribution: Number(snapshot.pfEmployerContribution) || 0,
    };
    const employeeCode = String(snapshot.employeeCode || record.employeeId).replace(/[^a-zA-Z0-9]/g, '_');
    return generatePayslipPdf(data, `payslip_${employeeCode}_${record.month}_${record.year}.pdf`);
  }

  async getSamplePayslipPdf(): Promise<{ buffer: Buffer; fileName: string }> {
    const org = await AppDataSource.getRepository(OrgSettings).findOne({ where: {} }).catch(() => null);
    const now = new Date();
    const data: PayslipData = {
      companyName: org?.companyName || 'Connect HR',
      companyAddress: org?.companyAddress || 'Your registered company address',
      companyLogo: org?.companyLogoUrl || undefined,
      cinNumber: org?.cinNumber || '',
      gstNumber: org?.gstNumber || '',
      additionalCompanyFields: org?.payslipAdditionalFields || [],
      employeeName: 'Sample Employee',
      employeeCode: 'EMP-SAMPLE-001',
      designation: 'Software Engineer',
      department: 'Technology',
      dateOfJoining: '01-01-2025',
      bankAccount: 'XXXX XXXX 1234',
      uan: 'XXXXXXXX1234',
      pfNo: 'PF-SAMPLE-001',
      esiNo: 'ESI-SAMPLE-001',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      workingDays: 22,
      eligibleWorkingDays: 22,
      payableDays: 22,
      presentDays: 20,
      leaveDays: 2,
      lopDays: 0,
      weekOffDays: 8,
      holidayDays: 1,
      earnings: [
        { name: 'Basic Salary', amount: 30000 },
        { name: 'House Rent Allowance', amount: 12000 },
        { name: 'Special Allowance', amount: 8000 },
      ],
      deductions: [
        { name: 'Provident Fund', amount: 1800 },
        { name: 'Professional Tax', amount: 200 },
      ],
      grossEarnings: 50000,
      totalDeductions: 2000,
      netPay: 48000,
      pfEmployerContribution: 1800,
    };
    return generatePayslipPdf(data, `sample_payslip_${now.getFullYear()}.pdf`);
  }

  async emailPayslip(recordId: string) {
    const record = await this.repo.findRecordById(recordId);
    if (!record) throw ApiError.notFound('Payroll record not found');
    if (record.status === PayrollRecordStatus.DRAFT)
      throw ApiError.badRequest('Cannot email a draft payslip');

    const email = (record.employeeSnapshot as any)?.email;
    if (!email) throw ApiError.badRequest('Employee email not available');

    const doc = record.payslipDocument || (await this.repo.findDocByRecordId(recordId));
    if (!doc)
      throw ApiError.badRequest('Payslip PDF not found — regenerate first');

    const pdf = await this.getPayslipPdf(recordId);
    const empName = (record.employeeSnapshot as any)?.employeeName || 'Employee';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const periodStr = `${monthNames[record.month - 1]} ${record.year}`;

    // Get company name for email
    let companyName = 'Connect HR';
    try {
      const orgRepo = AppDataSource.getRepository(OrgSettings);
      const org = await orgRepo.findOne({ where: {} });
      if (org?.companyName) companyName = org.companyName;
    } catch { /* use default */ }

    const sender = env.SMTP_FROM || env.SMTP_USER;
    if (!transporter || !sender) {
      throw ApiError.badRequest(
        'Email service is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in the backend environment.',
        'SMTP_NOT_CONFIGURED',
      );
    }

    if (transporter && sender) {
      await transporter.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${sender}>`,
        to: email,
        subject: `Your Payslip for ${periodStr}`,
        html: buildPayslipEmailHtml(empName, periodStr, Number(record.netPay), companyName),
        attachments: [{ filename: pdf.fileName, content: pdf.buffer }],
      }).catch((error: any) => {
        console.error('Payslip email delivery failed:', error?.message || error);
        throw new ApiError(
          'Unable to send the email. Verify the Gmail address and App Password in the backend environment, then redeploy.',
          'SMTP_DELIVERY_FAILED',
          502,
        );
      });

      await this.repo.updateRecord(record.id, { status: PayrollRecordStatus.EMAILED } as any);
      await this.repo.updateDocument(doc.id, { emailedAt: new Date() } as any);
    } else {
      console.log(`SMTP not configured — payslip email for ${empName}:`, { email, file: doc.filePath });
      await this.repo.updateRecord(record.id, { status: PayrollRecordStatus.EMAILED } as any);
    }

    return { message: `Payslip emailed to ${email}` };
  }

  // ─── List endpoints ───

  async listRuns(filters?: { month?: number; year?: number }) {
    const runs = await this.repo.findRuns(filters);
    return runs.map((r) => ({
      id: r.id,
      month: r.month,
      year: r.year,
      status: r.status,
      runType: r.runType,
      totalEmployees: r.totalEmployees,
      successCount: r.successCount,
      failedCount: r.failedCount,
      skippedCount: r.skippedCount,
      processedCount: r.processedCount,
      emailedCount: r.emailedCount,
      portalPublishedCount: r.portalPublishedCount,
      errorSummary: r.errorSummary,
      resultSummary: r.resultSummary,
      createdBy: r.createdBy,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    }));
  }

  async listRecords(filters?: {
    month?: number;
    year?: number;
    status?: PayrollRecordStatus;
    search?: string;
  }) {
    const records = await this.repo.findRecords(filters);
    return records.map((r) => this.formatRecord(r));
  }

  async getRecord(recordId: string) {
    const record = await this.repo.findRecordById(recordId);
    if (!record) throw ApiError.notFound('Payroll record not found');
    return this.formatRecord(record);
  }

  async deleteRecord(recordId: string) {
    const record = await this.repo.findRecordById(recordId);
    if (!record) throw ApiError.notFound('Payroll record not found');

    await this.repo.deleteRecord(recordId);
    return {
      id: record.id,
      employeeId: record.employeeId,
      month: record.month,
      year: record.year,
    };
  }

  async releasePayslip(recordId: string) {
    const record = await this.repo.findRecordById(recordId);
    if (!record) throw ApiError.notFound('Payroll record not found');
    if (record.status === PayrollRecordStatus.DRAFT) {
      throw ApiError.badRequest('Generate the payroll before releasing the payslip');
    }
    const doc = record.payslipDocument || (await this.repo.findDocByRecordId(recordId));
    if (!doc) throw ApiError.badRequest('Payslip document is not ready');
    await this.repo.updateDocument(doc.id, { filePath: 'released' } as any);
    const period = `${record.month}/${record.year}`;
    await new NotificationService().notifyUser(
      record.employeeId,
      'PAYSLIP_RELEASED',
      'Payslip released',
      `Your payslip for ${period} is now available to view and download.`,
      '/employee/payroll',
    ).catch((err) => console.error('Failed to create payslip notification', err.message));
    return this.formatRecord(await this.repo.findRecordById(recordId) as PayrollRecord);
  }

  async getEmployeePayslips(employeeId: string, year?: number) {
    const records = await this.repo.findRecordsByEmployee(employeeId, { year });
    return records.map((r) => this.formatRecord(r));
  }

  async getImportJobStatus(jobId: string) {
    const job = await this.repo.findJobById(jobId);
    if (!job) throw ApiError.notFound('Import job not found');
    return {
      id: job.id,
      payrollRunId: job.payrollRunId,
      originalFileName: job.originalFileName,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successRows: job.successRows,
      failedRows: job.failedRows,
      status: job.status,
      progressPercentage: job.progressPercentage,
      errorSummary: job.errorSummary,
      createdAt: job.createdAt,
    };
  }

  async getSummary(month: number, year: number) {
    const total = await this.repo.countRecords({ month, year });
    const generated = await this.repo.countRecords({ month, year, status: PayrollRecordStatus.GENERATED });
    const emailed = await this.repo.countRecords({ month, year, status: PayrollRecordStatus.EMAILED });
    const draft = await this.repo.countRecords({ month, year, status: PayrollRecordStatus.DRAFT });
    const failed = await this.repo.countRecords({ month, year, status: PayrollRecordStatus.FAILED });

    // Sum net pay from records
    const records = await this.repo.findRecords({ month, year });
    const totalPayout = records.reduce((s, r) => s + Number(r.netPay), 0);

    return {
      totalRecords: total,
      generated,
      emailed,
      draft,
      failed,
      totalPayout: round2(totalPayout),
    };
  }

  async getRunDetails(runId: string) {
    const run = await this.repo.findRunById(runId);
    if (!run) throw ApiError.notFound('Payroll run not found');
    const records = await this.repo.findRecords({ payrollRunId: runId });
    return {
      id: run.id,
      month: run.month,
      year: run.year,
      status: run.status,
      runType: run.runType,
      totalEmployees: run.totalEmployees,
      successCount: run.successCount,
      failedCount: run.failedCount,
      skippedCount: run.skippedCount,
      processedCount: run.processedCount,
      emailedCount: run.emailedCount,
      portalPublishedCount: run.portalPublishedCount,
      errorSummary: run.errorSummary,
      resultSummary: run.resultSummary,
      createdBy: run.createdBy,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      records: records.map((r) => this.formatRecord(r)),
    };
  }

  async startSystemBulkGenerate(input: {
    month: number;
    year: number;
    employeeIds?: string[];
    overwriteExisting?: boolean;
    adminId?: string;
  }) {
    const userRepo = AppDataSource.getRepository(User);
    const employeeQuery = userRepo
      .createQueryBuilder('u')
      .where('u.role = :role', { role: UserRole.EMPLOYEE })
      .andWhere('u.isActive = true');

    if (input.employeeIds?.length) {
      employeeQuery.andWhere('u.id IN (:...employeeIds)', {
        employeeIds: input.employeeIds,
      });
    }

    const employees = await employeeQuery.getMany();
    if (!employees.length) {
      throw ApiError.badRequest('No active employees found for payroll generation');
    }

    const run = await this.repo.createRun({
      month: input.month,
      year: input.year,
      runType: PayrollRunType.SYSTEM_BULK,
      status: PayrollRunStatus.PROCESSING,
      totalEmployees: employees.length,
      createdBy: input.adminId || null,
      resultSummary: {
        overwriteExisting: !!input.overwriteExisting,
        startedAt: new Date().toISOString(),
      },
    });

    this.processSystemBulkInBackground(
      run.id,
      employees.map((e) => e.id),
      input.month,
      input.year,
      !!input.overwriteExisting,
    ).catch((err) => {
      console.error('System bulk payroll generation failed:', err);
    });

    return {
      runId: run.id,
      totalEmployees: employees.length,
      status: run.status,
    };
  }

  private async processSystemBulkInBackground(
    runId: string,
    employeeIds: string[],
    month: number,
    year: number,
    overwriteExisting: boolean,
  ) {
    const BATCH_SIZE = 25;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ employeeId?: string; employeeCode?: string; message: string }> = [];

    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      const batch = employeeIds.slice(i, i + BATCH_SIZE);
      for (const employeeId of batch) {
        try {
          const computed = await this.computeEmployeePayrollData(employeeId, month, year);
          const existing = await this.repo.findExistingRecord(employeeId, month, year);
          if (
            existing &&
            existing.status !== PayrollRecordStatus.DRAFT &&
            !overwriteExisting
          ) {
            skippedCount++;
            continue;
          }

          const employeeSnapshot = {
            employeeName: `${computed.user.firstName} ${computed.user.lastName}`,
            employeeCode: computed.user.empId || '',
            email: computed.user.email,
            designation: computed.profile?.designation || '',
            department: computed.profile?.department || '',
            dateOfJoining: computed.profile?.dateOfJoining || '',
            bankAccount: computed.bankAccount,
            uan: computed.uan,
            pfNo: computed.pfNo,
            esiNo: computed.esiNo,
            pfEmployerContribution: computed.pfEmployerContribution,
          };

          const recordPayload = {
            payrollRunId: runId,
            employeeId,
            month,
            year,
            earnings: computed.earnings,
            deductions: computed.deductions,
            grossEarnings: computed.grossEarnings,
            totalDeductions: computed.totalDeductions,
            netPay: computed.netPay,
            workingDays: computed.attendance.workingDays,
            eligibleWorkingDays: computed.attendance.eligibleWorkingDays,
            payableDays: computed.attendance.payableDays,
            presentDays: computed.attendance.presentDays,
            leaveDays: computed.attendance.leaveDays,
            lopDays: computed.attendance.lopDays,
            employeeSnapshot,
            attendanceSnapshot: computed.attendance as unknown as Record<string, unknown>,
            source: PayrollSource.SYSTEM_AUTO,
            status: PayrollRecordStatus.GENERATED,
            remarks: null,
          };

          const saved = existing
            ? await this.repo.saveRecord(Object.assign(existing, recordPayload))
            : await this.repo.createRecord(recordPayload);

          await this.generateAndAttachPdf(saved, employeeSnapshot);
          successCount++;
        } catch (err: any) {
          failedCount++;
          errors.push({
            employeeId,
            message: err?.message || 'Unknown payroll generation error',
          });
        }
      }

      await this.repo.updateRun(runId, {
        processedCount: Math.min(i + BATCH_SIZE, employeeIds.length),
        successCount,
        failedCount,
        skippedCount,
        errorSummary: errors,
      } as any);
    }

    const finalStatus =
      failedCount === 0
        ? PayrollRunStatus.COMPLETED
        : successCount === 0
          ? PayrollRunStatus.FAILED
          : PayrollRunStatus.PARTIAL_SUCCESS;

    await this.repo.updateRun(runId, {
      status: finalStatus,
      processedCount: employeeIds.length,
      totalEmployees: employeeIds.length,
      successCount,
      failedCount,
      skippedCount,
      errorSummary: errors,
      resultSummary: {
        overwriteExisting,
        completedAt: new Date().toISOString(),
      },
      completedAt: new Date(),
    } as any);
  }

  async dispatchRun(
    runId: string,
    options: {
      sendEmail: boolean;
      publishToPortal: boolean;
      retryFailedOnly?: boolean;
    },
  ) {
    const run = await this.repo.findRunById(runId);
    if (!run) throw ApiError.notFound('Payroll run not found');

    const records = await this.repo.findRecords({ payrollRunId: runId });
    if (!records.length) {
      throw ApiError.badRequest('No payroll records found in this run');
    }

    let emailed = 0;
    let portalPublished = 0;
    let failed = 0;
    const errors: Array<{ employeeId?: string; employeeCode?: string; message: string }> = [];

    for (const record of records) {
      if (options.retryFailedOnly && record.status !== PayrollRecordStatus.FAILED) {
        continue;
      }
      try {
        if (options.sendEmail) {
          await this.emailPayslip(record.id);
          emailed++;
        }
        if (options.publishToPortal) {
          await this.releasePayslip(record.id);
          portalPublished++;
        }
      } catch (err: any) {
        failed++;
        const snapshot = (record.employeeSnapshot || {}) as Record<string, unknown>;
        errors.push({
          employeeId: record.employeeId,
          employeeCode: String(snapshot.employeeCode || ''),
          message: err?.message || 'Dispatch failed',
        });
      }
    }

    await this.repo.updateRun(runId, {
      emailedCount: Number(run.emailedCount || 0) + emailed,
      portalPublishedCount: Number(run.portalPublishedCount || 0) + portalPublished,
      errorSummary: [...(run.errorSummary || []), ...errors],
      resultSummary: {
        ...(run.resultSummary || {}),
        lastDispatchAt: new Date().toISOString(),
        lastDispatch: {
          sendEmail: options.sendEmail,
          publishToPortal: options.publishToPortal,
          retryFailedOnly: !!options.retryFailedOnly,
          emailed,
          portalPublished,
          failed,
        },
      },
    } as any);

    return {
      runId,
      totalRecords: records.length,
      emailed,
      portalPublished,
      failed,
      errors,
    };
  }

  exportAttendanceReport(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    return this.buildAttendanceReport(employeeId, month, year);
  }

  async exportSalaryReport(
    month: number,
    year: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const records = await this.repo.findRecords({ month, year });
    const header = [
      'Employee ID',
      'Employee Name',
      'Email',
      'Department',
      'Designation',
      'Gross Earnings',
      'Total Deductions',
      'Net Pay',
      'Paid Days',
      'LOP Days',
      'PF',
      'ESI',
      'PT',
      'Bank Account',
      'Status',
      'Generated At',
    ];

    const rows = records.map((record) => {
      const snapshot = (record.employeeSnapshot || {}) as Record<string, unknown>;
      const pf = this.findDeduction(record.deductions, ['pf']);
      const esi = this.findDeduction(record.deductions, ['esi']);
      const pt = this.findDeduction(record.deductions, ['professional tax', 'pt']);
      return [
        String(snapshot.employeeCode || ''),
        String(snapshot.employeeName || ''),
        String(snapshot.email || ''),
        String(snapshot.department || ''),
        String(snapshot.designation || ''),
        Number(record.grossEarnings) || 0,
        Number(record.totalDeductions) || 0,
        Number(record.netPay) || 0,
        Number(record.payableDays) || 0,
        Number(record.lopDays) || 0,
        pf,
        esi,
        pt,
        String(snapshot.bankAccount || ''),
        record.status,
        record.createdAt.toISOString(),
      ];
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, `Salary_${month}_${year}`);

    return {
      fileName: `salary_report_${year}_${String(month).padStart(2, '0')}.xlsx`,
      buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    };
  }

  // ─── Download Excel template ───

  generateExcelTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const headers = [
      // Identity
      'Employee ID', 'Employee Name', 'Email',
      // Earnings
      'Basic', 'HRA', 'Conveyance', 'Special Allowance', 'Allowances',
      'Bonus', 'Incentive', 'Retention Bonus', 'Joining Bonus',
      'Arrears', 'Reimbursement', 'Other Earnings',
      // Deductions
      'Employee PF', 'Employer PF', 'ESI', 'Professional Tax', 'TDS',
      'LOP Deduction', 'Salary Advance', 'Penalty', 'Other Deductions',
      // Attendance
      'Working Days', 'Payable Days', 'Present Days', 'Leave Days', 'LOP Days',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // Set column widths for readability
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ─── Helpers ───

  private async computeEmployeePayrollData(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<ComputedPayrollData> {
    const { user, profile, salary, salaryStructure } = await this.resolveEmployee(employeeId);
    const attendance = await this.computeAttendance(
      employeeId,
      month,
      year,
      profile?.dateOfJoining,
    );

    const earnings = this.mergeEarnings([], salary, salaryStructure);
    const deductions = this.mergeDeductions([], salary, salaryStructure);

    const lopDays = Number(attendance.lopDays) || 0;
    if (lopDays > 0 && attendance.eligibleWorkingDays > 0) {
      const lopBase =
        this.findComponentAmount(earnings, ['basic']) ||
        this.findComponentAmount(earnings, ['gross']) ||
        earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const lopDeduction = round2((lopBase / attendance.eligibleWorkingDays) * lopDays);
      const existingLopIdx = deductions.findIndex((d) =>
        d.name.toLowerCase().includes('lop'),
      );
      if (existingLopIdx >= 0) deductions.splice(existingLopIdx, 1);
      deductions.push({ name: 'LOP Deduction', amount: lopDeduction });
    }

    const pfEmployeeContribution = this.extractPfEmployeeContribution(
      salary,
      salaryStructure,
    );
    if (
      pfEmployeeContribution > 0 &&
      !deductions.some((d) => d.name.toLowerCase().includes('pf'))
    ) {
      deductions.push({
        name: 'PF (Employee)',
        amount: pfEmployeeContribution,
      });
    }

    const pfEmployerContribution = this.extractPfEmployerContribution(
      salary,
      salaryStructure,
    );

    const grossEarnings = round2(earnings.reduce((s, e) => s + Number(e.amount || 0), 0));
    const totalDeductions = round2(
      deductions.reduce((s, d) => s + Number(d.amount || 0), 0),
    );
    const netPay = round2(grossEarnings - totalDeductions);

    const bankingInfo = (salaryStructure?.bankingInfo || {}) as Record<string, unknown>;
    const bankAccount =
      String(bankingInfo.accountNumber || '') || salary?.accountNumber || '';
    const uan = String(bankingInfo.uanNumber || '') || salary?.uanNumber || '';
    const pfNo = String(bankingInfo.pfNumber || '') || '';
    const esiNo = String(bankingInfo.esiNumber || '') || '';

    return {
      user,
      profile,
      salary,
      salaryStructure,
      attendance,
      earnings,
      deductions,
      grossEarnings,
      totalDeductions,
      netPay,
      bankAccount,
      uan,
      pfNo,
      esiNo,
      pfEmployeeContribution,
      pfEmployerContribution,
    };
  }

  private async resolveEmployee(employeeId: string) {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: employeeId, isActive: true } });
    if (!user) throw ApiError.notFound('Employee not found');
    const { profile, salary, salaryStructure } = await this.resolveEmployeeData(user.id);
    return { user, profile, salary, salaryStructure };
  }

  private async resolveEmployeeData(userId: string) {
    const profileRepo = AppDataSource.getRepository(EmployeeProfile);
    const salaryRepo = AppDataSource.getRepository(SalaryDetails);
    const structureRepo = AppDataSource.getRepository(EmployeeSalaryStructure);
    const [profile, salary, salaryStructure] = await Promise.all([
      profileRepo.findOne({ where: { userId } }),
      salaryRepo.findOne({ where: { userId } }),
      structureRepo
        .createQueryBuilder('ss')
        .leftJoinAndSelect('ss.components', 'components')
        .leftJoinAndSelect('ss.statutoryBreakdowns', 'statutoryBreakdowns')
        .where('ss.employeeId = :userId', { userId })
        .andWhere('ss.status = :status', { status: 'ACTIVE' })
        .orderBy('ss.effectiveFrom', 'DESC')
        .addOrderBy('ss.createdAt', 'DESC')
        .getOne(),
    ]);
    return { profile, salary, salaryStructure };
  }

  private async findUserByRow(row: ParsedRow): Promise<User | null> {
    const userRepo = AppDataSource.getRepository(User);
    if (row.employeeId) {
      // Try by empId first
      const u = await userRepo.findOne({ where: { empId: row.employeeId, isActive: true } });
      if (u) return u;
    }
    if (row.employeeCode) {
      const u = await userRepo.findOne({ where: { empId: row.employeeCode, isActive: true } });
      if (u) return u;
    }
    if (row.email) {
      const u = await userRepo.findOne({ where: { email: row.email, isActive: true } });
      if (u) return u;
    }
    return null;
  }

  private async computeAttendance(
    employeeId: string,
    month: number,
    year: number,
    dateOfJoining?: string,
  ): Promise<AttendanceComputation> {
    const attRepo = AppDataSource.getRepository(Attendance);
    const leaveRepo = AppDataSource.getRepository(LeaveRequest);
    const holidayRepo = AppDataSource.getRepository(Holiday);

    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let weekOffDays: string[] = ['SUNDAY'];
    let altSatRule = AlternateSaturdayRule.NONE;
    try {
      const orgRepo = AppDataSource.getRepository(OrgSettings);
      const org = await orgRepo.findOne({ where: {} });
      if (org) {
        weekOffDays = (org.weekOffDays || 'SUNDAY')
          .split(',')
          .map((d) => d.trim().toUpperCase());
        altSatRule = org.alternateSaturdayOffRule || AlternateSaturdayRule.NONE;
      }
    } catch {
      // fallback defaults
    }

    const holidays = await holidayRepo
      .createQueryBuilder('h')
      .where('h.date >= :start AND h.date <= :end', { start: startDate, end: endDate })
      .getMany();
    const holidaySet = new Set(holidays.map((h) => h.date));

    const DAY_NAMES = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];

    const classifyDay = (d: number): 'WORKING' | 'HOLIDAY' | 'WEEK_OFF' => {
      const dt = new Date(year, month - 1, d);
      const dayOfWeek = dt.getDay();
      const dayName = DAY_NAMES[dayOfWeek];
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
        2,
        '0',
      )}`;

      if (holidaySet.has(dateStr)) return 'HOLIDAY';
      if (dayName !== 'SATURDAY' && weekOffDays.includes(dayName)) return 'WEEK_OFF';

      if (dayName === 'SATURDAY') {
        if (weekOffDays.includes('SATURDAY')) return 'WEEK_OFF';
        if (altSatRule !== AlternateSaturdayRule.NONE) {
          const saturdayNum = Math.ceil(d / 7);
          if (
            altSatRule === AlternateSaturdayRule.SECOND_FOURTH &&
            (saturdayNum === 2 || saturdayNum === 4)
          ) {
            return 'WEEK_OFF';
          }
          if (
            altSatRule === AlternateSaturdayRule.FIRST_THIRD &&
            (saturdayNum === 1 || saturdayNum === 3)
          ) {
            return 'WEEK_OFF';
          }
        }
      }
      return 'WORKING';
    };

    let workingDays = 0;
    let weekOffCount = 0;
    let holidayCount = 0;
    for (let d = 1; d <= lastDay; d++) {
      const cls = classifyDay(d);
      if (cls === 'WORKING') workingDays++;
      if (cls === 'WEEK_OFF') weekOffCount++;
      if (cls === 'HOLIDAY') holidayCount++;
    }

    let eligibleStartDay = 1;
    if (dateOfJoining) {
      const joiningDate = new Date(dateOfJoining);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month - 1, lastDay);
      if (joiningDate > monthEnd) {
        return {
          workingDays,
          eligibleWorkingDays: 0,
          payableDays: 0,
          presentDays: 0,
          leaveDays: 0,
          lopDays: 0,
          weekOffDays: weekOffCount,
          holidayDays: holidayCount,
          totalWorkedMinutes: 0,
          totalBreakMinutes: 0,
          totalLateMinutes: 0,
          permissionHours: 0,
          permissionCount: 0,
          regularizationCount: 0,
        };
      }
      if (joiningDate > monthStart) eligibleStartDay = joiningDate.getDate();
    }

    let eligibleWorkingDays = 0;
    for (let d = eligibleStartDay; d <= lastDay; d++) {
      if (classifyDay(d) === 'WORKING') eligibleWorkingDays++;
    }

    const eligibleStartDate = `${year}-${String(month).padStart(
      2,
      '0',
    )}-${String(eligibleStartDay).padStart(2, '0')}`;

    const [attendances, approvedLeaves] = await Promise.all([
      attRepo
        .createQueryBuilder('a')
        .where('a.employeeId = :employeeId', { employeeId })
        .andWhere('a.date >= :start AND a.date <= :end', {
          start: eligibleStartDate,
          end: endDate,
        })
        .getMany(),
      leaveRepo
        .createQueryBuilder('lr')
        .where('lr.employeeId = :employeeId', { employeeId })
        .andWhere('lr.status = :approved', { approved: LeaveStatus.APPROVED })
        .andWhere(
          '((lr.startDate <= :end AND lr.endDate >= :start) OR (lr.date >= :start AND lr.date <= :end))',
          {
            start: eligibleStartDate,
            end: endDate,
          },
        )
        .getMany(),
    ]);

    let presentDays = 0;
    let leaveDays = 0;
    let lopDays = 0;
    let totalWorkedMinutes = 0;
    let totalBreakMinutes = 0;
    let totalLateMinutes = 0;
    let regularizationCount = 0;

    for (const attendance of attendances) {
      totalWorkedMinutes += Number(attendance.totalWorkMinutes || 0);
      totalBreakMinutes += Number(attendance.totalBreakMinutes || 0);
      totalLateMinutes += Number(attendance.lateMinutes || 0);
      if (attendance.regularized) regularizationCount += 1;

      switch (attendance.status) {
        case AttendanceStatus.PRESENT:
        case AttendanceStatus.LATE:
        case AttendanceStatus.PERMISSION:
        case AttendanceStatus.REGULARIZED:
        case AttendanceStatus.EARLY_OUT:
        case AttendanceStatus.OVERTIME:
          presentDays += 1;
          break;
        case AttendanceStatus.HALF_DAY:
          presentDays += 0.5;
          lopDays += 0.5;
          break;
        case AttendanceStatus.LOP:
          lopDays += 1;
          break;
        case AttendanceStatus.LEAVE:
          leaveDays += 1;
          break;
        default:
          break;
      }
    }

    let permissionHours = 0;
    let permissionCount = 0;
    for (const leave of approvedLeaves) {
      const effectiveType = leave.approvedLeaveType || leave.leaveType;
      if (leave.requestMode === RequestMode.PERMISSION || effectiveType === LeaveType.PERMISSION) {
        permissionCount += 1;
        permissionHours += Number(leave.totalHours || 0);
        continue;
      }

      const totalDays =
        Number(leave.totalDays || 0) ||
        (leave.startDate && leave.endDate
          ? this.countBusinessDaysInRange(leave.startDate, leave.endDate, holidaySet, weekOffDays, altSatRule)
          : leave.date
            ? 1
            : 0);
      if (effectiveType === LeaveType.LOP) lopDays += totalDays;
      else leaveDays += totalDays;
    }

    if (lopDays > eligibleWorkingDays) lopDays = eligibleWorkingDays;
    const payableDays = Math.max(0, round2(eligibleWorkingDays - lopDays));

    return {
      workingDays,
      eligibleWorkingDays,
      payableDays,
      presentDays: round2(presentDays),
      leaveDays: round2(leaveDays),
      lopDays: round2(lopDays),
      weekOffDays: weekOffCount,
      holidayDays: holidayCount,
      totalWorkedMinutes,
      totalBreakMinutes,
      totalLateMinutes,
      permissionHours: round2(permissionHours),
      permissionCount,
      regularizationCount,
    };
  }

  private mergeEarnings(
    excelEarnings: PayrollComponent[],
    salary: SalaryDetails | null,
    salaryStructure?: EmployeeSalaryStructure | null,
  ): PayrollComponent[] {
    if (excelEarnings.length > 0) return this.normalizeComponents(excelEarnings);

    if (salaryStructure?.components?.length) {
      const fromStructure = salaryStructure.components
        .filter(
          (component) =>
            component.category === SalaryComponentCategory.EARNING &&
            Number(component.calculatedAmount || 0) > 0 &&
            component.includeInGross,
        )
        .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
        .map((component) => ({
          name: component.componentName,
          amount: round2(Number(component.calculatedAmount || 0)),
        }));
      if (fromStructure.length > 0) return fromStructure;
    }

    if (salary && Array.isArray(salary.earnings) && salary.earnings.length > 0) {
      return salary.earnings
        .filter((earning: any) => Number(earning.amount) > 0)
        .map((earning: any) => ({
          name: earning.name,
          amount: round2(Number(earning.amount)),
        }));
    }

    const earnings: PayrollComponent[] = [];
    if (salary) {
      if (Number(salary.basic) > 0) earnings.push({ name: 'Basic', amount: Number(salary.basic) });
      if (Number(salary.hra) > 0) earnings.push({ name: 'HRA', amount: Number(salary.hra) });
      if (Number(salary.allowances) > 0) {
        earnings.push({ name: 'Allowances', amount: Number(salary.allowances) });
      }
    }
    return this.normalizeComponents(earnings);
  }

  private mergeDeductions(
    excelDeductions: PayrollComponent[],
    salary: SalaryDetails | null,
    salaryStructure?: EmployeeSalaryStructure | null,
  ): PayrollComponent[] {
    if (excelDeductions.length > 0) return this.normalizeComponents(excelDeductions);

    const deductions: PayrollComponent[] = [];
    const seen = new Set<string>();
    const addDeduction = (name: string, amount: number) => {
      const normalizedName = name.trim();
      const key = normalizedName.toLowerCase();
      if (!normalizedName || amount <= 0 || seen.has(key)) return;
      seen.add(key);
      deductions.push({ name: normalizedName, amount: round2(amount) });
    };

    if (salaryStructure?.components?.length) {
      for (const component of salaryStructure.components) {
        if (
          component.category === SalaryComponentCategory.DEDUCTION &&
          component.affectsNetPay &&
          Number(component.calculatedAmount || 0) > 0
        ) {
          addDeduction(component.componentName, Number(component.calculatedAmount || 0));
        }
      }
    }

    if (salaryStructure?.statutoryBreakdowns?.length) {
      for (const statutory of salaryStructure.statutoryBreakdowns) {
        if (
          (statutory.componentSide === StatutoryComponentSide.EMPLOYEE ||
            statutory.componentSide === StatutoryComponentSide.SHARED) &&
          Number(statutory.amount || 0) > 0
        ) {
          addDeduction(statutory.componentName, Number(statutory.amount || 0));
        }
      }
    }

    if (deductions.length > 0) return deductions;

    if (salary && Array.isArray(salary.deductions) && salary.deductions.length > 0) {
      for (const deduction of salary.deductions) {
        addDeduction(String((deduction as any).name || ''), Number((deduction as any).amount || 0));
      }
    }

    if (salary && salary.pfApplicable && Number(salary.pfEmployeeContribution) > 0) {
      addDeduction('PF (Employee)', Number(salary.pfEmployeeContribution));
    }

    return deductions;
  }

  private extractPfEmployeeContribution(
    salary: SalaryDetails | null,
    salaryStructure?: EmployeeSalaryStructure | null,
  ): number {
    if (salaryStructure?.statutoryBreakdowns?.length) {
      const value = salaryStructure.statutoryBreakdowns
        .filter(
          (statutory) =>
            statutory.statutoryType === StatutoryType.PF &&
            (statutory.componentSide === StatutoryComponentSide.EMPLOYEE ||
              statutory.componentSide === StatutoryComponentSide.SHARED),
        )
        .reduce((sum, statutory) => sum + Number(statutory.amount || 0), 0);
      if (value > 0) return round2(value);
    }
    if (salary?.pfApplicable && Number(salary.pfEmployeeContribution) > 0) {
      return round2(Number(salary.pfEmployeeContribution));
    }
    return 0;
  }

  private extractPfEmployerContribution(
    salary: SalaryDetails | null,
    salaryStructure?: EmployeeSalaryStructure | null,
  ): number {
    if (salaryStructure?.statutoryBreakdowns?.length) {
      const value = salaryStructure.statutoryBreakdowns
        .filter(
          (statutory) =>
            statutory.statutoryType === StatutoryType.PF &&
            (statutory.componentSide === StatutoryComponentSide.EMPLOYER ||
              statutory.componentSide === StatutoryComponentSide.SHARED),
        )
        .reduce((sum, statutory) => sum + Number(statutory.amount || 0), 0);
      if (value > 0) return round2(value);
    }
    if (salary?.pfApplicable && Number(salary.pfEmployerContribution) > 0) {
      return round2(Number(salary.pfEmployerContribution));
    }
    return 0;
  }

  private normalizeComponents(components: PayrollComponent[]): PayrollComponent[] {
    return components
      .map((component) => ({
        name: String(component.name || '').trim(),
        amount: round2(Number(component.amount || 0)),
      }))
      .filter((component) => component.name && component.amount > 0);
  }

  private findComponentAmount(components: PayrollComponent[], tokens: string[]): number {
    const lowered = tokens.map((token) => token.toLowerCase());
    const found = components.find((component) => {
      const name = component.name.toLowerCase();
      return lowered.some((token) => name === token || name.includes(token));
    });
    return found ? Number(found.amount || 0) : 0;
  }

  private findDeduction(components: PayrollComponent[], keys: string[]): number {
    return round2(
      components
        .filter((component) => {
          const name = component.name.toLowerCase();
          return keys.some((key) => name.includes(key.toLowerCase()));
        })
        .reduce((sum, component) => sum + Number(component.amount || 0), 0),
    );
  }

  private countBusinessDaysInRange(
    startDate: string,
    endDate: string,
    holidaySet: Set<string>,
    weekOffDays: string[],
    altSatRule: AlternateSaturdayRule,
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    const DAY_NAMES = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    let count = 0;
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(date.getDate()).padStart(2, '0')}`;
      if (holidaySet.has(dateStr)) continue;
      const dayOfWeek = date.getDay();
      const dayName = DAY_NAMES[dayOfWeek];
      if (dayName !== 'SATURDAY' && weekOffDays.includes(dayName)) continue;
      if (dayName === 'SATURDAY') {
        if (weekOffDays.includes('SATURDAY')) continue;
        if (altSatRule !== AlternateSaturdayRule.NONE) {
          const saturdayNum = Math.ceil(date.getDate() / 7);
          if (
            altSatRule === AlternateSaturdayRule.SECOND_FOURTH &&
            (saturdayNum === 2 || saturdayNum === 4)
          ) {
            continue;
          }
          if (
            altSatRule === AlternateSaturdayRule.FIRST_THIRD &&
            (saturdayNum === 1 || saturdayNum === 3)
          ) {
            continue;
          }
        }
      }
      count++;
    }
    return count;
  }

  private async buildAttendanceReport(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const { user, profile } = await this.resolveEmployee(employeeId);
    const attendance = await this.computeAttendance(
      employeeId,
      month,
      year,
      profile?.dateOfJoining,
    );
    const attRepo = AppDataSource.getRepository(Attendance);
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(
      2,
      '0',
    )}`;
    const rows = await attRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.date >= :start AND a.date <= :end', { start: startDate, end: endDate })
      .orderBy('a.date', 'ASC')
      .getMany();

    const headerRow = [
      'Date',
      'Status',
      'First In',
      'Last Out',
      'Worked Minutes',
      'Break Minutes',
      'Late Minutes',
      'Early Out Minutes',
      'Overtime Minutes',
      'Regularized',
      'Permission Applied (mins)',
      'Geo Fence Issue',
    ];
    const detailRows = rows.map((row) => [
      row.date,
      row.status,
      row.firstCheckInAt ? new Date(row.firstCheckInAt).toISOString() : '',
      row.lastCheckOutAt ? new Date(row.lastCheckOutAt).toISOString() : '',
      Number(row.totalWorkMinutes || 0),
      Number(row.totalBreakMinutes || 0),
      Number(row.lateMinutes || 0),
      Number(row.earlyOutMinutes || 0),
      Number(row.overtimeMinutes || 0),
      row.regularized ? 'Yes' : 'No',
      Number(row.permissionMinutesApplied || 0),
      row.geoFenceIssue ? 'Yes' : 'No',
    ]);

    const summaryRows = [
      ['Employee Name', `${user.firstName} ${user.lastName}`],
      ['Employee ID', user.empId || ''],
      ['Department', profile?.department || ''],
      ['Designation', profile?.designation || ''],
      ['Month', `${String(month).padStart(2, '0')}/${year}`],
      ['Working Days', attendance.workingDays],
      ['Weekly Off', attendance.weekOffDays],
      ['Holidays', attendance.holidayDays],
      ['Present Days', attendance.presentDays],
      ['Leave Days', attendance.leaveDays],
      ['LOP Days', attendance.lopDays],
      ['Paid Days', attendance.payableDays],
      ['Worked Hours', round2(attendance.totalWorkedMinutes / 60)],
      ['Break Hours', round2(attendance.totalBreakMinutes / 60)],
      ['Late Minutes', attendance.totalLateMinutes],
      ['Permission Hours', attendance.permissionHours],
      ['Permission Count', attendance.permissionCount],
      ['Regularization Count', attendance.regularizationCount],
    ];

    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const detailSheet = XLSX.utils.aoa_to_sheet([headerRow, ...detailRows]);
    detailSheet['!cols'] = headerRow.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Daily Attendance');

    return {
      fileName: `attendance_report_${user.empId || employeeId}_${year}_${String(month).padStart(2, '0')}.xlsx`,
      buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    };
  }

  private formatRecord(r: PayrollRecord) {
    return {
      id: r.id,
      payrollRunId: r.payrollRunId,
      employeeId: r.employeeId,
      month: r.month,
      year: r.year,
      employeeSnapshot: r.employeeSnapshot,
      attendanceSnapshot: r.attendanceSnapshot,
      earnings: r.earnings,
      deductions: r.deductions,
      grossEarnings: Number(r.grossEarnings),
      totalDeductions: Number(r.totalDeductions),
      netPay: Number(r.netPay),
      workingDays: Number(r.workingDays),
      eligibleWorkingDays: Number(r.eligibleWorkingDays) || Number(r.workingDays),
      payableDays: Number(r.payableDays),
      presentDays: Number(r.presentDays),
      leaveDays: Number(r.leaveDays),
      lopDays: Number(r.lopDays),
      status: r.status,
      source: r.source,
      remarks: r.remarks,
      hasPayslip: !!r.payslipDocument,
      payslipFileName: r.payslipDocument?.fileName || null,
      isReleased: r.payslipDocument?.filePath === 'released',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildPayslipEmailHtml(empName: string, period: string, _netPay?: number, companyName?: string): string {
  const company = companyName || 'HRMS';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
  <div style="background:#7548b9;padding:24px 28px;"><h1 style="margin:0;color:#fff;font-size:20px;">${company}</h1></div>
  <div style="padding:28px;">
    <p style="margin:0 0 16px;color:#1a1a2e;font-size:15px;">Hi <strong>${empName}</strong>,</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;">We have sent your payslip for <strong>${period}</strong>. Please find it attached to this email.</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;">You can also view and download your payslips from the HRMS portal.</p>
    <p style="margin:0;color:#475569;font-size:14px;">Regards,<br><strong>${company}</strong></p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated message. Please do not reply.</p>
  </div>
  <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">&copy; ${new Date().getFullYear()} ${company}. All rights reserved.</p>
  </div>
</div>
</body></html>`;
}

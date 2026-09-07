import { SalaryDetailsRepository } from '../repositories/salaryDetails.repository';
import { EmployeeRepository } from '../repositories/employee.repository';
import { ApiError } from '../utils/apiError';
import type { SalaryComponent } from '../entities/SalaryDetails.entity';

interface SalaryInput {
  ctc?: number;
  basic?: number;
  hra?: number;
  allowances?: number;
  earnings?: SalaryComponent[];
  deductions?: SalaryComponent[];
  pfApplicable?: boolean;
  pfEmployeeContribution?: number;
  pfEmployerContribution?: number;
  taxRegime?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  bankMobileNumber?: string;
  branchName?: string;
  panNumber?: string;
  uanNumber?: string;
  esiNumber?: string;
}

export class SalaryDetailsService {
  private salaryRepo: SalaryDetailsRepository;
  private employeeRepo: EmployeeRepository;

  constructor() {
    this.salaryRepo = new SalaryDetailsRepository();
    this.employeeRepo = new EmployeeRepository();
  }

  async listAll() {
    const records = await this.salaryRepo.findAll();
    return {
      data: records.map((r) => this.formatRecord(r)),
      total: records.length,
    };
  }

  async getById(id: string) {
    const record = await this.salaryRepo.findById(id);
    if (!record) {
      throw ApiError.notFound('Salary details not found', 'SALARY_NOT_FOUND');
    }
    return this.formatRecord(record);
  }

  async getByUserId(userId: string) {
    const record = await this.salaryRepo.findByUserId(userId);
    if (!record) return null;
    return this.formatRecord(record);
  }

  async saveSalary(userId: string, input: SalaryInput) {
    const profile = await this.employeeRepo.findByUserId(userId);
    if (!profile) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const record = await this.salaryRepo.upsertByUserId(userId, {
      ctc: input.ctc ?? 0,
      basic: input.basic ?? 0,
      hra: input.hra ?? 0,
      allowances: input.allowances ?? 0,
      earnings: input.earnings ?? [],
      deductions: input.deductions ?? [],
      pfApplicable: input.pfApplicable ?? true,
      pfEmployeeContribution: input.pfEmployeeContribution ?? 0,
      pfEmployerContribution: input.pfEmployerContribution ?? 0,
      taxRegime: input.taxRegime || 'New',
      accountNumber: input.accountNumber || null,
      ifscCode: input.ifscCode || null,
      bankName: input.bankName || null,
      accountHolderName: input.accountHolderName || null,
      bankMobileNumber: input.bankMobileNumber || null,
      branchName: input.branchName || null,
      panNumber: input.panNumber || null,
      uanNumber: input.uanNumber || null,
      esiNumber: input.esiNumber || null,
    });

    return this.formatRecord(record);
  }

  async updateById(id: string, input: SalaryInput) {
    const existing = await this.salaryRepo.findById(id);
    if (!existing) {
      throw ApiError.notFound('Salary details not found', 'SALARY_NOT_FOUND');
    }

    await this.salaryRepo.update(id, {
      ctc: input.ctc ?? 0,
      basic: input.basic ?? 0,
      hra: input.hra ?? 0,
      allowances: input.allowances ?? 0,
      earnings: input.earnings ?? [],
      deductions: input.deductions ?? [],
      pfApplicable: input.pfApplicable ?? true,
      pfEmployeeContribution: input.pfEmployeeContribution ?? 0,
      pfEmployerContribution: input.pfEmployerContribution ?? 0,
      taxRegime: input.taxRegime || 'New',
      accountNumber: input.accountNumber || null,
      ifscCode: input.ifscCode || null,
      bankName: input.bankName || null,
      accountHolderName: input.accountHolderName || null,
      bankMobileNumber: input.bankMobileNumber || null,
      branchName: input.branchName || null,
      panNumber: input.panNumber || null,
      uanNumber: input.uanNumber || null,
      esiNumber: input.esiNumber || null,
    });

    return this.getById(id);
  }

  /**
   * Build normalised earnings array — reads from JSONB if available,
   * falls back to legacy basic/hra/allowances fixed columns.
   */
  private buildEarnings(r: any): SalaryComponent[] {
    const arr: SalaryComponent[] = Array.isArray(r.earnings) && r.earnings.length > 0 ? r.earnings : [];
    if (arr.length > 0) return arr;
    // Backward compat: derive from legacy fixed fields
    const earnings: SalaryComponent[] = [];
    if (parseFloat(r.basic) > 0) earnings.push({ name: 'Basic', amount: parseFloat(r.basic) });
    if (parseFloat(r.hra) > 0) earnings.push({ name: 'HRA', amount: parseFloat(r.hra) });
    if (parseFloat(r.allowances) > 0) earnings.push({ name: 'Allowances', amount: parseFloat(r.allowances) });
    return earnings;
  }

  private buildDeductions(r: any): SalaryComponent[] {
    const arr: SalaryComponent[] = Array.isArray(r.deductions) && r.deductions.length > 0 ? r.deductions : [];
    if (arr.length > 0) return arr;
    // Backward compat: derive PF from legacy field
    const deductions: SalaryComponent[] = [];
    if (r.pfApplicable && parseFloat(r.pfEmployeeContribution) > 0) {
      deductions.push({ name: 'PF (Employee)', amount: parseFloat(r.pfEmployeeContribution) });
    }
    return deductions;
  }

  private formatRecord(r: any) {
    const earnings = this.buildEarnings(r);
    const deductions = this.buildDeductions(r);
    const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

    return {
      id: r.id,
      userId: r.userId,
      ctc: parseFloat(r.ctc) || 0,
      basic: parseFloat(r.basic) || 0,
      hra: parseFloat(r.hra) || 0,
      allowances: parseFloat(r.allowances) || 0,
      earnings,
      deductions,
      totalEarnings,
      totalDeductions,
      netPay: totalEarnings - totalDeductions,
      pfApplicable: r.pfApplicable ?? true,
      pfEmployeeContribution: parseFloat(r.pfEmployeeContribution) || 0,
      pfEmployerContribution: parseFloat(r.pfEmployerContribution) || 0,
      taxRegime: r.taxRegime || 'New',
      accountNumber: r.accountNumber || '',
      ifscCode: r.ifscCode || '',
      bankName: r.bankName || '',
      accountHolderName: r.accountHolderName || '',
      bankMobileNumber: r.bankMobileNumber || '',
      branchName: r.branchName || '',
      panNumber: r.panNumber || '',
      uanNumber: r.uanNumber || '',
      esiNumber: r.esiNumber || '',
      employeeName: r.user ? `${r.user.firstName} ${r.user.lastName}` : '',
      empId: r.user?.empId || '',
      email: r.user?.email || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

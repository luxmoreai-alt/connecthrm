import { EmployeeRepository } from '../repositories/employee.repository';
import { EmployeeSalaryStructureRepository } from '../repositories/employeeSalaryStructure.repository';
import { SalaryDetailsRepository } from '../repositories/salaryDetails.repository';
import {
  CalculatedComponent,
  SalaryCalculationEngineService,
  SalaryComputationResult,
  StatutoryBreakdownLine,
} from './salaryCalculationEngine.service';
import { OrganizationSalaryConfigService } from './organizationSalaryConfig.service';
import { ApiError } from '../utils/apiError';
import {
  SalaryCalculationType,
  SalaryComponentCategory,
  SalaryComponentSourceType,
  StatutoryComponentSide,
} from '../salary/salary.enums';
import { SalaryPreviewInput } from '../salary/salary.types';

interface CustomEmployeeComponentInput {
  componentName: string;
  componentCode?: string;
  category: 'EARNING' | 'DEDUCTION';
  amount: number;
  includeInGross?: boolean;
  taxable?: boolean;
  includeInPfWage?: boolean;
  includeInEsiWage?: boolean;
  affectsNetPay?: boolean;
  displayOrder?: number;
}

interface SaveEmployeeSalaryStructureInput extends SalaryPreviewInput {
  effectiveFrom?: string;
  notes?: string;
  overrideEnabled?: boolean;
  customComponents?: CustomEmployeeComponentInput[];
  bankingInfo?: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    mobileNumber?: string;
    branchName?: string;
    panNumber?: string;
    uanNumber?: string;
  };
}

interface EmployeeBankingDetailsInput {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  mobileNumber: string;
  branchName: string;
  panNumber: string;
  uanNumber: string;
}

interface EmployeeSalaryComputationResult extends SalaryComputationResult {
  earnings: CalculatedComponent[];
  deductions: CalculatedComponent[];
  statutoryBreakdowns: StatutoryBreakdownLine[];
}

export class EmployeeSalaryStructureService {
  private employeeRepo: EmployeeRepository;
  private structureRepo: EmployeeSalaryStructureRepository;
  private configService: OrganizationSalaryConfigService;
  private calculator: SalaryCalculationEngineService;
  private salaryDetailsRepo: SalaryDetailsRepository;

  constructor() {
    this.employeeRepo = new EmployeeRepository();
    this.structureRepo = new EmployeeSalaryStructureRepository();
    this.configService = new OrganizationSalaryConfigService();
    this.calculator = new SalaryCalculationEngineService();
    this.salaryDetailsRepo = new SalaryDetailsRepository();
  }

  async listLatestStructures() {
    const rows = await this.structureRepo.listLatestByEmployee();
    return {
      data: rows.map((row) => this.formatStructure(row)),
      total: rows.length,
    };
  }

  async getLatestByEmployee(userId: string) {
    const row = await this.structureRepo.findLatestByEmployee(userId);
    if (!row) return null;
    return this.formatStructure(row);
  }

  async getBankingDetails(userId: string) {
    const [structure, legacy] = await Promise.all([
      this.structureRepo.findLatestByEmployee(userId),
      this.salaryDetailsRepo.findByUserId(userId),
    ]);
    const banking = (structure?.bankingInfo || {}) as Record<string, unknown>;
    return {
      accountHolderName: String(banking.accountHolderName || legacy?.accountHolderName || ''),
      bankName: String(banking.bankName || legacy?.bankName || ''),
      accountNumber: String(banking.accountNumber || legacy?.accountNumber || ''),
      ifscCode: String(banking.ifscCode || legacy?.ifscCode || ''),
      mobileNumber: String(banking.mobileNumber || legacy?.bankMobileNumber || ''),
      branchName: String(banking.branchName || legacy?.branchName || ''),
      panNumber: String(banking.panNumber || legacy?.panNumber || ''),
      uanNumber: String(banking.uanNumber || legacy?.uanNumber || ''),
      submitted: Boolean(
        (banking.accountNumber || legacy?.accountNumber)
        && (banking.ifscCode || legacy?.ifscCode),
      ),
    };
  }

  async saveBankingDetails(userId: string, input: EmployeeBankingDetailsInput) {
    const employee = await this.employeeRepo.findByUserId(userId);
    if (!employee) throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');

    const bankingInfo = {
      accountHolderName: input.accountHolderName,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      ifscCode: input.ifscCode,
      mobileNumber: input.mobileNumber,
      branchName: input.branchName,
      panNumber: input.panNumber,
      uanNumber: input.uanNumber,
    };
    const structure = await this.structureRepo.findLatestByEmployee(userId);
    if (structure) await this.structureRepo.updateBankingInfo(structure.id, bankingInfo);

    await this.salaryDetailsRepo.upsertByUserId(userId, {
      accountHolderName: input.accountHolderName,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      ifscCode: input.ifscCode,
      bankMobileNumber: input.mobileNumber,
      branchName: input.branchName,
      panNumber: input.panNumber,
      uanNumber: input.uanNumber || null,
    });
    return this.getBankingDetails(userId);
  }

  async preview(input: SaveEmployeeSalaryStructureInput): Promise<EmployeeSalaryComputationResult> {
    const config = await this.configService.getActiveConfigEntity();
    const computed = this.calculator.calculate(config, {
      annualCtc: input.annualCtc,
      monthlyCtc: input.monthlyCtc,
      taxRegime: input.taxRegime,
      componentOverrides: input.componentOverrides,
      componentStates: input.componentStates,
      statutoryOverrides: input.statutoryOverrides,
    });

    return this.applyCustomComponents(computed, input.customComponents || []);
  }

  async saveForEmployee(userId: string, input: SaveEmployeeSalaryStructureInput) {
    const employee = await this.employeeRepo.findByUserId(userId);
    if (!employee) {
      throw ApiError.notFound('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const config = await this.configService.getActiveConfigEntity();
    const computed = this.calculator.calculate(config, {
      annualCtc: input.annualCtc,
      monthlyCtc: input.monthlyCtc,
      taxRegime: input.taxRegime,
      componentOverrides: input.componentOverrides,
      componentStates: input.componentStates,
      statutoryOverrides: input.statutoryOverrides,
    });
    const finalStructure = this.applyCustomComponents(computed, input.customComponents || []);

    const saved = await this.structureRepo.saveStructureWithChildren({
      structure: {
        employeeId: userId,
        organizationSalaryConfigId: config.id,
        annualCtc: finalStructure.annualCtc,
        monthlyCtc: finalStructure.monthlyCtc,
        taxRegime: finalStructure.taxRegime,
        overrideEnabled: input.overrideEnabled ?? false,
        effectiveFrom: input.effectiveFrom || new Date().toISOString().slice(0, 10),
        notes: input.notes || null,
        summary: finalStructure.summary,
        bankingInfo: input.bankingInfo || {},
      },
      components: [
        ...finalStructure.earnings.map((component) => ({
          componentName: component.componentName,
          componentCode: component.componentCode,
          category: component.category,
          sourceType: component.sourceType,
          calculationType: component.calculationType,
          value: component.value,
          calculatedAmount: component.amount,
          percentageOf: component.percentageOf,
          formulaReference: component.formulaExpression,
          isOverride: component.isOverride,
          includeInGross: component.includeInGross,
          taxable: component.taxable,
          includeInPfWage: component.includeInPfWage,
          includeInEsiWage: component.includeInEsiWage,
          affectsNetPay: component.affectsNetPay,
          displayOrder: component.displayOrder,
          metadata: {},
        })),
        ...finalStructure.deductions.map((component) => ({
          componentName: component.componentName,
          componentCode: component.componentCode,
          category: component.category,
          sourceType: component.sourceType,
          calculationType: component.calculationType,
          value: component.value,
          calculatedAmount: component.amount,
          percentageOf: component.percentageOf,
          formulaReference: component.formulaExpression,
          isOverride: component.isOverride,
          includeInGross: component.includeInGross,
          taxable: component.taxable,
          includeInPfWage: component.includeInPfWage,
          includeInEsiWage: component.includeInEsiWage,
          affectsNetPay: component.affectsNetPay,
          displayOrder: component.displayOrder,
          metadata: {},
        })),
      ],
      statutoryBreakdowns: finalStructure.statutoryBreakdowns.map((entry) => ({
        statutoryType: entry.statutoryType,
        componentSide: entry.componentSide,
        componentName: entry.componentName,
        calculationMode: entry.calculationMode,
        rate: entry.rate,
        basisAmount: entry.basisAmount,
        wageBasis: entry.wageBasis,
        amount: entry.amount,
        metadata: entry.metadata,
      })),
    });

    await this.syncLegacySalaryDetails(userId, finalStructure, input.bankingInfo);
    return this.formatStructure(saved);
  }

  private async syncLegacySalaryDetails(
    userId: string,
    structure: EmployeeSalaryComputationResult,
    bankingInfo?: SaveEmployeeSalaryStructureInput['bankingInfo'],
  ) {
    const basic = structure.earnings.find((e) => e.componentCode === 'BASIC')?.amount || 0;
    const hra = structure.earnings.find((e) => e.componentCode === 'HRA')?.amount || 0;
    const allowances = structure.earnings
      .filter((e) => !['BASIC', 'HRA'].includes(e.componentCode))
      .reduce((sum, e) => sum + e.amount, 0);
    const pfEmployee =
      structure.deductions.find((d) => d.componentCode === 'PF_EMPLOYEE')?.amount || 0;
    const pfEmployer =
      structure.statutoryBreakdowns.find(
        (s) => s.componentName === 'PF Employer' && s.componentSide === StatutoryComponentSide.EMPLOYER,
      )?.amount || 0;

    await this.salaryDetailsRepo.upsertByUserId(userId, {
      ctc: structure.annualCtc,
      basic,
      hra,
      allowances,
      earnings: structure.earnings.map((e) => ({ name: e.componentName, amount: e.amount })),
      deductions: structure.deductions.map((d) => ({ name: d.componentName, amount: d.amount })),
      pfApplicable: pfEmployee > 0 || pfEmployer > 0,
      pfEmployeeContribution: pfEmployee,
      pfEmployerContribution: pfEmployer,
      taxRegime: structure.taxRegime,
      bankName: bankingInfo?.bankName || null,
      accountHolderName: bankingInfo?.accountHolderName || null,
      accountNumber: bankingInfo?.accountNumber || null,
      ifscCode: bankingInfo?.ifscCode || null,
      bankMobileNumber: bankingInfo?.mobileNumber || null,
      branchName: bankingInfo?.branchName || null,
      panNumber: bankingInfo?.panNumber || null,
      uanNumber: bankingInfo?.uanNumber || null,
    });
  }

  private applyCustomComponents(
    computed: SalaryComputationResult,
    customComponents: CustomEmployeeComponentInput[],
  ): EmployeeSalaryComputationResult {
    const earningComponents = [...computed.earnings];
    const deductionComponents = [...computed.deductions];

    let autoOrder = 3000;
    for (const custom of customComponents) {
      const amount = Number(custom.amount || 0);
      if (!custom.componentName?.trim() || amount <= 0) continue;

      const code = (custom.componentCode || custom.componentName)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const row: CalculatedComponent = {
        componentName: custom.componentName.trim(),
        componentCode: code,
        category: custom.category as SalaryComponentCategory,
        sourceType: SalaryComponentSourceType.EMPLOYEE_CUSTOM,
        calculationType: SalaryCalculationType.FIXED,
        value: amount,
        percentageOf: null,
        formulaExpression: null,
        amount,
        includeInGross: custom.includeInGross ?? custom.category === SalaryComponentCategory.EARNING,
        taxable: custom.taxable ?? custom.category === SalaryComponentCategory.EARNING,
        includeInPfWage: custom.includeInPfWage ?? false,
        includeInEsiWage: custom.includeInEsiWage ?? false,
        affectsNetPay:
          custom.affectsNetPay ?? custom.category === SalaryComponentCategory.DEDUCTION,
        editableForEmployee: true,
        isOverride: true,
        displayOrder: custom.displayOrder ?? autoOrder++,
      };

      if (custom.category === SalaryComponentCategory.EARNING) {
        earningComponents.push(row);
      } else {
        deductionComponents.push(row);
      }
    }

    const totalEarnings = earningComponents.reduce((sum, item) => sum + item.amount, 0);
    const employeeDeductions = deductionComponents
      .filter((item) => item.affectsNetPay)
      .reduce((sum, item) => sum + item.amount, 0);
    const totalDeductions = deductionComponents.reduce((sum, item) => sum + item.amount, 0);
    const employerContributions = computed.statutoryBreakdowns
      .filter((item) => item.componentSide === StatutoryComponentSide.EMPLOYER)
      .reduce((sum, item) => sum + item.amount, 0);
    const netPay = totalEarnings - employeeDeductions;
    const employerCostImpact = totalEarnings + employerContributions;
    const grossSalary = earningComponents
      .filter((item) => item.includeInGross)
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      ...computed,
      earnings: earningComponents.sort((a, b) => a.displayOrder - b.displayOrder),
      deductions: deductionComponents.sort((a, b) => a.displayOrder - b.displayOrder),
      summary: {
        grossSalary,
        totalEarnings,
        totalDeductions,
        netPay,
        employeeDeductions,
        employerContributions,
        employerCostImpact,
        annualNetPay: netPay * 12,
        annualEmployerCostImpact: employerCostImpact * 12,
      },
    };
  }

  private formatStructure(row: any) {
    const earnings = (row.components || [])
      .filter((c: any) => c.category === SalaryComponentCategory.EARNING)
      .map((c: any) => ({
        id: c.id,
        componentName: c.componentName,
        componentCode: c.componentCode,
        category: c.category,
        sourceType: c.sourceType,
        calculationType: c.calculationType,
        value: c.value != null ? Number(c.value) : null,
        calculatedAmount: Number(c.calculatedAmount || 0),
        percentageOf: c.percentageOf,
        formulaReference: c.formulaReference,
        isOverride: c.isOverride,
        includeInGross: c.includeInGross,
        taxable: c.taxable,
        includeInPfWage: c.includeInPfWage,
        includeInEsiWage: c.includeInEsiWage,
        affectsNetPay: c.affectsNetPay,
        displayOrder: c.displayOrder,
      }));
    const deductions = (row.components || [])
      .filter((c: any) => c.category === SalaryComponentCategory.DEDUCTION)
      .map((c: any) => ({
        id: c.id,
        componentName: c.componentName,
        componentCode: c.componentCode,
        category: c.category,
        sourceType: c.sourceType,
        calculationType: c.calculationType,
        value: c.value != null ? Number(c.value) : null,
        calculatedAmount: Number(c.calculatedAmount || 0),
        percentageOf: c.percentageOf,
        formulaReference: c.formulaReference,
        isOverride: c.isOverride,
        includeInGross: c.includeInGross,
        taxable: c.taxable,
        includeInPfWage: c.includeInPfWage,
        includeInEsiWage: c.includeInEsiWage,
        affectsNetPay: c.affectsNetPay,
        displayOrder: c.displayOrder,
      }));

    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : '',
      employeeCode: row.employee?.empId || '',
      email: row.employee?.email || '',
      organizationSalaryConfigId: row.organizationSalaryConfigId,
      appliedTemplateName: row.organizationSalaryConfig?.defaultTemplateName || '',
      appliedConfigVersion: row.organizationSalaryConfig?.version || 0,
      annualCtc: Number(row.annualCtc || 0),
      monthlyCtc: Number(row.monthlyCtc || 0),
      taxRegime: row.taxRegime,
      overrideEnabled: row.overrideEnabled,
      effectiveFrom: row.effectiveFrom,
      status: row.status,
      notes: row.notes || '',
      summary: row.summary || {},
      bankingInfo: row.bankingInfo || {},
      earnings,
      deductions,
      statutoryBreakdowns: (row.statutoryBreakdowns || []).map((s: any) => ({
        id: s.id,
        statutoryType: s.statutoryType,
        componentSide: s.componentSide,
        componentName: s.componentName,
        calculationMode: s.calculationMode,
        rate: s.rate != null ? Number(s.rate) : null,
        basisAmount: Number(s.basisAmount || 0),
        wageBasis: s.wageBasis,
        amount: Number(s.amount || 0),
        metadata: s.metadata || {},
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export type SalaryComponentCategory = "EARNING" | "DEDUCTION";
export type SalaryComponentStatus = "ACTIVE" | "INACTIVE";
export type SalaryComponentSourceType =
  | "TEMPLATE_DEFAULT"
  | "AUTO_STATUTORY"
  | "MANUAL_DEFAULT"
  | "EMPLOYEE_CUSTOM";
export type SalaryCalculationType = "FIXED" | "PERCENTAGE" | "FORMULA" | "RESIDUAL";
export type RoundingRule = "NONE" | "ROUND" | "FLOOR" | "CEIL";
export type StatutoryCalculationMode = "PERCENTAGE" | "FIXED" | "SLAB";
export type StatutoryType = "PF" | "ESI" | "PT" | "OTHER";
export type StatutoryComponentSide = "EMPLOYEE" | "EMPLOYER" | "SHARED";

export interface SalaryTemplateComponent {
  id?: string;
  componentName: string;
  componentCode: string;
  category: SalaryComponentCategory;
  sourceType: SalaryComponentSourceType;
  status: SalaryComponentStatus;
  defaultEnabled: boolean;
  calculationType: SalaryCalculationType;
  value?: number | null;
  percentageOf?: string | null;
  formulaExpression?: string | null;
  taxable: boolean;
  includeInPfWage: boolean;
  includeInEsiWage: boolean;
  includeInGross: boolean;
  affectsNetPay: boolean;
  editableForEmployee: boolean;
  displayOrder: number;
  metadata?: Record<string, unknown> | null;
}

export interface PfConfig {
  pfApplicable: boolean;
  pfCalculationMode: StatutoryCalculationMode;
  pfWageBasis: "BASIC" | "BASIC_DA" | "PF_ELIGIBLE_EARNINGS" | "CUSTOM";
  pfCustomComponentCodes?: string[];
  employeePfRate: number;
  employerPfRate: number;
  pensionRate: number;
  employeePfFixedAmount?: number;
  employerPfFixedAmount?: number;
  pensionFixedAmount?: number;
  pfWageLimitEnabled: boolean;
  pfWageLimitAmount: number;
  allowHigherPf: boolean;
  roundOffRule: RoundingRule;
  editablePerEmployee: boolean;
  defaultEnabled: boolean;
}

export interface EsiConfig {
  esiApplicable: boolean;
  esiCalculationMode: StatutoryCalculationMode;
  employeeEsiRate: number;
  employerEsiRate: number;
  employeeEsiFixedAmount?: number;
  employerEsiFixedAmount?: number;
  esiWageBasis: "GROSS" | "ESI_ELIGIBLE_EARNINGS" | "CUSTOM";
  esiCustomComponentCodes?: string[];
  esiEligibilityThresholdEnabled: boolean;
  esiEligibilityThresholdAmount: number;
  roundOffRule: RoundingRule;
  editablePerEmployee: boolean;
  defaultEnabled: boolean;
}

export interface PtSlab {
  minAmount: number;
  maxAmount: number | null;
  amount: number;
}

export interface PtConfig {
  ptApplicable: boolean;
  ptCalculationMode: "FIXED" | "SLAB";
  fixedAmount: number;
  slabs: PtSlab[];
  editablePerEmployee: boolean;
  defaultEnabled: boolean;
}

export interface SalaryRoundingRules {
  componentRule: RoundingRule;
  statutoryRule: RoundingRule;
  summaryRule: RoundingRule;
}

export interface OrganizationSalaryConfig {
  id: string;
  organizationId: string;
  defaultTemplateName: string;
  version: number;
  active: boolean;
  effectiveFrom: string;
  taxRegimeDefaults: string;
  pfConfig: PfConfig;
  esiConfig: EsiConfig;
  ptConfig: PtConfig;
  roundingRules: SalaryRoundingRules;
  metadata?: Record<string, unknown>;
  components: SalaryTemplateComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface SalaryConfigVersion {
  id: string;
  version: number;
  defaultTemplateName: string;
  active: boolean;
  effectiveFrom: string;
  createdAt: string;
}

export interface SalaryPreviewInput {
  annualCtc?: number;
  monthlyCtc?: number;
  taxRegime?: string;
  componentOverrides?: Record<string, number>;
  componentStates?: Record<string, boolean>;
  statutoryOverrides?: {
    pfApplicable?: boolean;
    esiApplicable?: boolean;
    ptApplicable?: boolean;
    employeePfRate?: number;
    employerPfRate?: number;
    employeeEsiRate?: number;
    employerEsiRate?: number;
    ptFixedAmount?: number;
  };
}

export interface SalaryComputedComponent {
  componentName: string;
  componentCode: string;
  category: SalaryComponentCategory;
  sourceType: SalaryComponentSourceType;
  calculationType: SalaryCalculationType;
  value: number | null;
  percentageOf: string | null;
  formulaExpression: string | null;
  amount: number;
  includeInGross: boolean;
  taxable: boolean;
  includeInPfWage: boolean;
  includeInEsiWage: boolean;
  affectsNetPay: boolean;
  editableForEmployee: boolean;
  isOverride: boolean;
  displayOrder: number;
}

export interface SalaryStatutoryBreakdown {
  statutoryType: StatutoryType;
  componentSide: StatutoryComponentSide;
  componentName: string;
  amount: number;
  calculationMode: StatutoryCalculationMode;
  rate: number | null;
  basisAmount: number;
  wageBasis: string | null;
  metadata: Record<string, unknown>;
}

export interface SalaryComputation {
  annualCtc: number;
  monthlyCtc: number;
  taxRegime: string;
  appliedTemplateName: string;
  appliedConfigVersion: number;
  earnings: SalaryComputedComponent[];
  deductions: SalaryComputedComponent[];
  statutoryBreakdowns: SalaryStatutoryBreakdown[];
  summary: {
    grossSalary: number;
    totalEarnings: number;
    totalDeductions: number;
    netPay: number;
    employeeDeductions: number;
    employerContributions: number;
    employerCostImpact: number;
    annualNetPay: number;
    annualEmployerCostImpact: number;
  };
}

export interface SaveEmployeeSalaryStructureInput extends SalaryPreviewInput {
  effectiveFrom?: string;
  notes?: string;
  overrideEnabled?: boolean;
  customComponents?: Array<{
    componentName: string;
    componentCode?: string;
    category: SalaryComponentCategory;
    amount: number;
    includeInGross?: boolean;
    taxable?: boolean;
    includeInPfWage?: boolean;
    includeInEsiWage?: boolean;
    affectsNetPay?: boolean;
    displayOrder?: number;
  }>;
  bankingInfo?: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    mobileNumber?: string;
    branchName?: string;
    panNumber?: string;
    uanNumber?: string;
    esiNumber?: string;
  };
}

export interface EmployeeSalaryStructureRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  email: string;
  organizationSalaryConfigId: string;
  appliedTemplateName: string;
  appliedConfigVersion: number;
  annualCtc: number;
  monthlyCtc: number;
  taxRegime: string;
  overrideEnabled: boolean;
  effectiveFrom: string;
  status: string;
  notes: string;
  summary: SalaryComputation["summary"];
  bankingInfo: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    mobileNumber?: string;
    branchName?: string;
    panNumber?: string;
    uanNumber?: string;
    esiNumber?: string;
  };
  earnings: Array<
    SalaryComputedComponent & {
      id: string;
      calculatedAmount: number;
      formulaReference?: string | null;
    }
  >;
  deductions: Array<
    SalaryComputedComponent & {
      id: string;
      calculatedAmount: number;
      formulaReference?: string | null;
    }
  >;
  statutoryBreakdowns: Array<
    SalaryStatutoryBreakdown & {
      id: string;
    }
  >;
  createdAt: string;
  updatedAt: string;
}

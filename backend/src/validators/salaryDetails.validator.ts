import { z } from 'zod';

const salaryComponentSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().min(0),
  category: z.string().max(50).optional(),
});

export const saveSalarySchema = z.object({
  ctc: z.number().min(0).optional().default(0),
  // Legacy fixed fields (still accepted for backward compat)
  basic: z.number().min(0).optional().default(0),
  hra: z.number().min(0).optional().default(0),
  allowances: z.number().min(0).optional().default(0),
  // Dynamic components
  earnings: z.array(salaryComponentSchema).optional().default([]),
  deductions: z.array(salaryComponentSchema).optional().default([]),
  // PF & tax
  pfApplicable: z.boolean().optional().default(true),
  pfEmployeeContribution: z.number().min(0).optional().default(0),
  pfEmployerContribution: z.number().min(0).optional().default(0),
  taxRegime: z.string().max(10).optional().default('New'),
  // Banking
  accountHolderName: z.string().max(120).optional().default(''),
  accountNumber: z.string().max(30).optional().default(''),
  ifscCode: z.string().max(20).optional().default(''),
  bankName: z.string().max(100).optional().default(''),
  bankMobileNumber: z.string().max(15).optional().default(''),
  branchName: z.string().max(100).optional().default(''),
  panNumber: z.string().max(10).optional().default(''),
  uanNumber: z.string().max(20).optional().default(''),
  esiNumber: z.string().max(10).optional().default(''),
});

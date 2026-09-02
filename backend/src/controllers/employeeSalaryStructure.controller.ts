import { Request, Response } from 'express';
import { ApiError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';
import { EmployeeSalaryStructureService } from '../services/employeeSalaryStructure.service';
import {
  previewEmployeeSalaryStructureSchema,
  saveEmployeeSalaryStructureSchema,
  employeeBankingDetailsSchema,
} from '../validators/employeeSalaryStructure.validator';
import { NotificationService } from '../services/notification.service';

const service = new EmployeeSalaryStructureService();
const notificationService = new NotificationService();

export class EmployeeSalaryStructureController {
  static async getMyBankingDetails(req: Request, res: Response): Promise<void> {
    const result = await service.getBankingDetails(req.user!.userId);
    ApiResponse.success(res, 'Banking details retrieved', result);
  }

  static async saveMyBankingDetails(req: Request, res: Response): Promise<void> {
    const parsed = employeeBankingDetailsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await service.saveBankingDetails(req.user!.userId, parsed.data);
    await notificationService.notifyAdmins(
      'BANKING_DETAILS_UPDATED',
      'Employee banking details submitted',
      'An employee submitted or updated their salary banking information.',
      '/admin/employees/salary',
    ).catch((err) => console.error('Failed to notify admins about banking details', err.message));
    ApiResponse.success(res, 'Banking details saved successfully', result);
  }

  static async list(_req: Request, res: Response): Promise<void> {
    const result = await service.listLatestStructures();
    ApiResponse.success(res, 'Employee salary structures retrieved', result);
  }

  static async getLatestByEmployee(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId as string;
    const result = await service.getLatestByEmployee(userId);
    ApiResponse.success(res, 'Employee salary structure retrieved', result);
  }

  static async getBankingDetailsByEmployee(req: Request, res: Response): Promise<void> {
    const result = await service.getBankingDetails(req.params.userId as string);
    ApiResponse.success(res, 'Employee banking details retrieved', result);
  }

  static async preview(req: Request, res: Response): Promise<void> {
    const parsed = previewEmployeeSalaryStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }
    const result = await service.preview(parsed.data as any);
    ApiResponse.success(res, 'Employee salary preview generated', result);
  }

  static async save(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId as string;
    const parsed = saveEmployeeSalaryStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }
    const result = await service.saveForEmployee(userId, parsed.data as any);
    await notificationService.notifyUser(userId, 'SALARY_UPDATED', 'Salary and banking details updated', 'HR updated your salary structure or banking information.', '/employee/payroll')
      .catch((err) => console.error('Failed to create salary structure notification', err.message));
    ApiResponse.success(res, 'Employee salary structure saved', result);
  }
}

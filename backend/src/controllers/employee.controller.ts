import { Request, Response } from 'express';
import { EmployeeService } from '../services/employee.service';
import {
  createEmployeeSchema,
  offboardEmployeeSchema,
  updateEmployeeSchema,
} from '../validators/employee.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const employeeService = new EmployeeService();

export class EmployeeController {
  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }

    const result = await employeeService.createEmployee(parsed.data);
    ApiResponse.created(res, 'Employee created successfully', result);
  }

  static async list(_req: Request, res: Response): Promise<void> {
    const result = await employeeService.listEmployees();
    ApiResponse.success(res, 'Employees retrieved', result);
  }

  static async dropdown(_req: Request, res: Response): Promise<void> {
    const result = await employeeService.dropdownEmployees();
    ApiResponse.success(res, 'Employee dropdown retrieved', result);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await employeeService.getEmployee(id);
    ApiResponse.success(res, 'Employee retrieved', result);
  }

  static async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }

    const result = await employeeService.updateEmployee(id, parsed.data);
    ApiResponse.success(res, 'Employee updated successfully', result);
  }

  static async offboard(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const parsed = offboardEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        'VALIDATION_ERROR',
      );
    }
    const result = await employeeService.offboardEmployee(id, parsed.data);
    ApiResponse.success(res, 'Employee offboarded successfully', result);
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const result = await employeeService.deleteEmployee(id);
    ApiResponse.success(res, 'Employee deleted successfully', result);
  }

  static async sendOnboardingLink(req: Request, res: Response): Promise<void> {
    const result = await employeeService.sendOnboardingLink(req.params.id as string);
    ApiResponse.success(res, 'Onboarding link sent successfully', result);
  }

  static async sendBankingDetailsLink(req: Request, res: Response): Promise<void> {
    const result = await employeeService.sendBankingDetailsLink(req.params.id as string);
    ApiResponse.success(res, 'Banking details link sent successfully', result);
  }

  static async uploadPhoto(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    if (!req.file) {
      throw ApiError.badRequest('Please select a profile photo', 'PHOTO_REQUIRED');
    }
    const result = await employeeService.updateProfilePhoto(id, req.file);
    ApiResponse.success(res, 'Profile photo updated successfully', result);
  }
}

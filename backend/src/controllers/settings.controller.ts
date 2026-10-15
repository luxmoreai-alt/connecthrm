import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import {
  updateSettingsSchema,
  createHolidaySchema,
  updateHolidaySchema,
  saveWorkdayOverrideSchema,
} from '../validators/settings.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { deleteCompanyLogo, storeCompanyLogo } from '../utils/companyLogo';

const settingsService = new SettingsService();

export class SettingsController {
  static async getSettings(_req: Request, res: Response): Promise<void> {
    const result = await settingsService.getSettings();
    ApiResponse.success(res, 'Settings retrieved', result);
  }

  static async updateSettings(req: Request, res: Response): Promise<void> {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }
    const result = await settingsService.updateSettings(parsed.data);
    ApiResponse.success(res, 'Settings updated successfully', result);
  }

  static async uploadCompanyLogo(req: Request, res: Response): Promise<void> {
    if (!req.file) throw ApiError.badRequest('Please select a logo', 'LOGO_REQUIRED');
    const current = await settingsService.getSettings();
    const companyLogoUrl = await storeCompanyLogo(req.file);
    try {
      const result = await settingsService.updateSettings({ companyLogoUrl });
      await deleteCompanyLogo(current.companyLogoUrl);
      ApiResponse.success(res, 'Company logo updated successfully', result);
    } catch (error) {
      await deleteCompanyLogo(companyLogoUrl);
      throw error;
    }
  }

  static async deleteCompanyLogo(_req: Request, res: Response): Promise<void> {
    const current = await settingsService.getSettings();
    const result = await settingsService.updateSettings({ companyLogoUrl: null });
    await deleteCompanyLogo(current.companyLogoUrl);
    ApiResponse.success(res, 'Company logo removed successfully', result);
  }

  static async listHolidays(_req: Request, res: Response): Promise<void> {
    const result = await settingsService.listHolidays();
    ApiResponse.success(res, 'Holidays retrieved', result);
  }

  static async createHoliday(req: Request, res: Response): Promise<void> {
    const parsed = createHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }
    const result = await settingsService.createHoliday(parsed.data);
    ApiResponse.created(res, 'Holiday created successfully', result);
  }

  static async updateHoliday(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const parsed = updateHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
    }
    const result = await settingsService.updateHoliday(id, parsed.data);
    ApiResponse.success(res, 'Holiday updated successfully', result);
  }

  static async deleteHoliday(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    await settingsService.deleteHoliday(id);
    ApiResponse.success(res, 'Holiday deleted successfully');
  }

  static async listWorkdayOverrides(req: Request, res: Response): Promise<void> {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const result = await settingsService.listWorkdayOverrides(year);
    ApiResponse.success(res, 'Workday updates retrieved', result);
  }

  static async saveWorkdayOverride(req: Request, res: Response): Promise<void> {
    const parsed = saveWorkdayOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '), 'VALIDATION_ERROR');
    }
    const result = await settingsService.saveWorkdayOverride(parsed.data, req.user!.userId);
    ApiResponse.success(res, 'Workday update saved and employees notified', result);
  }

  static async deleteWorkdayOverride(req: Request, res: Response): Promise<void> {
    await settingsService.deleteWorkdayOverride(req.params.id as string);
    ApiResponse.success(res, 'Workday update deleted');
  }
}

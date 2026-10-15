import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { ApiResponse } from '../utils/apiResponse';

const dashboardService = new DashboardService();

export class DashboardController {
  static async getSummary(_req: Request, res: Response): Promise<void> {
    const result = await dashboardService.getSummary();
    ApiResponse.success(res, 'Dashboard summary retrieved', result);
  }

  static async getUpcomingBirthdays(req: Request, res: Response): Promise<void> {
    const days = parseInt(req.query.days as string) || 30;
    const result = await dashboardService.getUpcomingBirthdays(days);
    ApiResponse.success(res, 'Upcoming birthdays retrieved', result);
  }

  static async getUpcomingHolidays(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 4;
    const result = await dashboardService.getUpcomingHolidays(limit);
    ApiResponse.success(res, 'Upcoming holidays retrieved', result);
  }

  static async getHolidayCalendar(req: Request, res: Response): Promise<void> {
    const requestedYear = Number(req.query.year ?? new Date().getFullYear());
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : new Date().getFullYear();
    const result = await dashboardService.getHolidayCalendar(year);
    ApiResponse.success(res, 'Holiday calendar retrieved', result);
  }

  static async getWorkdayUpdates(req: Request, res: Response): Promise<void> {
    const requestedYear = Number(req.query.year ?? new Date().getFullYear());
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear : new Date().getFullYear();
    ApiResponse.success(res, 'Workday updates retrieved', await dashboardService.getWorkdayUpdates(year));
  }
}

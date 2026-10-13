import { Request, Response } from 'express';
import { z } from 'zod';
import { ShiftService } from '../services/shift.service';
import { ApiError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';

const service = new ShiftService();
const saveWeekSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assignments: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftId: z.string().uuid().nullable(),
    note: z.string().max(300).optional(),
  })).max(7),
});

export class ShiftController {
  static async definitions(_req: Request, res: Response): Promise<void> {
    ApiResponse.success(res, 'Shift definitions retrieved', await service.getDefinitions());
  }

  static async myWeek(req: Request, res: Response): Promise<void> {
    ApiResponse.success(
      res,
      'Weekly shift schedule retrieved',
      await service.getEmployeeWeek(req.user!.userId, req.query.weekStart as string | undefined),
    );
  }

  static async adminWeek(req: Request, res: Response): Promise<void> {
    ApiResponse.success(
      res,
      'Weekly shift allocations retrieved',
      await service.getAdminWeek(req.query.weekStart as string | undefined),
    );
  }

  static async saveEmployeeWeek(req: Request, res: Response): Promise<void> {
    const parsed = saveWeekSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'VALIDATION_ERROR');
    }
    ApiResponse.success(
      res,
      'Weekly shifts saved successfully',
      await service.saveEmployeeWeek(req.params.employeeId as string, req.user!.userId, parsed.data.weekStart, parsed.data.assignments),
    );
  }
}

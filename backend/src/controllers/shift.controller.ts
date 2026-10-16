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

const shiftDefinitionSchema = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores').transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(100),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Start time must use HH:mm format'),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'End time must use HH:mm format'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color'),
  isNightShift: z.boolean(),
}).refine((value) => value.startTime !== value.endTime, {
  message: 'Start and end times must be different',
  path: ['endTime'],
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

  static async createDefinition(req: Request, res: Response): Promise<void> {
    const parsed = shiftDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'VALIDATION_ERROR');
    }
    ApiResponse.created(res, 'Shift timing created successfully', await service.createDefinition(parsed.data));
  }

  static async updateDefinition(req: Request, res: Response): Promise<void> {
    const parsed = shiftDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues.map((issue) => issue.message).join('; '), 'VALIDATION_ERROR');
    }
    ApiResponse.success(
      res,
      'Shift timing updated successfully',
      await service.updateDefinition(req.params.shiftId as string, parsed.data),
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

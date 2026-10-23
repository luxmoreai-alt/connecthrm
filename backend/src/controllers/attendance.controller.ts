import { Request, Response } from 'express';
import { AttendanceService } from '../services/attendance.service';
import { AttendanceStatus } from '../entities/Attendance.entity';
import { AttendanceRequestStatus } from '../attendance/attendance.enums';
import {
  startWorkSchema,
  endWorkSchema,
  punchActionSchema,
  reEnableStartWorkSchema,
  adminOverrideByEmployeeSchema,
  adminManualEntryByEmployeeSchema,
  monthlyQuerySchema,
  dateQuerySchema,
  createRegularizationRequestSchema,
  createPermissionRequestSchema,
  reviewRequestSchema,
  attendancePolicyUpdateSchema,
  employeeAttendanceAccessOverrideSchema,
} from '../validators/attendance.validator';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { deleteAttendancePhoto, saveAttendancePhoto } from '../utils/attendancePhoto';

const attendanceService = new AttendanceService();

const parseOrThrow = (schema: { safeParse: (v: unknown) => any }, input: unknown): any => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    throw ApiError.badRequest(messages.join('; '), 'VALIDATION_ERROR');
  }
  return parsed.data;
};

export class AttendanceController {
  // Settings / policy (admin)
  static async getPolicy(_req: Request, res: Response): Promise<void> {
    const result = await attendanceService.getActivePolicy();
    ApiResponse.success(res, 'Attendance policy retrieved', result);
  }

  static async listPolicyVersions(_req: Request, res: Response): Promise<void> {
    const result = await attendanceService.listPolicyVersions();
    ApiResponse.success(res, 'Attendance policy versions retrieved', result);
  }

  static async savePolicy(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(attendancePolicyUpdateSchema, req.body);
    const result = await attendanceService.savePolicy(data as any, req.user?.userId);
    ApiResponse.success(res, 'Attendance policy updated successfully', result);
  }

  // Employee
  static async getMyToday(req: Request, res: Response): Promise<void> {
    const result = await attendanceService.getTodayAttendance(req.user!.userId);
    ApiResponse.success(res, 'Today attendance retrieved', result);
  }

  static async getMyState(req: Request, res: Response): Promise<void> {
    const result = await attendanceService.getTodayState(req.user!.userId);
    ApiResponse.success(res, 'Attendance state retrieved', result);
  }

  static async punch(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(punchActionSchema, req.body);
    if (data.punchType === 'CHECK_IN' && !req.file) {
      throw ApiError.badRequest('Take a camera photo before punching in', 'PUNCH_IN_PHOTO_REQUIRED');
    }

    let photoUrl: string | undefined;
    try {
      if (data.punchType === 'CHECK_IN' && req.file) {
        photoUrl = await saveAttendancePhoto(req.user!.userId, req.file);
      }
      const result = await attendanceService.punchAction(req.user!.userId, {
        ...data,
        photoUrl,
      } as any);
      ApiResponse.success(res, 'Punch recorded successfully', result);
    } catch (error) {
      if (photoUrl) await deleteAttendancePhoto(photoUrl);
      throw error;
    }
  }

  static async startWork(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(startWorkSchema, req.body);
    if (!req.file) {
      throw ApiError.badRequest('Take a camera photo before punching in', 'PUNCH_IN_PHOTO_REQUIRED');
    }
    let photoUrl: string | undefined;
    try {
      photoUrl = await saveAttendancePhoto(req.user!.userId, req.file);
      const result = await attendanceService.startWork(req.user!.userId, { ...data, photoUrl });
      ApiResponse.success(res, 'Attendance started successfully', result);
    } catch (error) {
      if (photoUrl) await deleteAttendancePhoto(photoUrl);
      throw error;
    }
  }

  static async endWork(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(endWorkSchema, req.body);
    const result = await attendanceService.endWork(req.user!.userId, data);
    ApiResponse.success(res, 'Work ended successfully', result);
  }

  static async getMyHistory(req: Request, res: Response): Promise<void> {
    const daysParam = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days;
    const days = daysParam ? parseInt(String(daysParam), 10) : 30;
    const result = await attendanceService.getHistory(req.user!.userId, days);
    ApiResponse.success(res, 'Attendance history retrieved', result);
  }

  static async getMyMonthly(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(monthlyQuerySchema, req.query);
    const result = await attendanceService.getEmployeeMonthlyAttendance(req.user!.userId, data);
    ApiResponse.success(res, 'Monthly attendance retrieved', result);
  }

  static async getMyDay(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(dateQuerySchema, req.query);
    const result = await attendanceService.getDayDetails(req.user!.userId, data.date);
    ApiResponse.success(res, 'Day attendance detail retrieved', result);
  }

  static async createRegularization(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(createRegularizationRequestSchema, req.body);
    const result = await attendanceService.createRegularizationRequest(req.user!.userId, data as any);
    ApiResponse.created(res, 'Regularization request created', result);
  }

  static async listMyRegularizations(req: Request, res: Response): Promise<void> {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await attendanceService.listMyRegularizationRequests(req.user!.userId, status);
    ApiResponse.success(res, 'Regularization requests retrieved', result);
  }

  static async createPermission(req: Request, res: Response): Promise<void> {
    const data = parseOrThrow(createPermissionRequestSchema, req.body);
    const result = await attendanceService.createPermissionRequest(req.user!.userId, data);
    ApiResponse.created(res, 'Permission request created', result);
  }

  static async listMyPermissions(req: Request, res: Response): Promise<void> {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await attendanceService.listMyPermissionRequests(req.user!.userId, status);
    ApiResponse.success(res, 'Permission requests retrieved', result);
  }

  // Admin
  static async getAdminAttendance(req: Request, res: Response): Promise<void> {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const department = req.query.department as string | undefined;
    const result = await attendanceService.getAdminAttendance(date, status, search, department);
    ApiResponse.success(res, 'Attendance records retrieved', result);
  }

  static async getAdminEmployeeAttendance(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const daysParam = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days;
    const days = daysParam ? parseInt(String(daysParam), 10) : 30;
    const result = await attendanceService.getAdminEmployeeAttendance(employeeId, days);
    ApiResponse.success(res, 'Employee attendance retrieved', result);
  }

  static async getAdminEmployeeDay(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(dateQuerySchema, req.query);
    const result = await attendanceService.getAdminDayDetails(employeeId, data.date);
    ApiResponse.success(res, 'Employee day attendance detail retrieved', result);
  }

  static async getAdminEmployeeMonthly(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(monthlyQuerySchema, req.query);
    const result = await attendanceService.getAdminMonthlySummary(employeeId, data);
    ApiResponse.success(res, 'Employee monthly attendance summary retrieved', result);
  }

  static async getAdminPendingRequests(_req: Request, res: Response): Promise<void> {
    const result = await attendanceService.getAdminPendingRequests();
    ApiResponse.success(res, 'Pending attendance requests retrieved', result);
  }

  static async listAdminRegularizations(req: Request, res: Response): Promise<void> {
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (rawStatus && !Object.values(AttendanceRequestStatus).includes(rawStatus as AttendanceRequestStatus)) {
      throw ApiError.badRequest('Invalid regularization status', 'INVALID_REGULARIZATION_STATUS');
    }
    const result = await attendanceService.getAdminRegularizationRequests(
      rawStatus as AttendanceRequestStatus | undefined,
    );
    ApiResponse.success(res, 'Regularization history retrieved', result);
  }

  static async listEmployeeAccessOverrides(req: Request, res: Response): Promise<void> {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await attendanceService.listEmployeeAccessOverrides(search);
    ApiResponse.success(res, 'Attendance access overrides retrieved', result);
  }

  static async getEmployeeAccessOverride(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const result = await attendanceService.getEmployeeAccessOverride(employeeId);
    ApiResponse.success(res, 'Attendance access override retrieved', result);
  }

  static async saveEmployeeAccessOverride(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(employeeAttendanceAccessOverrideSchema, req.body);
    const result = await attendanceService.saveEmployeeAccessOverride(
      employeeId,
      req.user!.userId,
      data,
    );
    ApiResponse.success(res, 'Attendance access override saved', result);
  }

  static async clearEmployeeAccessOverride(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const result = await attendanceService.clearEmployeeAccessOverride(
      employeeId,
      req.user!.userId,
    );
    ApiResponse.success(res, 'Attendance access override cleared', result);
  }

  static async reviewRegularization(req: Request, res: Response): Promise<void> {
    const requestId = req.params.requestId as string;
    const data = parseOrThrow(reviewRequestSchema, req.body);
    const result = await attendanceService.reviewRegularizationRequest(
      requestId,
      req.user!.userId,
      data,
    );
    ApiResponse.success(res, 'Regularization request reviewed', result);
  }

  static async reviewPermission(req: Request, res: Response): Promise<void> {
    const requestId = req.params.requestId as string;
    const data = parseOrThrow(reviewRequestSchema, req.body);
    const result = await attendanceService.reviewPermissionRequest(
      requestId,
      req.user!.userId,
      data,
    );
    ApiResponse.success(res, 'Permission request reviewed', result);
  }

  static async overrideStatus(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(adminOverrideByEmployeeSchema, req.body);
    const result = await attendanceService.overrideStatus(
      employeeId,
      data.date,
      data.status as AttendanceStatus,
      data.reason,
    );
    ApiResponse.success(res, 'Attendance status overridden successfully', result);
  }

  static async manualEntry(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(adminManualEntryByEmployeeSchema, req.body);
    const result = await attendanceService.manualEntry(employeeId, data.date, {
      ...data,
      status: data.status as AttendanceStatus | undefined,
    });
    ApiResponse.success(res, 'Attendance updated manually', result);
  }

  static async reEnableStartWork(req: Request, res: Response): Promise<void> {
    const employeeId = req.params.employeeId as string;
    const data = parseOrThrow(reEnableStartWorkSchema, req.body);
    const result = await attendanceService.reEnableStartWork(
      employeeId,
      req.user!.userId,
      data,
    );
    ApiResponse.success(res, 'Start work override enabled successfully', result);
  }
}


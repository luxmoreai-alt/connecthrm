import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { EmployeeService } from '../services/employee.service';
import { ApiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const employeeService = new EmployeeService();

const accessSchema = z.object({
  employeeId: z.string().trim().toUpperCase().min(2).max(20).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  department: z.string().trim().min(1).max(100),
  designation: z.string().trim().min(1).max(100),
  employmentType: z.string().trim().min(1).max(50),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reportingManager: z.string().trim().min(1).max(200),
  shiftSchedule: z.string().trim().min(1).max(100),
});

const tokensMatch = (supplied: unknown): boolean => {
  const configured = env.OFFER_SYNC_TOKEN;
  if (!configured || typeof supplied !== 'string') return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
};

router.post('/access', asyncHandler(async (req, res) => {
  if (!tokensMatch(req.headers['x-offer-sync-token'])) {
    return ApiResponse.error(res, 'Invalid Offer Studio integration token', 'INVALID_OFFER_SYNC_TOKEN', 401);
  }

  const parsed = accessSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return ApiResponse.error(res, message, 'VALIDATION_ERROR', 400);
  }

  const result = await employeeService.provisionOfferAccess({
    empId: parsed.data.employeeId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    department: parsed.data.department,
    designation: parsed.data.designation,
    employmentType: parsed.data.employmentType,
    dateOfJoining: parsed.data.dateOfJoining,
    reportingManager: parsed.data.reportingManager,
    shiftSchedule: parsed.data.shiftSchedule,
    allowLoginOnlyInsideOffice: false,
  });

  return ApiResponse.success(res, result.created ? 'HRMS access created and emailed' : 'HRMS access refreshed and emailed', result, result.created ? 201 : 200);
}));

export default router;

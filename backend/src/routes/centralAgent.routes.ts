import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const tokensMatch = (authorization: unknown): boolean => {
  const configured = env.CENTRAL_AGENT_TOKEN;
  if (!configured || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7).trim();
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
};

router.get('/overview', asyncHandler(async (req, res) => {
  if (!tokensMatch(req.headers.authorization)) {
    return ApiResponse.error(res, 'Invalid central agent token', 'INVALID_CENTRAL_AGENT_TOKEN', 401);
  }

  const [employeeRows, leaveRows, attendanceRows, regularizationRows, permissionRows] = await Promise.all([
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM users WHERE "isActive" = TRUE AND "deletedAt" IS NULL`),
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM leave_requests WHERE status = 'PENDING'`),
    AppDataSource.query(`SELECT status::text AS status, COUNT(*)::int AS count FROM attendance WHERE date = CURRENT_DATE GROUP BY status ORDER BY status`),
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM attendance_regularization_requests WHERE status = 'PENDING'`),
    AppDataSource.query(`SELECT COUNT(*)::int AS count FROM attendance_permission_requests WHERE status = 'PENDING'`),
  ]);

  const attendance = Object.fromEntries(attendanceRows.map((row: { status: string; count: number }) => [row.status, Number(row.count)]));
  return ApiResponse.success(res, 'HRMS overview retrieved', {
    activeEmployees: Number(employeeRows[0]?.count || 0),
    pendingLeaveRequests: Number(leaveRows[0]?.count || 0),
    pendingRegularizations: Number(regularizationRows[0]?.count || 0),
    pendingPermissions: Number(permissionRows[0]?.count || 0),
    attendanceDate: new Date().toISOString().slice(0, 10),
    attendance,
  });
}));

export default router;

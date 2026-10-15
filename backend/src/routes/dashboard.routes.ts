import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Shared endpoints — any authenticated user
router.get('/upcoming-birthdays', authMiddleware, asyncHandler(DashboardController.getUpcomingBirthdays));
router.get('/upcoming-holidays', authMiddleware, asyncHandler(DashboardController.getUpcomingHolidays));
router.get('/holidays', authMiddleware, asyncHandler(DashboardController.getHolidayCalendar));
router.get('/workday-updates', authMiddleware, asyncHandler(DashboardController.getWorkdayUpdates));

// Admin-only summary
router.get('/', authMiddleware, roleMiddleware('ADMIN'), asyncHandler(DashboardController.getSummary));

export default router;

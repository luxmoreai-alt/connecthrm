import { Router } from 'express';
import { AttendanceController } from '../controllers/attendance.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';

const router = Router();

const punchPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Punch photo must be a JPG, PNG, or WEBP image'));
  },
});

router.use(authMiddleware);

// Employee attendance routes
router.get('/me/today', asyncHandler(AttendanceController.getMyToday));
router.get('/me/state', asyncHandler(AttendanceController.getMyState));
router.post('/me/punch', punchPhotoUpload.single('photo'), asyncHandler(AttendanceController.punch));
router.post('/me/start-work', punchPhotoUpload.single('photo'), asyncHandler(AttendanceController.startWork));
router.post('/me/end-work', asyncHandler(AttendanceController.endWork));
router.get('/me/history', asyncHandler(AttendanceController.getMyHistory));
router.get('/me/monthly', asyncHandler(AttendanceController.getMyMonthly));
router.get('/me/day', asyncHandler(AttendanceController.getMyDay));
router.post('/me/regularizations', asyncHandler(AttendanceController.createRegularization));
router.get('/me/regularizations', asyncHandler(AttendanceController.listMyRegularizations));
router.post('/me/permissions', asyncHandler(AttendanceController.createPermission));
router.get('/me/permissions', asyncHandler(AttendanceController.listMyPermissions));

// Admin attendance routes
router.get('/admin', roleMiddleware('ADMIN'), asyncHandler(AttendanceController.getAdminAttendance));
router.get(
  '/admin/pending-requests',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.getAdminPendingRequests),
);
router.get(
  '/admin/regularizations',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.listAdminRegularizations),
);
router.get(
  '/admin/access-overrides',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.listEmployeeAccessOverrides),
);
router.get(
  '/admin/access-overrides/:employeeId',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.getEmployeeAccessOverride),
);
router.put(
  '/admin/access-overrides/:employeeId',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.saveEmployeeAccessOverride),
);
router.delete(
  '/admin/access-overrides/:employeeId',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.clearEmployeeAccessOverride),
);
router.patch(
  '/admin/regularizations/:requestId/review',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.reviewRegularization),
);
router.patch(
  '/admin/permissions/:requestId/review',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.reviewPermission),
);
router.get(
  '/admin/:employeeId',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.getAdminEmployeeAttendance),
);
router.get(
  '/admin/:employeeId/day',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.getAdminEmployeeDay),
);
router.get(
  '/admin/:employeeId/monthly',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.getAdminEmployeeMonthly),
);
router.patch(
  '/admin/:employeeId/status',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.overrideStatus),
);
router.patch(
  '/admin/:employeeId/manual-entry',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.manualEntry),
);
router.patch(
  '/admin/:employeeId/re-enable-start-work',
  roleMiddleware('ADMIN'),
  asyncHandler(AttendanceController.reEnableStartWork),
);

export default router;


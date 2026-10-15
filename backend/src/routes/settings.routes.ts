import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { OrganizationSalaryConfigController } from '../controllers/organizationSalaryConfig.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Logo must be a JPG, PNG, or WEBP image'));
  },
});

// All settings routes require ADMIN role
router.use(authMiddleware, roleMiddleware('ADMIN'));

// ── Org Settings ──

/**
 * @swagger
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get organisation settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     workStartTime: { type: string, example: "09:00" }
 *                     workEndTime: { type: string, example: "18:00" }
 *                     lateGraceMinutes: { type: integer, example: 15 }
 *                     halfDayMinMinutes: { type: integer, example: 240 }
 *                     fullDayMinMinutes: { type: integer, example: 540 }
 *                     weekOffDays: { type: string, example: "SUNDAY" }
 *                     alternateSaturdayOffRule: { type: string, enum: [NONE, SECOND_FOURTH, FIRST_THIRD] }
 *                     officeLatitude: { type: number, nullable: true }
 *                     officeLongitude: { type: number, nullable: true }
 *                     officeRadiusMeters: { type: integer, nullable: true }
 *                     geoFenceRequired: { type: boolean, example: true }
 *                     allowRemoteAttendance: { type: boolean, example: false }
 */
router.get('/', asyncHandler(SettingsController.getSettings));

/**
 * @swagger
 * /api/settings:
 *   put:
 *     tags: [Settings]
 *     summary: Update organisation settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workStartTime: { type: string, example: "09:00" }
 *               workEndTime: { type: string, example: "18:00" }
 *               lateGraceMinutes: { type: integer, example: 15 }
 *               halfDayMinMinutes: { type: integer, example: 240 }
 *               fullDayMinMinutes: { type: integer, example: 540 }
 *               weekOffDays: { type: string, example: "SATURDAY,SUNDAY" }
 *               alternateSaturdayOffRule: { type: string, enum: [NONE, SECOND_FOURTH, FIRST_THIRD] }
 *               officeLatitude: { type: number, nullable: true }
 *               officeLongitude: { type: number, nullable: true }
 *               officeRadiusMeters: { type: integer, nullable: true }
 *               geoFenceRequired: { type: boolean }
 *               allowRemoteAttendance: { type: boolean }
 *     responses:
 *       200:
 *         description: Settings updated
 *       400:
 *         description: Validation error
 */
router.put('/', asyncHandler(SettingsController.updateSettings));
router.post('/company-logo', logoUpload.single('logo'), asyncHandler(SettingsController.uploadCompanyLogo));
router.delete('/company-logo', asyncHandler(SettingsController.deleteCompanyLogo));

// Salary configuration
router.get(
  '/salary-config',
  asyncHandler(OrganizationSalaryConfigController.getActive),
);
router.get(
  '/salary-config/versions',
  asyncHandler(OrganizationSalaryConfigController.listVersions),
);
router.put(
  '/salary-config',
  asyncHandler(OrganizationSalaryConfigController.save),
);
router.post(
  '/salary-config/preview',
  asyncHandler(OrganizationSalaryConfigController.preview),
);


// ── Holidays ──

/**
 * @swagger
 * /api/settings/holidays:
 *   get:
 *     tags: [Settings]
 *     summary: List all holidays
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Holidays list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           date: { type: string, format: date }
 *                           name: { type: string }
 *                     total: { type: integer }
 */
router.get('/holidays', asyncHandler(SettingsController.listHolidays));

/**
 * @swagger
 * /api/settings/holidays:
 *   post:
 *     tags: [Settings]
 *     summary: Create a holiday
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, name]
 *             properties:
 *               date: { type: string, format: date, example: "2026-01-26" }
 *               name: { type: string, example: "Republic Day" }
 *     responses:
 *       201:
 *         description: Holiday created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate date
 */
router.post('/holidays', asyncHandler(SettingsController.createHoliday));

/**
 * @swagger
 * /api/settings/holidays/{id}:
 *   put:
 *     tags: [Settings]
 *     summary: Update a holiday
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, name]
 *             properties:
 *               date: { type: string, format: date }
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Holiday updated
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate date
 */
router.put('/holidays/:id', asyncHandler(SettingsController.updateHoliday));

/**
 * @swagger
 * /api/settings/holidays/{id}:
 *   delete:
 *     tags: [Settings]
 *     summary: Delete a holiday
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Holiday deleted
 *       404:
 *         description: Not found
 */
router.delete('/holidays/:id', asyncHandler(SettingsController.deleteHoliday));
router.get('/workday-overrides', asyncHandler(SettingsController.listWorkdayOverrides));
router.post('/workday-overrides', asyncHandler(SettingsController.saveWorkdayOverride));
router.delete('/workday-overrides/:id', asyncHandler(SettingsController.deleteWorkdayOverride));

export default router;

import { Router } from 'express';
import { EmployeeController } from '../controllers/employee.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getUploadPath } from '../utils/uploadPath';

const router = Router();

const PHOTO_DIR = getUploadPath('profile-photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const photoStorage = process.env.VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, PHOTO_DIR),
      filename: (_req, file, cb) =>
        cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    });

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Profile photo must be a JPG, PNG, or WEBP image'));
  },
});

// All employee routes require ADMIN role
router.use(authMiddleware, roleMiddleware('ADMIN'));

/**
 * @swagger
 * /api/employees:
 *   post:
 *     tags: [Employees]
 *     summary: Create a new employee
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, department, designation, employmentType, dateOfJoining, reportingManager, shiftSchedule]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               department: { type: string }
 *               designation: { type: string }
 *               employmentType: { type: string }
 *               dateOfJoining: { type: string, format: date }
 *               reportingManager: { type: string }
 *               shiftSchedule: { type: string }
 *               allowLoginOnlyInsideOffice: { type: boolean }
 *               officeLatitude: { type: number }
 *               officeLongitude: { type: number }
 *               officeRadiusMeters: { type: number }
 *     responses:
 *       201:
 *         description: Employee created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate email
 */
router.post('/', asyncHandler(EmployeeController.create));

/**
 * @swagger
 * /api/employees:
 *   get:
 *     tags: [Employees]
 *     summary: List all employees
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employees list
 */
router.get('/', asyncHandler(EmployeeController.list));

/**
 * @swagger
 * /api/employees/dropdown:
 *   get:
 *     tags: [Employees]
 *     summary: Get employee dropdown list
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employee dropdown list
 */
router.get('/dropdown', asyncHandler(EmployeeController.dropdown));

router.post(
  '/:id/photo',
  photoUpload.single('photo'),
  asyncHandler(EmployeeController.uploadPhoto),
);

/**
 * @swagger
 * /api/employees/{id}:
 *   get:
 *     tags: [Employees]
 *     summary: Get employee by profile ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Employee details
 *       404:
 *         description: Not found
 */
router.get('/:id', asyncHandler(EmployeeController.getById));

router.post('/:id/offboard', asyncHandler(EmployeeController.offboard));
router.post('/:id/send-onboarding-link', asyncHandler(EmployeeController.sendOnboardingLink));
router.post('/:id/send-banking-details-link', asyncHandler(EmployeeController.sendBankingDetailsLink));

/**
 * @swagger
 * /api/employees/{id}:
 *   patch:
 *     tags: [Employees]
 *     summary: Update employee
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
 *             properties:
 *               isActive: { type: boolean }
 *               officeLocationRequired: { type: boolean }
 *               officeLatitude: { type: number }
 *               officeLongitude: { type: number }
 *               officeRadiusMeters: { type: number }
 *               department: { type: string }
 *               designation: { type: string }
 *     responses:
 *       200:
 *         description: Employee updated
 *       404:
 *         description: Not found
 */
router.patch('/:id', asyncHandler(EmployeeController.update));

router.delete('/:id', asyncHandler(EmployeeController.delete));

export default router;

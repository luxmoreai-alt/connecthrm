import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { PayrollController } from '../controllers/payroll.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getUploadPath } from '../utils/uploadPath';

const router = Router();

// ── Multer config for Excel uploads ───
const UPLOAD_DIR = getUploadPath('payroll-imports');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const ALLOWED_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

// All routes require auth
router.use(authMiddleware);

// ═══════ Admin routes ═══════
router.get('/template', roleMiddleware('ADMIN'), asyncHandler(PayrollController.downloadTemplate));
router.get('/sample-payslip', roleMiddleware('ADMIN'), asyncHandler(PayrollController.downloadSamplePayslip));
router.get('/reports/attendance', roleMiddleware('ADMIN'), asyncHandler(PayrollController.attendanceReport));
router.get('/reports/salary', roleMiddleware('ADMIN'), asyncHandler(PayrollController.salaryReport));
router.get('/summary', roleMiddleware('ADMIN'), asyncHandler(PayrollController.summary));
router.get('/runs', roleMiddleware('ADMIN'), asyncHandler(PayrollController.listRuns));
router.get('/runs/:id', roleMiddleware('ADMIN'), asyncHandler(PayrollController.runDetail));
router.post('/runs/system-generate', roleMiddleware('ADMIN'), asyncHandler(PayrollController.bulkGenerate));
router.post('/runs/:id/dispatch', roleMiddleware('ADMIN'), asyncHandler(PayrollController.dispatchRun));
router.get('/records', roleMiddleware('ADMIN'), asyncHandler(PayrollController.listRecords));
router.get('/records/:id', roleMiddleware('ADMIN'), asyncHandler(PayrollController.getRecord));
router.delete('/records/:id', roleMiddleware('ADMIN'), asyncHandler(PayrollController.deleteRecord));
router.get('/records/:id/download', roleMiddleware('ADMIN'), asyncHandler(PayrollController.downloadPayslip));
router.post('/preview', roleMiddleware('ADMIN'), asyncHandler(PayrollController.preview));
router.post('/generate', roleMiddleware('ADMIN'), asyncHandler(PayrollController.generateManual));
router.post('/import', roleMiddleware('ADMIN'), upload.single('file'), asyncHandler(PayrollController.bulkImport));
router.get('/import/:jobId', roleMiddleware('ADMIN'), asyncHandler(PayrollController.importStatus));
router.post('/records/:id/email', roleMiddleware('ADMIN'), asyncHandler(PayrollController.emailPayslip));
router.post('/records/:id/release', roleMiddleware('ADMIN'), asyncHandler(PayrollController.releasePayslip));

// ═══════ Employee routes ═══════
router.get('/my-payslips', asyncHandler(PayrollController.myPayslips));
router.get('/my-payslips/:id', asyncHandler(PayrollController.myPayslipDetail));
router.get('/my-payslips/:id/download', asyncHandler(PayrollController.downloadMyPayslip));

export default router;

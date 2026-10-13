import { Router } from 'express';
import { ShiftController } from '../controllers/shift.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authMiddleware);

router.get('/definitions', asyncHandler(ShiftController.definitions));
router.get('/me/week', asyncHandler(ShiftController.myWeek));
router.get('/admin/week', roleMiddleware('ADMIN'), asyncHandler(ShiftController.adminWeek));
router.put('/admin/week/:employeeId', roleMiddleware('ADMIN'), asyncHandler(ShiftController.saveEmployeeWeek));

export default router;

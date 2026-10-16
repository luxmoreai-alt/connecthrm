import { Router } from 'express';
import { ShiftController } from '../controllers/shift.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(authMiddleware);

router.get('/definitions', asyncHandler(ShiftController.definitions));
router.get('/me/week', asyncHandler(ShiftController.myWeek));
router.post('/admin/definitions', roleMiddleware('ADMIN'), asyncHandler(ShiftController.createDefinition));
router.put('/admin/definitions/:shiftId', roleMiddleware('ADMIN'), asyncHandler(ShiftController.updateDefinition));
router.get('/admin/week', roleMiddleware('ADMIN'), asyncHandler(ShiftController.adminWeek));
router.put('/admin/week/:employeeId', roleMiddleware('ADMIN'), asyncHandler(ShiftController.saveEmployeeWeek));

export default router;

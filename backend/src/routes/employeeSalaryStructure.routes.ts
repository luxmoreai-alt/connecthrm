import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { EmployeeSalaryStructureController } from '../controllers/employeeSalaryStructure.controller';

const router = Router();

router.use(authMiddleware);

router.get('/me/banking', roleMiddleware('EMPLOYEE'), asyncHandler(EmployeeSalaryStructureController.getMyBankingDetails));
router.put('/me/banking', roleMiddleware('EMPLOYEE'), asyncHandler(EmployeeSalaryStructureController.saveMyBankingDetails));

router.use(roleMiddleware('ADMIN'));

router.get('/', asyncHandler(EmployeeSalaryStructureController.list));
router.get('/user/:userId/banking', asyncHandler(EmployeeSalaryStructureController.getBankingDetailsByEmployee));
router.get('/user/:userId', asyncHandler(EmployeeSalaryStructureController.getLatestByEmployee));
router.post('/preview', asyncHandler(EmployeeSalaryStructureController.preview));
router.put('/user/:userId', asyncHandler(EmployeeSalaryStructureController.save));

export default router;

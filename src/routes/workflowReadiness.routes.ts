import { Router } from 'express';
import { WorkflowReadinessController } from '../controllers/workflowReadiness.controller';

const router = Router();

// Mount this behind your normal admin authentication middleware.
router.get('/', WorkflowReadinessController.overview);
router.get('/database', WorkflowReadinessController.database);
router.get('/routes', WorkflowReadinessController.routes);

export default router;

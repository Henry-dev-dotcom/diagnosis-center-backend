import { Router } from 'express';
import { WorkflowTrackingController } from '../controllers/workflowTracking.controller';
import { validateWorkflowEventQuery } from '../validators/workflowTracking.validators';

const router = Router();

// Use your existing auth and role middleware before these routes in routes/index.ts.
router.get('/', validateWorkflowEventQuery, WorkflowTrackingController.list);
router.get('/summary', validateWorkflowEventQuery, WorkflowTrackingController.summary);
router.get('/:eventId', WorkflowTrackingController.getById);

export default router;

import { Router } from 'express';
import scanWorkflowRoutes from './scanWorkflow.routes';

const router = Router();

// Register inside backend/src/routes/index.ts or your central API router.
// If an older scanWorkflow route from Phase 4 is already registered, replace it with this refined Phase 9 version.
router.use('/api/scan', scanWorkflowRoutes);

export default router;

import { Router } from 'express';
import labWorkflowRoutes from './labWorkflow.routes';
import scanWorkflowRoutes from './scanWorkflow.routes';
import receptionWorkflowRoutes from './receptionWorkflow.routes';
import clinicianResultDeliveryRoutes from './clinicianResultDelivery.routes';
import facilityManagementRoutes from './facilityManagement.routes';
import workflowTrackingRoutes from './workflowTracking.routes';
import workflowReadinessRoutes from './workflowReadiness.routes';
import resultDocumentRoutes from './resultDocument.routes';

const router = Router();

/**
 * Final diagnostic platform route registration for Phases 2-14.
 *
 * Recommended central registration:
 *   apiRouter.use('/', diagnosticPlatformRoutes);
 * or, if your app mounts no /api prefix:
 *   app.use('/api', diagnosticPlatformRoutes);
 *
 * Important:
 * - resultDocumentRoutes is mounted before lab/scan routes so multipart upload
 *   routes from Phase 6 handle document uploads before any placeholder routes.
 * - If you later remove the placeholder document routes from labWorkflow.routes.ts
 *   and scanWorkflow.routes.ts, keep resultDocumentRoutes mounted here.
 */
router.use('/', resultDocumentRoutes);
router.use('/lab', labWorkflowRoutes);
router.use('/scan', scanWorkflowRoutes);
router.use('/', receptionWorkflowRoutes);
router.use('/', clinicianResultDeliveryRoutes);
router.use('/admin/facilities', facilityManagementRoutes);
router.use('/admin/workflow-events', workflowTrackingRoutes);
router.use('/admin/workflow-readiness', workflowReadinessRoutes);

export default router;

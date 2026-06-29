import { Router } from 'express';
import { ScanWorkflowController } from '../controllers/scanWorkflow.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { FACILITY_ADMIN_ROLES, SCAN_ROLES } from '../constants/roles';
import { DEFAULT_FACILITY_FEATURES } from '../constants/diagnosticWorkflow.constants';
import {
  validateAcceptScanRequest,
  validateSaveScanResult,
  validateScanQueueSearch,
  validateScanResultDocument,
} from '../validators/scanWorkflow.validators';

const router = Router();

router.use(
  attachFacilityScope,
  requireFacilityId(),
  requireFacilityFeature(DEFAULT_FACILITY_FEATURES.SCAN)
);

const scanAccess = requireAnyRole([...SCAN_ROLES, ...FACILITY_ADMIN_ROLES]);

// Queue section: search and review scan requests, then accept selected scans to imaging.
router.get('/queue', scanAccess, validateScanQueueSearch, ScanWorkflowController.getQueue);
router.get('/queue/summary', scanAccess, ScanWorkflowController.getQueueSummary);
router.get('/queue/search', scanAccess, validateScanQueueSearch, ScanWorkflowController.searchQueue);
router.get('/queue/:orderId', scanAccess, ScanWorkflowController.getQueueOrder);
router.post('/queue/:orderId/accept', scanAccess, validateAcceptScanRequest, ScanWorkflowController.accept);

// Accepted scans: enter findings, upload result files, complete the scan result, and push directly to clinician.
router.get('/accepted', scanAccess, validateScanQueueSearch, ScanWorkflowController.getAccepted);
router.get('/accepted/search', scanAccess, validateScanQueueSearch, ScanWorkflowController.searchAccepted);
router.get('/accepted/:scanId', scanAccess, ScanWorkflowController.getAcceptedScan);
router.post('/accepted/:scanId/result', scanAccess, validateSaveScanResult, ScanWorkflowController.saveResult);
router.patch('/accepted/:scanId/complete', scanAccess, ScanWorkflowController.completeResult);

// Attach your existing upload middleware before validateScanResultDocument.
// Example: router.post('/accepted/:scanId/documents', upload.single('document'), validateScanResultDocument, ScanWorkflowController.attachDocument);
router.get('/accepted/:scanId/documents', scanAccess, ScanWorkflowController.getDocuments);
router.post('/accepted/:scanId/documents', scanAccess, validateScanResultDocument, ScanWorkflowController.attachDocument);
router.delete('/accepted/documents/:documentId', scanAccess, ScanWorkflowController.removeDocument);

router.post('/accepted/:scanId/push-to-clinician', scanAccess, ScanWorkflowController.pushToClinician);

// Results archive: all scan results already sent to clinicians.
router.get('/results', scanAccess, validateScanQueueSearch, ScanWorkflowController.getResults);

export default router;

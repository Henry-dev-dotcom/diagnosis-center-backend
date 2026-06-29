import { Router } from 'express';
import { LabWorkflowController } from '../controllers/labWorkflow.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { requireFacilityFeature } from '../middleware/requireFeature.middleware';
import { FACILITY_ADMIN_ROLES, LAB_ROLES } from '../constants/roles';
import { DEFAULT_FACILITY_FEATURES } from '../constants/diagnosticWorkflow.constants';
import {
  validateAcceptSelectedLabTests,
  validateLabQueueSearch,
  validateLabResultDocument,
  validateSaveLabTestResult,
} from '../validators/labWorkflow.validators';

const router = Router();

router.use(
  attachFacilityScope,
  requireFacilityId(),
  requireFacilityFeature(DEFAULT_FACILITY_FEATURES.LABORATORY)
);

const labAccess = requireAnyRole([...LAB_ROLES, ...FACILITY_ADMIN_ROLES]);

// Queue section: search requests, review one request, accept selected tests.
router.get('/queue', labAccess, validateLabQueueSearch, LabWorkflowController.getQueue);
router.get('/queue/summary', labAccess, LabWorkflowController.getQueueSummary);
router.get('/queue/search', labAccess, validateLabQueueSearch, LabWorkflowController.searchQueue);
router.get('/queue/:orderId', labAccess, LabWorkflowController.getQueueOrder);
router.post('/queue/:orderId/accept-tests', labAccess, validateAcceptSelectedLabTests, LabWorkflowController.acceptTests);

// Accepted Samples section: open a patient, enter each accepted test result, complete each test, push all to clinician.
router.get('/accepted-samples', labAccess, validateLabQueueSearch, LabWorkflowController.getAcceptedSamples);
router.get('/accepted-samples/search', labAccess, validateLabQueueSearch, LabWorkflowController.searchAcceptedSamples);
router.get('/accepted-samples/:sampleId', labAccess, LabWorkflowController.getAcceptedSample);
router.post('/accepted-samples/:sampleId/tests/:testId/result', labAccess, validateSaveLabTestResult, LabWorkflowController.saveTestResult);
router.patch('/accepted-samples/:sampleId/tests/:testId/complete', labAccess, LabWorkflowController.completeTest);
router.patch('/accepted-samples/:sampleId/tests/:testId/reopen', labAccess, LabWorkflowController.reopenTest);

// Result-entry popup document support. Attach your existing upload middleware before validateLabResultDocument.
// Example: router.post('/accepted-samples/:sampleId/tests/:testId/documents', upload.single('document'), validateLabResultDocument, LabWorkflowController.attachTestDocument);
router.post('/accepted-samples/:sampleId/tests/:testId/documents', labAccess, validateLabResultDocument, LabWorkflowController.attachTestDocument);
router.delete('/accepted-samples/documents/:documentId', labAccess, LabWorkflowController.removeTestDocument);

router.post('/accepted-samples/:sampleId/push-to-clinician', labAccess, LabWorkflowController.pushToClinician);

// Results section: archive of sent laboratory results.
router.get('/results', labAccess, validateLabQueueSearch, LabWorkflowController.getResults);

export default router;

import { Router } from 'express';
import { attachFacilityScope } from '../middleware/facilityScope.middleware';
import { requireSecureFacilityContext } from '../middleware/facilitySecurity.middleware';
import { validateResultDocumentUpload, blockDocumentMutationAfterDelivery } from '../middleware/fileSecurity.middleware';
import {
  preventPostDeliveryLabEdits,
  preventPostDeliveryScanEdits,
  requireAllLabTestsCompletedBeforeDelivery,
  validateLabAcceptanceSelection,
} from '../middleware/workflowValidation.middleware';
import { validateBody, acceptLabTestsSecureSchema, saveLabTestResultSecureSchema, saveScanResultSecureSchema } from '../validators/securityWorkflow.validators';

const router = Router();

// Apply these guards around the existing Phase 4 to Phase 10 routes.
router.use(attachFacilityScope, requireSecureFacilityContext());

// Laboratory queue: selected tests must belong to the original request and cannot be duplicated.
router.post(
  '/lab/queue/:orderId/accept-tests',
  validateBody(acceptLabTestsSecureSchema),
  validateLabAcceptanceSelection()
  // labWorkflowController.acceptSelectedTests
);

// Laboratory accepted samples: block edits after delivery and validate one-test-at-a-time result input.
router.post(
  '/lab/accepted-samples/:sampleId/tests/:testId/result',
  preventPostDeliveryLabEdits(),
  validateBody(saveLabTestResultSecureSchema)
  // labWorkflowController.saveTestResult
);

router.post(
  '/lab/accepted-samples/:sampleId/push-to-clinician',
  requireAllLabTestsCompletedBeforeDelivery()
  // labWorkflowController.pushToClinician
);

router.post(
  '/lab/accepted-samples/:sampleId/tests/:testId/documents',
  blockDocumentMutationAfterDelivery('labAcceptedSample', 'sampleId'),
  validateResultDocumentUpload()
  // resultDocumentController.uploadLabTestDocuments
);

// Scan accepted requests: block post-delivery mutation and validate findings before saving.
router.post(
  '/scan/accepted/:scanId/result',
  preventPostDeliveryScanEdits(),
  validateBody(saveScanResultSecureSchema)
  // scanWorkflowController.saveScanResult
);

router.post(
  '/scan/accepted/:scanId/documents',
  blockDocumentMutationAfterDelivery('scanAcceptedRequest', 'scanId'),
  validateResultDocumentUpload()
  // resultDocumentController.uploadScanDocuments
);

export default router;

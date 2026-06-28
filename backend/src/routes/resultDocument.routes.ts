import { Router } from 'express';
import { ResultDocumentController } from '../controllers/resultDocument.controller';
import { attachFacilityScope, requireFacilityId } from '../middleware/facilityScope.middleware';
import { requireAnyRole } from '../middleware/roleAccess.middleware';
import { FACILITY_ADMIN_ROLES, LAB_ROLES, SCAN_ROLES } from '../constants/roles';
import { singleResultDocument } from '../middleware/resultDocumentUpload.middleware';
import { validateResultDocumentUpload } from '../validators/resultDocument.validators';

const router = Router();

router.use(attachFacilityScope, requireFacilityId());

const labAccess = requireAnyRole([...LAB_ROLES, ...FACILITY_ADMIN_ROLES]);
const scanAccess = requireAnyRole([...SCAN_ROLES, ...FACILITY_ADMIN_ROLES]);

// Laboratory result-entry popup documents.
router.get('/lab/accepted-samples/:sampleId/tests/:testId/documents', labAccess, ResultDocumentController.listLabTestDocuments);
router.post(
  '/lab/accepted-samples/:sampleId/tests/:testId/documents',
  labAccess,
  singleResultDocument('document'),
  validateResultDocumentUpload,
  ResultDocumentController.attachLabTestDocument
);
router.delete('/lab/accepted-samples/documents/:documentId', labAccess, ResultDocumentController.removeLabTestDocument);

// Scan result documents.
router.get('/scan/accepted/:scanId/documents', scanAccess, ResultDocumentController.listScanDocuments);
router.post(
  '/scan/accepted/:scanId/documents',
  scanAccess,
  singleResultDocument('document'),
  validateResultDocumentUpload,
  ResultDocumentController.attachScanDocument
);
router.delete('/scan/accepted/documents/:documentId', scanAccess, ResultDocumentController.removeScanDocument);

export default router;

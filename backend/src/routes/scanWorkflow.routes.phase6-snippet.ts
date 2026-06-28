// Add these imports to backend/src/routes/scanWorkflow.routes.ts
import { ResultDocumentController } from '../controllers/resultDocument.controller';
import { singleResultDocument } from '../middleware/resultDocumentUpload.middleware';
import { validateResultDocumentUpload } from '../validators/resultDocument.validators';

// Add these routes after POST /accepted/:scanId/result and before push-to-clinician.
router.get('/accepted/:scanId/documents', scanAccess, ResultDocumentController.listScanDocuments);
router.post(
  '/accepted/:scanId/documents',
  scanAccess,
  singleResultDocument('document'),
  validateResultDocumentUpload,
  ResultDocumentController.attachScanDocument
);
router.delete('/accepted/documents/:documentId', scanAccess, ResultDocumentController.removeScanDocument);

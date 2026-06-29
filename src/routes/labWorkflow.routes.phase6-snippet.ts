// Add these imports to backend/src/routes/labWorkflow.routes.ts
import { singleResultDocument } from '../middleware/resultDocumentUpload.middleware';

// Replace the existing document upload route with this version so multipart file uploads work.
router.post(
  '/accepted-samples/:sampleId/tests/:testId/documents',
  labAccess,
  singleResultDocument('document'),
  validateLabResultDocument,
  LabWorkflowController.attachTestDocument
);

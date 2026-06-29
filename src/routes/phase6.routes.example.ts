import { Router } from 'express';
import resultDocumentRoutes from './resultDocument.routes';

const router = Router();

// Register this under your existing API router.
// Recommended path: app.use('/api', router) or apiRouter.use('/', router)
// This creates:
// POST /api/lab/accepted-samples/:sampleId/tests/:testId/documents
// POST /api/scan/accepted/:scanId/documents
router.use('/', resultDocumentRoutes);

export default router;

import express, { Router } from 'express';
import { UserRole } from '@prisma/client';
import {
  createAnalyzerDeviceController,
  deleteAnalyzerTestMapController,
  discardAnalyzerMessageController,
  getAnalyzerDeviceController,
  getAnalyzerMessageController,
  ingestAnalyzerResultsController,
  listAnalyzerDevicesController,
  listAnalyzerMessagesController,
  listAnalyzerTestMapsController,
  listUnmappedAnalyzerCodesController,
  replayAnalyzerMessageController,
  rotateAnalyzerDeviceKeyController,
  updateAnalyzerDeviceController,
  uploadAnalyzerFileController,
  upsertAnalyzerTestMapController
} from '../controllers/analyzer.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { env } from '../config/env.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireAnalyzerDevice } from '../middleware/analyzerAuth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  analyzerDeviceQuerySchema,
  analyzerMessageQuerySchema,
  analyzerTestMapQuerySchema,
  analyzerTestMapSchema,
  analyzerUploadSchema,
  createAnalyzerDeviceSchema,
  discardAnalyzerMessageSchema,
  unmappedCodesQuerySchema,
  updateAnalyzerDeviceSchema
} from '../validators/analyzer.validators.js';

/*
  Two doors into the same pipeline.

  analyzerIngestRoutes is the one an instrument posts to. It carries no session
  and must be mounted before the department routers, which apply requireAuth to
  everything beneath them.

  analyzerRoutes is the staff side: registering instruments, mapping their codes
  and reading the log of what arrived.
*/

export const analyzerIngestRoutes = Router();

/*
  An analyzer sends its own dialect, not JSON: HL7 as text/plain, ASTM as
  octet-stream, a CSV export as text/csv. Taking the body as raw text for any
  content type is what lets a bridge forward the instrument's bytes untouched.
  A JSON payload has already been parsed globally, which the controller handles.
*/
analyzerIngestRoutes.post(
  '/integrations/analyzers/results',
  requireAnalyzerDevice,
  express.text({ type: '*/*', limit: env.BODY_LIMIT }),
  ingestAnalyzerResultsController
);

export const analyzerRoutes = Router();
analyzerRoutes.use('/lab/analyzers', requireAuth, requireModule('laboratory'), requireRole(UserRole.ADMIN, UserRole.LAB_STAFF));

analyzerRoutes.get('/lab/analyzers', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ query: analyzerDeviceQuerySchema }), listAnalyzerDevicesController);
analyzerRoutes.post('/lab/analyzers', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ body: createAnalyzerDeviceSchema }), createAnalyzerDeviceController);

// Mapping and message routes come before /:id so a literal segment is never read
// as a device id.
analyzerRoutes.get('/lab/analyzers/test-maps', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ query: analyzerTestMapQuerySchema }), listAnalyzerTestMapsController);
analyzerRoutes.post('/lab/analyzers/test-maps', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ body: analyzerTestMapSchema }), upsertAnalyzerTestMapController);
analyzerRoutes.delete('/lab/analyzers/test-maps/:id', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ params: idParamSchema }), deleteAnalyzerTestMapController);
analyzerRoutes.get('/lab/analyzers/unmapped-codes', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ query: unmappedCodesQuerySchema }), listUnmappedAnalyzerCodesController);

analyzerRoutes.get('/lab/analyzers/messages', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ query: analyzerMessageQuerySchema }), listAnalyzerMessagesController);
analyzerRoutes.get('/lab/analyzers/messages/:id', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ params: idParamSchema }), getAnalyzerMessageController);
// Run a stored message again, once a mapping is fixed or the sample is accepted.
analyzerRoutes.post('/lab/analyzers/messages/:id/replay', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ params: idParamSchema }), replayAnalyzerMessageController);
analyzerRoutes.post('/lab/analyzers/messages/:id/discard', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ params: idParamSchema, body: discardAnalyzerMessageSchema }), discardAnalyzerMessageController);

// The no-bridge path: somebody exports the run and uploads the file.
analyzerRoutes.post('/lab/analyzers/upload', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ body: analyzerUploadSchema }), uploadAnalyzerFileController);

analyzerRoutes.get('/lab/analyzers/:id', requirePermission(PERMISSIONS.LAB_ANALYZERS_READ), validateRequest({ params: idParamSchema }), getAnalyzerDeviceController);
analyzerRoutes.patch('/lab/analyzers/:id', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ params: idParamSchema, body: updateAnalyzerDeviceSchema }), updateAnalyzerDeviceController);
analyzerRoutes.post('/lab/analyzers/:id/rotate-key', requirePermission(PERMISSIONS.LAB_ANALYZERS_MANAGE), validateRequest({ params: idParamSchema }), rotateAnalyzerDeviceKeyController);

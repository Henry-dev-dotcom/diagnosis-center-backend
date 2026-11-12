import { Router } from 'express';
import { CatalogItemType, UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import { labOrderQueueController } from '../controllers/order.controller.js';
import {
  acceptLabOrderSamplesController,
  acceptLabSamplesController,
  attachLabResultFilesController,
  createInventoryItemController,
  createQualityControlRunController,
  getLabPatientTrendsController,
  getReferenceRangesController,
  listAcceptedSamplesController,
  listInventoryController,
  listLabReviewQueueController,
  listQualityControlRunsController,
  listRejectedRetestSamplesController,
  recordInventoryTransactionController,
  rejectLabSampleController,
  reverseLabResultController,
  saveLabResultDraftController,
  signOffLabResultController,
  submitLabResultReviewController
} from '../controllers/lab.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { requireOrderItemTypeAccess } from '../middleware/resourceScope.js';
import { validateRequest } from '../middleware/validate.js';
import { catalogItemIdParamSchema, dateRangeQuerySchema, idParamSchema, orderIdParamSchema, patientIdParamSchema } from '../validators/common.validators.js';
import {
  acceptSampleFromOrderSchema,
  acceptSampleSchema,
  inventoryItemSchema,
  inventoryTransactionSchema,
  labResultSchema,
  labWorkflowQuerySchema,
  qualityControlSchema,
  rejectSampleSchema,
  reverseLabResultSchema,
  signOffLabResultSchema,
  submitLabResultReviewSchema
} from '../validators/lab.validators.js';

import { createLabTestController, listLabTestsController, removeLabTestController, saveTestParametersController, updateLabTestController } from '../controllers/labTests.controller.js';
import { createLabTestSchema, labTestQuerySchema, saveTestParametersSchema, updateLabTestSchema } from '../validators/labTests.validators.js';

import { cancelDeltaRequestController, createDeltaRequestController, deltaComparisonController, listDeltaIncomingController, listDeltaOutgoingController, listDeltaPartnersController, respondDeltaRequestController } from '../controllers/deltaCheck.controller.js';
import { createDeltaRequestSchema, respondDeltaRequestSchema } from '../validators/deltaCheck.validators.js';

export const labRoutes = Router();
labRoutes.use('/lab', requireAuth, requireModule('laboratory'), requireRole(UserRole.ADMIN, UserRole.LAB_STAFF));
labRoutes.get('/lab', requirePermission(PERMISSIONS.LAB_QUEUE_READ), moduleLanding('lab'));
labRoutes.get('/lab/queue', requirePermission(PERMISSIONS.LAB_QUEUE_READ), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ query: dateRangeQuerySchema }), labOrderQueueController);
labRoutes.post('/lab/samples/accept', requirePermission(PERMISSIONS.LAB_SAMPLES_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ body: acceptSampleSchema }), acceptLabSamplesController);
labRoutes.post('/lab/orders/:orderId/accept', requirePermission(PERMISSIONS.LAB_SAMPLES_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ params: orderIdParamSchema, body: acceptSampleFromOrderSchema }), acceptLabOrderSamplesController);
labRoutes.get('/lab/accepted-samples', requirePermission(PERMISSIONS.LAB_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listAcceptedSamplesController);
labRoutes.post('/lab/results/draft', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ body: labResultSchema }), saveLabResultDraftController);
labRoutes.post('/lab/results', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ body: labResultSchema }), saveLabResultDraftController);
labRoutes.post('/lab/results/submit-review', requirePermission(PERMISSIONS.LAB_RESULTS_SUBMIT_REVIEW), validateRequest({ body: submitLabResultReviewSchema }), submitLabResultReviewController);
labRoutes.post('/lab/results/:id/sign-off', requirePermission(PERMISSIONS.LAB_RESULTS_SIGN_OFF), validateRequest({ params: idParamSchema, body: signOffLabResultSchema }), signOffLabResultController);
// A signed-off (sent) result, pulled back by the lab itself to correct it — see docs/SECURITY_AND_DATA_PROTECTION.md.
labRoutes.post('/lab/results/:id/reverse', requirePermission(PERMISSIONS.LAB_RESULTS_REVERSE), validateRequest({ params: idParamSchema, body: reverseLabResultSchema }), reverseLabResultController);
labRoutes.post('/lab/results/:id/files', requirePermission(PERMISSIONS.FILES_UPLOAD), validateRequest({ params: idParamSchema }), attachLabResultFilesController);
labRoutes.post('/lab/samples/:id/reject', requirePermission(PERMISSIONS.LAB_SAMPLES_REJECT), validateRequest({ params: idParamSchema, body: rejectSampleSchema }), rejectLabSampleController);
// The test menu: procedures, parameters and reference ranges (never patients' results).
labRoutes.get('/lab/tests', requirePermission(PERMISSIONS.LAB_TESTS_MANAGE), validateRequest({ query: labTestQuerySchema }), listLabTestsController);
labRoutes.post('/lab/tests', requirePermission(PERMISSIONS.LAB_TESTS_MANAGE), validateRequest({ body: createLabTestSchema }), createLabTestController);
labRoutes.patch('/lab/tests/:id', requirePermission(PERMISSIONS.LAB_TESTS_MANAGE), validateRequest({ params: idParamSchema, body: updateLabTestSchema }), updateLabTestController);
labRoutes.delete('/lab/tests/:id', requirePermission(PERMISSIONS.LAB_TESTS_MANAGE), validateRequest({ params: idParamSchema }), removeLabTestController);
labRoutes.put('/lab/tests/:id/parameters', requirePermission(PERMISSIONS.LAB_TESTS_MANAGE), validateRequest({ params: idParamSchema, body: saveTestParametersSchema }), saveTestParametersController);
// Delta check across facilities: ask another laboratory for a patient's earlier results, answer such requests.
labRoutes.get('/lab/delta-check/partners', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), listDeltaPartnersController);
labRoutes.get('/lab/delta-check/requests', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), listDeltaOutgoingController);
labRoutes.post('/lab/delta-check/requests', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), validateRequest({ body: createDeltaRequestSchema }), createDeltaRequestController);
labRoutes.get('/lab/delta-check/requests/:id/comparison', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), validateRequest({ params: idParamSchema }), deltaComparisonController);
labRoutes.post('/lab/delta-check/requests/:id/cancel', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), validateRequest({ params: idParamSchema }), cancelDeltaRequestController);
labRoutes.get('/lab/delta-check/inbox', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), listDeltaIncomingController);
labRoutes.post('/lab/delta-check/inbox/:id/respond', requirePermission(PERMISSIONS.LAB_DELTA_CHECK), validateRequest({ params: idParamSchema, body: respondDeltaRequestSchema }), respondDeltaRequestController);
labRoutes.get('/lab/review-queue', requirePermission(PERMISSIONS.LAB_REVIEW_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listLabReviewQueueController);
labRoutes.get('/lab/rejected-retest', requirePermission(PERMISSIONS.LAB_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listRejectedRetestSamplesController);
labRoutes.get('/lab/reference-ranges/:catalogItemId', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ params: catalogItemIdParamSchema }), getReferenceRangesController);
labRoutes.get('/lab/patient-trends/:patientId', requirePermission(PERMISSIONS.LAB_TRENDS_READ), validateRequest({ params: patientIdParamSchema, query: dateRangeQuerySchema }), getLabPatientTrendsController);
labRoutes.get('/lab/qc', requirePermission(PERMISSIONS.LAB_QC_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listQualityControlRunsController);
labRoutes.post('/lab/qc', requirePermission(PERMISSIONS.LAB_QC_MANAGE), validateRequest({ body: qualityControlSchema }), createQualityControlRunController);
labRoutes.get('/lab/inventory', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listInventoryController);
labRoutes.post('/lab/inventory', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ body: inventoryItemSchema }), createInventoryItemController);
labRoutes.post('/lab/inventory/:id/transactions', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ params: idParamSchema, body: inventoryTransactionSchema }), recordInventoryTransactionController);

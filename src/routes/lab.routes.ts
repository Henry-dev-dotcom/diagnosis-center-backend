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
  saveLabResultDraftController,
  signOffLabResultController,
  submitLabResultReviewController
} from '../controllers/lab.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
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
  signOffLabResultSchema,
  submitLabResultReviewSchema
} from '../validators/lab.validators.js';

export const labRoutes = Router();
labRoutes.use('/lab', requireAuth, requireRole(UserRole.ADMIN, UserRole.LAB_STAFF));
labRoutes.get('/lab', requirePermission(PERMISSIONS.LAB_QUEUE_READ), moduleLanding('lab'));
labRoutes.get('/lab/queue', requirePermission(PERMISSIONS.LAB_QUEUE_READ), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ query: dateRangeQuerySchema }), labOrderQueueController);
labRoutes.post('/lab/samples/accept', requirePermission(PERMISSIONS.LAB_SAMPLES_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ body: acceptSampleSchema }), acceptLabSamplesController);
labRoutes.post('/lab/orders/:orderId/accept', requirePermission(PERMISSIONS.LAB_SAMPLES_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.LAB), validateRequest({ params: orderIdParamSchema, body: acceptSampleFromOrderSchema }), acceptLabOrderSamplesController);
labRoutes.get('/lab/accepted-samples', requirePermission(PERMISSIONS.LAB_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listAcceptedSamplesController);
labRoutes.post('/lab/results/draft', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ body: labResultSchema }), saveLabResultDraftController);
labRoutes.post('/lab/results', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ body: labResultSchema }), saveLabResultDraftController);
labRoutes.post('/lab/results/submit-review', requirePermission(PERMISSIONS.LAB_RESULTS_SUBMIT_REVIEW), validateRequest({ body: submitLabResultReviewSchema }), submitLabResultReviewController);
labRoutes.post('/lab/results/:id/sign-off', requirePermission(PERMISSIONS.LAB_RESULTS_SIGN_OFF), validateRequest({ params: idParamSchema, body: signOffLabResultSchema }), signOffLabResultController);
labRoutes.post('/lab/results/:id/files', requirePermission(PERMISSIONS.FILES_UPLOAD), validateRequest({ params: idParamSchema }), attachLabResultFilesController);
labRoutes.post('/lab/samples/:id/reject', requirePermission(PERMISSIONS.LAB_SAMPLES_REJECT), validateRequest({ params: idParamSchema, body: rejectSampleSchema }), rejectLabSampleController);
labRoutes.get('/lab/review-queue', requirePermission(PERMISSIONS.LAB_REVIEW_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listLabReviewQueueController);
labRoutes.get('/lab/rejected-retest', requirePermission(PERMISSIONS.LAB_QUEUE_READ), validateRequest({ query: labWorkflowQuerySchema }), listRejectedRetestSamplesController);
labRoutes.get('/lab/reference-ranges/:catalogItemId', requirePermission(PERMISSIONS.LAB_RESULTS_CREATE), validateRequest({ params: catalogItemIdParamSchema }), getReferenceRangesController);
labRoutes.get('/lab/patient-trends/:patientId', requirePermission(PERMISSIONS.LAB_TRENDS_READ), validateRequest({ params: patientIdParamSchema, query: dateRangeQuerySchema }), getLabPatientTrendsController);
labRoutes.get('/lab/qc', requirePermission(PERMISSIONS.LAB_QC_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listQualityControlRunsController);
labRoutes.post('/lab/qc', requirePermission(PERMISSIONS.LAB_QC_MANAGE), validateRequest({ body: qualityControlSchema }), createQualityControlRunController);
labRoutes.get('/lab/inventory', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listInventoryController);
labRoutes.post('/lab/inventory', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ body: inventoryItemSchema }), createInventoryItemController);
labRoutes.post('/lab/inventory/:id/transactions', requirePermission(PERMISSIONS.LAB_INVENTORY_MANAGE), validateRequest({ params: idParamSchema, body: inventoryTransactionSchema }), recordInventoryTransactionController);

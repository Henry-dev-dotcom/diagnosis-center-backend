import { Router } from 'express';
import { CatalogItemType, UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import { scanOrderQueueController } from '../controllers/order.controller.js';
import {
  acceptScanOrderController,
  acceptScansController,
  attachScanResultFilesController,
  createScanBookingController,
  listAcceptedScansController,
  listPriorScansController,
  listRejectedRetakeScansController,
  listScanBookingsController,
  listScanReviewQueueController,
  requestScanRetakeController,
  saveScanResultDraftController,
  signOffScanResultController,
  submitScanResultReviewController
} from '../controllers/scan.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireOrderItemTypeAccess } from '../middleware/resourceScope.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema, orderIdParamSchema, patientIdParamSchema } from '../validators/common.validators.js';
import {
  acceptScanFromOrderSchema,
  acceptScanSchema,
  scanBookingSchema,
  scanResultFilesSchema,
  scanResultSchema,
  scanRetakeSchema,
  scanWorkflowQuerySchema,
  signOffScanResultSchema,
  submitScanResultReviewSchema
} from '../validators/scan.validators.js';

export const scanRoutes = Router();
scanRoutes.use('/scan', requireAuth, requireRole(UserRole.ADMIN, UserRole.SCAN_STAFF));
scanRoutes.get('/scan', requirePermission(PERMISSIONS.SCAN_QUEUE_READ), moduleLanding('scan'));
scanRoutes.get('/scan/queue', requirePermission(PERMISSIONS.SCAN_QUEUE_READ), requireOrderItemTypeAccess(CatalogItemType.SCAN), validateRequest({ query: scanWorkflowQuerySchema }), scanOrderQueueController);
scanRoutes.post('/scan/accept', requirePermission(PERMISSIONS.SCAN_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.SCAN), validateRequest({ body: acceptScanSchema }), acceptScansController);
scanRoutes.post('/scan/orders/:orderId/accept', requirePermission(PERMISSIONS.SCAN_ACCEPT), requireOrderItemTypeAccess(CatalogItemType.SCAN), validateRequest({ params: orderIdParamSchema, body: acceptScanFromOrderSchema }), acceptScanOrderController);
scanRoutes.get('/scan/accepted-scans', requirePermission(PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ query: scanWorkflowQuerySchema }), listAcceptedScansController);
scanRoutes.post('/scan/bookings', requirePermission(PERMISSIONS.SCAN_BOOKINGS_MANAGE), validateRequest({ body: scanBookingSchema }), createScanBookingController);
scanRoutes.get('/scan/bookings', requirePermission(PERMISSIONS.SCAN_BOOKINGS_MANAGE), validateRequest({ query: scanWorkflowQuerySchema }), listScanBookingsController);
scanRoutes.post('/scan/results/draft', requirePermission(PERMISSIONS.SCAN_RESULTS_CREATE), validateRequest({ body: scanResultSchema }), saveScanResultDraftController);
scanRoutes.post('/scan/results', requirePermission(PERMISSIONS.SCAN_RESULTS_CREATE), validateRequest({ body: scanResultSchema }), saveScanResultDraftController);
scanRoutes.post('/scan/results/submit-review', requirePermission(PERMISSIONS.SCAN_RESULTS_SUBMIT_REVIEW), validateRequest({ body: submitScanResultReviewSchema }), submitScanResultReviewController);
scanRoutes.post('/scan/results/:id/sign-off', requirePermission(PERMISSIONS.SCAN_RESULTS_SIGN_OFF), validateRequest({ params: idParamSchema, body: signOffScanResultSchema }), signOffScanResultController);
scanRoutes.post('/scan/retake', requirePermission(PERMISSIONS.SCAN_RETAKE_MANAGE), validateRequest({ body: scanRetakeSchema }), requestScanRetakeController);
scanRoutes.get('/scan/review-queue', requirePermission(PERMISSIONS.SCAN_REVIEW_QUEUE_READ), validateRequest({ query: scanWorkflowQuerySchema }), listScanReviewQueueController);
scanRoutes.get('/scan/rejected-retake', requirePermission(PERMISSIONS.SCAN_RETAKE_MANAGE), validateRequest({ query: scanWorkflowQuerySchema }), listRejectedRetakeScansController);
scanRoutes.post('/scan/results/:id/files', requirePermission(PERMISSIONS.SCAN_FILES_UPLOAD), validateRequest({ params: idParamSchema, body: scanResultFilesSchema }), attachScanResultFilesController);
scanRoutes.get('/scan/prior/:patientId', requirePermission(PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ params: patientIdParamSchema, query: scanWorkflowQuerySchema }), listPriorScansController);

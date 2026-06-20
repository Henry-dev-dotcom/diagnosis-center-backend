import { Router } from 'express';
import { UserRole } from '@prisma/client';
import {
  emailResultController,
  getResultDetailController,
  getResultReportController,
  listDeliveryLogsController,
  listResultsController,
  releaseResultController,
  retryDeliveryLogController,
  smsResultController,
  whatsappResultController
} from '../controllers/results.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { dateRangeQuerySchema, idParamSchema } from '../validators/common.validators.js';
import { releaseResultSchema, resultDeliverySchema, retryDeliverySchema } from '../validators/result.validators.js';

export const resultsRoutes = Router();
resultsRoutes.use('/results', requireAuth, requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF));
resultsRoutes.get('/results', requireAnyPermission(PERMISSIONS.RESULTS_READ, PERMISSIONS.RESULTS_READ_OWN, PERMISSIONS.DOCTOR_RESULTS_READ_OWN, PERMISSIONS.RECEPTION_RESULTS_READ), validateRequest({ query: dateRangeQuerySchema }), listResultsController);
resultsRoutes.get('/results/delivery-logs', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listDeliveryLogsController);
resultsRoutes.get('/results/:id', requireAnyPermission(PERMISSIONS.RESULTS_READ, PERMISSIONS.RESULTS_READ_OWN, PERMISSIONS.DOCTOR_RESULTS_READ_OWN, PERMISSIONS.RECEPTION_RESULTS_READ), validateRequest({ params: idParamSchema }), getResultDetailController);
resultsRoutes.post('/results/:id/release', requirePermission(PERMISSIONS.RESULTS_RELEASE), validateRequest({ params: idParamSchema, body: releaseResultSchema }), releaseResultController);
resultsRoutes.get('/results/:id/report', requirePermission(PERMISSIONS.RESULTS_REPORT_DOWNLOAD), validateRequest({ params: idParamSchema }), getResultReportController);
resultsRoutes.post('/results/:id/email', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_MANAGE, PERMISSIONS.RECEPTION_NOTICES_SEND), validateRequest({ params: idParamSchema, body: resultDeliverySchema }), emailResultController);
resultsRoutes.post('/results/:id/sms', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_MANAGE, PERMISSIONS.RECEPTION_NOTICES_SEND), validateRequest({ params: idParamSchema, body: resultDeliverySchema }), smsResultController);
resultsRoutes.post('/results/:id/whatsapp', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_MANAGE, PERMISSIONS.RECEPTION_NOTICES_SEND), validateRequest({ params: idParamSchema, body: resultDeliverySchema }), whatsappResultController);
resultsRoutes.get('/results/delivery/logs', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ query: dateRangeQuerySchema }), listDeliveryLogsController);
resultsRoutes.post('/results/delivery/logs/:id/retry', requirePermission(PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ params: idParamSchema, body: retryDeliverySchema }), retryDeliveryLogController);

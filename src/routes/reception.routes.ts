import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import { confirmReceptionOrderController, listReceptionIncomingOrdersController } from '../controllers/order.controller.js';
import {
  checkInPatientController,
  createAppointmentController,
  createWalkInController,
  listAppointmentsController,
  listDailyVisitsController,
  listReceptionResultsInboxController,
  sendReceptionResultNoticeController,
  updateAppointmentController
} from '../controllers/reception.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  appointmentQuerySchema,
  appointmentSchema,
  checkInSchema,
  confirmOrderSchema,
  createWalkInSchema,
  dailyVisitsQuerySchema,
  resultsInboxQuerySchema,
  sendResultNoticeSchema,
  updateAppointmentSchema
} from '../validators/reception.validators.js';
import { orderListQuerySchema } from '../validators/order.validators.js';

export const receptionRoutes = Router();
receptionRoutes.use('/reception', requireAuth, requireRole(UserRole.ADMIN, UserRole.RECEPTIONIST));
receptionRoutes.get('/reception', requirePermission(PERMISSIONS.RECEPTION_ORDERS_READ), moduleLanding('reception'));
receptionRoutes.get('/reception/incoming-orders', requirePermission(PERMISSIONS.RECEPTION_ORDERS_READ), validateRequest({ query: orderListQuerySchema }), listReceptionIncomingOrdersController);
receptionRoutes.post('/reception/orders/:id/confirm', requirePermission(PERMISSIONS.RECEPTION_ORDERS_CONFIRM), validateRequest({ params: idParamSchema, body: confirmOrderSchema }), confirmReceptionOrderController);
receptionRoutes.post('/reception/check-in', requirePermission(PERMISSIONS.RECEPTION_CHECK_IN), validateRequest({ body: checkInSchema }), checkInPatientController);
receptionRoutes.post('/reception/walk-ins', requirePermission(PERMISSIONS.RECEPTION_WALK_INS_CREATE), validateRequest({ body: createWalkInSchema }), createWalkInController);
receptionRoutes.get('/reception/appointments', requirePermission(PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE), validateRequest({ query: appointmentQuerySchema }), listAppointmentsController);
receptionRoutes.post('/reception/appointments', requirePermission(PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE), validateRequest({ body: appointmentSchema }), createAppointmentController);
receptionRoutes.patch('/reception/appointments/:id', requirePermission(PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE), validateRequest({ params: idParamSchema, body: updateAppointmentSchema }), updateAppointmentController);
receptionRoutes.get('/reception/daily-visits', requirePermission(PERMISSIONS.RECEPTION_CHECK_IN), validateRequest({ query: dailyVisitsQuerySchema }), listDailyVisitsController);
receptionRoutes.get('/reception/results-inbox', requirePermission(PERMISSIONS.RECEPTION_RESULTS_READ), validateRequest({ query: resultsInboxQuerySchema }), listReceptionResultsInboxController);
receptionRoutes.post('/reception/results/:id/send-notice', requirePermission(PERMISSIONS.RECEPTION_NOTICES_SEND), validateRequest({ params: idParamSchema, body: sendResultNoticeSchema }), sendReceptionResultNoticeController);

import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { cancelOrderSchema, orderListQuerySchema, orderTransitionSchema, updateOrderStatusSchema } from '../validators/order.validators.js';
import {
  cancelOrderController,
  getOrderController,
  getOrderTimelineController,
  listOrdersController,
  transitionOrderController,
  updateOrderStatusController
} from '../controllers/order.controller.js';

export const ordersRoutes = Router();
ordersRoutes.use('/orders', requireAuth);
ordersRoutes.get('/orders', requireAnyPermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN), validateRequest({ query: orderListQuerySchema }), listOrdersController);
ordersRoutes.get('/orders/:id', requireAnyPermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN), validateRequest({ params: idParamSchema }), getOrderController);
ordersRoutes.patch('/orders/:id/status', requireAnyPermission(PERMISSIONS.ORDERS_STATUS_UPDATE, PERMISSIONS.RECEPTION_ORDERS_CONFIRM), validateRequest({ params: idParamSchema, body: updateOrderStatusSchema }), updateOrderStatusController);
ordersRoutes.post('/orders/:id/transition', requireAnyPermission(PERMISSIONS.ORDERS_STATUS_UPDATE, PERMISSIONS.RECEPTION_ORDERS_CONFIRM), validateRequest({ params: idParamSchema, body: orderTransitionSchema }), transitionOrderController);
ordersRoutes.post('/orders/:id/cancel', requireAnyPermission(PERMISSIONS.ORDERS_CANCEL, PERMISSIONS.RECEPTION_ORDERS_CONFIRM), validateRequest({ params: idParamSchema, body: cancelOrderSchema }), cancelOrderController);
ordersRoutes.get('/orders/:id/timeline', requireAnyPermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN), validateRequest({ params: idParamSchema }), getOrderTimelineController);

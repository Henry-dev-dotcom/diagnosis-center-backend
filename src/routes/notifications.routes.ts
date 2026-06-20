import { Router } from 'express';
import {
  createNotificationController,
  deliverNotificationController,
  getNotificationPreferencesController,
  listNotificationLogsController,
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
  markNotificationUnreadController,
  retryNotificationLogController,
  updateNotificationSettingsController
} from '../controllers/notification.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { dateRangeQuerySchema, idParamSchema } from '../validators/common.validators.js';
import { retryDeliverySchema } from '../validators/result.validators.js';
import { createNotificationSchema, deliverNotificationSchema, notificationSettingsSchema } from '../validators/notification.validators.js';

export const notificationsRoutes = Router();
notificationsRoutes.use('/notifications', requireAuth);
notificationsRoutes.get('/notifications', requirePermission(PERMISSIONS.NOTIFICATIONS_READ), validateRequest({ query: dateRangeQuerySchema }), listNotificationsController);
notificationsRoutes.post('/notifications', requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE), validateRequest({ body: createNotificationSchema }), createNotificationController);
notificationsRoutes.patch('/notifications/read-all', requirePermission(PERMISSIONS.NOTIFICATIONS_READ), markAllNotificationsReadController);
notificationsRoutes.patch('/notifications/:id/read', requirePermission(PERMISSIONS.NOTIFICATIONS_READ), validateRequest({ params: idParamSchema }), markNotificationReadController);
notificationsRoutes.patch('/notifications/:id/unread', requirePermission(PERMISSIONS.NOTIFICATIONS_READ), validateRequest({ params: idParamSchema }), markNotificationUnreadController);
notificationsRoutes.post('/notifications/:id/deliver', requireAnyPermission(PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ params: idParamSchema, body: deliverNotificationSchema }), deliverNotificationController);
notificationsRoutes.get('/notifications/logs', requireAnyPermission(PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_READ), validateRequest({ query: dateRangeQuerySchema }), listNotificationLogsController);
notificationsRoutes.post('/notifications/logs/:id/retry', requireAnyPermission(PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ params: idParamSchema, body: retryDeliverySchema }), retryNotificationLogController);
notificationsRoutes.get('/notifications/preferences', requirePermission(PERMISSIONS.NOTIFICATIONS_READ), getNotificationPreferencesController);
notificationsRoutes.patch('/notifications/preferences', requirePermission(PERMISSIONS.NOTIFICATIONS_SETTINGS_MANAGE), validateRequest({ body: notificationSettingsSchema }), updateNotificationSettingsController);
notificationsRoutes.patch('/notifications/settings', requirePermission(PERMISSIONS.NOTIFICATIONS_SETTINGS_MANAGE), validateRequest({ body: notificationSettingsSchema }), updateNotificationSettingsController);

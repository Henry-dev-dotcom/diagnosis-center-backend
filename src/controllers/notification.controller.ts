import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  createNotification,
  deliverNotification,
  getNotificationPreferences,
  listNotificationLogs,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  retryNotificationLog,
  updateNotificationSettings
} from '../services/notification.service.js';

export const listNotificationsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listNotifications(req.query, req);
  return sendSuccess(res, 'Notifications loaded successfully', result);
});

export const createNotificationController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createNotification(req.body, req);
  return sendSuccess(res, 'Notification created successfully', result, 201);
});

export const markNotificationReadController = asyncHandler(async (req: Request, res: Response) => {
  const result = await markNotificationRead(req.params.id, req);
  return sendSuccess(res, 'Notification marked as read successfully', result);
});

export const markNotificationUnreadController = asyncHandler(async (req: Request, res: Response) => {
  const result = await markNotificationUnread(req.params.id, req);
  return sendSuccess(res, 'Notification marked as unread successfully', result);
});

export const markAllNotificationsReadController = asyncHandler(async (req: Request, res: Response) => {
  const result = await markAllNotificationsRead(req);
  return sendSuccess(res, 'Notifications marked as read successfully', result);
});

export const deliverNotificationController = asyncHandler(async (req: Request, res: Response) => {
  const result = await deliverNotification(req.params.id, req.body, req);
  return sendSuccess(res, 'Notification delivery recorded successfully', result);
});

export const listNotificationLogsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listNotificationLogs(req.query);
  return sendSuccess(res, 'Notification delivery logs loaded successfully', result);
});

export const retryNotificationLogController = asyncHandler(async (req: Request, res: Response) => {
  const result = await retryNotificationLog(req.params.id, req);
  return sendSuccess(res, 'Notification delivery retry recorded successfully', result);
});

export const getNotificationPreferencesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getNotificationPreferences(req);
  return sendSuccess(res, 'Notification preferences loaded successfully', result);
});

export const updateNotificationSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateNotificationSettings(req.body, req);
  return sendSuccess(res, 'Notification settings validated successfully', result);
});

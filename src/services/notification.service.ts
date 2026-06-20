import { DeliveryStatus, NotificationType, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';

function toDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function notificationWhere(query: Request['query'], req: Request): Prisma.NotificationWhereInput {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const from = toDate(query.from);
  const to = toDate(query.to);
  const status = typeof query.status === 'string' ? query.status : undefined;
  const type = typeof query.type === 'string' && query.type in NotificationType ? (query.type as NotificationType) : undefined;
  return {
    ...(req.user?.role === 'ADMIN' ? {} : { OR: [{ recipientUserId: req.user?.id }, { createdById: req.user?.id }, { recipientUserId: null }] }),
    ...(type ? { type } : {}),
    ...(status === 'read' ? { isRead: true } : {}),
    ...(status === 'unread' ? { isRead: false } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { body: { contains: search, mode: 'insensitive' } },
                { recipientEmail: { contains: search, mode: 'insensitive' } },
                { recipientPhone: { contains: search, mode: 'insensitive' } },
                { order: { orderCode: { contains: search, mode: 'insensitive' } } }
              ]
            }
          ]
        }
      : {})
  };
}

export async function listNotifications(query: Request['query'], req: Request) {
  const { page, limit, skip, take, sortBy, sortOrder } = getPagination(query);
  const where = notificationWhere(query, req);
  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      include: {
        order: { select: { id: true, orderCode: true, status: true, patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } } } },
        createdBy: { select: { id: true, name: true, role: true } },
        deliveryLogs: { orderBy: { createdAt: 'desc' }, take: 3 }
      },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'readAt', 'title'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, isRead: false } })
  ]);
  return { items, unreadCount, meta: paginationMeta(total, page, limit) };
}

export async function markNotificationRead(id: string, req: Request) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new AppError('Notification was not found', 404, 'NOTIFICATION_NOT_FOUND');
  if (req.user?.role !== 'ADMIN' && notification.recipientUserId && notification.recipientUserId !== req.user?.id) {
    throw new AppError('You cannot update another user notification', 403, 'NOTIFICATION_FORBIDDEN');
  }

  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_MARKED_READ',
    module: 'Notifications',
    entityType: 'Notification',
    entityId: id,
    beforeData: { isRead: notification.isRead, readAt: notification.readAt },
    afterData: { isRead: updated.isRead, readAt: updated.readAt }
  });
  return updated;
}

export async function listNotificationLogs(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const from = toDate(query.from);
  const to = toDate(query.to);
  const where: Prisma.DeliveryLogWhereInput = {
    notificationId: { not: null },
    ...(query.status && String(query.status) in DeliveryStatus ? { status: String(query.status) as DeliveryStatus } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { target: { contains: search, mode: 'insensitive' } },
            { notification: { title: { contains: search, mode: 'insensitive' } } },
            { notification: { body: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.deliveryLog.findMany({
      where,
      include: { notification: true, report: { select: { id: true, reportCode: true } }, performedBy: { select: { id: true, name: true, role: true } } },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'deliveredAt', 'status', 'channel'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.deliveryLog.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function retryNotificationLog(id: string, req: Request) {
  const log = await prisma.deliveryLog.findUnique({ where: { id }, include: { notification: true } });
  if (!log || !log.notificationId) throw new AppError('Notification delivery log was not found', 404, 'NOTIFICATION_LOG_NOT_FOUND');

  const updated = await prisma.deliveryLog.update({
    where: { id },
    data: { status: DeliveryStatus.RETRIED, retryCount: { increment: 1 }, performedById: req.user?.id ?? null, error: null, deliveredAt: new Date() },
    include: { notification: true, performedBy: { select: { id: true, name: true, role: true } } }
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_DELIVERY_RETRIED',
    module: 'Notifications',
    entityType: 'DeliveryLog',
    entityId: id,
    beforeData: log,
    afterData: updated
  });

  return updated;
}

export async function updateNotificationSettings(body: Record<string, unknown>, req: Request) {
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_SETTINGS_UPDATED',
    module: 'Notifications',
    entityType: 'NotificationSettings',
    afterData: body
  });

  return {
    settings: body,
    persisted: false,
    note: 'Settings are validated and audit-logged. A dedicated notification settings table can be added during deployment customization.'
  };
}

type CreateNotificationPayload = {
  type: NotificationType;
  title: string;
  body: string;
  orderId?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  channels?: Array<'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP'>;
};

type DeliverNotificationPayload = {
  channels?: Array<'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP'>;
  target?: string;
  safeMessage?: boolean;
};

const PRIVACY_SAFE_NOTICE = 'Your result/notification is ready. Please contact the diagnosis center or use the secure link provided by the facility.';

function safeDeliveryBody(channel: string, body: string) {
  if (channel === 'SMS' || channel === 'WHATSAPP') return PRIVACY_SAFE_NOTICE;
  return body;
}

function targetForChannel(notification: { recipientEmail: string | null; recipientPhone: string | null }, channel: string, fallback?: string) {
  if (fallback) return fallback;
  if (channel === 'EMAIL') return notification.recipientEmail ?? null;
  if (channel === 'SMS' || channel === 'WHATSAPP') return notification.recipientPhone ?? null;
  return null;
}

export async function createNotification(body: CreateNotificationPayload, req: Request) {
  const notification = await prisma.notification.create({
    data: {
      type: body.type,
      title: body.title,
      body: body.body,
      orderId: body.orderId ?? null,
      recipientUserId: body.recipientUserId ?? null,
      recipientEmail: body.recipientEmail ?? null,
      recipientPhone: body.recipientPhone ?? null,
      createdById: req.user?.id ?? null
    }
  });

  const channels = body.channels?.length ? body.channels : ['IN_APP'];
  const logs = await prisma.deliveryLog.createMany({
    data: channels.map((channel) => ({
      notificationId: notification.id,
      performedById: req.user?.id ?? null,
      channel,
      status: channel === 'IN_APP' ? DeliveryStatus.DELIVERED : DeliveryStatus.QUEUED,
      target: targetForChannel(notification, channel),
      safeMessage: channel === 'SMS' || channel === 'WHATSAPP',
      deliveredAt: channel === 'IN_APP' ? new Date() : null
    }))
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_CREATED',
    module: 'Notifications',
    entityType: 'Notification',
    entityId: notification.id,
    afterData: notification,
    details: { channels, deliveryLogCount: logs.count }
  });

  return prisma.notification.findUniqueOrThrow({ where: { id: notification.id }, include: { deliveryLogs: true, createdBy: { select: { id: true, name: true, role: true } } } });
}

export async function markNotificationUnread(id: string, req: Request) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new AppError('Notification was not found', 404, 'NOTIFICATION_NOT_FOUND');
  if (req.user?.role !== 'ADMIN' && notification.recipientUserId && notification.recipientUserId !== req.user?.id) {
    throw new AppError('You cannot update another user notification', 403, 'NOTIFICATION_FORBIDDEN');
  }
  const updated = await prisma.notification.update({ where: { id }, data: { isRead: false, readAt: null } });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_MARKED_UNREAD',
    module: 'Notifications',
    entityType: 'Notification',
    entityId: id,
    beforeData: { isRead: notification.isRead, readAt: notification.readAt },
    afterData: { isRead: updated.isRead, readAt: updated.readAt }
  });
  return updated;
}

export async function markAllNotificationsRead(req: Request) {
  const where: Prisma.NotificationWhereInput = req.user?.role === 'ADMIN' ? {} : { OR: [{ recipientUserId: req.user?.id }, { createdById: req.user?.id }, { recipientUserId: null }] };
  const result = await prisma.notification.updateMany({ where: { ...where, isRead: false }, data: { isRead: true, readAt: new Date() } });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATIONS_MARKED_ALL_READ',
    module: 'Notifications',
    entityType: 'Notification',
    details: { count: result.count }
  });
  return { updatedCount: result.count };
}

export async function deliverNotification(id: string, body: DeliverNotificationPayload, req: Request) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new AppError('Notification was not found', 404, 'NOTIFICATION_NOT_FOUND');
  const channels = body.channels?.length ? body.channels : ['IN_APP'];
  const logs = await prisma.deliveryLog.createMany({
    data: channels.map((channel) => ({
      notificationId: notification.id,
      performedById: req.user?.id ?? null,
      channel,
      status: channel === 'IN_APP' ? DeliveryStatus.DELIVERED : DeliveryStatus.SENT,
      target: targetForChannel(notification, channel, body.target),
      safeMessage: body.safeMessage ?? (channel === 'SMS' || channel === 'WHATSAPP'),
      deliveredAt: new Date(),
      error: null
    }))
  });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'NOTIFICATION_DELIVERED',
    module: 'Notifications',
    entityType: 'Notification',
    entityId: id,
    details: { channels, safeBodies: channels.map((channel) => ({ channel, body: safeDeliveryBody(channel, notification.body) })), deliveryLogCount: logs.count }
  });
  return prisma.notification.findUniqueOrThrow({ where: { id }, include: { deliveryLogs: { orderBy: { createdAt: 'desc' } } } });
}

export async function getNotificationPreferences(req: Request) {
  return {
    userId: req.user?.id ?? null,
    persisted: false,
    preferences: {
      emailEnabled: true,
      smsEnabled: true,
      whatsappEnabled: true,
      inAppEnabled: true,
      resultReleased: true,
      paymentUpdate: true,
      orderUpdate: true,
      systemAlert: true
    },
    note: 'Notification preferences are currently returned from defaults and can be persisted with a future NotificationPreference table.'
  };
}

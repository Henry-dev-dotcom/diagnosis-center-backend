import { CatalogItemType, DeliveryChannel, DeliveryStatus, EncounterStatus, NotificationType, OrderItemStatus, OrderStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { getRequestAuditContext } from './audit.service.js';
import { prisma } from './prisma.service.js';
import { AppError } from '../utils/appError.js';

const PING_TITLE = 'Diagnostic status requested';
const PING_BODY = 'A clinician requests a status update on this pending laboratory or imaging order. Please review it in the appropriate diagnostic queue.';
const COOLDOWN_MS = 5 * 60 * 1000;
const COMPLETED_ITEM_STATUSES: OrderItemStatus[] = [OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED, OrderItemStatus.CANCELLED];

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Send a persistent, in-app-only status request to active laboratory and imaging staff. */
export async function requestDiagnosticStatusPing(encounterId: string, req: Request) {
  const actorId = req.user?.id;
  if (!actorId) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');

  const encounter = await prisma.encounter.findUnique({
    where: { id: encounterId },
    select: {
      id: true,
      status: true,
      suspendedAt: true,
      attendingId: true,
      orders: {
        select: {
          id: true,
          status: true,
          items: { select: { type: true, status: true } }
        }
      }
    }
  });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  if (encounter.status !== EncounterStatus.IN_CONSULTATION || !encounter.suspendedAt) {
    throw new AppError('Ping Diagnostics is available only while a visit is paused for results', 409, 'ENCOUNTER_NOT_SUSPENDED');
  }
  if (req.user?.role !== UserRole.ADMIN && encounter.attendingId && encounter.attendingId !== actorId) {
    throw new AppError('Another clinician is seeing this patient', 409, 'ENCOUNTER_IN_CONSULTATION');
  }

  const diagnosticOrders = encounter.orders.filter((order) =>
    order.status !== OrderStatus.CANCELLED &&
    order.items.some((item) => (item.type === CatalogItemType.LAB || item.type === CatalogItemType.SCAN) && !COMPLETED_ITEM_STATUSES.includes(item.status))
  );
  if (diagnosticOrders.length === 0) {
    throw new AppError('There are no outstanding diagnostic orders to notify', 409, 'NO_PENDING_DIAGNOSTIC_ORDERS');
  }

  const allDiagnosticOrderIds = encounter.orders.filter((order) =>
    order.items.some((item) => item.type === CatalogItemType.LAB || item.type === CatalogItemType.SCAN)
  ).map((order) => order.id);
  const recipients = await prisma.user.findMany({
    where: { role: { in: [UserRole.LAB_STAFF, UserRole.SCAN_STAFF] }, status: UserStatus.ACTIVE },
    select: { id: true, role: true }
  });
  if (recipients.length === 0) {
    throw new AppError('No active laboratory or imaging staff are available to receive the request', 409, 'DIAGNOSTIC_STAFF_UNAVAILABLE');
  }

  const now = new Date();
  const cooldownStart = new Date(now.getTime() - COOLDOWN_MS);
  const auditContext = getRequestAuditContext(req);
  const lockKey = `lab-ping:${req.user?.facilityId ?? 'facility'}:${encounterId}:${actorId}`;
  const notificationCount = diagnosticOrders.reduce((count, order) => {
    const types = new Set(order.items.map((item) => item.type));
    return count + recipients.filter((recipient) => (types.has(CatalogItemType.LAB) && recipient.role === UserRole.LAB_STAFF)
      || (types.has(CatalogItemType.SCAN) && recipient.role === UserRole.SCAN_STAFF)).length;
  }, 0);

  return prisma.$transaction(async (tx) => {
    // Serializing requests per clinician/visit makes the persisted cooldown effective across API instances.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL AS acquired`;
    const recent = await tx.notification.findFirst({
      where: {
        createdById: actorId,
        type: NotificationType.ORDER_UPDATE,
        title: PING_TITLE,
        orderId: { in: allDiagnosticOrderIds },
        createdAt: { gte: cooldownStart }
      },
      select: { createdAt: true }
    });
    if (recent) {
      const retryAfterSeconds = Math.max(1, Math.ceil((COOLDOWN_MS - (now.getTime() - recent.createdAt.getTime())) / 1000));
      throw new AppError('A diagnostic status request was sent for this visit recently. Please wait before sending another.', 429, 'DIAGNOSTIC_PING_COOLDOWN', { retryAfterSeconds });
    }

    for (const order of diagnosticOrders) {
      const types = new Set(order.items.map((item) => item.type));
      const orderRecipients = recipients.filter((recipient) => (types.has(CatalogItemType.LAB) && recipient.role === UserRole.LAB_STAFF)
        || (types.has(CatalogItemType.SCAN) && recipient.role === UserRole.SCAN_STAFF));
      for (const recipient of orderRecipients) {
        const notification = await tx.notification.create({
          data: {
            orderId: order.id,
            createdById: actorId,
            recipientUserId: recipient.id,
            type: NotificationType.ORDER_UPDATE,
            title: PING_TITLE,
            body: PING_BODY,
            createdAt: now
          }
        });
        await tx.deliveryLog.create({
          data: {
            notificationId: notification.id,
            performedById: actorId,
            channel: DeliveryChannel.IN_APP,
            status: DeliveryStatus.DELIVERED,
            safeMessage: true,
            deliveredAt: now
          }
        });
        await tx.auditLog.create({
          data: {
            ...auditContext,
            action: 'NOTIFICATION_CREATED',
            module: 'Notifications',
            entityType: 'Notification',
            entityId: notification.id,
            afterData: jsonValue(notification),
            details: { channels: ['IN_APP'], deliveryLogCount: 1 }
          }
        });
      }
    }

    await tx.auditLog.create({
      data: {
        ...auditContext,
        action: 'DIAGNOSTIC_STATUS_PINGED',
        module: 'Encounters',
        entityType: 'Encounter',
        entityId: encounterId,
        details: { orderCount: diagnosticOrders.length, recipientCount: recipients.length, notificationCount, channel: 'IN_APP', cooldownSeconds: COOLDOWN_MS / 1000 }
      }
    });

    return {
      status: 'DELIVERED' as const,
      requestedAt: now,
      orderCount: diagnosticOrders.length,
      recipientCount: recipients.length,
      notificationCount
    };
  });
}

// Backwards-compatible alias for older clients using the original endpoint name.
export const requestLabStatusPing = requestDiagnosticStatusPing;

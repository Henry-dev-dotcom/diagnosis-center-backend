import {
  DeliveryChannel,
  DeliveryStatus,
  LabResultStatus,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  ScanStatus,
  UserRole,
  UserStatus
} from '@prisma/client';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';

const patientSelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  gender: true,
  dateOfBirth: true
} satisfies Prisma.PatientSelect;

const reportInclude = {
  order: {
    include: {
      patient: { select: patientSelect },
      doctor: { include: { user: { select: { id: true, name: true, email: true, role: true } }, hospital: { select: { id: true, code: true, name: true } } } },
      hospital: { select: { id: true, code: true, name: true } },
      items: { include: { catalogItem: { select: { id: true, catalogCode: true, name: true, type: true, price: true } } } },
      invoice: { select: { id: true, invoiceCode: true, status: true, total: true, amountPaid: true, balance: true } }
    }
  },
  labResult: {
    include: {
      sample: { select: { id: true, sampleCode: true, sampleType: true, collectedAt: true, acceptedAt: true } },
      enteredBy: { select: { id: true, name: true, role: true } },
      parameters: { include: { referenceParameter: true }, orderBy: { createdAt: 'asc' as const } },
      reviews: { include: { reviewer: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' as const } }
    }
  },
  scanResult: {
    include: {
      reportedBy: { select: { id: true, name: true, role: true } },
      files: { orderBy: { uploadedAt: 'desc' as const } },
      reviews: { include: { reviewer: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' as const } }
    }
  },
  generatedBy: { select: { id: true, name: true, role: true } },
  deliveryLogs: { orderBy: { createdAt: 'desc' as const }, take: 10, include: { performedBy: { select: { id: true, name: true, role: true } } } },
  secureLinks: { orderBy: { createdAt: 'desc' as const }, take: 5, include: { patient: { select: patientSelect }, createdBy: { select: { id: true, name: true, role: true } } } }
} satisfies Prisma.ReportInclude;

type ReleasePayload = {
  releaseNote?: string | null;
  notifyDoctor?: boolean;
  notifyReception?: boolean;
};

type DeliveryPayload = {
  channel?: DeliveryChannel | string;
  recipient: string;
  note?: string | null;
};

type RetryPayload = {
  reason?: string | null;
  notes?: string | null;
};

function toDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// SecureResultLink records keep tokenHash only; patient-facing token is returned once at creation time.
function createSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isPrivacySafeChannel(channel: DeliveryChannel) {
  return ([DeliveryChannel.SMS, DeliveryChannel.WHATSAPP] as DeliveryChannel[]).includes(channel);
}

// SMS and WhatsApp notices must not include clinical values, diagnosis, findings, or lab parameters.
function buildSafeResultNotice(reportCode: string, channel: DeliveryChannel, customNote?: string | null) {
  const safe = `Your result report ${reportCode} is ready. Please contact reception or use your secure result link from the diagnosis center.`;
  if (isPrivacySafeChannel(channel)) return safe;
  if (customNote?.trim()) return customNote.trim();
  return safe;
}

function buildReportWhere(query: Request['query'], req?: Request): Prisma.ReportWhereInput {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const from = toDate(query.from);
  const to = toDate(query.to);
  const status = typeof query.status === 'string' && query.status in ReportStatus ? (query.status as ReportStatus) : undefined;
  const where: Prisma.ReportWhereInput = {
    ...(status ? { status } : {}),
    ...(from || to ? { generatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { reportCode: { contains: search, mode: 'insensitive' } },
            { order: { orderCode: { contains: search, mode: 'insensitive' } } },
            { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } },
            { order: { patient: { firstName: { contains: search, mode: 'insensitive' } } } },
            { order: { patient: { lastName: { contains: search, mode: 'insensitive' } } } },
            { labResult: { resultCode: { contains: search, mode: 'insensitive' } } },
            { scanResult: { resultCode: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  if (req?.user?.role === UserRole.DOCTOR) {
    where.order = {
      ...(typeof where.order === 'object' && !Array.isArray(where.order) ? where.order : {}),
      doctor: { userId: req.user.id }
    } as Prisma.OrderWhereInput;
  }

  return where;
}

async function getReportOrThrow(reportId: string, req?: Request) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, ...buildReportWhere({}, req) },
    include: reportInclude
  });
  if (!report) throw new AppError('Result report was not found', 404, 'REPORT_NOT_FOUND');
  return report;
}

async function doctorRecipients() {
  const users = await prisma.user.findMany({ where: { role: UserRole.RECEPTIONIST, status: UserStatus.ACTIVE }, select: { id: true } });
  return users.map((user) => user.id);
}

async function createSecureLink(tx: Prisma.TransactionClient, report: { id: string; order: { patientId: string } }, req: Request) {
  const token = createSecureToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const secureLink = await tx.secureResultLink.create({
    data: {
      reportId: report.id,
      patientId: report.order.patientId,
      createdById: req.user?.id ?? null,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  return {
    ...secureLink,
    token,
    urlPath: `/results/secure/${token}`
  };
}

async function updateOrderReleaseState(tx: Prisma.TransactionClient, report: { orderId: string }, req: Request, note?: string | null) {
  const order = await tx.order.findUnique({ where: { id: report.orderId }, include: { items: true } });
  if (!order) return null;

  const allClinicalItemsComplete = order.items.every((item) => ([OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED, OrderItemStatus.REJECTED, OrderItemStatus.CANCELLED] as OrderItemStatus[]).includes(item.status));
  if (!allClinicalItemsComplete) return order;

  await tx.orderItem.updateMany({
    where: { orderId: order.id, status: OrderItemStatus.SIGNED_OFF },
    data: { status: OrderItemStatus.FINAL_RELEASED, completedAt: new Date() }
  });
  const updatedOrder = await tx.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.FINAL_RELEASED, releasedAt: new Date() }
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.FINAL_RELEASED,
      actorId: req.user?.id ?? null,
      note: note ?? 'All signed-off results released'
    }
  });
  return updatedOrder;
}

export async function listResults(query: Request['query'], req: Request) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where = buildReportWhere({ ...query, search }, req);
  const [items, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['generatedAt', 'downloadedAt', 'reportCode'] as const, 'generatedAt'),
      skip,
      take
    }),
    prisma.report.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getResultDetail(reportId: string, req: Request) {
  return getReportOrThrow(reportId, req);
}

export async function releaseResult(reportId: string, body: ReleasePayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const current = await getReportOrThrow(reportId, req);
  if (current.status === ReportStatus.VOIDED) throw new AppError('Voided reports cannot be released', 409, 'REPORT_VOIDED');

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.GENERATED },
      include: {
        order: { include: { patient: true, doctor: { include: { user: true } } } },
        labResult: true,
        scanResult: true
      }
    });

    if (report.labResultId && report.labResult?.status === LabResultStatus.SIGNED_OFF) {
      await tx.orderItem.update({ where: { id: report.labResult.orderItemId }, data: { status: OrderItemStatus.FINAL_RELEASED, completedAt: new Date() } });
    }
    if (report.scanResultId && report.scanResult?.status === ScanStatus.SIGNED_OFF) {
      await tx.orderItem.update({ where: { id: report.scanResult.orderItemId }, data: { status: OrderItemStatus.FINAL_RELEASED, completedAt: new Date() } });
    }

    const secureLink = await createSecureLink(tx, report, req);
    const releasedOrder = await updateOrderReleaseState(tx, report, req, body.releaseNote);

    const notifications = [];
    if (body.notifyDoctor !== false && report.order.doctor?.userId) {
      notifications.push(
        await tx.notification.create({
          data: {
            orderId: report.orderId,
            createdById: req.user?.id ?? null,
            recipientUserId: report.order.doctor.userId,
            recipientEmail: report.order.doctor.user.email,
            type: NotificationType.RESULT_RELEASED,
            title: 'Result report released',
            body: `Result report ${report.reportCode} has been released for order ${report.order.orderCode}.`
          }
        })
      );
    }
    if (body.notifyReception !== false) {
      const receptionUsers = await tx.user.findMany({ where: { role: UserRole.RECEPTIONIST, status: UserStatus.ACTIVE }, select: { id: true } });
      for (const { id: recipientUserId } of receptionUsers) {
        notifications.push(
          await tx.notification.create({
            data: {
              orderId: report.orderId,
              createdById: req.user?.id ?? null,
              recipientUserId,
              type: NotificationType.RESULT_RELEASED,
              title: 'Result ready for delivery',
              body: `Result report ${report.reportCode} is ready for patient delivery.`
            }
          })
        );
      }
    }

    return { report, releasedOrder, secureLink, notifications };
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'RESULT_RELEASED',
    module: 'Results',
    entityType: 'Report',
    entityId: reportId,
    beforeData: current,
    afterData: { report: result.report, releasedOrder: result.releasedOrder },
    details: { secureLinkCreated: true, notifyDoctor: body.notifyDoctor !== false, notifyReception: body.notifyReception !== false }
  });

  return result;
}

export async function getPdfReadyReport(reportId: string, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await getReportOrThrow(reportId, req);
  if (before.status === ReportStatus.VOIDED) throw new AppError('Voided reports cannot be downloaded', 409, 'REPORT_VOIDED');

  const report = await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.DOWNLOADED, downloadedAt: new Date() },
    include: reportInclude
  });

  await prisma.deliveryLog.create({
    data: {
      reportId,
      performedById: req.user.id,
      channel: DeliveryChannel.PDF_DOWNLOAD,
      status: DeliveryStatus.DELIVERED,
      safeMessage: true,
      target: req.user.email ?? req.user.username,
      deliveredAt: new Date()
    }
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'REPORT_DOWNLOADED',
    module: 'Results',
    entityType: 'Report',
    entityId: reportId,
    beforeData: { status: before.status, downloadedAt: before.downloadedAt },
    afterData: { status: report.status, downloadedAt: report.downloadedAt }
  });

  return {
    report,
    pdfReady: true,
    reportTemplate: {
      title: 'Diagnostic Result Report',
      includesPatientDemographics: true,
      includesClinicalValues: true,
      includesLabParameters: Boolean(report.labResult),
      includesScanFindings: Boolean(report.scanResult),
      generatedAt: new Date()
    }
  };
}

export async function sendResultDelivery(reportId: string, channel: DeliveryChannel, body: DeliveryPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const report = await getReportOrThrow(reportId, req);
  if (report.status === ReportStatus.VOIDED) throw new AppError('Voided reports cannot be delivered', 409, 'REPORT_VOIDED');

  const safeMessage = isPrivacySafeChannel(channel);
  const message = buildSafeResultNotice(report.reportCode, channel, body.note);
  const isEmail = channel === DeliveryChannel.EMAIL;

  const notification = await prisma.notification.create({
    data: {
      orderId: report.orderId,
      createdById: req.user.id,
      recipientEmail: isEmail ? body.recipient : null,
      recipientPhone: isEmail ? null : body.recipient,
      type: NotificationType.RESULT_RELEASED,
      title: 'Result report ready',
      body: message,
      deliveryLogs: {
        create: {
          reportId: report.id,
          performedById: req.user.id,
          channel,
          status: DeliveryStatus.SENT,
          target: body.recipient,
          safeMessage,
          deliveredAt: new Date()
        }
      }
    },
    include: { deliveryLogs: true }
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: `${channel}_RESULT_DELIVERY_SENT`,
    module: 'Results',
    entityType: 'Report',
    entityId: reportId,
    afterData: notification,
    details: { channel, target: body.recipient, safeMessage }
  });

  return { reportId, channel, notification, safeMessage };
}

export async function listDeliveryLogs(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const from = toDate(query.from);
  const to = toDate(query.to);
  const where: Prisma.DeliveryLogWhereInput = {
    ...(query.status && String(query.status) in DeliveryStatus ? { status: String(query.status) as DeliveryStatus } : {}),
    ...(query.channel && String(query.channel) in DeliveryChannel ? { channel: String(query.channel) as DeliveryChannel } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { target: { contains: search, mode: 'insensitive' } },
            { error: { contains: search, mode: 'insensitive' } },
            { report: { reportCode: { contains: search, mode: 'insensitive' } } },
            { notification: { title: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.deliveryLog.findMany({
      where,
      include: {
        report: { select: { id: true, reportCode: true, status: true, order: { select: { id: true, orderCode: true, patient: { select: patientSelect } } } } },
        notification: { select: { id: true, title: true, type: true, isRead: true } },
        performedBy: { select: { id: true, name: true, role: true } }
      },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'deliveredAt', 'channel', 'status'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.deliveryLog.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function retryDeliveryLog(deliveryLogId: string, body: RetryPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const log = await prisma.deliveryLog.findUnique({ where: { id: deliveryLogId }, include: { report: true, notification: true } });
  if (!log) throw new AppError('Delivery log was not found', 404, 'DELIVERY_LOG_NOT_FOUND');

  const updated = await prisma.deliveryLog.update({
    where: { id: deliveryLogId },
    data: {
      status: DeliveryStatus.RETRIED,
      retryCount: { increment: 1 },
      performedById: req.user.id,
      error: null,
      deliveredAt: new Date()
    },
    include: { report: true, notification: true, performedBy: { select: { id: true, name: true, role: true } } }
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'DELIVERY_RETRIED',
    module: 'Results',
    entityType: 'DeliveryLog',
    entityId: deliveryLogId,
    beforeData: log,
    afterData: updated,
    details: { reason: body.reason ?? body.notes ?? null }
  });

  return updated;
}

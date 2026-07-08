import {
  CatalogItemType,
  EquipmentStatus,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  ScanStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { normalizeAndStoreFile } from './fileStorage.service.js';
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

const scanAcceptanceInclude = {
  acceptedBy: { select: { id: true, name: true, role: true } },
  orderItem: {
    include: {
      catalogItem: {
        include: { department: { select: { id: true, code: true, name: true, type: true } } }
      },
      order: {
        include: {
          patient: { select: patientSelect },
          doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true, email: true } } } },
          hospital: { select: { id: true, code: true, name: true } },
          invoice: { select: { id: true, invoiceCode: true, status: true, total: true, balance: true } }
        }
      },
      scanBookings: {
        include: { equipment: { select: { id: true, name: true, room: true, modality: true, status: true } } },
        orderBy: { startAt: 'desc' as const },
        take: 3
      }
    }
  },
  scanResults: {
    include: {
      files: { orderBy: { uploadedAt: 'desc' as const } },
      reviews: { orderBy: { createdAt: 'desc' as const }, take: 3, include: { reviewer: { select: { id: true, name: true, role: true } } } },
      reports: { orderBy: { generatedAt: 'desc' as const }, take: 1 }
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1
  },
  retakes: { orderBy: { createdAt: 'desc' as const }, take: 3, include: { requestedBy: { select: { id: true, name: true, role: true } } } }
} satisfies Prisma.ScanAcceptanceInclude;

const scanResultInclude = {
  acceptance: { include: { acceptedBy: { select: { id: true, name: true, role: true } } } },
  orderItem: {
    include: {
      catalogItem: { include: { department: { select: { id: true, code: true, name: true, type: true } } } },
      order: {
        include: {
          patient: { select: patientSelect },
          doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true, email: true } } } },
          hospital: { select: { id: true, code: true, name: true } }
        }
      },
      scanBookings: { include: { equipment: { select: { id: true, name: true, room: true, modality: true, status: true } } }, orderBy: { startAt: 'desc' as const }, take: 3 }
    }
  },
  reportedBy: { select: { id: true, name: true, role: true } },
  files: { orderBy: { uploadedAt: 'desc' as const } },
  reviews: { include: { reviewer: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' as const } },
  reports: { orderBy: { generatedAt: 'desc' as const }, take: 1 }
} satisfies Prisma.ScanResultInclude;

const scanBookingInclude = {
  patient: { select: patientSelect },
  orderItem: {
    include: {
      catalogItem: true,
      order: { include: { patient: { select: patientSelect }, doctor: { include: { user: { select: { id: true, name: true } } } }, hospital: { select: { id: true, code: true, name: true } } } }
    }
  },
  equipment: { include: { department: { select: { id: true, code: true, name: true, type: true } } } },
  createdBy: { select: { id: true, name: true, role: true } }
} satisfies Prisma.ScanBookingInclude;

type AcceptScanPayload = {
  orderId?: string;
  orderItemIds?: string[];
  patientId?: string;
  notes?: string | null;
};

type ScanBookingPayload = {
  patientId: string;
  orderItemId?: string;
  equipmentId: string;
  scheduledAt: Date | string;
  durationMinutes?: number;
  notes?: string | null;
};

type ScanResultFilePayload = {
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  storageKey?: string | null;
  contentBase64?: string | null;
  base64?: string | null;
  dataUrl?: string | null;
  isDicom?: boolean;
  studyUid?: string | null;
  seriesUid?: string | null;
  instanceUid?: string | null;
  modality?: string | null;
};

type ScanResultPayload = {
  scanAcceptanceId?: string;
  orderItemId?: string;
  resultId?: string;
  findings: string;
  impression: string;
  recommendation?: string | null;
  comparison?: string | null;
  technicianNotes?: string | null;
  modality?: string | null;
  files?: ScanResultFilePayload[];
};

type SubmitReviewPayload = { resultId: string; notes?: string | null };
type SignOffPayload = { decision: 'SIGNED_OFF' | 'REJECTED'; reviewerComment?: string | null };
type ScanRetakePayload = { resultId: string; reason: string; notes?: string | null };
type ScanFilesPayload = { files: ScanResultFilePayload[] };

function cleanString(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toDate(value: Date | string | undefined, fallback = new Date()) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

const uniqueCodeFieldByModel: Record<string, string> = {
  scanBooking: 'bookingCode',
  scanResult: 'resultCode',
  report: 'reportCode'
};

async function nextCode(model: 'scanBooking' | 'scanResult' | 'report', prefix: string, tx: Prisma.TransactionClient = prisma) {
  // Existing codes can be non-contiguous (seed gaps, deletions), so a row
  // count collides with the unique constraint; derive from the max suffix.
  const codeField = uniqueCodeFieldByModel[model];
  const rows = await (tx as any)[model].findMany({
    where: { [codeField]: { startsWith: `${prefix}-` } },
    select: { [codeField]: true }
  });
  const max = rows.reduce((current: number, row: Record<string, string>) => {
    const suffix = Number(String(row[codeField]).slice(prefix.length + 1));
    return Number.isFinite(suffix) && suffix > current ? suffix : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

async function nextBookingCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('scanBooking', 'SCN-BKG', tx);
}

async function nextScanResultCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('scanResult', 'SCN-RES', tx);
}

async function nextReportCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('report', 'RPT', tx);
}

async function getScanOrderItemsForAcceptance(body: AcceptScanPayload, routeOrderId?: string) {
  const orderId = routeOrderId ?? body.orderId;
  const itemIds = body.orderItemIds?.filter(Boolean) ?? [];

  const where: Prisma.OrderItemWhereInput = {
    type: CatalogItemType.SCAN,
    ...(itemIds.length ? { id: { in: [...new Set(itemIds)] } } : {}),
    ...(orderId ? { orderId } : {}),
    order: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.PENDING_REVIEW] } }
  };

  const orderItems = await prisma.orderItem.findMany({
    where,
    include: {
      catalogItem: true,
      order: { include: { patient: true } },
      scanAcceptance: true
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!orderItems.length) throw new AppError('No eligible scan order items were found for acceptance', 404, 'SCAN_ITEMS_NOT_FOUND');
  if (itemIds.length && orderItems.length !== [...new Set(itemIds)].length) {
    throw new AppError('One or more scan order items were not found or are not eligible', 404, 'SCAN_ITEMS_NOT_FOUND');
  }
  if (body.patientId && orderItems.some((item) => item.order.patientId !== body.patientId)) {
    throw new AppError('Selected scan items do not match the provided patient', 400, 'SCAN_PATIENT_MISMATCH');
  }
  return orderItems;
}

async function setParentOrderProgress(orderId: string, tx: Prisma.TransactionClient, actorId?: string | null) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.FINAL_RELEASED) return;

  const hasAnyStarted = order.items.some((item) => item.status !== OrderItemStatus.REQUESTED);
  const allReadyForReview = order.items.length > 0 && order.items.every((item) => ([OrderItemStatus.PENDING_REVIEW, OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED] as OrderItemStatus[]).includes(item.status));
  const nextStatus = allReadyForReview ? OrderStatus.PENDING_REVIEW : hasAnyStarted ? OrderStatus.IN_PROGRESS : order.status;

  if (nextStatus !== order.status) {
    await tx.order.update({ where: { id: order.id }, data: { status: nextStatus } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        actorId: actorId ?? null,
        note: 'Automatic scan workflow status update'
      }
    });
  }
}

async function resolveScanResultTarget(body: ScanResultPayload) {
  if (body.resultId) {
    const result = await prisma.scanResult.findUnique({ where: { id: body.resultId }, include: scanResultInclude });
    if (!result) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');
    return { existingResult: result, orderItemId: result.orderItemId, acceptanceId: result.acceptanceId };
  }

  if (body.scanAcceptanceId) {
    const acceptance = await prisma.scanAcceptance.findUnique({ where: { id: body.scanAcceptanceId }, include: { orderItem: { include: { catalogItem: true, order: true } } } });
    if (!acceptance) throw new AppError('Scan acceptance was not found', 404, 'SCAN_ACCEPTANCE_NOT_FOUND');
    if (acceptance.orderItem.type !== CatalogItemType.SCAN) throw new AppError('Accepted item is not a scan request', 400, 'NOT_SCAN_ITEM');
    return { existingResult: null, orderItemId: acceptance.orderItemId, acceptanceId: acceptance.id };
  }

  if (body.orderItemId) {
    const orderItem = await prisma.orderItem.findUnique({ where: { id: body.orderItemId }, include: { scanAcceptance: true, catalogItem: true, order: true } });
    if (!orderItem || orderItem.type !== CatalogItemType.SCAN) throw new AppError('Scan order item was not found', 404, 'SCAN_ITEM_NOT_FOUND');
    const acceptance = orderItem.scanAcceptance ?? (await prisma.scanAcceptance.create({ data: { orderItemId: orderItem.id, status: ScanStatus.ACCEPTED } }));
    return { existingResult: null, orderItemId: orderItem.id, acceptanceId: acceptance.id };
  }

  throw new AppError('Provide scanAcceptanceId, orderItemId, or resultId', 400, 'SCAN_RESULT_TARGET_REQUIRED');
}

async function createScanResultFiles(tx: Prisma.TransactionClient, scanResultId: string, files: ScanResultFilePayload[] = []) {
  if (!files.length) return [];
  const normalized = await Promise.all(files.map((file) => normalizeAndStoreFile(file, { module: 'SCAN', entityType: 'ScanResult', entityId: scanResultId })));
  await tx.scanResultFile.createMany({
    data: normalized.map((file) => ({
      scanResultId,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      storageKey: file.storageKey,
      isDicom: file.isDicom,
      studyUid: cleanString(file.studyUid) as string | null,
      seriesUid: cleanString(file.seriesUid) as string | null,
      instanceUid: cleanString(file.instanceUid) as string | null,
      modality: cleanString(file.modality) as string | null
    }))
  });
}

async function createReportIfNeeded(resultId: string, tx: Prisma.TransactionClient, actorId?: string | null) {
  const result = await tx.scanResult.findUnique({ where: { id: resultId }, include: { orderItem: true } });
  if (!result) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');
  const existing = await tx.report.findFirst({ where: { scanResultId: result.id } });
  if (existing) return existing;

  const reportCode = await nextReportCode(tx);
  return tx.report.create({
    data: {
      reportCode,
      orderId: result.orderItem.orderId,
      scanResultId: result.id,
      status: ReportStatus.GENERATED,
      generatedById: actorId ?? null,
      secureToken: `${reportCode}-${Date.now()}`
    }
  });
}

export async function acceptScans(body: AcceptScanPayload, req: Request, routeOrderId?: string) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const items = await getScanOrderItemsForAcceptance(body, routeOrderId);
  const acceptedAt = new Date();
  const before = items.map((item) => item.scanAcceptance ?? { orderItemId: item.id, status: ScanStatus.NOT_ACCEPTED });

  const result = await prisma.$transaction(async (tx) => {
    const accepted = [];
    for (const item of items) {
      const acceptance = await tx.scanAcceptance.upsert({
        where: { orderItemId: item.id },
        create: {
          orderItemId: item.id,
          status: ScanStatus.ACCEPTED,
          acceptedAt,
          acceptedById: req.user?.id ?? null,
          notes: cleanString(body.notes) as string | null
        },
        update: {
          status: ScanStatus.ACCEPTED,
          acceptedAt,
          acceptedById: req.user?.id ?? null,
          notes: cleanString(body.notes) as string | null
        }
      });
      await tx.orderItem.update({ where: { id: item.id }, data: { status: OrderItemStatus.ACCEPTED, acceptedAt } });
      await setParentOrderProgress(item.orderId, tx, req.user?.id ?? null);
      accepted.push(acceptance);
    }
    return accepted;
  });

  const accepted = await prisma.scanAcceptance.findMany({ where: { id: { in: result.map((item) => item.id) } }, include: scanAcceptanceInclude, orderBy: { acceptedAt: 'desc' } });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SCAN_REQUEST_ACCEPTED',
    module: 'Scan',
    entityType: 'ScanAcceptance',
    entityId: accepted.map((item) => item.id).join(','),
    beforeData: before,
    afterData: accepted,
    details: { orderItemIds: items.map((item) => item.id), routeOrderId: routeOrderId ?? null }
  });
  return { accepted, count: accepted.length };
}

export async function listAcceptedScans(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ScanAcceptanceWhereInput = {
    status: { in: [ScanStatus.ACCEPTED, ScanStatus.DRAFT, ScanStatus.PENDING_REVIEW] },
    ...(query.from || query.to ? { acceptedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { orderItem: { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { order: { patient: { firstName: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { order: { patient: { lastName: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } },
            { orderItem: { order: { orderCode: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.scanAcceptance.findMany({ where, include: scanAcceptanceInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['acceptedAt', 'createdAt', 'updatedAt'] as const, 'acceptedAt'), skip, take }),
    prisma.scanAcceptance.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createScanBooking(body: ScanBookingPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

  const equipment = await prisma.equipment.findUnique({ where: { id: body.equipmentId }, include: { department: true } });
  if (!equipment) throw new AppError('Equipment was not found', 404, 'EQUIPMENT_NOT_FOUND');
  if (equipment.status === EquipmentStatus.OUT_OF_SERVICE || equipment.status === EquipmentStatus.MAINTENANCE) {
    throw new AppError('Selected equipment is not available for booking', 409, 'EQUIPMENT_UNAVAILABLE');
  }

  let orderItemId = body.orderItemId ?? null;
  if (orderItemId) {
    const orderItem = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
    if (!orderItem || orderItem.type !== CatalogItemType.SCAN) throw new AppError('Scan order item was not found', 404, 'SCAN_ITEM_NOT_FOUND');
    if (orderItem.order.patientId !== body.patientId) throw new AppError('Booking patient does not match the selected order item', 400, 'BOOKING_PATIENT_MISMATCH');
  }

  const startAt = toDate(body.scheduledAt);
  const duration = Math.max(Number(body.durationMinutes ?? 30), 1);
  const endAt = new Date(startAt.getTime() + duration * 60 * 1000);

  const booking = await prisma.scanBooking.create({
    data: {
      bookingCode: await nextBookingCode(),
      patientId: body.patientId,
      orderItemId,
      equipmentId: body.equipmentId,
      startAt,
      endAt,
      status: 'Booked',
      notes: cleanString(body.notes) as string | null,
      createdById: req.user.id
    },
    include: scanBookingInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SCAN_BOOKING_CREATED',
    module: 'Scan',
    entityType: 'ScanBooking',
    entityId: booking.id,
    afterData: booking
  });
  return booking;
}

export async function listScanBookings(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ScanBookingWhereInput = {
    ...(query.from || query.to ? { startAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.equipmentId ? { equipmentId: String(query.equipmentId) } : {}),
    ...(search
      ? {
          OR: [
            { bookingCode: { contains: search, mode: 'insensitive' } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { equipment: { name: { contains: search, mode: 'insensitive' } } },
            { equipment: { modality: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.scanBooking.findMany({ where, include: scanBookingInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['startAt', 'createdAt', 'updatedAt', 'bookingCode'] as const, 'startAt'), skip, take }),
    prisma.scanBooking.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function saveScanResultDraft(body: ScanResultPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const target = await resolveScanResultTarget(body);
  const before = target.existingResult;

  const saved = await prisma.$transaction(async (tx) => {
    const result = before
      ? await tx.scanResult.update({
          where: { id: before.id },
          data: {
            status: ScanStatus.DRAFT,
            findings: body.findings,
            impression: body.impression,
            comparison: cleanString(body.comparison) as string | null,
            recommendations: cleanString(body.recommendation) as string | null,
            technicianNotes: cleanString(body.technicianNotes) as string | null,
            reportedById: req.user?.id ?? null
          }
        })
      : await tx.scanResult.create({
          data: {
            resultCode: await nextScanResultCode(tx),
            orderItemId: target.orderItemId,
            acceptanceId: target.acceptanceId ?? null,
            status: ScanStatus.DRAFT,
            findings: body.findings,
            impression: body.impression,
            comparison: cleanString(body.comparison) as string | null,
            recommendations: cleanString(body.recommendation) as string | null,
            technicianNotes: cleanString(body.technicianNotes) as string | null,
            reportedById: req.user?.id ?? null
          }
        });

    if (target.acceptanceId) await tx.scanAcceptance.update({ where: { id: target.acceptanceId }, data: { status: ScanStatus.DRAFT } });
    await tx.orderItem.update({ where: { id: target.orderItemId }, data: { status: OrderItemStatus.DRAFT } });
    await createScanResultFiles(tx, result.id, body.files ?? []);

    const item = await tx.orderItem.findUnique({ where: { id: target.orderItemId } });
    if (item) await setParentOrderProgress(item.orderId, tx, req.user?.id ?? null);
    return result;
  });

  const result = await prisma.scanResult.findUniqueOrThrow({ where: { id: saved.id }, include: scanResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: before ? 'SCAN_RESULT_DRAFT_UPDATED' : 'SCAN_RESULT_DRAFT_CREATED',
    module: 'Scan',
    entityType: 'ScanResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: { fileCount: body.files?.length ?? 0 }
  });
  return result;
}

export async function submitScanResultForReview(body: SubmitReviewPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.scanResult.findUnique({ where: { id: body.resultId }, include: scanResultInclude });
  if (!before) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');
  if (before.status === ScanStatus.SIGNED_OFF) throw new AppError('Signed-off scan reports cannot be resubmitted', 409, 'SCAN_RESULT_ALREADY_SIGNED_OFF');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.scanResult.update({ where: { id: body.resultId }, data: { status: ScanStatus.PENDING_REVIEW, submittedAt: new Date() } });
    if (before.acceptanceId) await tx.scanAcceptance.update({ where: { id: before.acceptanceId }, data: { status: ScanStatus.PENDING_REVIEW } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.PENDING_REVIEW } });
    await tx.scanReview.create({ data: { scanResultId: body.resultId, reviewerId: null, decision: 'PENDING_REVIEW', note: cleanString(body.notes) as string | null } });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return result;
  });

  const result = await prisma.scanResult.findUniqueOrThrow({ where: { id: updated.id }, include: scanResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SCAN_RESULT_SUBMITTED_FOR_REVIEW',
    module: 'Scan',
    entityType: 'ScanResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: { notes: body.notes ?? null }
  });
  return result;
}

export async function signOffScanResult(resultId: string, body: SignOffPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.scanResult.findUnique({ where: { id: resultId }, include: scanResultInclude });
  if (!before) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.scanReview.create({
      data: {
        scanResultId: resultId,
        reviewerId: req.user?.id ?? null,
        decision: body.decision,
        note: cleanString(body.reviewerComment) as string | null
      }
    });

    if (body.decision === 'SIGNED_OFF') {
      const result = await tx.scanResult.update({ where: { id: resultId }, data: { status: ScanStatus.SIGNED_OFF, signedOffAt: new Date() } });
      if (before.acceptanceId) await tx.scanAcceptance.update({ where: { id: before.acceptanceId }, data: { status: ScanStatus.SIGNED_OFF } });
      await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.SIGNED_OFF, completedAt: new Date() } });
      const report = await createReportIfNeeded(resultId, tx, req.user?.id ?? null);
      await tx.notification.create({
        data: {
          orderId: before.orderItem.orderId,
          createdById: req.user?.id ?? null,
          recipientUserId: before.orderItem.order.doctor?.user?.id ?? null,
          type: NotificationType.ORDER_UPDATE,
          title: 'Scan report signed off',
          body: `${before.resultCode} has been signed off and is ready for results release.`
        }
      });
      await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
      return { result, report, retake: null };
    }

    const result = await tx.scanResult.update({ where: { id: resultId }, data: { status: ScanStatus.REJECTED } });
    if (before.acceptanceId) await tx.scanAcceptance.update({ where: { id: before.acceptanceId }, data: { status: ScanStatus.RETAKE_REQUESTED } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.RETEST_REQUESTED } });
    const retake = await tx.scanRetake.create({
      data: {
        acceptanceId: before.acceptanceId ?? null,
        requestedById: req.user?.id ?? null,
        reason: cleanString(body.reviewerComment) as string | null ?? 'Reviewer rejected report and requested retake.',
        status: 'Open'
      }
    });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return { result, report: null, retake };
  });

  const result = await prisma.scanResult.findUniqueOrThrow({ where: { id: updated.result.id }, include: scanResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: body.decision === 'SIGNED_OFF' ? 'SCAN_RESULT_SIGNED_OFF' : 'SCAN_RESULT_REJECTED_BY_REVIEWER',
    module: 'Scan',
    entityType: 'ScanResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: { reportId: updated.report?.id ?? null, retakeId: updated.retake?.id ?? null, reviewerComment: body.reviewerComment ?? null }
  });
  return { result, report: updated.report, retake: updated.retake };
}

export async function requestScanRetake(body: ScanRetakePayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.scanResult.findUnique({ where: { id: body.resultId }, include: scanResultInclude });
  if (!before) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');
  if (before.status === ScanStatus.SIGNED_OFF) throw new AppError('Signed-off scan reports cannot be marked for retake', 409, 'SCAN_RESULT_SIGNED_OFF');

  const retake = await prisma.$transaction(async (tx) => {
    if (before.acceptanceId) await tx.scanAcceptance.update({ where: { id: before.acceptanceId }, data: { status: ScanStatus.RETAKE_REQUESTED } });
    await tx.scanResult.update({ where: { id: body.resultId }, data: { status: ScanStatus.REJECTED } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.RETEST_REQUESTED } });
    const created = await tx.scanRetake.create({
      data: {
        acceptanceId: before.acceptanceId ?? null,
        requestedById: req.user?.id ?? null,
        reason: body.reason,
        status: 'Open'
      }
    });
    await tx.scanReview.create({ data: { scanResultId: body.resultId, reviewerId: req.user?.id ?? null, decision: 'RETAKE_REQUESTED', note: cleanString(body.notes) as string | null ?? body.reason } });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return created;
  });

  const result = await prisma.scanResult.findUniqueOrThrow({ where: { id: body.resultId }, include: scanResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SCAN_RETAKE_REQUESTED',
    module: 'Scan',
    entityType: 'ScanRetake',
    entityId: retake.id,
    beforeData: before,
    afterData: result,
    details: { reason: body.reason, notes: body.notes ?? null }
  });
  return { retake, result };
}

export async function listScanReviewQueue(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ScanResultWhereInput = {
    status: ScanStatus.PENDING_REVIEW,
    ...(query.from || query.to ? { submittedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { resultCode: { contains: search, mode: 'insensitive' } },
            { orderItem: { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { order: { patient: { firstName: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { order: { patient: { lastName: { contains: search, mode: 'insensitive' } } } } },
            { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.scanResult.findMany({ where, include: scanResultInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['submittedAt', 'createdAt', 'updatedAt', 'resultCode'] as const, 'submittedAt'), skip, take }),
    prisma.scanResult.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function listRejectedRetakeScans(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ScanAcceptanceWhereInput = {
    OR: [{ status: ScanStatus.RETAKE_REQUESTED }, { scanResults: { some: { status: ScanStatus.REJECTED } } }, { orderItem: { status: OrderItemStatus.RETEST_REQUESTED } }],
    ...(query.from || query.to ? { updatedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { orderItem: { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } } },
                { orderItem: { order: { patient: { firstName: { contains: search, mode: 'insensitive' } } } } },
                { orderItem: { order: { patient: { lastName: { contains: search, mode: 'insensitive' } } } } },
                { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } },
                { scanResults: { some: { resultCode: { contains: search, mode: 'insensitive' } } } }
              ]
            }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.scanAcceptance.findMany({ where, include: scanAcceptanceInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['updatedAt', 'createdAt', 'acceptedAt'] as const, 'updatedAt'), skip, take }),
    prisma.scanAcceptance.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function attachScanResultFiles(resultId: string, body: ScanFilesPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.scanResult.findUnique({ where: { id: resultId }, include: scanResultInclude });
  if (!before) throw new AppError('Scan result was not found', 404, 'SCAN_RESULT_NOT_FOUND');
  if (before.status === ScanStatus.SIGNED_OFF) throw new AppError('Signed-off scan reports cannot receive new files through this endpoint', 409, 'SCAN_RESULT_SIGNED_OFF');

  await prisma.$transaction(async (tx) => {
    await createScanResultFiles(tx, resultId, body.files);
  });

  const result = await prisma.scanResult.findUniqueOrThrow({ where: { id: resultId }, include: scanResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SCAN_RESULT_FILES_ATTACHED',
    module: 'Scan',
    entityType: 'ScanResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: {
      fileCount: body.files.length,
      dicomCount: body.files.filter((file) => file.isDicom).length,
      studyUids: body.files.map((file) => file.studyUid).filter(Boolean)
    }
  });
  return result;
}

export async function listPriorScans(patientId: string, query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: patientSelect });
  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

  const where: Prisma.ScanResultWhereInput = {
    orderItem: { order: { patientId } },
    status: ScanStatus.SIGNED_OFF,
    ...(search
      ? {
          OR: [
            { resultCode: { contains: search, mode: 'insensitive' } },
            { impression: { contains: search, mode: 'insensitive' } },
            { findings: { contains: search, mode: 'insensitive' } },
            { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.scanResult.findMany({ where, include: scanResultInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['signedOffAt', 'createdAt', 'updatedAt', 'resultCode'] as const, 'signedOffAt'), skip, take }),
    prisma.scanResult.count({ where })
  ]);
  return { patient, items, meta: paginationMeta(total, page, limit) };
}

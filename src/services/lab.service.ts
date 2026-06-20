import {
  CatalogItemType,
  DeliveryChannel,
  LabResultStatus,
  LabSampleStatus,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  ResultFlag
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { normalizeAndStoreFile, type IncomingFilePayload } from './fileStorage.service.js';
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

const labSampleInclude = {
  patient: { select: patientSelect },
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
      }
    }
  },
  results: {
    include: {
      parameters: { orderBy: { createdAt: 'asc' as const } },
      reviews: { orderBy: { createdAt: 'desc' as const }, take: 3, include: { reviewer: { select: { id: true, name: true, role: true } } } }
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1
  },
  rejections: { orderBy: { createdAt: 'desc' as const }, take: 3, include: { rejectedBy: { select: { id: true, name: true, role: true } } } }
} satisfies Prisma.LabSampleInclude;

const labResultInclude = {
  patient: { select: patientSelect },
  sample: { include: { acceptedBy: { select: { id: true, name: true, role: true } } } },
  orderItem: {
    include: {
      catalogItem: { include: { parameters: { include: { ranges: true }, orderBy: { sortOrder: 'asc' as const } } } },
      order: {
        include: {
          patient: { select: patientSelect },
          doctor: { select: { id: true, title: true, user: { select: { id: true, name: true, email: true } } } },
          hospital: { select: { id: true, code: true, name: true } }
        }
      }
    }
  },
  enteredBy: { select: { id: true, name: true, role: true } },
  parameters: { include: { referenceParameter: true }, orderBy: { createdAt: 'asc' as const } },
  reviews: { include: { reviewer: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' as const } },
  reports: { orderBy: { generatedAt: 'desc' as const }, take: 1 }
} satisfies Prisma.LabResultInclude;

type AcceptSamplePayload = {
  orderId?: string;
  orderItemIds?: string[];
  patientId?: string;
  collectedAt?: Date | string;
  sampleType?: string | null;
  barcode?: string | null;
  notes?: string | null;
};

type LabResultPayload = {
  sampleId?: string;
  orderItemId?: string;
  resultId?: string;
  overallComment?: string | null;
  parameters: Array<{
    parameterId?: string;
    name: string;
    value: string;
    unit?: string | null;
    flag?: ResultFlag;
    referenceRange?: string | null;
    notes?: string | null;
  }>;
};

type SubmitReviewPayload = { resultId: string; notes?: string | null };
type SignOffPayload = { decision: 'SIGNED_OFF' | 'REJECTED'; reviewerComment?: string | null };
type RejectSamplePayload = { reason: string; requestRecollection?: boolean; notes?: string | null };
type QcPayload = { catalogItemId?: string | null; parameterName: string; controlLevel?: string | null; value?: number | string | null; expectedMean?: number | string | null; standardDeviation?: number | string | null; result: string; notes?: string | null };
type InventoryItemPayload = { name: string; category: string; currentStock?: number | string; minLevel?: number | string; maxLevel?: number | string | null; unit?: string | null; expiryDate?: Date | string | null; supplier?: string | null };
type InventoryTransactionPayload = { type: string; quantity: number | string; reason?: string | null };

function cleanString(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: Date | string | undefined, fallback = new Date()) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function nextCode(model: 'labSample' | 'labResult' | 'report' | 'qualityControlRun' | 'inventoryItem' | 'inventoryTransaction', prefix: string, tx: Prisma.TransactionClient = prisma) {
  const count = await (tx as any)[model].count();
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function nextSampleCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('labSample', 'SMP', tx);
}

async function nextResultCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('labResult', 'RES', tx);
}

async function nextReportCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('report', 'RPT', tx);
}

async function nextQcCode(tx: Prisma.TransactionClient = prisma) {
  return nextCode('qualityControlRun', 'QC', tx);
}

async function nextInventoryCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.inventoryItem.count({ where: { itemCode: { startsWith: 'LAB-' } } });
  return `LAB-INV-${String(count + 1).padStart(4, '0')}`;
}

async function getLabOrderItemsForAcceptance(body: AcceptSamplePayload, routeOrderId?: string) {
  const orderId = routeOrderId ?? body.orderId;
  const itemIds = body.orderItemIds?.filter(Boolean) ?? [];

  const where: Prisma.OrderItemWhereInput = {
    type: CatalogItemType.LAB,
    ...(itemIds.length ? { id: { in: [...new Set(itemIds)] } } : {}),
    ...(orderId ? { orderId } : {}),
    order: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.PENDING_REVIEW] } }
  };

  const orderItems = await prisma.orderItem.findMany({
    where,
    include: {
      catalogItem: true,
      order: { include: { patient: true } },
      labSample: true
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!orderItems.length) throw new AppError('No eligible lab order items were found for sample acceptance', 404, 'LAB_ITEMS_NOT_FOUND');
  if (itemIds.length && orderItems.length !== [...new Set(itemIds)].length) {
    throw new AppError('One or more lab order items were not found or are not eligible', 404, 'LAB_ITEMS_NOT_FOUND');
  }
  if (body.patientId && orderItems.some((item) => item.order.patientId !== body.patientId)) {
    throw new AppError('Selected lab items do not match the provided patient', 400, 'LAB_PATIENT_MISMATCH');
  }
  return orderItems;
}

function buildSampleStatusFromAction(requestRecollection?: boolean) {
  return requestRecollection ? LabSampleStatus.RECOLLECTION_REQUESTED : LabSampleStatus.REJECTED;
}

function computeFlag(value: string, range?: { low: Prisma.Decimal | null; high: Prisma.Decimal | null; criticalLow: Prisma.Decimal | null; criticalHigh: Prisma.Decimal | null } | null, provided?: ResultFlag) {
  if (provided && provided !== ResultFlag.PENDING) return provided;
  const numeric = numberOrNull(value);
  if (numeric === null || !range) return ResultFlag.NO_RANGE;

  const criticalLow = range.criticalLow === null ? null : Number(range.criticalLow);
  const criticalHigh = range.criticalHigh === null ? null : Number(range.criticalHigh);
  const low = range.low === null ? null : Number(range.low);
  const high = range.high === null ? null : Number(range.high);

  if (criticalLow !== null && numeric < criticalLow) return ResultFlag.CRITICAL;
  if (criticalHigh !== null && numeric > criticalHigh) return ResultFlag.CRITICAL;
  if (low !== null && numeric < low) return ResultFlag.LOW;
  if (high !== null && numeric > high) return ResultFlag.HIGH;
  if (low === null && high === null) return ResultFlag.NO_RANGE;
  return ResultFlag.NORMAL;
}

function referenceDisplay(parameter: { unit: string | null; ranges: Array<{ displayRange: string | null; low: Prisma.Decimal | null; high: Prisma.Decimal | null }> }) {
  const range = parameter.ranges[0];
  if (!range) return null;
  if (range.displayRange) return range.displayRange;
  if (range.low !== null && range.high !== null) return `${range.low.toString()} - ${range.high.toString()}${parameter.unit ? ` ${parameter.unit}` : ''}`;
  return null;
}

async function setParentOrderProgress(orderId: string, tx: Prisma.TransactionClient, actorId?: string | null) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.FINAL_RELEASED) return;

  const hasAnyStarted = order.items.some((item) => item.status !== OrderItemStatus.REQUESTED);
  const allReadyForReview = order.items.length > 0 && order.items.every((item) => [OrderItemStatus.PENDING_REVIEW, OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED].includes(item.status));
  const nextStatus = allReadyForReview ? OrderStatus.PENDING_REVIEW : hasAnyStarted ? OrderStatus.IN_PROGRESS : order.status;

  if (nextStatus !== order.status) {
    await tx.order.update({ where: { id: order.id }, data: { status: nextStatus } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        actorId: actorId ?? null,
        note: 'Automatic lab workflow status update'
      }
    });
  }
}

export async function acceptLabSamples(body: AcceptSamplePayload, req: Request, routeOrderId?: string) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const orderItems = await getLabOrderItemsForAcceptance(body, routeOrderId);
  const collectedAt = toDate(body.collectedAt);
  const acceptedAt = new Date();

  const accepted = await prisma.$transaction(async (tx) => {
    const samples = [];
    for (const item of orderItems) {
      if (item.labSample && [LabSampleStatus.ACCEPTED, LabSampleStatus.DRAFT, LabSampleStatus.PENDING_REVIEW, LabSampleStatus.SIGNED_OFF].includes(item.labSample.status)) {
        samples.push(
          await tx.labSample.update({
            where: { id: item.labSample.id },
            data: {
              status: LabSampleStatus.ACCEPTED,
              sampleType: cleanString(body.sampleType) as string | null ?? item.catalogItem.sampleType,
              collectedAt,
              acceptedAt,
              acceptedById: req.user?.id ?? null,
              barcodeValue: cleanString(body.barcode) as string | null ?? item.labSample.barcodeValue,
              notes: cleanString(body.notes) as string | null ?? item.labSample.notes
            }
          })
        );
      } else {
        const sampleCode = await nextSampleCode(tx);
        samples.push(
          await tx.labSample.create({
            data: {
              sampleCode,
              orderItemId: item.id,
              patientId: item.order.patientId,
              status: LabSampleStatus.ACCEPTED,
              sampleType: cleanString(body.sampleType) as string | null ?? item.catalogItem.sampleType,
              collectedAt,
              acceptedAt,
              acceptedById: req.user?.id ?? null,
              barcodeValue: cleanString(body.barcode) as string | null ?? `${sampleCode}-BARCODE`,
              notes: cleanString(body.notes) as string | null
            }
          })
        );
      }

      await tx.orderItem.update({ where: { id: item.id }, data: { status: OrderItemStatus.ACCEPTED, acceptedAt } });
      await setParentOrderProgress(item.orderId, tx, req.user?.id ?? null);
    }
    return samples;
  });

  const fullSamples = await prisma.labSample.findMany({ where: { id: { in: accepted.map((sample) => sample.id) } }, include: labSampleInclude, orderBy: { acceptedAt: 'desc' } });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'LAB_SAMPLE_ACCEPTED',
    module: 'Lab',
    entityType: 'LabSample',
    entityId: accepted.map((sample) => sample.id).join(','),
    afterData: fullSamples,
    details: { count: accepted.length, routeOrderId: routeOrderId ?? null }
  });

  return { samples: fullSamples };
}

export async function listAcceptedSamples(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.LabSampleWhereInput = {
    status: query.status ? (String(query.status) as LabSampleStatus) : { in: [LabSampleStatus.ACCEPTED, LabSampleStatus.DRAFT, LabSampleStatus.PENDING_REVIEW, LabSampleStatus.SIGNED_OFF] },
    ...(query.from || query.to ? { acceptedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { sampleCode: { contains: search, mode: 'insensitive' } },
            { barcodeValue: { contains: search, mode: 'insensitive' } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { orderItem: { order: { orderCode: { contains: search, mode: 'insensitive' } } } },
            { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.labSample.findMany({ where, include: labSampleInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['acceptedAt', 'createdAt', 'updatedAt', 'sampleCode'] as const, 'acceptedAt'), skip, take }),
    prisma.labSample.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

async function resolveSampleForResult(body: LabResultPayload) {
  if (body.resultId) {
    const result = await prisma.labResult.findUnique({ where: { id: body.resultId }, include: { sample: true, orderItem: { include: { catalogItem: { include: { parameters: { include: { ranges: true } } } } } } } });
    if (!result) throw new AppError('Lab result was not found', 404, 'LAB_RESULT_NOT_FOUND');
    return { existingResult: result, sample: result.sample, orderItem: result.orderItem };
  }

  const sample = body.sampleId
    ? await prisma.labSample.findUnique({ where: { id: body.sampleId }, include: { orderItem: { include: { catalogItem: { include: { parameters: { include: { ranges: true }, orderBy: { sortOrder: 'asc' } } } } } } } })
    : body.orderItemId
      ? await prisma.labSample.findUnique({ where: { orderItemId: body.orderItemId }, include: { orderItem: { include: { catalogItem: { include: { parameters: { include: { ranges: true }, orderBy: { sortOrder: 'asc' } } } } } } } })
      : null;

  if (!sample) throw new AppError('An accepted sample is required before entering lab results', 404, 'LAB_SAMPLE_NOT_FOUND');
  if ([LabSampleStatus.REJECTED, LabSampleStatus.RECOLLECTION_REQUESTED].includes(sample.status)) throw new AppError('Rejected samples cannot receive results until recollection is accepted', 409, 'LAB_SAMPLE_REJECTED');
  return { existingResult: null, sample, orderItem: sample.orderItem };
}

function mapParameterInput(input: LabResultPayload['parameters'][number], catalogItem: { parameters: Array<{ id: string; name: string; unit: string | null; ranges: Array<{ displayRange: string | null; low: Prisma.Decimal | null; high: Prisma.Decimal | null; criticalLow: Prisma.Decimal | null; criticalHigh: Prisma.Decimal | null }> }> }) {
  const referenceParameter = input.parameterId ? catalogItem.parameters.find((parameter) => parameter.id === input.parameterId) : catalogItem.parameters.find((parameter) => parameter.name.toLowerCase() === input.name.toLowerCase());
  const range = referenceParameter?.ranges[0] ?? null;
  const numericValue = numberOrNull(input.value);
  const flag = computeFlag(input.value, range, input.flag);
  return {
    referenceParameterId: referenceParameter?.id ?? input.parameterId ?? null,
    name: input.name,
    value: input.value,
    numericValue: numericValue === null ? null : numericValue,
    unit: cleanString(input.unit) as string | null ?? referenceParameter?.unit ?? null,
    referenceRange: cleanString(input.referenceRange) as string | null ?? (referenceParameter ? referenceDisplay(referenceParameter) : null),
    low: range?.low ?? null,
    high: range?.high ?? null,
    criticalLow: range?.criticalLow ?? null,
    criticalHigh: range?.criticalHigh ?? null,
    flag
  };
}

export async function saveLabResultDraft(body: LabResultPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const { existingResult, sample, orderItem } = await resolveSampleForResult(body);
  if (orderItem.type !== CatalogItemType.LAB) throw new AppError('Only LAB order items can receive lab results', 403, 'NOT_LAB_ORDER_ITEM');

  const before = existingResult ? await prisma.labResult.findUnique({ where: { id: existingResult.id }, include: labResultInclude }) : null;
  const parameterData = body.parameters.map((parameter) => mapParameterInput(parameter, orderItem.catalogItem));

  const result = await prisma.$transaction(async (tx) => {
    const resultRecord = existingResult
      ? await tx.labResult.update({
          where: { id: existingResult.id },
          data: {
            status: LabResultStatus.DRAFT,
            interpretation: cleanString(body.overallComment) as string | null,
            technicianNotes: cleanString(body.overallComment) as string | null ?? existingResult.technicianNotes,
            enteredById: req.user?.id ?? null
          }
        })
      : await tx.labResult.create({
          data: {
            resultCode: await nextResultCode(tx),
            orderItemId: orderItem.id,
            sampleId: sample.id,
            patientId: sample.patientId,
            status: LabResultStatus.DRAFT,
            interpretation: cleanString(body.overallComment) as string | null,
            technicianNotes: cleanString(body.overallComment) as string | null,
            enteredById: req.user?.id ?? null
          }
        });

    await tx.labResultParameter.deleteMany({ where: { labResultId: resultRecord.id } });
    await tx.labResultParameter.createMany({ data: parameterData.map((parameter) => ({ ...parameter, labResultId: resultRecord.id })) });
    await tx.labSample.update({ where: { id: sample.id }, data: { status: LabSampleStatus.DRAFT } });
    await tx.orderItem.update({ where: { id: orderItem.id }, data: { status: OrderItemStatus.DRAFT } });
    await setParentOrderProgress(orderItem.orderId, tx, req.user?.id ?? null);
    return resultRecord;
  });

  const fullResult = await prisma.labResult.findUniqueOrThrow({ where: { id: result.id }, include: labResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: existingResult ? 'LAB_RESULT_DRAFT_UPDATED' : 'LAB_RESULT_DRAFT_CREATED',
    module: 'Lab',
    entityType: 'LabResult',
    entityId: fullResult.id,
    beforeData: before,
    afterData: fullResult
  });

  return fullResult;
}

export async function submitLabResultForReview(body: SubmitReviewPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.labResult.findUnique({ where: { id: body.resultId }, include: labResultInclude });
  if (!before) throw new AppError('Lab result was not found', 404, 'LAB_RESULT_NOT_FOUND');
  if (before.status === LabResultStatus.SIGNED_OFF) throw new AppError('Signed-off results cannot be resubmitted', 409, 'LAB_RESULT_ALREADY_SIGNED_OFF');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.labResult.update({ where: { id: body.resultId }, data: { status: LabResultStatus.PENDING_REVIEW, submittedAt: new Date() } });
    await tx.labSample.update({ where: { id: before.sampleId }, data: { status: LabSampleStatus.PENDING_REVIEW } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.PENDING_REVIEW } });
    await tx.labResultReview.create({ data: { labResultId: body.resultId, reviewerId: null, decision: 'PENDING_REVIEW', note: cleanString(body.notes) as string | null } });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return result;
  });

  const result = await prisma.labResult.findUniqueOrThrow({ where: { id: updated.id }, include: labResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'LAB_RESULT_SUBMITTED_FOR_REVIEW',
    module: 'Lab',
    entityType: 'LabResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: { notes: body.notes ?? null }
  });
  return result;
}

async function createReportIfNeeded(resultId: string, tx: Prisma.TransactionClient, actorId?: string | null) {
  const result = await tx.labResult.findUnique({ where: { id: resultId }, include: { orderItem: true } });
  if (!result) throw new AppError('Lab result was not found', 404, 'LAB_RESULT_NOT_FOUND');
  const existing = await tx.report.findFirst({ where: { labResultId: result.id } });
  if (existing) return existing;

  const reportCode = await nextReportCode(tx);
  return tx.report.create({
    data: {
      reportCode,
      orderId: result.orderItem.orderId,
      labResultId: result.id,
      status: ReportStatus.GENERATED,
      generatedById: actorId ?? null,
      secureToken: `${reportCode}-${Date.now()}`
    }
  });
}

export async function signOffLabResult(resultId: string, body: SignOffPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.labResult.findUnique({ where: { id: resultId }, include: labResultInclude });
  if (!before) throw new AppError('Lab result was not found', 404, 'LAB_RESULT_NOT_FOUND');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.labResultReview.create({
      data: {
        labResultId: resultId,
        reviewerId: req.user?.id ?? null,
        decision: body.decision,
        note: cleanString(body.reviewerComment) as string | null
      }
    });

    if (body.decision === 'SIGNED_OFF') {
      const result = await tx.labResult.update({ where: { id: resultId }, data: { status: LabResultStatus.SIGNED_OFF, signedOffAt: new Date() } });
      await tx.labSample.update({ where: { id: before.sampleId }, data: { status: LabSampleStatus.SIGNED_OFF } });
      await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.SIGNED_OFF, completedAt: new Date() } });
      const report = await createReportIfNeeded(resultId, tx, req.user?.id ?? null);
      await tx.notification.create({
        data: {
          orderId: before.orderItem.orderId,
          createdById: req.user?.id ?? null,
          recipientUserId: before.orderItem.order.doctor?.user?.id ?? null,
          type: NotificationType.ORDER_UPDATE,
          title: 'Lab result signed off',
          body: `${before.resultCode} has been signed off and is ready for results release.`
        }
      });
      await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
      return { result, report };
    }

    const result = await tx.labResult.update({ where: { id: resultId }, data: { status: LabResultStatus.CANCELLED } });
    await tx.labSample.update({ where: { id: before.sampleId }, data: { status: LabSampleStatus.RECOLLECTION_REQUESTED } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: OrderItemStatus.RETEST_REQUESTED } });
    await tx.sampleRejection.create({
      data: {
        sampleId: before.sampleId,
        rejectedById: req.user?.id ?? null,
        reason: cleanString(body.reviewerComment) as string | null ?? 'Reviewer rejected result and requested retest.',
        action: 'RETEST_REQUESTED'
      }
    });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return { result, report: null };
  });

  const result = await prisma.labResult.findUniqueOrThrow({ where: { id: updated.result.id }, include: labResultInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: body.decision === 'SIGNED_OFF' ? 'LAB_RESULT_SIGNED_OFF' : 'LAB_RESULT_REJECTED_BY_REVIEWER',
    module: 'Lab',
    entityType: 'LabResult',
    entityId: result.id,
    beforeData: before,
    afterData: result,
    details: { reportId: updated.report?.id ?? null, reviewerComment: body.reviewerComment ?? null }
  });
  return { result, report: updated.report };
}

export async function rejectLabSample(sampleId: string, body: RejectSamplePayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.labSample.findUnique({ where: { id: sampleId }, include: labSampleInclude });
  if (!before) throw new AppError('Lab sample was not found', 404, 'LAB_SAMPLE_NOT_FOUND');
  if (before.status === LabSampleStatus.SIGNED_OFF) throw new AppError('Signed-off samples cannot be rejected', 409, 'LAB_SAMPLE_SIGNED_OFF');

  const nextSampleStatus = buildSampleStatusFromAction(body.requestRecollection);
  const nextItemStatus = body.requestRecollection ? OrderItemStatus.RETEST_REQUESTED : OrderItemStatus.REJECTED;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.sampleRejection.create({
      data: {
        sampleId,
        rejectedById: req.user?.id ?? null,
        reason: body.reason,
        action: body.requestRecollection ? 'RECOLLECTION_REQUESTED' : 'REJECTED'
      }
    });
    await tx.labResult.updateMany({ where: { sampleId, status: { not: LabResultStatus.SIGNED_OFF } }, data: { status: LabResultStatus.CANCELLED } });
    await tx.orderItem.update({ where: { id: before.orderItemId }, data: { status: nextItemStatus } });
    const sample = await tx.labSample.update({ where: { id: sampleId }, data: { status: nextSampleStatus, notes: cleanString(body.notes) as string | null ?? before.notes } });
    await setParentOrderProgress(before.orderItem.orderId, tx, req.user?.id ?? null);
    return sample;
  });

  const sample = await prisma.labSample.findUniqueOrThrow({ where: { id: updated.id }, include: labSampleInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: body.requestRecollection ? 'LAB_SAMPLE_RECOLLECTION_REQUESTED' : 'LAB_SAMPLE_REJECTED',
    module: 'Lab',
    entityType: 'LabSample',
    entityId: sample.id,
    beforeData: before,
    afterData: sample,
    details: { reason: body.reason, requestRecollection: body.requestRecollection ?? false }
  });
  return sample;
}

export async function listLabReviewQueue(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.LabResultWhereInput = {
    status: LabResultStatus.PENDING_REVIEW,
    ...(query.from || query.to ? { submittedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { resultCode: { contains: search, mode: 'insensitive' } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.labResult.findMany({ where, include: labResultInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['submittedAt', 'createdAt', 'updatedAt', 'resultCode'] as const, 'submittedAt'), skip, take }),
    prisma.labResult.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function listRejectedRetestSamples(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.LabSampleWhereInput = {
    OR: [{ status: { in: [LabSampleStatus.REJECTED, LabSampleStatus.RECOLLECTION_REQUESTED] } }, { orderItem: { status: { in: [OrderItemStatus.REJECTED, OrderItemStatus.RETEST_REQUESTED] } } }],
    ...(query.from || query.to ? { updatedAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { sampleCode: { contains: search, mode: 'insensitive' } },
                { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
                { patient: { firstName: { contains: search, mode: 'insensitive' } } },
                { patient: { lastName: { contains: search, mode: 'insensitive' } } },
                { orderItem: { catalogItem: { name: { contains: search, mode: 'insensitive' } } } }
              ]
            }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.labSample.findMany({ where, include: labSampleInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['updatedAt', 'createdAt', 'sampleCode'] as const, 'updatedAt'), skip, take }),
    prisma.labSample.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getReferenceRanges(catalogItemId: string) {
  const catalogItem = await prisma.catalogItem.findFirst({
    where: { id: catalogItemId, type: CatalogItemType.LAB },
    include: { parameters: { include: { ranges: { orderBy: [{ gender: 'asc' }, { ageMin: 'asc' }] } }, orderBy: { sortOrder: 'asc' } } }
  });
  if (!catalogItem) throw new AppError('Lab catalog item was not found', 404, 'LAB_CATALOG_ITEM_NOT_FOUND');
  return catalogItem;
}

export async function getLabPatientTrends(patientId: string, query: Request['query']) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: patientSelect });
  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

  const parameters = await prisma.labResultParameter.findMany({
    where: {
      labResult: {
        patientId,
        status: LabResultStatus.SIGNED_OFF,
        ...(query.from || query.to ? { signedOffAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {})
      }
    },
    include: {
      labResult: { select: { id: true, resultCode: true, signedOffAt: true, createdAt: true, orderItem: { select: { catalogItem: { select: { id: true, name: true } } } } } }
    },
    orderBy: { createdAt: 'asc' }
  });

  const grouped = parameters.reduce<Record<string, unknown[]>>((acc, parameter) => {
    acc[parameter.name] ??= [];
    acc[parameter.name].push({
      value: parameter.value,
      numericValue: parameter.numericValue ? Number(parameter.numericValue) : null,
      unit: parameter.unit,
      flag: parameter.flag,
      referenceRange: parameter.referenceRange,
      resultCode: parameter.labResult.resultCode,
      catalogItem: parameter.labResult.orderItem.catalogItem,
      date: parameter.labResult.signedOffAt ?? parameter.labResult.createdAt
    });
    return acc;
  }, {});

  return { patient, parameters: grouped, totalParameters: parameters.length };
}

export async function listQualityControlRuns(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.QualityControlRunWhereInput = {
    ...(query.status ? { result: String(query.status) } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(String(query.from)) } : {}), ...(query.to ? { lte: new Date(String(query.to)) } : {}) } } : {}),
    ...(search ? { OR: [{ parameterName: { contains: search, mode: 'insensitive' } }, { result: { contains: search, mode: 'insensitive' } }, { controlLevel: { contains: search, mode: 'insensitive' } }] } : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.qualityControlRun.findMany({ where, include: { performedBy: { select: { id: true, name: true, role: true } } }, orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'parameterName', 'result'] as const, 'createdAt'), skip, take }),
    prisma.qualityControlRun.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createQualityControlRun(body: QcPayload, req: Request) {
  if (body.catalogItemId) await getReferenceRanges(body.catalogItemId);
  const run = await prisma.qualityControlRun.create({
    data: {
      id: await nextQcCode(),
      catalogItemId: cleanString(body.catalogItemId) as string | null,
      parameterName: body.parameterName,
      controlLevel: cleanString(body.controlLevel) as string | null,
      value: numberOrNull(body.value),
      expectedMean: numberOrNull(body.expectedMean),
      standardDeviation: numberOrNull(body.standardDeviation),
      result: body.result,
      notes: cleanString(body.notes) as string | null,
      performedById: req.user?.id ?? null
    },
    include: { performedBy: { select: { id: true, name: true, role: true } } }
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'LAB_QC_RUN_CREATED', module: 'Lab', entityType: 'QualityControlRun', entityId: run.id, afterData: run });
  return run;
}

export async function listInventory(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.InventoryItemWhereInput = {
    ...(query.status ? { isActive: String(query.status).toLowerCase() !== 'inactive' } : {}),
    ...(search ? { OR: [{ itemCode: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { category: { contains: search, mode: 'insensitive' } }, { supplier: { contains: search, mode: 'insensitive' } }] } : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.inventoryItem.findMany({ where, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5, include: { performedBy: { select: { id: true, name: true, role: true } } } } }, orderBy: safeOrderBy(sortBy, sortOrder, ['name', 'currentStock', 'expiryDate', 'createdAt'] as const, 'name'), skip, take }),
    prisma.inventoryItem.count({ where })
  ]);
  const lowStock = items.filter((item) => Number(item.currentStock) <= Number(item.minLevel));
  return { items, lowStock, meta: paginationMeta(total, page, limit) };
}

export async function createInventoryItem(body: InventoryItemPayload, req: Request) {
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: await nextInventoryCode(),
      name: body.name,
      category: body.category,
      currentStock: numberOrNull(body.currentStock) ?? 0,
      minLevel: numberOrNull(body.minLevel) ?? 0,
      maxLevel: numberOrNull(body.maxLevel),
      unit: cleanString(body.unit) as string | null,
      expiryDate: body.expiryDate ? toDate(body.expiryDate) : null,
      supplier: cleanString(body.supplier) as string | null
    }
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'LAB_INVENTORY_ITEM_CREATED', module: 'Lab', entityType: 'InventoryItem', entityId: item.id, afterData: item });
  return item;
}

export async function recordInventoryTransaction(inventoryItemId: string, body: InventoryTransactionPayload, req: Request) {
  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item was not found', 404, 'INVENTORY_ITEM_NOT_FOUND');

  const quantity = numberOrNull(body.quantity) ?? 0;
  if (quantity <= 0) throw new AppError('Inventory transaction quantity must be greater than zero', 400, 'INVALID_INVENTORY_QUANTITY');
  const normalizedType = body.type.toUpperCase();
  const sign = ['STOCK_OUT', 'USED', 'DAMAGED', 'EXPIRED', 'ADJUSTMENT_OUT'].includes(normalizedType) ? -1 : 1;
  const nextStock = Number(item.currentStock) + sign * quantity;
  if (nextStock < 0) throw new AppError('Inventory stock cannot go below zero', 409, 'INSUFFICIENT_INVENTORY_STOCK');

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.inventoryTransaction.create({
      data: {
        inventoryItemId,
        type: normalizedType,
        quantity,
        reason: cleanString(body.reason) as string | null,
        performedById: req.user?.id ?? null
      }
    });
    const updatedItem = await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { currentStock: nextStock } });
    return { transaction, item: updatedItem };
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'LAB_INVENTORY_TRANSACTION_RECORDED',
    module: 'Lab',
    entityType: 'InventoryTransaction',
    entityId: result.transaction.id,
    beforeData: item,
    afterData: result,
    details: { type: normalizedType, quantity }
  });
  return result;
}

export async function attachLabResultFiles(resultId: string, req: Request) {
  const result = await prisma.labResult.findUnique({ where: { id: resultId }, include: labResultInclude });
  if (!result) throw new AppError('Lab result was not found', 404, 'LAB_RESULT_NOT_FOUND');
  const body = req.body as { files?: IncomingFilePayload[]; metadata?: Record<string, unknown> };
  const files = Array.isArray(body.files) ? body.files : [];
  const normalized = await Promise.all(files.map((file) => normalizeAndStoreFile(file, { module: 'LAB', entityType: 'LabResult', entityId: result.id })));
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'LAB_RESULT_FILES_UPLOADED_METADATA_ONLY',
    module: 'Lab',
    entityType: 'LabResult',
    entityId: result.id,
    afterData: { files: normalized, metadata: body.metadata ?? null },
    details: {
      note: 'Lab file bytes can be stored locally when contentBase64 is supplied, but lab attachment rows require a future FileAsset table migration.',
      deliveryChannel: DeliveryChannel.IN_APP,
      fileCount: normalized.length
    }
  });
  return {
    result,
    persisted: false,
    files: normalized,
    fileLayerStatus: 'local-bytes-supported-generic-file-asset-table-pending'
  };
}

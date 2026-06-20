import {
  CatalogItemType,
  InvoiceStatus,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  OrderUrgency,
  Prisma,
  UserRole,
  UserStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';
import type { AuthUser } from '../types/auth.js';

const orderInclude = {
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      gender: true,
      dateOfBirth: true
    }
  },
  doctor: {
    select: {
      id: true,
      title: true,
      specialty: true,
      licenseNumber: true,
      user: { select: { id: true, name: true, email: true } },
      hospital: { select: { id: true, name: true, code: true } }
    }
  },
  hospital: { select: { id: true, name: true, code: true, phone: true, email: true } },
  items: {
    include: {
      catalogItem: {
        select: {
          id: true,
          catalogCode: true,
          name: true,
          type: true,
          price: true,
          sampleType: true,
          modality: true,
          expectedCompletionHours: true,
          department: { select: { id: true, name: true, code: true, type: true } }
        }
      },
      labSample: { select: { id: true, sampleCode: true, status: true, sampleType: true, acceptedAt: true } },
      scanAcceptance: { select: { id: true, status: true, acceptedAt: true } },
      scanBookings: { select: { id: true, bookingCode: true, startAt: true, endAt: true, status: true }, orderBy: { startAt: 'desc' as const }, take: 1 }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  invoice: { select: { id: true, invoiceCode: true, status: true, subtotal: true, discount: true, tax: true, total: true, amountPaid: true, balance: true } },
  statusHistory: {
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' as const },
    take: 20
  },
  cancellations: {
    include: { cancelledBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' as const }
  },
  _count: { select: { reports: true, notifications: true } }
} satisfies Prisma.OrderInclude;

const timelineInclude = {
  actor: { select: { id: true, name: true, role: true } }
} satisfies Prisma.OrderStatusHistoryInclude;

type CreateOrderPayload = {
  patientId: string;
  hospitalId?: string | null;
  referringDoctorId?: string | null;
  clinicalNotes?: string | null;
  diagnosis?: string | null;
  urgency?: OrderUrgency;
  items: Array<{ catalogItemId: string; notes?: string | null; preferredDate?: Date | string | null }>;
};

type StatusPayload = {
  status?: OrderStatus;
  nextStatus?: OrderStatus;
  reason?: string | null;
  notes?: string | null;
};

type CancelPayload = {
  reason: string;
  supervisorApprovalId?: string | null;
};

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.SUBMITTED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.PENDING_REVIEW, OrderStatus.CANCELLED],
  [OrderStatus.PENDING_REVIEW]: [OrderStatus.IN_PROGRESS, OrderStatus.FINAL_RELEASED, OrderStatus.CANCELLED],
  [OrderStatus.FINAL_RELEASED]: [],
  [OrderStatus.CANCELLED]: []
};

function cleanOptionalString(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function nextOrderCode(tx: Prisma.TransactionClient = prisma) {
  const year = new Date().getFullYear();
  const count = await tx.order.count({ where: { orderCode: { startsWith: `ORD-${year}-` } } });
  return `ORD-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function nextInvoiceCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.invoice.count();
  return `INV-${String(count + 1).padStart(4, '0')}`;
}

async function getDoctorProfileForActor(user?: AuthUser, explicitDoctorProfileId?: string | null) {
  if (user?.role === UserRole.DOCTOR) {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: user.id }, include: { hospital: true } });
    if (!profile) throw new AppError('Doctor profile was not found for this user', 404, 'DOCTOR_PROFILE_NOT_FOUND');
    return profile;
  }

  if (explicitDoctorProfileId) {
    const profile = await prisma.doctorProfile.findUnique({ where: { id: explicitDoctorProfileId }, include: { hospital: true } });
    if (!profile) throw new AppError('Selected doctor profile was not found', 404, 'DOCTOR_PROFILE_NOT_FOUND');
    return profile;
  }

  return null;
}

async function getDoctorProfileForUser(user?: AuthUser) {
  if (!user || user.role !== UserRole.DOCTOR) return null;
  return prisma.doctorProfile.findUnique({ where: { userId: user.id } });
}

async function buildOrderWhere(query: Request['query'], user?: AuthUser, options?: { doctorOnly?: boolean; active?: boolean; completed?: boolean; incomingOnly?: boolean }) {
  const { search } = getPagination(query);
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: String(query.status) as OrderStatus } : {}),
    ...(query.urgency ? { urgency: String(query.urgency) as OrderUrgency } : {}),
    ...(query.patientId ? { patientId: String(query.patientId) } : {}),
    ...(query.doctorId ? { doctorId: String(query.doctorId) } : {}),
    ...(query.hospitalId ? { hospitalId: String(query.hospitalId) } : {}),
    ...(query.from || query.to
      ? {
          submittedAt: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {})
          }
        }
      : {}),
    ...(search
      ? {
          OR: [
            { orderCode: { contains: search, mode: 'insensitive' } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { clinicalNotes: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  if (options?.active) where.status = { in: [OrderStatus.SUBMITTED, OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.PENDING_REVIEW] };
  if (options?.completed) where.status = { in: [OrderStatus.FINAL_RELEASED, OrderStatus.CANCELLED] };
  if (options?.incomingOnly) where.status = OrderStatus.SUBMITTED;

  if (user?.role === UserRole.DOCTOR || options?.doctorOnly) {
    const profile = await getDoctorProfileForUser(user);
    where.doctorId = profile?.id ?? '__no_access__';
  }

  return where;
}

async function assertOrderAccess(orderId: string, user?: AuthUser) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { doctor: { select: { userId: true } } } });
  if (!order) throw new AppError('Order was not found', 404, 'ORDER_NOT_FOUND');

  if (user?.role === UserRole.DOCTOR && order.doctor?.userId !== user.id) {
    throw new AppError('You can only access your own orders', 403, 'ORDER_SCOPE_DENIED');
  }

  return order;
}

async function loadCatalogItems(catalogItemIds: string[]) {
  const uniqueIds = [...new Set(catalogItemIds)];
  if (uniqueIds.length !== catalogItemIds.length) {
    throw new AppError('Duplicate catalog items are not allowed in the same order', 400, 'DUPLICATE_ORDER_ITEMS');
  }

  const items = await prisma.catalogItem.findMany({ where: { id: { in: uniqueIds }, isActive: true }, include: { department: true } });
  if (items.length !== uniqueIds.length) {
    const found = new Set(items.map((item) => item.id));
    const missing = uniqueIds.filter((id) => !found.has(id));
    throw new AppError('One or more catalog items were not found or are inactive', 404, 'CATALOG_ITEMS_NOT_FOUND', { missing });
  }
  return items;
}

function buildClinicalNotes(body: CreateOrderPayload) {
  const notes = cleanOptionalString(body.clinicalNotes) as string | null;
  const diagnosis = cleanOptionalString(body.diagnosis) as string | null;
  if (notes && diagnosis) return `${notes}\n\nDiagnosis/Provisional diagnosis: ${diagnosis}`;
  if (diagnosis) return `Diagnosis/Provisional diagnosis: ${diagnosis}`;
  return notes;
}

export async function createDoctorOrder(body: CreateOrderPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');

  const doctorProfile = await getDoctorProfileForActor(req.user, body.referringDoctorId);
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

  const catalogItems = await loadCatalogItems(body.items.map((item) => item.catalogItemId));
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const now = new Date();
  const maxCompletionHours = Math.max(...catalogItems.map((item) => item.expectedCompletionHours ?? 24), 24);
  const hospitalId = body.hospitalId ?? doctorProfile?.hospitalId ?? patient.hospitalId ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const orderCode = await nextOrderCode(tx);
    const order = await tx.order.create({
      data: {
        orderCode,
        patientId: body.patientId,
        doctorId: doctorProfile?.id ?? null,
        hospitalId,
        urgency: body.urgency ?? OrderUrgency.ROUTINE,
        clinicalNotes: buildClinicalNotes(body),
        expectedCompletionAt: addHours(now, maxCompletionHours),
        submittedAt: now,
        createdById: req.user?.id ?? null,
        items: {
          create: body.items.map((input) => {
            const catalogItem = catalogById.get(input.catalogItemId);
            const preferredDate = input.preferredDate ? new Date(input.preferredDate) : null;
            return {
              catalogItemId: input.catalogItemId,
              type: catalogItem?.type ?? CatalogItemType.LAB,
              status: OrderItemStatus.REQUESTED,
              notes: cleanOptionalString(input.notes) as string | null,
              expectedCompletionAt: preferredDate ?? addHours(now, catalogItem?.expectedCompletionHours ?? 24)
            };
          })
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.SUBMITTED,
            actorId: req.user?.id ?? null,
            note: 'Order submitted by doctor workflow'
          }
        }
      }
    });

    if (doctorProfile && !patient.referringDoctorId) {
      await tx.patient.update({ where: { id: patient.id }, data: { referringDoctorId: doctorProfile.id, updatedById: req.user?.id ?? null } });
    }

    const receptionist = await tx.user.findFirst({ where: { role: UserRole.RECEPTIONIST, status: UserStatus.ACTIVE }, orderBy: { createdAt: 'asc' } });
    await tx.notification.create({
      data: {
        orderId: order.id,
        createdById: req.user?.id ?? null,
        recipientUserId: receptionist?.id ?? null,
        type: NotificationType.ORDER_UPDATE,
        title: 'Incoming doctor order',
        body: `${order.orderCode} is awaiting reception confirmation.`,
        isRead: false
      }
    });

    return order;
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ORDER_CREATED',
    module: 'Doctor',
    entityType: 'Order',
    entityId: order.id,
    afterData: order
  });

  return order;
}

export async function listOrders(query: Request['query'], user?: AuthUser, options?: { doctorOnly?: boolean; active?: boolean; completed?: boolean; incomingOnly?: boolean }) {
  const { page, limit, skip, take, sortBy, sortOrder } = getPagination(query);
  const where = await buildOrderWhere(query, user, options);
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['submittedAt', 'createdAt', 'updatedAt', 'orderCode'] as const, 'submittedAt'),
      skip,
      take
    }),
    prisma.order.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getOrder(orderId: string, user?: AuthUser) {
  await assertOrderAccess(orderId, user);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export async function getOrderTimeline(orderId: string, user?: AuthUser) {
  await assertOrderAccess(orderId, user);
  const [history, cancellation, order] = await prisma.$transaction([
    prisma.orderStatusHistory.findMany({ where: { orderId }, include: timelineInclude, orderBy: { createdAt: 'asc' } }),
    prisma.orderCancellation.findMany({
      where: { orderId },
      include: { cancelledBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderCode: true, status: true, submittedAt: true, confirmedAt: true, releasedAt: true } })
  ]);

  return { order, history, cancellation };
}

function assertTransitionAllowed(currentStatus: OrderStatus, nextStatus: OrderStatus) {
  if (currentStatus === nextStatus) {
    throw new AppError(`Order is already ${nextStatus}`, 409, 'ORDER_STATUS_UNCHANGED');
  }
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new AppError(`Order cannot move from ${currentStatus} to ${nextStatus}`, 409, 'ORDER_TRANSITION_NOT_ALLOWED', {
      currentStatus,
      nextStatus,
      allowedNextStatuses: allowedTransitions[currentStatus]
    });
  }
}

export async function updateOrderStatus(orderId: string, body: StatusPayload, req: Request) {
  const nextStatus = body.status ?? body.nextStatus;
  if (!nextStatus) throw new AppError('Next order status is required', 400, 'ORDER_STATUS_REQUIRED');

  const before = await assertOrderAccess(orderId, req.user);
  assertTransitionAllowed(before.status, nextStatus);

  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        ...(nextStatus === OrderStatus.CONFIRMED ? { confirmedAt: new Date(), confirmedById: req.user?.id ?? null } : {}),
        ...(nextStatus === OrderStatus.FINAL_RELEASED ? { releasedAt: new Date() } : {})
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: before.status,
        toStatus: nextStatus,
        actorId: req.user?.id ?? null,
        note: cleanOptionalString(body.notes ?? body.reason) as string | null
      }
    });

    if (nextStatus === OrderStatus.CANCELLED) {
      await tx.orderItem.updateMany({ where: { orderId }, data: { status: OrderItemStatus.CANCELLED } });
    }

    return order;
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: updated.id }, include: orderInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ORDER_STATUS_UPDATED',
    module: 'Orders',
    entityType: 'Order',
    entityId: order.id,
    beforeData: before,
    afterData: order,
    details: { fromStatus: before.status, toStatus: nextStatus, reason: body.reason ?? body.notes ?? null }
  });

  return order;
}

export async function cancelOrder(orderId: string, body: CancelPayload, req: Request) {
  const before = await assertOrderAccess(orderId, req.user);
  if ([OrderStatus.CANCELLED, OrderStatus.FINAL_RELEASED].includes(before.status)) {
    throw new AppError('Final or already cancelled orders cannot be cancelled', 409, 'ORDER_CANNOT_BE_CANCELLED');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderCancellation.create({
      data: {
        orderId,
        cancelledById: req.user?.id ?? null,
        reason: body.reason
      }
    });

    const order = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
    await tx.orderItem.updateMany({ where: { orderId }, data: { status: OrderItemStatus.CANCELLED } });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: before.status,
        toStatus: OrderStatus.CANCELLED,
        actorId: req.user?.id ?? null,
        note: body.reason
      }
    });
    return order;
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: updated.id }, include: orderInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ORDER_CANCELLED',
    module: 'Orders',
    entityType: 'Order',
    entityId: order.id,
    beforeData: before,
    afterData: order,
    details: { reason: body.reason, supervisorApprovalId: body.supervisorApprovalId ?? null }
  });

  return order;
}

export async function ensureOrderInvoice(orderId: string, req: Request) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      patient: true,
      invoice: true,
      items: { include: { catalogItem: true } }
    }
  });
  if (!order) throw new AppError('Order was not found', 404, 'ORDER_NOT_FOUND');
  if (order.invoice) return order.invoice;

  const subtotal = order.items.reduce((sum, item) => sum + Number(item.catalogItem.price), 0);
  const total = subtotal;

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceCode = await nextInvoiceCode(tx);
    return tx.invoice.create({
      data: {
        invoiceCode,
        orderId: order.id,
        patientId: order.patientId,
        hospitalId: order.hospitalId,
        status: InvoiceStatus.UNPAID,
        subtotal,
        total,
        balance: total,
        createdById: req.user?.id ?? null,
        items: {
          create: order.items.map((item) => ({
            catalogItemId: item.catalogItemId,
            orderItemId: item.id,
            description: item.catalogItem.name,
            quantity: 1,
            unitPrice: item.catalogItem.price,
            total: item.catalogItem.price
          }))
        }
      }
    });
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'INVOICE_CREATED_FROM_ORDER',
    module: 'Billing',
    entityType: 'Invoice',
    entityId: invoice.id,
    afterData: invoice,
    details: { orderId: order.id, orderCode: order.orderCode }
  });

  return invoice;
}

export async function confirmReceptionOrder(orderId: string, body: { invoiceNow?: boolean; notes?: string | null }, req: Request) {
  const order = await updateOrderStatus(orderId, { nextStatus: OrderStatus.CONFIRMED, notes: body.notes }, req);
  const invoice = body.invoiceNow === false ? order.invoice : await ensureOrderInvoice(orderId, req);
  return { order: await getOrder(orderId, req.user), invoice };
}

export async function getOrderItemQueue(type: CatalogItemType, query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.OrderItemWhereInput = {
    type,
    order: {
      status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PROGRESS, OrderStatus.PENDING_REVIEW] },
      ...(query.from || query.to
        ? {
            submittedAt: {
              ...(query.from ? { gte: new Date(String(query.from)) } : {}),
              ...(query.to ? { lte: new Date(String(query.to)) } : {})
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              { orderCode: { contains: search, mode: 'insensitive' } },
              { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
              { patient: { firstName: { contains: search, mode: 'insensitive' } } },
              { patient: { lastName: { contains: search, mode: 'insensitive' } } }
            ]
          }
        : {})
    },
    ...(query.status ? { status: String(query.status) as OrderItemStatus } : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.orderItem.findMany({
      where,
      include: {
        catalogItem: { include: { department: true } },
        order: {
          include: {
            patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true, gender: true, dateOfBirth: true } },
            doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true } } } },
            hospital: { select: { id: true, name: true, code: true } },
            invoice: { select: { id: true, invoiceCode: true, status: true, total: true, balance: true } }
          }
        },
        labSample: true,
        scanAcceptance: true,
        scanBookings: { orderBy: { startAt: 'desc' }, take: 1 }
      },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'expectedCompletionAt'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.orderItem.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

import {
  AppointmentStatus,
  CatalogItemType,
  DeliveryChannel,
  DeliveryStatus,
  InvoiceStatus,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  OrderUrgency,
  Prisma,
  ReportStatus,
  UserRole,
  UserStatus,
  VisitStatus
} from '@prisma/client';
import type { Request } from 'express';
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
  dateOfBirth: true,
  hospitalId: true
} satisfies Prisma.PatientSelect;

const appointmentInclude = {
  patient: { select: patientSelect },
  order: { select: { id: true, orderCode: true, status: true, urgency: true } },
  doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true } } } },
  hospital: { select: { id: true, name: true, code: true } }
} satisfies Prisma.AppointmentInclude;

const visitInclude = {
  patient: { select: patientSelect },
  order: {
    select: {
      id: true,
      orderCode: true,
      status: true,
      urgency: true,
      invoice: { select: { id: true, invoiceCode: true, status: true, total: true, balance: true } }
    }
  },
  checkedInBy: { select: { id: true, name: true, role: true } }
} satisfies Prisma.PatientVisitInclude;

const resultInboxInclude = {
  order: {
    include: {
      patient: { select: patientSelect },
      doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true } } } },
      hospital: { select: { id: true, name: true, code: true } }
    }
  },
  labResult: { select: { id: true, resultCode: true, status: true, signedOffAt: true } },
  scanResult: { select: { id: true, resultCode: true, status: true, signedOffAt: true } },
  deliveryLogs: { orderBy: { createdAt: 'desc' as const }, take: 5 }
} satisfies Prisma.ReportInclude;

type ReceptionPatientPayload = {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  insuranceProvider?: string | null;
  policyNumber?: string | null;
  emergencyContact?: string | null;
  allergiesAndConditions?: string | null;
  hospitalId?: string | null;
  referringDoctorId?: string | null;
};

type CheckInPayload = {
  patientId: string;
  orderId?: string | null;
  appointmentId?: string | null;
  notes?: string | null;
  identityVerified?: boolean;
  visitType?: string | null;
};

type WalkInPayload = {
  patient?: ReceptionPatientPayload;
  patientId?: string | null;
  requestedItems: Array<{ catalogItemId: string; notes?: string | null }>;
  notes?: string | null;
  hospitalId?: string | null;
  invoiceNow?: boolean;
  checkInNow?: boolean;
};

type AppointmentPayload = {
  patientId?: string;
  doctorProfileId?: string | null;
  hospitalId?: string | null;
  orderId?: string | null;
  scheduledAt?: Date | string;
  scheduledDate?: Date | string;
  reason?: string | null;
  type?: string | null;
  roomOrArea?: string | null;
  status?: AppointmentStatus;
  notes?: string | null;
};

type ResultNoticePayload = {
  channel: DeliveryChannel | 'SMS' | 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  recipient: string;
  message?: string | null;
};

function clean(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDate(value: Date | string | undefined | null, fallback = new Date()) {
  if (!value) return fallback;
  return value instanceof Date ? value : new Date(value);
}

async function nextAppointmentCode() {
  const count = await prisma.appointment.count();
  return `APT-${String(count + 1).padStart(4, '0')}`;
}

async function assertPatient(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');
  return patient;
}

async function assertOrder(orderId: string, patientId?: string | null) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { invoice: true } });
  if (!order) throw new AppError('Order was not found', 404, 'ORDER_NOT_FOUND');
  if (patientId && order.patientId !== patientId) throw new AppError('Order does not belong to the selected patient', 409, 'ORDER_PATIENT_MISMATCH');
  if (([OrderStatus.CANCELLED, OrderStatus.FINAL_RELEASED] as OrderStatus[]).includes(order.status)) {
    throw new AppError('Final or cancelled orders cannot be checked in at reception', 409, 'ORDER_NOT_CHECK_IN_ELIGIBLE');
  }
  return order;
}

async function assertAppointment(appointmentId: string, patientId?: string | null) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new AppError('Appointment was not found', 404, 'APPOINTMENT_NOT_FOUND');
  if (patientId && appointment.patientId !== patientId) {
    throw new AppError('Appointment does not belong to the selected patient', 409, 'APPOINTMENT_PATIENT_MISMATCH');
  }
  return appointment;
}

function patientCreateData(body: ReceptionPatientPayload, actorId?: string | null): Prisma.PatientCreateInput {
  const phone = clean(body.phone) as string | null;
  const email = clean(body.email) as string | null;
  const insuranceProvider = clean(body.insuranceProvider) as string | null;
  const policyNumber = clean(body.policyNumber) as string | null;
  const contacts: Prisma.PatientContactCreateWithoutPatientInput[] = [];
  if (phone) contacts.push({ type: 'PHONE', value: phone, isPrimary: true });
  if (email) contacts.push({ type: 'EMAIL', value: email, isPrimary: contacts.length === 0 });

  return {
    patientCode: '',
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    dateOfBirth: body.dateOfBirth ? toDate(body.dateOfBirth) : null,
    gender: clean(body.gender) as string | null,
    phone,
    email,
    address: clean(body.address) as string | null,
    nationalId: clean(body.nationalId) as string | null,
    insuranceProvider,
    policyNumber,
    emergencyContact: clean(body.emergencyContact) as string | null,
    allergiesAndConditions: clean(body.allergiesAndConditions) as string | null,
    hospital: body.hospitalId ? { connect: { id: body.hospitalId } } : undefined,
    referringDoctor: body.referringDoctorId ? { connect: { id: body.referringDoctorId } } : undefined,
    createdBy: actorId ? { connect: { id: actorId } } : undefined,
    updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    contacts: contacts.length ? { create: contacts } : undefined,
    insuranceRecords: insuranceProvider && policyNumber ? { create: [{ provider: insuranceProvider, policyNumber }] } : undefined
  };
}

async function loadCatalogItems(catalogItemIds: string[]) {
  const uniqueIds = [...new Set(catalogItemIds)];
  if (uniqueIds.length !== catalogItemIds.length) throw new AppError('Duplicate requested items are not allowed', 400, 'DUPLICATE_WALK_IN_ITEMS');
  const items = await prisma.catalogItem.findMany({ where: { id: { in: uniqueIds }, isActive: true } });
  if (items.length !== uniqueIds.length) {
    const found = new Set(items.map((item) => item.id));
    throw new AppError('One or more requested catalog items were not found or are inactive', 404, 'CATALOG_ITEMS_NOT_FOUND', {
      missing: uniqueIds.filter((id) => !found.has(id))
    });
  }
  return items;
}

async function createInvoiceForOrder(tx: Prisma.TransactionClient, order: { id: string; patientId: string; hospitalId: string | null; items: Array<{ id: string; catalogItemId: string; catalogItem: { name: string; price: Prisma.Decimal | number } }> }, actorId?: string | null) {
  const subtotal = order.items.reduce((sum, item) => sum + Number(item.catalogItem.price), 0);
  const invoiceCode = `INV-${String((await tx.invoice.count()) + 1).padStart(4, '0')}`;
  return tx.invoice.create({
    data: {
      invoiceCode,
      orderId: order.id,
      patientId: order.patientId,
      hospitalId: order.hospitalId,
      status: InvoiceStatus.UNPAID,
      subtotal,
      total: subtotal,
      balance: subtotal,
      createdById: actorId ?? null,
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
    },
    include: { items: true }
  });
}

export async function checkInPatient(body: CheckInPayload, req: Request) {
  const patient = await assertPatient(body.patientId);
  const appointment = body.appointmentId ? await assertAppointment(body.appointmentId, patient.id) : null;
  const order = body.orderId
    ? await assertOrder(body.orderId, patient.id)
    : appointment?.orderId
      ? await assertOrder(appointment.orderId, patient.id)
      : null;
  if (appointment?.orderId && order && appointment.orderId !== order.id) {
    throw new AppError('Appointment is linked to a different order', 409, 'APPOINTMENT_ORDER_MISMATCH');
  }

  const visit = await prisma.$transaction(async (tx) => {
    const visitCode = `VIS-${String((await tx.patientVisit.count()) + 1).padStart(4, '0')}`;
    const createdVisit = await tx.patientVisit.create({
      data: {
        visitCode,
        patientId: patient.id,
        orderId: order?.id ?? null,
        checkedInById: req.user?.id ?? null,
        status: VisitStatus.CHECKED_IN,
        visitType: (clean(body.visitType) as string | null) ?? (appointment ? 'Appointment' : order ? 'Order' : 'Walk-in'),
        identityVerified: body.identityVerified ?? true,
        notes: clean(body.notes) as string | null
      }
    });

    if (appointment) {
      await tx.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.CHECKED_IN } });
    }

    const targetOrderId = order?.id ?? null;
    if (targetOrderId && order?.status === OrderStatus.CONFIRMED) {
      await tx.order.update({ where: { id: targetOrderId }, data: { status: OrderStatus.IN_PROGRESS } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: targetOrderId,
          fromStatus: OrderStatus.CONFIRMED,
          toStatus: OrderStatus.IN_PROGRESS,
          actorId: req.user?.id ?? null,
          note: 'Patient checked in at reception'
        }
      });
    }

    return createdVisit;
  });

  const loaded = await prisma.patientVisit.findUniqueOrThrow({ where: { id: visit.id }, include: visitInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'PATIENT_CHECKED_IN',
    module: 'Reception',
    entityType: 'PatientVisit',
    entityId: loaded.id,
    afterData: loaded,
    details: { patientId: patient.id, orderId: order?.id ?? null, appointmentId: appointment?.id ?? null }
  });

  return loaded;
}

export async function createWalkIn(body: WalkInPayload, req: Request) {
  if (!body.patient && !body.patientId) throw new AppError('Provide an existing patient ID or new patient details', 400, 'PATIENT_REQUIRED');
  const catalogItems = await loadCatalogItems(body.requestedItems.map((item) => item.catalogItemId));
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

  const created = await prisma.$transaction(async (tx) => {
    let patient = body.patientId ? await tx.patient.findUnique({ where: { id: body.patientId } }) : null;
    if (body.patient && !patient) {
      const data = patientCreateData(body.patient, req.user?.id);
      data.patientCode = `PAT-${String((await tx.patient.count()) + 1).padStart(4, '0')}`;
      patient = await tx.patient.create({ data });
    }
    if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

    const orderCode = `ORD-${new Date().getUTCFullYear()}-${String((await tx.order.count()) + 1).padStart(4, '0')}`;
    const hospitalId = body.hospitalId ?? body.patient?.hospitalId ?? patient.hospitalId ?? null;
    const order = await tx.order.create({
      data: {
        orderCode,
        patientId: patient.id,
        hospitalId,
        status: OrderStatus.CONFIRMED,
        urgency: OrderUrgency.ROUTINE,
        clinicalNotes: (clean(body.notes) as string | null) ?? 'Walk-in order created at reception',
        submittedAt: new Date(),
        confirmedAt: new Date(),
        createdById: req.user?.id ?? null,
        confirmedById: req.user?.id ?? null,
        items: {
          create: body.requestedItems.map((item) => {
            const catalogItem = catalogById.get(item.catalogItemId);
            return {
              catalogItemId: item.catalogItemId,
              type: catalogItem?.type ?? CatalogItemType.LAB,
              status: OrderItemStatus.REQUESTED,
              notes: clean(item.notes) as string | null
            };
          })
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.CONFIRMED,
            actorId: req.user?.id ?? null,
            note: 'Walk-in order created and confirmed by reception'
          }
        }
      },
      include: { items: { include: { catalogItem: true } } }
    });

    const invoice = body.invoiceNow === false ? null : await createInvoiceForOrder(tx, order, req.user?.id);
    const visit = body.checkInNow === false
      ? null
      : await tx.patientVisit.create({
          data: {
            visitCode: `VIS-${String((await tx.patientVisit.count()) + 1).padStart(4, '0')}`,
            patientId: patient.id,
            orderId: order.id,
            checkedInById: req.user?.id ?? null,
            visitType: 'Walk-in',
            identityVerified: true,
            notes: clean(body.notes) as string | null
          }
        });

    const billingUser = await tx.user.findFirst({ where: { role: UserRole.BILLING_STAFF, status: UserStatus.ACTIVE }, orderBy: { createdAt: 'asc' } });
    await tx.notification.create({
      data: {
        orderId: order.id,
        createdById: req.user?.id ?? null,
        recipientUserId: billingUser?.id ?? null,
        type: NotificationType.ORDER_UPDATE,
        title: 'Walk-in order confirmed',
        body: `${order.orderCode} was created at reception${invoice ? ` with invoice ${invoice.invoiceCode}` : ''}.`,
        isRead: false
      }
    });

    return { patientId: patient.id, orderId: order.id, invoiceId: invoice?.id ?? null, visitId: visit?.id ?? null };
  });

  const [patient, order, invoice, visit] = await prisma.$transaction([
    prisma.patient.findUniqueOrThrow({ where: { id: created.patientId }, select: patientSelect }),
    prisma.order.findUniqueOrThrow({
      where: { id: created.orderId },
      include: {
        items: { include: { catalogItem: true }, orderBy: { createdAt: 'asc' } },
        hospital: { select: { id: true, name: true, code: true } }
      }
    }),
    created.invoiceId ? prisma.invoice.findUnique({ where: { id: created.invoiceId }, include: { items: true } }) : prisma.invoice.findFirst({ where: { id: '__none__' } }),
    created.visitId ? prisma.patientVisit.findUnique({ where: { id: created.visitId }, include: visitInclude }) : prisma.patientVisit.findFirst({ where: { id: '__none__' } })
  ]);

  const result = { patient, order, invoice, visit };

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'WALK_IN_CREATED',
    module: 'Reception',
    entityType: 'Order',
    entityId: order.id,
    afterData: result,
    details: { invoiceCreated: Boolean(invoice), visitCreated: Boolean(visit) }
  });

  return result;
}

export async function listAppointments(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.AppointmentWhereInput = {
    ...(query.status ? { status: String(query.status) as AppointmentStatus } : {}),
    ...(query.patientId ? { patientId: String(query.patientId) } : {}),
    ...(query.doctorProfileId ? { doctorId: String(query.doctorProfileId) } : {}),
    ...(query.hospitalId ? { hospitalId: String(query.hospitalId) } : {}),
    ...(query.from || query.to
      ? { scheduledDate: { ...(query.from ? { gte: toDate(query.from as Date | string) } : {}), ...(query.to ? { lte: toDate(query.to as Date | string) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { appointmentCode: { contains: search, mode: 'insensitive' } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { roomOrArea: { contains: search, mode: 'insensitive' } },
            { type: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['scheduledDate', 'createdAt', 'updatedAt', 'appointmentCode'] as const, 'scheduledDate'),
      skip,
      take
    }),
    prisma.appointment.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createAppointment(body: AppointmentPayload, req: Request) {
  if (!body.patientId) throw new AppError('Patient ID is required', 400, 'PATIENT_REQUIRED');
  await assertPatient(body.patientId);
  if (body.orderId) await assertOrder(body.orderId, body.patientId);
  const appointment = await prisma.appointment.create({
    data: {
      appointmentCode: await nextAppointmentCode(),
      patientId: body.patientId,
      orderId: body.orderId ?? null,
      doctorId: body.doctorProfileId ?? null,
      hospitalId: body.hospitalId ?? null,
      scheduledDate: toDate(body.scheduledAt ?? body.scheduledDate),
      type: (clean(body.type ?? body.reason) as string | null) ?? 'Scheduled',
      roomOrArea: clean(body.roomOrArea) as string | null,
      status: body.status ?? AppointmentStatus.SCHEDULED,
      notes: clean(body.notes ?? body.reason) as string | null
    },
    include: appointmentInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'APPOINTMENT_CREATED',
    module: 'Reception',
    entityType: 'Appointment',
    entityId: appointment.id,
    afterData: appointment
  });

  return appointment;
}

export async function updateAppointment(appointmentId: string, body: AppointmentPayload, req: Request) {
  const before = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!before) throw new AppError('Appointment was not found', 404, 'APPOINTMENT_NOT_FOUND');
  if (body.patientId) await assertPatient(body.patientId);
  if (body.orderId) await assertOrder(body.orderId, body.patientId ?? before.patientId);

  const data: Prisma.AppointmentUpdateInput = {};
  if ('patientId' in body && body.patientId) data.patient = { connect: { id: body.patientId } };
  if ('doctorProfileId' in body) data.doctor = body.doctorProfileId ? { connect: { id: body.doctorProfileId } } : { disconnect: true };
  if ('hospitalId' in body) data.hospital = body.hospitalId ? { connect: { id: body.hospitalId } } : { disconnect: true };
  if ('orderId' in body) data.order = body.orderId ? { connect: { id: body.orderId } } : { disconnect: true };
  if ('scheduledAt' in body || 'scheduledDate' in body) data.scheduledDate = toDate(body.scheduledAt ?? body.scheduledDate);
  if ('type' in body || 'reason' in body) data.type = (clean(body.type ?? body.reason) as string | null) ?? before.type;
  if ('roomOrArea' in body) data.roomOrArea = clean(body.roomOrArea) as string | null;
  if ('status' in body && body.status) data.status = body.status;
  if ('notes' in body || 'reason' in body) data.notes = clean(body.notes ?? body.reason) as string | null;

  const appointment = await prisma.appointment.update({ where: { id: appointmentId }, data, include: appointmentInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'APPOINTMENT_UPDATED',
    module: 'Reception',
    entityType: 'Appointment',
    entityId: appointment.id,
    beforeData: before,
    afterData: appointment
  });

  return appointment;
}

export async function listDailyVisits(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.PatientVisitWhereInput = {
    ...(query.status ? { status: String(query.status) as VisitStatus } : {}),
    ...(query.patientId ? { patientId: String(query.patientId) } : {}),
    ...(query.orderId ? { orderId: String(query.orderId) } : {}),
    ...(query.from || query.to
      ? { checkedInAt: { ...(query.from ? { gte: toDate(query.from as Date | string) } : {}), ...(query.to ? { lte: toDate(query.to as Date | string) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { visitCode: { contains: search, mode: 'insensitive' } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { order: { orderCode: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.patientVisit.findMany({
      where,
      include: visitInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['checkedInAt', 'completedAt', 'visitCode'] as const, 'checkedInAt'),
      skip,
      take
    }),
    prisma.patientVisit.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function listReceptionResultsInbox(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ReportWhereInput = {
    ...(query.status ? { status: String(query.status) as ReportStatus } : { status: ReportStatus.GENERATED }),
    ...(query.from || query.to
      ? { generatedAt: { ...(query.from ? { gte: toDate(query.from as Date | string) } : {}), ...(query.to ? { lte: toDate(query.to as Date | string) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { reportCode: { contains: search, mode: 'insensitive' } },
            { order: { orderCode: { contains: search, mode: 'insensitive' } } },
            { order: { patient: { firstName: { contains: search, mode: 'insensitive' } } } },
            { order: { patient: { lastName: { contains: search, mode: 'insensitive' } } } },
            { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } }
          ]
        }
      : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      include: resultInboxInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['generatedAt', 'downloadedAt', 'reportCode'] as const, 'generatedAt'),
      skip,
      take
    }),
    prisma.report.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

function buildSafePatientNotice(reportCode: string, channel: DeliveryChannel | string, provided?: string | null) {
  const defaultMessage = `Your result report ${reportCode} is ready. Please contact reception or use your secure result link from the diagnosis center.`;
  if (channel === DeliveryChannel.EMAIL && provided) return provided.trim();
  return defaultMessage;
}

export async function sendReceptionResultNotice(reportId: string, body: ResultNoticePayload, req: Request) {
  const report = await prisma.report.findUnique({ where: { id: reportId }, include: { order: { include: { patient: true } } } });
  if (!report) throw new AppError('Result report was not found', 404, 'REPORT_NOT_FOUND');
  if (report.status === ReportStatus.VOIDED) throw new AppError('Voided reports cannot be delivered', 409, 'REPORT_VOIDED');

  const channel = body.channel as DeliveryChannel;
  const message = buildSafePatientNotice(report.reportCode, channel, body.message);
  const isEmail = channel === DeliveryChannel.EMAIL;
  const notification = await prisma.notification.create({
    data: {
      orderId: report.orderId,
      createdById: req.user?.id ?? null,
      recipientEmail: isEmail ? body.recipient : null,
      recipientPhone: isEmail ? null : body.recipient,
      type: NotificationType.RESULT_RELEASED,
      title: 'Result report ready',
      body: message,
      isRead: false,
      deliveryLogs: {
        create: {
          reportId: report.id,
          performedById: req.user?.id ?? null,
          channel,
          status: DeliveryStatus.SENT,
          target: body.recipient,
          safeMessage: true,
          deliveredAt: new Date()
        }
      }
    },
    include: { deliveryLogs: true }
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SAFE_RESULT_NOTICE_SENT',
    module: 'Reception',
    entityType: 'Report',
    entityId: report.id,
    afterData: notification,
    details: { channel, target: body.recipient, safeMessage: true }
  });

  return { reportId: report.id, notification };
}

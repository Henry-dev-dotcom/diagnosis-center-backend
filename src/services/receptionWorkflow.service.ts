import { prisma } from './facilityScope.service';
import {
  RECEPTION_NOTIFICATION_TYPES,
  RECEPTION_ORDER_STATUS,
  RECEPTION_REQUEST_TYPE,
  RECEPTION_SOURCE,
} from '../constants/receptionWorkflow.constants';
import type {
  CreateReceptionDiagnosticRequestParams,
  CreateWalkInPatientParams,
  ReceptionSearchQuery,
} from '../types/receptionWorkflow.types';
import {
  AnyRecord,
  buildDateRange,
  httpError,
  makeReceptionCode,
  matchesOrderSearch,
  matchesPatientSearch,
  normalizeItems,
  normalizePatientName,
  normalizePriority,
  normalizeSearch,
  safeString,
  toSafeSkip,
  toSafeTake,
} from '../utils/receptionWorkflow.utils';

type ModelDelegate = Record<string, any> | undefined;

function model(name: string): ModelDelegate {
  return (prisma as any)[name];
}

function firstModel(names: string[]): ModelDelegate {
  for (const name of names) {
    const target = model(name);
    if (target) return target;
  }
  return undefined;
}

function requiredModel(names: string[], label: string): any {
  const target = firstModel(names);
  if (!target) throw httpError(`${label} model is not available in Prisma.`, 500);
  return target;
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = firstModel(['auditLog', 'auditLogs']);
  if (!auditLog?.create) return;
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      userId: data.actorId || data.userId,
      action: data.action,
      entity: data.entity || data.module || data.resourceType,
      entityId: data.entityId || data.resourceId,
      metadata: data.metadata || data.details,
    },
    {
      userId: data.actorId || data.userId,
      action: data.action,
      details: JSON.stringify(data.metadata || data),
    },
  ];

  for (const payload of attempts) {
    try {
      await auditLog.create({ data: payload });
      return;
    } catch (_error) {
      continue;
    }
  }
}

async function safeNotification(data: AnyRecord) {
  const notification = firstModel(['notification', 'notifications']);
  if (!notification?.create) return;
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      userId: data.userId || null,
      role: data.role || null,
      title: data.title,
      message: data.message,
      type: data.type,
      status: 'UNREAD',
      metadata: data.metadata,
      createdAt: new Date(),
    },
    {
      userId: data.userId || null,
      title: data.title,
      message: data.message,
      type: data.type,
      isRead: false,
    },
  ];

  for (const payload of attempts) {
    try {
      await notification.create({ data: payload });
      return;
    } catch (_error) {
      continue;
    }
  }
}

async function createOrderItems(orderId: string, facilityId: string, items: AnyRecord[]) {
  const orderItem = firstModel(['orderItem', 'orderItems']);
  if (!orderItem?.create && !orderItem?.createMany) return [];

  const normalized = items.map((item) => ({
    ...item,
    facilityId,
    orderId,
  }));

  if (orderItem.createMany) {
    try {
      await orderItem.createMany({ data: normalized });
      return normalized;
    } catch (_error) {
      // Fall back to individual create attempts below.
    }
  }

  const created: AnyRecord[] = [];
  for (const item of normalized) {
    const attempts = [
      item,
      {
        facilityId,
        orderId,
        serviceType: item.serviceType,
        serviceCode: item.serviceCode,
        serviceName: item.serviceName,
        type: item.type,
        category: item.category,
        quantity: item.quantity,
        price: item.price,
      },
      {
        orderId,
        name: item.serviceName || item.name,
        type: item.serviceType || item.type,
        quantity: item.quantity || 1,
      },
    ];

    for (const data of attempts) {
      try {
        const record = await orderItem.create({ data });
        created.push(record);
        break;
      } catch (_error) {
        continue;
      }
    }
  }

  return created;
}

async function findPatient(facilityId: string, patientId: string) {
  const patient = requiredModel(['patient', 'patients'], 'Patient');
  const whereAttempts = [
    { id: patientId, facilityId },
    { patientCode: patientId, facilityId },
    { id: patientId },
  ];

  for (const where of whereAttempts) {
    try {
      const record = await patient.findFirst({ where });
      if (record) return record;
    } catch (_error) {
      continue;
    }
  }

  throw httpError('Patient was not found for this facility.', 404);
}

async function createPatientWithFallback(facilityId: string, createdById: string, patientData: AnyRecord) {
  const patient = requiredModel(['patient', 'patients'], 'Patient');
  const fullName = normalizePatientName(patientData);
  const patientCode = patientData.patientCode || patientData.patientId || makeReceptionCode('WALKIN');

  const attempts = [
    {
      ...patientData,
      facilityId,
      patientCode,
      fullName,
      name: patientData.name || fullName,
      isWalkIn: true,
      source: RECEPTION_SOURCE.WALK_IN,
      registeredById: createdById,
      walkInRegisteredById: createdById,
      walkInRegisteredAt: new Date(),
      createdById,
      metadata: {
        ...(patientData.metadata || {}),
        source: RECEPTION_SOURCE.WALK_IN,
        registeredById: createdById,
      },
    },
    {
      facilityId,
      patientCode,
      fullName,
      name: patientData.name || fullName,
      phone: patientData.phone || null,
      email: patientData.email || null,
      gender: patientData.gender || null,
      dateOfBirth: patientData.dateOfBirth ? new Date(patientData.dateOfBirth) : null,
      isWalkIn: true,
      createdById,
    },
    {
      facilityId,
      patientCode,
      fullName,
      phone: patientData.phone || null,
      gender: patientData.gender || null,
    },
    {
      name: fullName,
      phone: patientData.phone || null,
      gender: patientData.gender || null,
    },
  ];

  for (const data of attempts) {
    try {
      return await patient.create({ data });
    } catch (_error) {
      continue;
    }
  }

  throw httpError('Unable to create walk-in patient. Check required Patient fields in the live schema.', 500);
}

async function createOrderWithFallback(params: CreateReceptionDiagnosticRequestParams, patientRecord: AnyRecord) {
  const order = requiredModel(['order', 'orders'], 'Order');
  const priority = normalizePriority(params.priority);
  const items = normalizeItems(params.items || [], params.requestType).map((item) => ({ ...item, priority, facilityId: params.facilityId }));
  const orderNumber = makeReceptionCode(params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'LABREQ' : 'SCANREQ');
  const base = {
    facilityId: params.facilityId,
    patientId: patientRecord.id || params.patientId,
    clinicianId: params.clinicianId || null,
    doctorId: params.clinicianId || null,
    requestedById: params.requestedById,
    requestedByRole: 'RECEPTIONIST',
    source: RECEPTION_SOURCE.WALK_IN,
    requestType: params.requestType,
    department: params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'LABORATORY' : 'IMAGING',
    priority,
    urgency: priority,
    status: RECEPTION_ORDER_STATUS.QUEUED,
    clinicalNotes: params.clinicalNotes || null,
    notes: params.clinicalNotes || null,
    paymentStatus: params.paymentStatus || null,
    invoiceId: params.invoiceId || null,
    orderNumber,
    orderCode: orderNumber,
    metadata: {
      source: RECEPTION_SOURCE.WALK_IN,
      requestType: params.requestType,
      priority,
      clinicalNotes: params.clinicalNotes || null,
      requestedById: params.requestedById,
      items,
    },
  };

  const attempts = [
    { ...base, items: { create: items } },
    { ...base, orderItems: { create: items } },
    base,
    {
      facilityId: params.facilityId,
      patientId: patientRecord.id || params.patientId,
      clinicianId: params.clinicianId || null,
      requestType: params.requestType,
      priority,
      status: RECEPTION_ORDER_STATUS.QUEUED,
      orderNumber,
      clinicalNotes: params.clinicalNotes || null,
      metadata: base.metadata,
    },
    {
      patientId: patientRecord.id || params.patientId,
      status: RECEPTION_ORDER_STATUS.QUEUED,
      orderNumber,
      metadata: base.metadata,
    },
  ];

  let createdOrder: AnyRecord | null = null;
  for (const data of attempts) {
    try {
      createdOrder = await order.create({ data, include: { items: true, orderItems: true, patient: true } });
      break;
    } catch (_error) {
      try {
        createdOrder = await order.create({ data });
        break;
      } catch (_inner) {
        continue;
      }
    }
  }

  if (!createdOrder) {
    throw httpError('Unable to create diagnostic request order. Check required Order fields in the live schema.', 500);
  }

  if (!createdOrder.items && !createdOrder.orderItems) {
    const createdItems = await createOrderItems(createdOrder.id, params.facilityId, items);
    createdOrder.items = createdItems;
  }

  return createdOrder;
}

export class ReceptionWorkflowService {
  static async createWalkInPatient(params: CreateWalkInPatientParams) {
    const patient = await createPatientWithFallback(params.facilityId, params.createdById, params.patient || {});

    await safeNotification({
      facilityId: params.facilityId,
      role: 'RECEPTIONIST',
      title: 'Walk-in patient registered',
      message: `${normalizePatientName(patient)} has been registered as a walk-in patient.`,
      type: RECEPTION_NOTIFICATION_TYPES.WALK_IN_REGISTERED,
      metadata: { patientId: patient.id, source: RECEPTION_SOURCE.WALK_IN },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.createdById,
      action: 'WALK_IN_PATIENT_CREATED',
      entity: 'Patient',
      entityId: patient.id,
      metadata: { patientId: patient.id, source: RECEPTION_SOURCE.WALK_IN },
    });

    return patient;
  }

  static async listWalkInPatients(facilityId: string, query: ReceptionSearchQuery = {}) {
    const patient = requiredModel(['patient', 'patients'], 'Patient');
    const q = normalizeSearch(query.q);
    const take = toSafeTake(query.take);
    const skip = toSafeSkip(query.skip);
    const dateRange = buildDateRange(query.from, query.to);
    const whereAttempts = [
      { facilityId, isWalkIn: true, ...(dateRange ? { createdAt: dateRange } : {}) },
      { facilityId, source: RECEPTION_SOURCE.WALK_IN, ...(dateRange ? { createdAt: dateRange } : {}) },
      { facilityId, ...(dateRange ? { createdAt: dateRange } : {}) },
      { ...(dateRange ? { createdAt: dateRange } : {}) },
    ];

    let records: AnyRecord[] = [];
    for (const where of whereAttempts) {
      try {
        records = await patient.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip });
        break;
      } catch (_error) {
        continue;
      }
    }

    return records.filter((record) => matchesPatientSearch(record, q));
  }

  static async getWalkInPatient(facilityId: string, patientId: string) {
    return findPatient(facilityId, patientId);
  }

  static async createDiagnosticRequest(params: CreateReceptionDiagnosticRequestParams) {
    if (![RECEPTION_REQUEST_TYPE.LAB, RECEPTION_REQUEST_TYPE.SCAN].includes(params.requestType as any)) {
      throw httpError('Request type must be LAB or SCAN.');
    }
    if (!params.items?.length) {
      throw httpError(params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'Select at least one laboratory test.' : 'Select at least one scan.');
    }

    const patient = await findPatient(params.facilityId, params.patientId);
    const order = await createOrderWithFallback(params, patient);
    const targetRole = params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'LAB_STAFF' : 'SCAN_STAFF';
    const targetQueue = params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'Lab Queue' : 'Scan Queue';
    const type = params.requestType === RECEPTION_REQUEST_TYPE.LAB
      ? RECEPTION_NOTIFICATION_TYPES.WALK_IN_LAB_REQUEST_CREATED
      : RECEPTION_NOTIFICATION_TYPES.WALK_IN_SCAN_REQUEST_CREATED;

    await safeNotification({
      facilityId: params.facilityId,
      role: targetRole,
      title: params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'New walk-in lab request' : 'New walk-in scan request',
      message: `${normalizePatientName(patient)} has a new ${params.requestType.toLowerCase()} request routed directly to ${targetQueue}.`,
      type,
      orderId: order.id,
      patientId: patient.id,
      status: 'UNREAD',
      metadata: {
        source: RECEPTION_SOURCE.WALK_IN,
        requestType: params.requestType,
        priority: normalizePriority(params.priority),
        routedTo: targetQueue,
      },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.requestedById,
      action: params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'RECEPTION_WALK_IN_LAB_REQUEST_CREATED' : 'RECEPTION_WALK_IN_SCAN_REQUEST_CREATED',
      entity: 'Order',
      entityId: order.id,
      metadata: {
        patientId: patient.id,
        requestType: params.requestType,
        itemCount: params.items.length,
        routedDirectlyToDiagnosticQueue: true,
      },
    });

    return {
      order,
      patient,
      routedTo: params.requestType === RECEPTION_REQUEST_TYPE.LAB ? 'LAB_QUEUE' : 'SCAN_QUEUE',
      receptionPushRequired: false,
    };
  }

  static async listPatientRequests(facilityId: string, patientId: string, query: ReceptionSearchQuery = {}) {
    await findPatient(facilityId, patientId);
    const order = requiredModel(['order', 'orders'], 'Order');
    const q = normalizeSearch(query.q);
    const take = toSafeTake(query.take);
    const skip = toSafeSkip(query.skip);
    const dateRange = buildDateRange(query.from, query.to);
    const requestType = safeString(query.requestType).toUpperCase();
    const priority = safeString(query.priority).toUpperCase();
    const status = safeString(query.status).toUpperCase();

    const baseWhere: AnyRecord = {
      facilityId,
      patientId,
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(requestType ? { requestType } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
    };

    const includeAttempts = [
      { items: true, orderItems: true, patient: true },
      { items: true, patient: true },
      { orderItems: true, patient: true },
      { patient: true },
      undefined,
    ];

    let records: AnyRecord[] = [];
    for (const include of includeAttempts) {
      try {
        records = await order.findMany({
          where: baseWhere,
          ...(include ? { include } : {}),
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        });
        break;
      } catch (_error) {
        try {
          records = await order.findMany({
            where: { patientId },
            ...(include ? { include } : {}),
            orderBy: { createdAt: 'desc' },
            take,
            skip,
          });
          break;
        } catch (_inner) {
          continue;
        }
      }
    }

    return records.filter((record) => matchesOrderSearch(record, q));
  }

  static async listReferenceResults(facilityId: string, query: ReceptionSearchQuery = {}) {
    const inbox = firstModel(['resultDeliveryInbox']);
    const result = firstModel(['result', 'results']);
    const q = normalizeSearch(query.q);
    const take = toSafeTake(query.take);
    const skip = toSafeSkip(query.skip);
    const dateRange = buildDateRange(query.from, query.to);
    const status = safeString(query.status).toUpperCase();

    if (inbox?.findMany) {
      const includeAttempts = [
        { patient: true, order: true, documents: true },
        { patient: true, order: true },
        undefined,
      ];
      for (const include of includeAttempts) {
        try {
          const records = await inbox.findMany({
            where: {
              facilityId,
              ...(status ? { status } : {}),
              ...(dateRange ? { deliveredAt: dateRange } : {}),
            },
            ...(include ? { include } : {}),
            orderBy: { deliveredAt: 'desc' },
            take,
            skip,
          });
          return records.filter((record: AnyRecord) => matchesOrderSearch(record, q));
        } catch (_error) {
          continue;
        }
      }
    }

    if (!result?.findMany) return [];
    const records = await result.findMany({
      where: { facilityId, ...(dateRange ? { createdAt: dateRange } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }).catch(() => []);
    return records.filter((record: AnyRecord) => matchesOrderSearch(record, q));
  }
}

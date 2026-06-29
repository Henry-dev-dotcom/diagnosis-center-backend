import { prisma } from './facilityScope.service';
import {
  CLINICIAN_RESULT_DELIVERY_STATUS,
  CLINICIAN_RESULT_NOTIFICATION_TYPES,
  CLINICIAN_RESULT_SOURCE,
} from '../constants/clinicianResultDelivery.constants';
import type {
  ClinicianInboxQuery,
  DeliverResultToClinicianParams,
  ResultArchiveStateParams,
  ResultReadStateParams,
} from '../types/clinicianResultDelivery.types';
import {
  AnyRecord,
  buildDateRange,
  buildResultTitle,
  getClinicianDisplayName,
  httpError,
  matchesSearch,
  normalizeSearch,
  toSafeSkip,
  toSafeTake,
} from '../utils/clinicianResultDelivery.utils';

type ModelDelegate = Record<string, any> | undefined;

function model(name: string): ModelDelegate {
  return (prisma as any)[name];
}

function requiredModel(name: string): any {
  const target = model(name);
  if (!target) throw httpError(`${name} model is not available in Prisma. Apply Phase 2 schema first.`, 500);
  return target;
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = model('auditLog');
  if (!auditLog?.create) return;
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      userId: data.actorId || data.userId,
      action: data.action,
      entity: data.entity || data.resourceType,
      entityId: data.entityId || data.resourceId,
      metadata: data.metadata,
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
  const notification = model('notification');
  if (!notification?.create) return;
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type,
      status: 'UNREAD',
      metadata: data.metadata,
    },
    {
      userId: data.userId,
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

async function findWithIncludes(modelName: string, where: AnyRecord) {
  const target = requiredModel(modelName);
  const includeOptions = [
    { patient: true, order: true, clinician: true, documents: true },
    { patient: true, order: true, clinician: true },
    { patient: true, order: true },
    { patient: true },
    undefined,
  ];

  for (const include of includeOptions) {
    try {
      const record = await target.findFirst({ where, ...(include ? { include } : {}) });
      if (record) return record;
    } catch (_error) {
      continue;
    }
  }
  return null;
}

async function findPatient(facilityId: string, patientId?: string | null) {
  if (!patientId) return null;
  const patient = model('patient');
  if (!patient?.findFirst) return null;
  try {
    return await patient.findFirst({ where: { id: patientId, facilityId } });
  } catch (_error) {
    try {
      return await patient.findFirst({ where: { id: patientId } });
    } catch (__error) {
      return null;
    }
  }
}

async function findClinician(facilityId: string, clinicianId?: string | null) {
  if (!clinicianId) return null;
  const user = model('user');
  if (!user?.findFirst) return null;
  try {
    return await user.findFirst({ where: { id: clinicianId, facilityId } });
  } catch (_error) {
    try {
      return await user.findFirst({ where: { id: clinicianId } });
    } catch (__error) {
      return null;
    }
  }
}

async function fetchLabPayload(facilityId: string, acceptedSampleId?: string | null) {
  if (!acceptedSampleId) return null;
  const sample = await findWithIncludes('labAcceptedSample', { id: acceptedSampleId, facilityId });
  if (!sample) return null;

  let tests: AnyRecord[] = [];
  const sampleTest = model('labAcceptedSampleTest');
  if (sampleTest?.findMany) {
    try {
      tests = await sampleTest.findMany({
        where: { acceptedSampleId, facilityId },
        include: { documents: true },
        orderBy: { createdAt: 'asc' },
      });
    } catch (_error) {
      tests = await sampleTest.findMany({ where: { acceptedSampleId, facilityId } }).catch(() => []);
    }
  }

  return { ...sample, tests };
}

async function fetchScanPayload(facilityId: string, scanAcceptedRequestId?: string | null) {
  if (!scanAcceptedRequestId) return null;
  const scan = await findWithIncludes('scanAcceptedRequest', { id: scanAcceptedRequestId, facilityId });
  if (!scan) return null;

  let documents: AnyRecord[] = [];
  const scanDoc = model('scanResultDocument');
  if (scanDoc?.findMany) {
    documents = await scanDoc.findMany({ where: { scanAcceptedRequestId, facilityId }, orderBy: { createdAt: 'desc' } }).catch(() => []);
  }

  return { ...scan, documents };
}

async function createInboxRecord(data: AnyRecord) {
  const inbox = requiredModel('resultDeliveryInbox');
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      clinicianId: data.clinicianId,
      patientId: data.patientId,
      orderId: data.orderId,
      resultId: data.resultId,
      source: data.source,
      status: data.status,
      priority: data.priority,
      title: data.title,
      summary: data.summary,
      payload: data.payload,
      sentById: data.sentById,
      sentAt: data.sentAt,
    },
    {
      facilityId: data.facilityId,
      userId: data.clinicianId,
      patientId: data.patientId,
      orderId: data.orderId,
      resultId: data.resultId,
      type: data.source,
      status: data.status,
      title: data.title,
      body: data.summary,
      metadata: data.payload,
    },
  ];

  for (const payload of attempts) {
    try {
      return await inbox.create({ data: payload });
    } catch (_error) {
      continue;
    }
  }

  throw httpError('Unable to create clinician result inbox record. Check ResultDeliveryInbox schema fields.', 500);
}

async function updateResultArchive(params: DeliverResultToClinicianParams, inboxId: string, payload: AnyRecord | null) {
  const result = model('result');
  if (!result?.update && !result?.create) return null;

  if (params.resultId && result.update) {
    try {
      return await result.update({
        where: { id: params.resultId },
        data: {
          facilityId: params.facilityId,
          clinicianId: params.clinicianId,
          patientId: params.patientId || undefined,
          orderId: params.orderId || undefined,
          status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT,
          sentToClinicianAt: new Date(),
          metadata: { inboxId, source: params.source, payload },
        },
      });
    } catch (_error) {
      // Legacy result fields may differ. Continue with safe fallback below.
    }
  }

  if (!result.create) return null;
  const attempts = [
    {
      facilityId: params.facilityId,
      patientId: params.patientId,
      orderId: params.orderId,
      clinicianId: params.clinicianId,
      source: params.source,
      status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT,
      title: params.title,
      summary: params.summary,
      metadata: { inboxId, payload },
      createdById: params.deliveredById,
      sentToClinicianAt: new Date(),
    },
    {
      facilityId: params.facilityId,
      patientId: params.patientId,
      orderId: params.orderId,
      doctorId: params.clinicianId,
      status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT,
      resultType: params.source,
      notes: params.summary,
      data: { inboxId, payload },
    },
  ];

  for (const data of attempts) {
    try {
      return await result.create({ data });
    } catch (_error) {
      continue;
    }
  }

  return null;
}

async function updateSourceWorkflowAfterDelivery(params: DeliverResultToClinicianParams) {
  if (params.source === CLINICIAN_RESULT_SOURCE.LAB && params.acceptedSampleId) {
    const sample = model('labAcceptedSample');
    if (sample?.update) {
      await sample.update({
        where: { id: params.acceptedSampleId },
        data: { status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT, sentToClinicianAt: new Date() },
      }).catch(() => undefined);
    }
  }

  if (params.source === CLINICIAN_RESULT_SOURCE.SCAN && params.scanAcceptedRequestId) {
    const scan = model('scanAcceptedRequest');
    if (scan?.update) {
      await scan.update({
        where: { id: params.scanAcceptedRequestId },
        data: { status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT, sentToClinicianAt: new Date() },
      }).catch(() => undefined);
    }
  }

  if (params.orderId) {
    const order = model('order');
    if (order?.update) {
      await order.update({
        where: { id: params.orderId },
        data: { status: 'SENT_TO_CLINICIAN' },
      }).catch(() => undefined);
    }
  }
}

export class ClinicianResultDeliveryService {
  static async deliverToClinician(params: DeliverResultToClinicianParams) {
    if (!params.facilityId) throw httpError('Facility is required.', 400);
    if (!params.clinicianId) throw httpError('Clinician recipient is required.', 400);
    if (!params.deliveredById) throw httpError('Delivering staff user is required.', 400);

    const patient = await findPatient(params.facilityId, params.patientId || null);
    const clinician = await findClinician(params.facilityId, params.clinicianId);
    const labPayload = params.source === CLINICIAN_RESULT_SOURCE.LAB ? await fetchLabPayload(params.facilityId, params.acceptedSampleId) : null;
    const scanPayload = params.source === CLINICIAN_RESULT_SOURCE.SCAN ? await fetchScanPayload(params.facilityId, params.scanAcceptedRequestId) : null;
    const payload = {
      ...(params.payload || {}),
      ...(labPayload ? { lab: labPayload } : {}),
      ...(scanPayload ? { scan: scanPayload } : {}),
    };

    const title = params.title || buildResultTitle(params.source, patient);
    const summary = params.summary || `${params.source === 'SCAN' ? 'Imaging' : 'Laboratory'} result has been sent to ${getClinicianDisplayName(clinician)}.`;

    const existing = await model('resultDeliveryInbox')?.findFirst?.({
      where: {
        facilityId: params.facilityId,
        clinicianId: params.clinicianId,
        ...(params.acceptedSampleId ? { acceptedSampleId: params.acceptedSampleId } : {}),
        ...(params.scanAcceptedRequestId ? { scanAcceptedRequestId: params.scanAcceptedRequestId } : {}),
        ...(params.resultId ? { resultId: params.resultId } : {}),
      },
    }).catch(() => null);
    if (existing) throw httpError('This result has already been sent to the clinician.', 409);

    const inboxRecord = await createInboxRecord({
      facilityId: params.facilityId,
      clinicianId: params.clinicianId,
      patientId: params.patientId || null,
      orderId: params.orderId || null,
      acceptedSampleId: params.acceptedSampleId || null,
      scanAcceptedRequestId: params.scanAcceptedRequestId || null,
      resultId: params.resultId || null,
      source: params.source,
      priority: params.priority || payload?.priority || 'ROUTINE',
      status: CLINICIAN_RESULT_DELIVERY_STATUS.SENT,
      title,
      summary,
      payload,
      sentById: params.deliveredById,
      sentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const archivedResult = await updateResultArchive(params, inboxRecord.id, payload);
    await updateSourceWorkflowAfterDelivery({ ...params, resultId: params.resultId || archivedResult?.id || null });

    await safeNotification({
      facilityId: params.facilityId,
      userId: params.clinicianId,
      title: 'New diagnostic result',
      message: summary,
      type: CLINICIAN_RESULT_NOTIFICATION_TYPES.RESULT_SENT_TO_CLINICIAN,
      metadata: {
        inboxId: inboxRecord.id,
        resultId: params.resultId || archivedResult?.id || null,
        source: params.source,
        orderId: params.orderId,
        patientId: params.patientId,
      },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.deliveredById,
      action: 'RESULT_SENT_TO_CLINICIAN',
      entity: 'ResultDeliveryInbox',
      entityId: inboxRecord.id,
      metadata: { clinicianId: params.clinicianId, source: params.source, orderId: params.orderId, patientId: params.patientId },
    });

    return { inbox: inboxRecord, result: archivedResult, payload };
  }

  static async getClinicianInbox(facilityId: string, clinicianId: string, query: ClinicianInboxQuery = {}) {
    if (!facilityId) throw httpError('Facility is required.', 400);
    if (!clinicianId) throw httpError('Clinician user is required.', 400);

    const inbox = requiredModel('resultDeliveryInbox');
    const take = toSafeTake(query.take);
    const skip = toSafeSkip(query.skip);
    const q = normalizeSearch(query.q);
    const sentAt = buildDateRange(query.from, query.to);
    const where: AnyRecord = {
      facilityId,
      clinicianId,
      ...(query.status ? { status: String(query.status) } : {}),
      ...(query.source ? { source: String(query.source) } : {}),
      ...(query.priority ? { priority: String(query.priority) } : {}),
      ...(query.patientId ? { patientId: String(query.patientId) } : {}),
      ...(query.orderId ? { orderId: String(query.orderId) } : {}),
      ...(sentAt ? { sentAt } : {}),
    };

    const includeOptions = [
      { patient: true, order: true, result: true },
      { patient: true, order: true },
      { patient: true },
      undefined,
    ];

    let records: AnyRecord[] = [];
    for (const include of includeOptions) {
      try {
        records = await inbox.findMany({ where, ...(include ? { include } : {}), orderBy: { sentAt: 'desc' }, take, skip });
        break;
      } catch (_error) {
        continue;
      }
    }

    const filtered = q ? records.filter((record) => matchesSearch(record, q)) : records;
    const unread = filtered.filter((record) => !['READ', 'ARCHIVED'].includes(String(record.status))).length;

    return {
      summary: {
        total: filtered.length,
        unread,
        lab: filtered.filter((record) => record.source === 'LAB').length,
        scan: filtered.filter((record) => record.source === 'SCAN').length,
        urgent: filtered.filter((record) => ['URGENT', 'STAT'].includes(String(record.priority))).length,
      },
      results: filtered,
    };
  }

  static async getClinicianResultById(facilityId: string, inboxId: string, clinicianId: string) {
    const inbox = requiredModel('resultDeliveryInbox');
    const includeOptions = [
      { patient: true, order: true, result: true },
      { patient: true, order: true },
      { patient: true },
      undefined,
    ];

    for (const include of includeOptions) {
      try {
        const record = await inbox.findFirst({
          where: { id: inboxId, facilityId, clinicianId },
          ...(include ? { include } : {}),
        });
        if (record) return record;
      } catch (_error) {
        continue;
      }
    }

    throw httpError('Result was not found in this clinician inbox.', 404);
  }

  static async markRead(params: ResultReadStateParams) {
    const inbox = requiredModel('resultDeliveryInbox');
    const existing = await this.getClinicianResultById(params.facilityId, params.inboxId, params.clinicianId);

    const data = {
      status: CLINICIAN_RESULT_DELIVERY_STATUS.READ,
      readAt: existing.readAt || new Date(),
      readById: params.actorId,
      updatedAt: new Date(),
    };

    let updated = existing;
    for (const updateData of [data, { status: CLINICIAN_RESULT_DELIVERY_STATUS.READ, readAt: data.readAt }, { isRead: true, readAt: data.readAt }]) {
      try {
        updated = await inbox.update({ where: { id: params.inboxId }, data: updateData });
        break;
      } catch (_error) {
        continue;
      }
    }

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'CLINICIAN_RESULT_READ',
      entity: 'ResultDeliveryInbox',
      entityId: params.inboxId,
      metadata: { clinicianId: params.clinicianId },
    });

    return updated;
  }

  static async setArchived(params: ResultArchiveStateParams) {
    const inbox = requiredModel('resultDeliveryInbox');
    await this.getClinicianResultById(params.facilityId, params.inboxId, params.clinicianId);
    const archived = params.archived !== false;
    const status = archived ? CLINICIAN_RESULT_DELIVERY_STATUS.ARCHIVED : CLINICIAN_RESULT_DELIVERY_STATUS.READ;

    let updated: AnyRecord | null = null;
    for (const data of [
      { status, archivedAt: archived ? new Date() : null, archivedById: archived ? params.actorId : null, updatedAt: new Date() },
      { status, isArchived: archived, archivedAt: archived ? new Date() : null },
      { status },
    ]) {
      try {
        updated = await inbox.update({ where: { id: params.inboxId }, data });
        break;
      } catch (_error) {
        continue;
      }
    }

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: archived ? 'CLINICIAN_RESULT_ARCHIVED' : 'CLINICIAN_RESULT_UNARCHIVED',
      entity: 'ResultDeliveryInbox',
      entityId: params.inboxId,
      metadata: { clinicianId: params.clinicianId },
    });

    return updated;
  }

  static async getResultDocuments(facilityId: string, inboxId: string, clinicianId: string) {
    const record = await this.getClinicianResultById(facilityId, inboxId, clinicianId);
    const labDocs = record.acceptedSampleId && model('labTestResultDocument')?.findMany
      ? await model('labTestResultDocument').findMany({ where: { facilityId, acceptedSampleId: record.acceptedSampleId }, orderBy: { uploadedAt: 'desc' } }).catch(() => [])
      : [];
    const scanDocs = record.scanAcceptedRequestId && model('scanResultDocument')?.findMany
      ? await model('scanResultDocument').findMany({ where: { facilityId, scanAcceptedRequestId: record.scanAcceptedRequestId }, orderBy: { uploadedAt: 'desc' } }).catch(() => [])
      : [];
    return { labDocuments: labDocs, scanDocuments: scanDocs, documents: [...labDocs, ...scanDocs] };
  }
}

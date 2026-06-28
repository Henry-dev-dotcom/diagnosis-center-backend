import { prisma } from './facilityScope.service';
import { ORDER_STATUS, RESULT_DELIVERY_STATUS } from '../constants/diagnosticWorkflow.constants';
import {
  SCAN_AUDIT_EVENTS,
  SCAN_NOTIFICATION_EVENTS,
  SCAN_QUEUE_STATUS,
  SCAN_RESULT_STATUS,
} from '../constants/scanWorkflow.constants';
import type {
  AcceptScanRequestDTO,
  AnyRecord,
  RequestedScanDTO,
  SaveScanResultDTO,
  ScanDocumentMetadataDTO,
  ScanQueueSearchOptions,
} from '../types/scanWorkflow.types';
import {
  badRequest,
  buildJsonMetadata,
  buildOrderSearchValues,
  conflict,
  createFileChecksum,
  makeWorkflowCode,
  normalizeSearch,
  notFound,
  parseArray,
  resolveOrderClinicianId,
  resolveOrderPatientText,
  safeText,
  stringifyForSearch,
  toSafeSkip,
  toSafeTake,
  uniqueScanKey,
} from '../utils/scanWorkflow.utils';

function model(name: string): any {
  return (prisma as any)[name];
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = model('auditLog');
  if (!auditLog?.create) return;
  try {
    await auditLog.create({ data });
  } catch (_error) {
    // Legacy audit tables may not have identical columns. Never fail scan workflow because audit logging failed.
  }
}

async function safeNotification(data: AnyRecord) {
  const notification = model('notification');
  if (!notification?.create) return;
  try {
    await notification.create({ data });
  } catch (_error) {
    // Legacy notification tables may not have identical columns. Never fail scan workflow because notification creation failed.
  }
}

async function safeUpdateOrderStatus(orderId: string, facilityId: string, status: string) {
  const order = model('order');
  if (!order?.updateMany) return;
  try {
    await order.updateMany({ where: { id: orderId, facilityId }, data: { status } });
  } catch (_error) {
    // Keep compatibility with installations that use different order status enum values.
  }
}

function getOrderItems(order: AnyRecord): AnyRecord[] {
  return parseArray(order.items || order.orderItems || order.OrderItems || order.tests || order.services);
}

function isScanItem(item: AnyRecord): boolean {
  const text = `${item.department || ''} ${item.type || ''} ${item.serviceType || ''} ${item.category || ''} ${item.name || ''} ${item.serviceName || ''} ${item.modality || ''}`.toLowerCase();
  return (
    text.includes('scan') ||
    text.includes('imaging') ||
    text.includes('radiology') ||
    text.includes('x-ray') ||
    text.includes('xray') ||
    text.includes('ultrasound') ||
    text.includes('mri') ||
    text.includes('ct') ||
    text.includes('ecg')
  );
}

function normalizeRequestedScan(item: AnyRecord): RequestedScanDTO {
  return {
    orderItemId: item.orderItemId || item.id || null,
    scanId: item.scanId || item.catalogId || item.serviceId || item.id || null,
    scanCode: item.scanCode || item.code || item.serviceCode || item.itemCode || null,
    scanName: item.scanName || item.name || item.serviceName || item.itemName || item.label || 'Imaging Request',
    modality: item.modality || item.type || item.category || null,
    bodyPart: item.bodyPart || item.anatomy || item.region || null,
    clinicalQuestion: item.clinicalQuestion || item.clinicalNotes || item.notes || null,
    price: item.price || item.amount || null,
    metadata: buildJsonMetadata(item),
  };
}

function readAcceptedScans(scan: AnyRecord): RequestedScanDTO[] {
  return parseArray<RequestedScanDTO>(scan.selectedScans || scan.requestedScans || scan.scans || scan.metadata?.selectedScans);
}

async function findOrderWithItems(facilityId: string, orderId: string): Promise<AnyRecord> {
  const order = model('order');
  if (!order?.findFirst) throw badRequest('Order model is not available in Prisma.');

  const includeAttempts = [
    { items: true, patient: true, clinician: true, doctor: true, hospital: true },
    { orderItems: true, patient: true, clinician: true, doctor: true, hospital: true },
    { items: true, patient: true, doctor: true, hospital: true },
    { orderItems: true, patient: true, doctor: true, hospital: true },
    { patient: true, clinician: true, doctor: true },
    { patient: true },
    undefined,
  ];

  for (const include of includeAttempts) {
    try {
      const record = await order.findFirst({
        where: { id: orderId, facilityId },
        ...(include ? { include } : {}),
      });
      if (record) return record;
    } catch (_error) {
      continue;
    }
  }

  throw notFound('The requested scan order was not found for this facility.');
}

async function findFacilityOrders(facilityId: string, options: ScanQueueSearchOptions = {}): Promise<AnyRecord[]> {
  const order = model('order');
  if (!order?.findMany) throw badRequest('Order model is not available in Prisma.');

  const take = toSafeTake(options.take);
  const skip = toSafeSkip(options.skip);
  const statusFilter = safeText(options.status);
  const priorityFilter = safeText(options.priority);

  const where: AnyRecord = { facilityId };
  if (statusFilter) where.status = statusFilter;
  if (priorityFilter) where.OR = [{ priority: priorityFilter }, { urgency: priorityFilter }];

  const includeAttempts = [
    { items: true, patient: true, clinician: true, doctor: true, hospital: true },
    { orderItems: true, patient: true, clinician: true, doctor: true, hospital: true },
    { items: true, patient: true, doctor: true, hospital: true },
    { orderItems: true, patient: true, doctor: true, hospital: true },
    { patient: true, clinician: true, doctor: true },
    { patient: true },
    undefined,
  ];

  for (const include of includeAttempts) {
    try {
      return await order.findMany({
        where,
        ...(include ? { include } : {}),
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });
    } catch (_error) {
      continue;
    }
  }

  return [];
}

function validateSelectedScans(requestedScans: RequestedScanDTO[], selectedScans: RequestedScanDTO[]) {
  if (!selectedScans.length) throw badRequest('At least one scan must be selected before accepting the request.');

  const requestedKeys = new Set(requestedScans.map(uniqueScanKey));
  const seen = new Set<string>();

  selectedScans.forEach((selected) => {
    const key = uniqueScanKey(selected);
    if (!requestedKeys.has(key)) {
      throw badRequest(`The scan "${selected.scanName || key}" does not belong to the original request.`);
    }
    if (seen.has(key)) {
      throw badRequest(`Duplicate scan selection detected for "${selected.scanName || key}".`);
    }
    seen.add(key);
  });
}

function normalizeSelectedScans(requestedScans: RequestedScanDTO[], selectedScans?: RequestedScanDTO[]): RequestedScanDTO[] {
  const raw = selectedScans?.length ? selectedScans : requestedScans;
  const byKey = new Map(requestedScans.map((scan) => [uniqueScanKey(scan), scan]));
  const normalized = raw.map((scan) => {
    const source = byKey.get(uniqueScanKey(scan)) || scan;
    return { ...source, ...scan };
  });
  validateSelectedScans(requestedScans, normalized);
  return normalized;
}

export class ScanWorkflowService {
  static getRequestedScans(order: AnyRecord): RequestedScanDTO[] {
    const normalized = getOrderItems(order).filter(isScanItem).map(normalizeRequestedScan);
    const seen = new Set<string>();
    return normalized.filter((scan) => {
      const key = uniqueScanKey(scan);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  static async getQueue(facilityId: string, options: ScanQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const acceptedScans = await model('scanAcceptedRequest')?.findMany?.({
      where: {
        facilityId,
        status: { in: [SCAN_QUEUE_STATUS.ACCEPTED, SCAN_QUEUE_STATUS.IN_PROGRESS, SCAN_QUEUE_STATUS.COMPLETED, SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN] },
      },
      select: { orderId: true },
    }).catch(() => []) || [];
    const acceptedOrderIds = new Set(acceptedScans.map((scan: AnyRecord) => scan.orderId));

    const orders = await findFacilityOrders(facilityId, options);
    const queue = orders
      .filter((order) => !acceptedOrderIds.has(order.id))
      .map((order) => ({
        ...order,
        patientDisplayName: resolveOrderPatientText(order),
        requestedScans: this.getRequestedScans(order),
      }))
      .filter((order) => order.requestedScans.length > 0);

    if (!search) return queue;
    return queue.filter((order) => {
      const values = [...buildOrderSearchValues(order), stringifyForSearch(order.requestedScans)];
      return values.some((value) => value.toLowerCase().includes(search));
    });
  }

  static async getQueueSummary(facilityId: string) {
    const queue = await this.getQueue(facilityId, { take: 100 });
    return {
      total: queue.length,
      urgent: queue.filter((item: AnyRecord) => String(item.priority || item.urgency || '').toUpperCase() === 'URGENT').length,
      routine: queue.filter((item: AnyRecord) => String(item.priority || item.urgency || 'ROUTINE').toUpperCase() !== 'URGENT').length,
      notAccepted: queue.length,
    };
  }

  static async getQueueOrder(facilityId: string, orderId: string) {
    const order = await findOrderWithItems(facilityId, orderId);
    const requestedScans = this.getRequestedScans(order);
    if (!requestedScans.length) throw notFound('No scan/imaging request was found for this order.');
    return {
      ...order,
      patientDisplayName: resolveOrderPatientText(order),
      requestedScans,
    };
  }

  static async acceptScanRequest(params: {
    facilityId: string;
    orderId: string;
    acceptedById: string;
    actorName?: string | null;
    payload: AcceptScanRequestDTO;
  }) {
    const { facilityId, orderId, acceptedById, actorName, payload } = params;
    const order = await findOrderWithItems(facilityId, orderId);
    const requestedScans = this.getRequestedScans(order);
    if (!requestedScans.length) throw badRequest('This order does not contain any scan/imaging request.');

    const existing = await model('scanAcceptedRequest')?.findFirst?.({
      where: {
        facilityId,
        orderId,
        status: { in: [SCAN_QUEUE_STATUS.ACCEPTED, SCAN_QUEUE_STATUS.IN_PROGRESS, SCAN_QUEUE_STATUS.COMPLETED, SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN] },
      },
    });
    if (existing) throw conflict('This scan request has already been accepted.');

    const selectedScans = normalizeSelectedScans(requestedScans, payload.selectedScans);
    const clinicianId = resolveOrderClinicianId(order);

    const scan = await model('scanAcceptedRequest').create({
      data: {
        facilityId,
        orderId,
        patientId: order.patientId || order.patient?.id,
        clinicianId,
        acceptedById,
        scanCode: makeWorkflowCode('SCAN'),
        modality: payload.modality || selectedScans[0]?.modality || null,
        room: payload.room || null,
        machine: payload.machine || null,
        technicianNotes: payload.technicianNotes || null,
        requestedScans: selectedScans,
        resultStatus: SCAN_RESULT_STATUS.DRAFT,
        priority: order.priority || order.urgency || 'ROUTINE',
        status: SCAN_QUEUE_STATUS.ACCEPTED,
        acceptedAt: new Date(),
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
      },
    });

    await safeUpdateOrderStatus(orderId, facilityId, ORDER_STATUS.ACCEPTED);
    await safeAuditLog({
      facilityId,
      userId: acceptedById,
      action: SCAN_AUDIT_EVENTS.REQUEST_ACCEPTED,
      entityType: 'ScanAcceptedRequest',
      entityId: scan.id,
      metadata: { orderId, selectedScans, actorName },
    });

    return scan;
  }

  static async getAcceptedScans(facilityId: string, options: ScanQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const scanAcceptedRequest = model('scanAcceptedRequest');
    if (!scanAcceptedRequest?.findMany) throw badRequest('ScanAcceptedRequest model is not available in Prisma.');

    const where: AnyRecord = {
      facilityId,
      status: { in: [SCAN_QUEUE_STATUS.ACCEPTED, SCAN_QUEUE_STATUS.IN_PROGRESS, SCAN_QUEUE_STATUS.COMPLETED] },
    };
    if (options.priority) where.priority = options.priority;
    if (options.modality) where.modality = options.modality;

    const includeAttempts = [
      { documents: true, order: { include: { patient: true, clinician: true, doctor: true } } },
      { scanResultDocuments: true, order: { include: { patient: true, clinician: true, doctor: true } } },
      { order: { include: { patient: true, clinician: true, doctor: true } } },
      undefined,
    ];

    let scans: AnyRecord[] = [];
    for (const include of includeAttempts) {
      try {
        scans = await scanAcceptedRequest.findMany({
          where,
          ...(include ? { include } : {}),
          orderBy: { acceptedAt: 'desc' },
          take: toSafeTake(options.take),
          skip: toSafeSkip(options.skip),
        });
        break;
      } catch (_error) {
        continue;
      }
    }

    const decorated: AnyRecord[] = scans.map((scan: AnyRecord) => ({
      ...scan,
      requestedScans: readAcceptedScans(scan),
      patientDisplayName: scan.order ? resolveOrderPatientText(scan.order) : scan.patientId,
    }));

    if (!search) return decorated;
    return decorated.filter((scan) => {
      const values = [
        scan.id,
        scan.scanCode,
        scan.orderId,
        scan.patientId,
        scan.clinicianId,
        scan.priority,
        scan.status,
        scan.modality,
        scan.order?.patient?.fullName,
        scan.order?.patient?.name,
        stringifyForSearch(readAcceptedScans(scan)),
      ].filter(Boolean).map(String);
      return values.some((value) => value.toLowerCase().includes(search));
    });
  }

  static async getAcceptedScan(facilityId: string, scanId: string) {
    const scanAcceptedRequest = model('scanAcceptedRequest');
    if (!scanAcceptedRequest?.findFirst) throw badRequest('ScanAcceptedRequest model is not available in Prisma.');

    const includeAttempts = [
      { documents: true, order: { include: { patient: true, clinician: true, doctor: true } } },
      { scanResultDocuments: true, order: { include: { patient: true, clinician: true, doctor: true } } },
      { order: { include: { patient: true, clinician: true, doctor: true } } },
      undefined,
    ];

    for (const include of includeAttempts) {
      try {
        const scan = await scanAcceptedRequest.findFirst({
          where: { id: scanId, facilityId },
          ...(include ? { include } : {}),
        });
        if (scan) return { ...scan, requestedScans: readAcceptedScans(scan) };
      } catch (_error) {
        continue;
      }
    }

    throw notFound('Accepted scan request was not found.');
  }

  static async saveScanResult(params: {
    facilityId: string;
    scanId: string;
    actorId: string;
    actorName?: string | null;
    payload: SaveScanResultDTO;
  }) {
    const { facilityId, scanId, actorId, actorName, payload } = params;
    const scan = await this.getAcceptedScan(facilityId, scanId);
    if (scan.status === SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Sent scan results cannot be edited.');
    if (!safeText(payload.findings) && !safeText(payload.impression) && !safeText(payload.conclusion)) {
      throw badRequest('Enter scan findings, impression, or conclusion before saving.');
    }

    const updated = await model('scanAcceptedRequest').update({
      where: { id: scanId },
      data: {
        findings: payload.findings ?? scan.findings,
        impression: payload.impression ?? scan.impression,
        conclusion: payload.conclusion ?? scan.conclusion,
        recommendation: payload.recommendation ?? scan.recommendation,
        technicianNotes: payload.technicianNotes ?? scan.technicianNotes,
        radiologistNotes: payload.radiologistNotes ?? scan.radiologistNotes,
        resultStatus: payload.status || SCAN_RESULT_STATUS.DRAFT,
        status: SCAN_QUEUE_STATUS.IN_PROGRESS,
        updatedAt: new Date(),
      },
    });

    await safeAuditLog({
      facilityId,
      userId: actorId,
      action: SCAN_AUDIT_EVENTS.RESULT_SAVED,
      entityType: 'ScanAcceptedRequest',
      entityId: scanId,
      metadata: { actorName },
    });

    return updated;
  }

  static async completeScanResult(facilityId: string, scanId: string, actorId: string) {
    const scan = await this.getAcceptedScan(facilityId, scanId);
    if (scan.status === SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN) throw badRequest('This scan result has already been sent to the clinician.');
    if (!safeText(scan.findings) && !safeText(scan.impression) && !safeText(scan.conclusion)) {
      throw badRequest('The scan result cannot be completed until findings or impression has been saved.');
    }

    const updated = await model('scanAcceptedRequest').update({
      where: { id: scanId },
      data: {
        status: SCAN_QUEUE_STATUS.COMPLETED,
        resultStatus: SCAN_RESULT_STATUS.COMPLETED,
        completedAt: new Date(),
      },
    });

    await safeAuditLog({
      facilityId,
      userId: actorId,
      action: 'SCAN_RESULT_COMPLETED',
      entityType: 'ScanAcceptedRequest',
      entityId: scanId,
    });

    return updated;
  }

  static async attachDocument(params: {
    facilityId: string;
    scanId: string;
    actorId: string;
    document: ScanDocumentMetadataDTO;
  }) {
    const { facilityId, scanId, actorId, document } = params;
    const scan = await this.getAcceptedScan(facilityId, scanId);
    if (scan.status === SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Documents cannot be added after the scan result has been sent.');

    const created = await model('scanResultDocument').create({
      data: {
        facilityId,
        scanAcceptedRequestId: scanId,
        orderId: scan.orderId,
        patientId: scan.patientId,
        fileName: document.fileName || document.originalName,
        originalName: document.originalName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        fileUrl: document.fileUrl,
        checksum: document.checksum || createFileChecksum(document),
        uploadedById: actorId,
        uploadedAt: new Date(),
      },
    });

    await safeAuditLog({
      facilityId,
      userId: actorId,
      action: SCAN_AUDIT_EVENTS.DOCUMENT_UPLOADED,
      entityType: 'ScanResultDocument',
      entityId: created.id,
      metadata: { scanId, originalName: document.originalName },
    });

    return created;
  }

  static async removeDocument(facilityId: string, documentId: string, actorId: string) {
    const scanResultDocument = model('scanResultDocument');
    if (!scanResultDocument?.findFirst) throw badRequest('ScanResultDocument model is not available in Prisma.');

    const doc = await scanResultDocument.findFirst({ where: { id: documentId, facilityId } });
    if (!doc) throw notFound('Scan result document was not found.');

    const scan = await this.getAcceptedScan(facilityId, doc.scanAcceptedRequestId);
    if (scan.status === SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Documents cannot be removed after the scan result has been sent.');

    await scanResultDocument.delete({ where: { id: documentId } });
    await safeAuditLog({
      facilityId,
      userId: actorId,
      action: SCAN_AUDIT_EVENTS.DOCUMENT_REMOVED,
      entityType: 'ScanResultDocument',
      entityId: documentId,
    });

    return { deleted: true, id: documentId };
  }

  static async getDocuments(facilityId: string, scanId: string) {
    await this.getAcceptedScan(facilityId, scanId);
    return await model('scanResultDocument')?.findMany?.({
      where: { facilityId, scanAcceptedRequestId: scanId },
      orderBy: { uploadedAt: 'desc' },
    }).catch(() => []) || [];
  }

  static async pushToClinician(facilityId: string, scanId: string, actorId: string) {
    const scan = await this.getAcceptedScan(facilityId, scanId);
    if (scan.status === SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN) throw conflict('This scan result has already been sent to the clinician.');
    if (!scan.clinicianId) throw badRequest('This scan request has no clinician recipient.');
    if (!safeText(scan.findings) && !safeText(scan.impression) && !safeText(scan.conclusion)) {
      throw badRequest('The scan result cannot be sent until findings or impression has been completed.');
    }

    const documents = await this.getDocuments(facilityId, scanId);

    const updated = await model('scanAcceptedRequest').update({
      where: { id: scanId },
      data: {
        status: SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN,
        resultStatus: SCAN_RESULT_STATUS.SENT_TO_CLINICIAN,
        sentToClinicianAt: new Date(),
        completedAt: scan.completedAt || new Date(),
      },
    });

    const inbox = await model('resultDeliveryInbox')?.create?.({
      data: {
        facilityId,
        resultType: 'SCAN',
        sourceId: scanId,
        orderId: scan.orderId,
        patientId: scan.patientId,
        clinicianId: scan.clinicianId,
        deliveredById: actorId,
        status: RESULT_DELIVERY_STATUS.SENT,
        deliveredAt: new Date(),
        metadata: {
          scanCode: scan.scanCode,
          modality: scan.modality,
          requestedScans: readAcceptedScans(scan),
          findings: scan.findings,
          impression: scan.impression,
          conclusion: scan.conclusion,
          recommendation: scan.recommendation,
          documentCount: documents.length,
        },
      },
    }).catch(() => null);

    await model('result')?.create?.({
      data: {
        facilityId,
        orderId: scan.orderId,
        patientId: scan.patientId,
        clinicianId: scan.clinicianId,
        sourceType: 'SCAN',
        sourceId: scanId,
        status: SCAN_RESULT_STATUS.SENT_TO_CLINICIAN,
        title: `Scan result ${scan.scanCode}`,
        summary: scan.impression || scan.conclusion || scan.findings,
        metadata: {
          scan,
          requestedScans: readAcceptedScans(scan),
          documents,
          inboxId: inbox?.id || null,
        },
      },
    }).catch(() => null);

    await safeUpdateOrderStatus(scan.orderId, facilityId, ORDER_STATUS.SENT_TO_CLINICIAN);
    await safeNotification({
      facilityId,
      userId: scan.clinicianId,
      role: 'CLINICIAN',
      type: SCAN_NOTIFICATION_EVENTS.RESULT_SENT_TO_CLINICIAN,
      title: 'New scan result received',
      message: `Scan result ${scan.scanCode} has been sent to your inbox.`,
      orderId: scan.orderId,
      resultId: inbox?.id || scanId,
      status: 'UNREAD',
    });
    await safeAuditLog({
      facilityId,
      userId: actorId,
      action: SCAN_AUDIT_EVENTS.RESULT_PUSHED,
      entityType: 'ScanAcceptedRequest',
      entityId: scanId,
      metadata: { inboxId: inbox?.id || null, documentCount: documents.length },
    });

    return { scan: updated, inbox, documents };
  }

  static async getResults(facilityId: string, options: ScanQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const scanAcceptedRequest = model('scanAcceptedRequest');
    if (!scanAcceptedRequest?.findMany) throw badRequest('ScanAcceptedRequest model is not available in Prisma.');

    const records = await scanAcceptedRequest.findMany({
      where: { facilityId, status: SCAN_QUEUE_STATUS.SENT_TO_CLINICIAN },
      orderBy: { sentToClinicianAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    });

    const decorated = await Promise.all(records.map(async (scan: AnyRecord) => ({
      ...scan,
      requestedScans: readAcceptedScans(scan),
      documents: await this.getDocuments(facilityId, scan.id),
    })));

    if (!search) return decorated;
    return decorated.filter((scan) => {
      const values = [scan.id, scan.scanCode, scan.orderId, scan.patientId, scan.clinicianId, scan.modality, stringifyForSearch(scan.requestedScans)].filter(Boolean).map(String);
      return values.some((value) => value.toLowerCase().includes(search));
    });
  }
}

import { prisma } from './facilityScope.service';
import {
  LAB_SAMPLE_STATUS,
  LAB_TEST_STATUS,
  ORDER_STATUS,
  RESULT_DELIVERY_STATUS,
  SCAN_STATUS,
} from '../constants/diagnosticWorkflow.constants';
import { buildMetadata, computeResultFlag, makeCode, normalizeSearch, parseArray } from '../utils/diagnosticWorkflow.utils';

type AnyRecord = Record<string, any>;

type PaginationOptions = {
  search?: string;
  take?: number;
  skip?: number;
};

function model(name: string): any {
  return (prisma as any)[name];
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = model('auditLog');
  if (!auditLog?.create) return;
  try {
    await auditLog.create({ data });
  } catch (_error) {
    // Keep workflow actions successful even when legacy audit table fields differ.
  }
}

async function safeNotification(data: AnyRecord) {
  const notification = model('notification');
  if (!notification?.create) return;
  try {
    await notification.create({ data });
  } catch (_error) {
    // Keep workflow actions successful even when legacy notification table fields differ.
  }
}

async function findOrder(orderId: string, facilityId: string) {
  const order = model('order');
  if (!order?.findFirst) throw badRequest('Order model is not available in the Prisma client.');

  const includeOptions = [
    { items: true, patient: true, clinician: true, doctor: true, hospital: true },
    { items: true, patient: true, doctor: true, hospital: true },
    { items: true, patient: true },
    { patient: true },
    undefined,
  ];

  for (const include of includeOptions) {
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

  throw notFound('Order was not found for this facility.');
}

async function findOrdersForFacility(facilityId: string, options: PaginationOptions = {}) {
  const order = model('order');
  if (!order?.findMany) throw badRequest('Order model is not available in the Prisma client.');

  const take = Math.min(Number(options.take || 50), 100);
  const skip = Number(options.skip || 0);
  const search = normalizeSearch(options.search).toLowerCase();
  const includeOptions = [
    { items: true, patient: true, clinician: true, doctor: true, hospital: true },
    { items: true, patient: true, doctor: true, hospital: true },
    { items: true, patient: true },
    { patient: true },
    undefined,
  ];

  let records: AnyRecord[] = [];
  for (const include of includeOptions) {
    try {
      records = await order.findMany({
        where: { facilityId },
        ...(include ? { include } : {}),
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });
      break;
    } catch (_error) {
      continue;
    }
  }

  if (!search) return records;
  return records.filter((item) => {
    const values = [
      item.id,
      item.orderNumber,
      item.patientId,
      item.patient?.id,
      item.patient?.fullName,
      item.patient?.name,
      item.patient?.phone,
      item.clinicianId,
      item.doctorId,
      item.clinician?.name,
      item.doctor?.name,
      JSON.stringify(item.items || []),
    ];
    return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
  });
}

function getOrderItems(order: AnyRecord): AnyRecord[] {
  return parseArray<AnyRecord>(order.items || order.orderItems || order.OrderItems);
}

function isLabItem(item: AnyRecord): boolean {
  const text = `${item.department || ''} ${item.type || ''} ${item.serviceType || ''} ${item.category || ''}`.toLowerCase();
  return text.includes('lab') || text.includes('laboratory') || (!text.includes('scan') && !text.includes('imaging') && !text.includes('radiology'));
}

function isScanItem(item: AnyRecord): boolean {
  const text = `${item.department || ''} ${item.type || ''} ${item.serviceType || ''} ${item.category || ''}`.toLowerCase();
  return text.includes('scan') || text.includes('imaging') || text.includes('radiology') || text.includes('xray') || text.includes('x-ray') || text.includes('ultrasound');
}

function mapSelectedTest(selected: AnyRecord, orderItem?: AnyRecord) {
  const source = { ...(orderItem || {}), ...(selected || {}) };
  return {
    orderItemId: source.orderItemId || source.id || null,
    testId: source.testId || source.catalogId || source.serviceId || source.id || null,
    testCode: source.testCode || source.code || source.serviceCode || null,
    testName: source.testName || source.name || source.serviceName || source.label || 'Laboratory Test',
    referenceRange: source.referenceRange || source.normalRange || source.range || null,
    unit: source.unit || source.units || null,
  };
}

export class DiagnosticWorkflowService {
  static async getLabQueue(facilityId: string, options: PaginationOptions = {}) {
    const orders = await findOrdersForFacility(facilityId, options);
    const accepted = await model('labAcceptedSample')?.findMany?.({
      where: { facilityId, status: { in: [LAB_SAMPLE_STATUS.ACCEPTED, LAB_SAMPLE_STATUS.IN_PROGRESS, LAB_SAMPLE_STATUS.COMPLETED, LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN] } },
      select: { orderId: true },
    }).catch(() => []) || [];
    const acceptedOrderIds = new Set(accepted.map((item: AnyRecord) => item.orderId));

    return orders
      .filter((order) => !acceptedOrderIds.has(order.id))
      .filter((order) => getOrderItems(order).some(isLabItem) || String(order.requestType || order.department || '').toUpperCase().includes('LAB'))
      .map((order) => ({
        ...order,
        queueType: 'LAB',
        labItems: getOrderItems(order).filter(isLabItem),
      }));
  }

  static async getLabQueueOrder(facilityId: string, orderId: string) {
    const order = await findOrder(orderId, facilityId);
    return {
      ...order,
      queueType: 'LAB',
      labItems: getOrderItems(order).filter(isLabItem),
    };
  }

  static async acceptLabTests(params: {
    facilityId: string;
    orderId: string;
    selectedTests: AnyRecord[];
    acceptedById: string;
    actorName?: string;
    notes?: string;
  }) {
    const { facilityId, orderId, selectedTests, acceptedById, actorName, notes } = params;
    if (!selectedTests.length) throw badRequest('At least one laboratory test must be selected.');

    const order = await findOrder(orderId, facilityId);
    const existing = await model('labAcceptedSample')?.findFirst?.({ where: { facilityId, orderId } });
    if (existing) throw badRequest('This laboratory request has already been accepted.');

    const orderItems = getOrderItems(order);
    const acceptedSample = await model('labAcceptedSample').create({
      data: {
        facilityId,
        orderId,
        patientId: order.patientId || order.patient?.id,
        clinicianId: order.clinicianId || order.doctorId || order.doctor?.id || order.clinician?.id || null,
        acceptedById,
        sampleCode: makeCode('LAB'),
        priority: order.priority || order.urgency || 'ROUTINE',
        status: LAB_SAMPLE_STATUS.ACCEPTED,
        notes: notes || null,
        tests: {
          create: selectedTests.map((selected) => {
            const orderItem = orderItems.find((item) => item.id === selected.orderItemId || item.id === selected.id || item.id === selected.testId);
            return {
              facilityId,
              ...mapSelectedTest(selected, orderItem),
              status: LAB_TEST_STATUS.PENDING,
            };
          }),
        },
      },
      include: { tests: true },
    });

    await this.updateOrderStatus(orderId, facilityId, ORDER_STATUS.ACCEPTED, actorName || acceptedById, 'Laboratory sample accepted with selected tests.');
    await safeNotification({
      facilityId,
      userId: acceptedSample.clinicianId,
      role: 'CLINICIAN',
      title: 'Laboratory sample accepted',
      message: `Laboratory sample ${acceptedSample.sampleCode} has been accepted for result entry.`,
      status: 'UNREAD',
      orderId,
      createdAt: new Date(),
    });
    await safeAuditLog({
      facilityId,
      actorId: acceptedById,
      action: 'LAB_TESTS_ACCEPTED',
      module: 'Laboratory',
      entityId: acceptedSample.id,
      details: `${acceptedSample.tests.length} selected laboratory test(s) accepted for order ${orderId}.`,
      createdAt: new Date(),
    });

    return acceptedSample;
  }

  static async getAcceptedSamples(facilityId: string, options: PaginationOptions = {}) {
    const search = normalizeSearch(options.search).toLowerCase();
    const samples = await model('labAcceptedSample').findMany({
      where: {
        facilityId,
        status: { in: [LAB_SAMPLE_STATUS.ACCEPTED, LAB_SAMPLE_STATUS.IN_PROGRESS, LAB_SAMPLE_STATUS.COMPLETED] },
      },
      include: { tests: { orderBy: { createdAt: 'asc' } }, documents: true },
      orderBy: { acceptedAt: 'desc' },
      take: Math.min(Number(options.take || 50), 100),
      skip: Number(options.skip || 0),
    });

    if (!search) return samples;
    return samples.filter((sample: AnyRecord) => {
      const values = [
        sample.id,
        sample.sampleCode,
        sample.orderId,
        sample.patientId,
        sample.clinicianId,
        sample.priority,
        JSON.stringify(sample.tests || []),
      ];
      return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    });
  }

  static async getAcceptedSample(facilityId: string, sampleId: string) {
    const sample = await model('labAcceptedSample').findFirst({
      where: { id: sampleId, facilityId },
      include: { tests: { orderBy: { createdAt: 'asc' } }, documents: true },
    });
    if (!sample) throw notFound('Accepted laboratory sample was not found.');
    return sample;
  }

  static async saveLabTestResult(params: {
    facilityId: string;
    sampleId: string;
    sampleTestId: string;
    enteredById: string;
    resultValue?: string;
    parameters?: AnyRecord[];
    resultNotes?: string;
    equipmentNotes?: string;
  }) {
    const { facilityId, sampleId, sampleTestId, enteredById } = params;
    await this.getAcceptedSample(facilityId, sampleId);

    const test = await model('labAcceptedSampleTest').findFirst({ where: { id: sampleTestId, facilityId, acceptedSampleId: sampleId } });
    if (!test) throw notFound('Selected accepted laboratory test was not found.');

    const parameters = parseArray<AnyRecord>(params.parameters);
    const resultValue = params.resultValue || (parameters.length === 1 ? parameters[0].value : parameters.length ? JSON.stringify(parameters) : '');
    if (!String(resultValue || '').trim()) throw badRequest('Result value is required.');

    const updated = await model('labAcceptedSampleTest').update({
      where: { id: sampleTestId },
      data: {
        resultValue,
        resultFlag: computeResultFlag(String(resultValue), test.low, test.high),
        resultNotes: params.resultNotes || (parameters.length ? JSON.stringify(parameters) : null),
        equipmentNotes: params.equipmentNotes || null,
        enteredById,
        enteredAt: new Date(),
        status: LAB_TEST_STATUS.IN_PROGRESS,
      },
      include: { documents: true },
    });

    await model('labAcceptedSample').update({
      where: { id: sampleId },
      data: { status: LAB_SAMPLE_STATUS.IN_PROGRESS },
    });

    await safeAuditLog({
      facilityId,
      actorId: enteredById,
      action: 'LAB_TEST_RESULT_SAVED',
      module: 'Laboratory',
      entityId: sampleTestId,
      details: `${updated.testName} result saved.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async completeLabTestResult(facilityId: string, sampleId: string, sampleTestId: string, actorId: string) {
    await this.getAcceptedSample(facilityId, sampleId);
    const test = await model('labAcceptedSampleTest').findFirst({ where: { id: sampleTestId, facilityId, acceptedSampleId: sampleId } });
    if (!test) throw notFound('Selected accepted laboratory test was not found.');
    if (!String(test.resultValue || '').trim()) throw badRequest('Save a result value before marking this test completed.');

    const updated = await model('labAcceptedSampleTest').update({
      where: { id: sampleTestId },
      data: { status: LAB_TEST_STATUS.COMPLETED, completedAt: new Date() },
      include: { documents: true },
    });

    await safeAuditLog({
      facilityId,
      actorId,
      action: 'LAB_TEST_COMPLETED',
      module: 'Laboratory',
      entityId: sampleTestId,
      details: `${updated.testName} marked completed.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async pushLabResultToClinician(facilityId: string, sampleId: string, actorId: string) {
    const sample = await model('labAcceptedSample').findFirst({
      where: { id: sampleId, facilityId },
      include: { tests: { include: { documents: true } }, documents: true },
    });
    if (!sample) throw notFound('Accepted laboratory sample was not found.');
    if (!sample.clinicianId) throw badRequest('This request does not have a clinician recipient.');
    if (!sample.tests?.length) throw badRequest('No accepted laboratory tests were found for this sample.');
    const incomplete = sample.tests.filter((test: AnyRecord) => test.status !== LAB_TEST_STATUS.COMPLETED);
    if (incomplete.length) throw badRequest('All accepted tests must be completed before pushing results to the clinician.');

    const completedAt = new Date();
    const updatedSample = await model('labAcceptedSample').update({
      where: { id: sampleId },
      data: {
        status: LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN,
        completedAt: sample.completedAt || completedAt,
        sentToClinicianAt: completedAt,
      },
      include: { tests: { include: { documents: true } }, documents: true },
    });

    const inbox = await model('resultDeliveryInbox').create({
      data: {
        facilityId,
        resultType: 'LAB',
        sourceId: sampleId,
        orderId: sample.orderId,
        patientId: sample.patientId,
        clinicianId: sample.clinicianId,
        deliveredById: actorId,
        status: RESULT_DELIVERY_STATUS.SENT,
        metadata: buildMetadata({
          sampleCode: sample.sampleCode,
          tests: sample.tests.map((test: AnyRecord) => ({
            id: test.id,
            testName: test.testName,
            resultValue: test.resultValue,
            resultFlag: test.resultFlag,
            documents: test.documents || [],
          })),
        }),
      },
    });

    await this.updateOrderStatus(sample.orderId, facilityId, ORDER_STATUS.SENT_TO_CLINICIAN, actorId, 'Laboratory result sent directly to clinician.');
    await safeNotification({
      facilityId,
      userId: sample.clinicianId,
      role: 'CLINICIAN',
      title: 'Laboratory result ready',
      message: `Laboratory result for order ${sample.orderId} has been sent to you.`,
      status: 'UNREAD',
      orderId: sample.orderId,
      resultId: inbox.id,
      createdAt: new Date(),
    });
    await safeAuditLog({
      facilityId,
      actorId,
      action: 'LAB_RESULT_SENT_TO_CLINICIAN',
      module: 'Laboratory',
      entityId: sampleId,
      details: `Laboratory result for order ${sample.orderId} sent directly to clinician ${sample.clinicianId}.`,
      createdAt: new Date(),
    });

    return { sample: updatedSample, inbox };
  }

  static async getLabResults(facilityId: string, options: PaginationOptions = {}) {
    const search = normalizeSearch(options.search).toLowerCase();
    const records = await model('resultDeliveryInbox').findMany({
      where: { facilityId, resultType: 'LAB' },
      orderBy: { deliveredAt: 'desc' },
      take: Math.min(Number(options.take || 50), 100),
      skip: Number(options.skip || 0),
    });
    if (!search) return records;
    return records.filter((item: AnyRecord) => [item.orderId, item.patientId, item.clinicianId, item.status, JSON.stringify(item.metadata || {})].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  }

  static async getScanQueue(facilityId: string, options: PaginationOptions = {}) {
    const orders = await findOrdersForFacility(facilityId, options);
    const accepted = await model('scanAcceptedRequest')?.findMany?.({
      where: { facilityId, status: { in: [SCAN_STATUS.ACCEPTED, SCAN_STATUS.IN_PROGRESS, SCAN_STATUS.COMPLETED, SCAN_STATUS.SENT_TO_CLINICIAN] } },
      select: { orderId: true },
    }).catch(() => []) || [];
    const acceptedOrderIds = new Set(accepted.map((item: AnyRecord) => item.orderId));

    return orders
      .filter((order) => !acceptedOrderIds.has(order.id))
      .filter((order) => getOrderItems(order).some(isScanItem) || String(order.requestType || order.department || '').toUpperCase().includes('SCAN'))
      .map((order) => ({
        ...order,
        queueType: 'SCAN',
        scanItems: getOrderItems(order).filter(isScanItem),
      }));
  }

  static async acceptScanRequest(params: {
    facilityId: string;
    orderId: string;
    acceptedById: string;
    modality?: string;
    room?: string;
    machine?: string;
    technicianNotes?: string;
  }) {
    const order = await findOrder(params.orderId, params.facilityId);
    const existing = await model('scanAcceptedRequest')?.findFirst?.({ where: { facilityId: params.facilityId, orderId: params.orderId } });
    if (existing) throw badRequest('This scan request has already been accepted.');

    const accepted = await model('scanAcceptedRequest').create({
      data: {
        facilityId: params.facilityId,
        orderId: params.orderId,
        patientId: order.patientId || order.patient?.id,
        clinicianId: order.clinicianId || order.doctorId || order.doctor?.id || order.clinician?.id || null,
        acceptedById: params.acceptedById,
        scanCode: makeCode('SCAN'),
        modality: params.modality || null,
        room: params.room || null,
        machine: params.machine || null,
        technicianNotes: params.technicianNotes || null,
        priority: order.priority || order.urgency || 'ROUTINE',
        status: SCAN_STATUS.ACCEPTED,
      },
      include: { documents: true },
    });

    await this.updateOrderStatus(params.orderId, params.facilityId, ORDER_STATUS.ACCEPTED, params.acceptedById, 'Scan request accepted to imaging.');
    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.acceptedById,
      action: 'SCAN_REQUEST_ACCEPTED',
      module: 'Scan',
      entityId: accepted.id,
      details: `Scan request accepted for order ${params.orderId}.`,
      createdAt: new Date(),
    });

    return accepted;
  }

  static async getAcceptedScans(facilityId: string, options: PaginationOptions = {}) {
    const search = normalizeSearch(options.search).toLowerCase();
    const records = await model('scanAcceptedRequest').findMany({
      where: { facilityId, status: { in: [SCAN_STATUS.ACCEPTED, SCAN_STATUS.IN_PROGRESS, SCAN_STATUS.COMPLETED] } },
      include: { documents: true },
      orderBy: { acceptedAt: 'desc' },
      take: Math.min(Number(options.take || 50), 100),
      skip: Number(options.skip || 0),
    });
    if (!search) return records;
    return records.filter((item: AnyRecord) => [item.id, item.scanCode, item.orderId, item.patientId, item.clinicianId, item.modality, item.priority].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  }

  static async saveScanResult(params: {
    facilityId: string;
    scanAcceptedRequestId: string;
    actorId: string;
    findings?: string;
    impression?: string;
    technicianNotes?: string;
  }) {
    const record = await model('scanAcceptedRequest').findFirst({ where: { id: params.scanAcceptedRequestId, facilityId: params.facilityId } });
    if (!record) throw notFound('Accepted scan request was not found.');

    const updated = await model('scanAcceptedRequest').update({
      where: { id: params.scanAcceptedRequestId },
      data: {
        findings: params.findings || record.findings || null,
        impression: params.impression || record.impression || null,
        technicianNotes: params.technicianNotes || record.technicianNotes || null,
        status: SCAN_STATUS.COMPLETED,
        completedAt: new Date(),
      },
      include: { documents: true },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'SCAN_RESULT_SAVED',
      module: 'Scan',
      entityId: params.scanAcceptedRequestId,
      details: `Scan result saved for order ${updated.orderId}.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async pushScanResultToClinician(facilityId: string, scanAcceptedRequestId: string, actorId: string) {
    const record = await model('scanAcceptedRequest').findFirst({ where: { id: scanAcceptedRequestId, facilityId }, include: { documents: true } });
    if (!record) throw notFound('Accepted scan request was not found.');
    if (!record.clinicianId) throw badRequest('This scan request does not have a clinician recipient.');
    if (!String(record.findings || '').trim() && !String(record.impression || '').trim()) throw badRequest('Enter scan findings or impression before sending.');

    const sentAt = new Date();
    const updated = await model('scanAcceptedRequest').update({
      where: { id: scanAcceptedRequestId },
      data: { status: SCAN_STATUS.SENT_TO_CLINICIAN, sentToClinicianAt: sentAt, completedAt: record.completedAt || sentAt },
      include: { documents: true },
    });

    const inbox = await model('resultDeliveryInbox').create({
      data: {
        facilityId,
        resultType: 'SCAN',
        sourceId: scanAcceptedRequestId,
        orderId: record.orderId,
        patientId: record.patientId,
        clinicianId: record.clinicianId,
        deliveredById: actorId,
        status: RESULT_DELIVERY_STATUS.SENT,
        metadata: buildMetadata({
          scanCode: record.scanCode,
          modality: record.modality,
          findings: record.findings,
          impression: record.impression,
          documents: record.documents || [],
        }),
      },
    });

    await this.updateOrderStatus(record.orderId, facilityId, ORDER_STATUS.SENT_TO_CLINICIAN, actorId, 'Scan result sent directly to clinician.');
    await safeNotification({
      facilityId,
      userId: record.clinicianId,
      role: 'CLINICIAN',
      title: 'Scan result ready',
      message: `Scan result for order ${record.orderId} has been sent to you.`,
      status: 'UNREAD',
      orderId: record.orderId,
      resultId: inbox.id,
      createdAt: new Date(),
    });
    await safeAuditLog({
      facilityId,
      actorId,
      action: 'SCAN_RESULT_SENT_TO_CLINICIAN',
      module: 'Scan',
      entityId: scanAcceptedRequestId,
      details: `Scan result for order ${record.orderId} sent directly to clinician ${record.clinicianId}.`,
      createdAt: new Date(),
    });

    return { scan: updated, inbox };
  }

  static async getClinicianInbox(facilityId: string, clinicianId: string, options: PaginationOptions = {}) {
    return model('resultDeliveryInbox').findMany({
      where: { facilityId, clinicianId },
      orderBy: { deliveredAt: 'desc' },
      take: Math.min(Number(options.take || 50), 100),
      skip: Number(options.skip || 0),
    });
  }

  static async markClinicianInboxRead(facilityId: string, inboxId: string, clinicianId: string) {
    const record = await model('resultDeliveryInbox').findFirst({ where: { id: inboxId, facilityId, clinicianId } });
    if (!record) throw notFound('Result inbox item was not found.');
    return model('resultDeliveryInbox').update({
      where: { id: inboxId },
      data: { status: RESULT_DELIVERY_STATUS.READ, readAt: new Date() },
    });
  }


  static async createWalkInPatient(params: {
    facilityId: string;
    createdById: string;
    patient: AnyRecord;
  }) {
    const patientModel = model('patient');
    if (!patientModel?.create) throw badRequest('Patient model is not available in the Prisma client.');

    const patient = await patientModel.create({
      data: {
        ...params.patient,
        facilityId: params.facilityId,
        source: params.patient.source || 'RECEPTION_WALK_IN',
      },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.createdById,
      action: 'WALK_IN_PATIENT_CREATED',
      module: 'Reception',
      entityId: patient.id,
      details: 'Walk-in patient created by reception.',
      createdAt: new Date(),
    });

    return patient;
  }

  static async createWalkInDiagnosticRequest(params: {
    facilityId: string;
    patientId: string;
    requestedById: string;
    clinicianId?: string;
    requestType: 'LAB' | 'SCAN';
    priority?: string;
    clinicalNotes?: string;
    items: AnyRecord[];
  }) {
    if (!params.items.length) throw badRequest('At least one diagnostic item is required.');
    const orderModel = model('order');
    if (!orderModel?.create) throw badRequest('Order model is not available in the Prisma client.');

    const order = await orderModel.create({
      data: {
        facilityId: params.facilityId,
        patientId: params.patientId,
        clinicianId: params.clinicianId || params.requestedById,
        requestedById: params.requestedById,
        requestType: params.requestType,
        priority: params.priority || 'ROUTINE',
        urgency: params.priority || 'ROUTINE',
        clinicalNotes: params.clinicalNotes || null,
        source: 'RECEPTION_WALK_IN',
        status: ORDER_STATUS.QUEUED,
        items: {
          create: params.items.map((item) => ({
            facilityId: params.facilityId,
            serviceType: params.requestType,
            department: params.requestType === 'LAB' ? 'Laboratory' : 'Scan',
            serviceCode: item.serviceCode || item.code || item.testCode || item.scanCode || null,
            serviceName: item.serviceName || item.name || item.testName || item.scanName || 'Diagnostic item',
            price: item.price || null,
            metadata: buildMetadata({ originalItem: item }),
          })),
        },
      },
      include: { items: true, patient: true },
    });

    const moduleName = params.requestType === 'LAB' ? 'Laboratory' : 'Scan';
    await safeNotification({
      facilityId: params.facilityId,
      role: params.requestType === 'LAB' ? 'LAB_STAFF' : 'SCAN_STAFF',
      title: `New ${moduleName.toLowerCase()} request`,
      message: `Walk-in ${moduleName.toLowerCase()} request ${order.id} is ready in the queue.`,
      status: 'UNREAD',
      orderId: order.id,
      createdAt: new Date(),
    });
    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.requestedById,
      action: `WALK_IN_${params.requestType}_REQUEST_CREATED`,
      module: 'Reception',
      entityId: order.id,
      details: `Walk-in ${moduleName.toLowerCase()} request routed directly to diagnostic queue.`,
      createdAt: new Date(),
    });

    return order;
  }

  static async updateOrderStatus(orderId: string, facilityId: string, status: string, actorId: string, note: string) {
    const order = model('order');
    if (!order?.updateMany) return;
    try {
      await order.updateMany({
        where: { id: orderId, facilityId },
        data: { status, updatedAt: new Date() },
      });
    } catch (_error) {
      try {
        await order.updateMany({ where: { id: orderId }, data: { status } });
      } catch (__error) {
        return;
      }
    }

    await safeAuditLog({
      facilityId,
      actorId,
      action: 'ORDER_STATUS_UPDATED',
      module: 'Orders',
      entityId: orderId,
      details: note,
      createdAt: new Date(),
    });
  }
}

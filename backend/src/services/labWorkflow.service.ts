import { prisma } from './facilityScope.service';
import {
  LAB_SAMPLE_STATUS,
  LAB_TEST_STATUS,
  ORDER_STATUS,
  RESULT_DELIVERY_STATUS,
} from '../constants/diagnosticWorkflow.constants';
import type {
  AcceptLabTestsDTO,
  LabDocumentMetadataDTO,
  LabQueueSearchOptions,
  RequestedLabTestDTO,
  SaveLabTestResultDTO,
} from '../types/labWorkflow.types';
import {
  AnyRecord,
  badRequest,
  buildJsonMetadata,
  computeBasicFlag,
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
} from '../utils/labWorkflow.utils';

function model(name: string): any {
  return (prisma as any)[name];
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = model('auditLog');
  if (!auditLog?.create) return;
  try {
    await auditLog.create({ data });
  } catch (_error) {
    // Legacy audit tables may have slightly different columns. Never fail the clinical workflow because of audit logging.
  }
}

async function safeNotification(data: AnyRecord) {
  const notification = model('notification');
  if (!notification?.create) return;
  try {
    await notification.create({ data });
  } catch (_error) {
    // Legacy notification tables may have slightly different columns. Never fail the clinical workflow because of notification logging.
  }
}

function getOrderItems(order: AnyRecord): AnyRecord[] {
  return parseArray(order.items || order.orderItems || order.OrderItems || order.tests || order.services);
}

function isLabItem(item: AnyRecord): boolean {
  const text = `${item.department || ''} ${item.type || ''} ${item.serviceType || ''} ${item.category || ''} ${item.name || ''} ${item.serviceName || ''}`.toLowerCase();
  if (text.includes('scan') || text.includes('imaging') || text.includes('radiology') || text.includes('x-ray') || text.includes('xray') || text.includes('ultrasound')) return false;
  return text.includes('lab') || text.includes('laboratory') || text.includes('test') || !text.trim();
}

function normalizeRequestedLabTest(item: AnyRecord): RequestedLabTestDTO {
  return {
    orderItemId: item.orderItemId || item.id || null,
    testId: item.testId || item.catalogId || item.serviceId || item.id || null,
    testCode: item.testCode || item.code || item.serviceCode || item.itemCode || null,
    testName: item.testName || item.name || item.serviceName || item.itemName || item.label || 'Laboratory Test',
    referenceRange: item.referenceRange || item.normalRange || item.range || null,
    unit: item.unit || item.units || null,
    price: item.price || item.amount || null,
    metadata: buildJsonMetadata(item),
  };
}

function uniqueTestKey(test: RequestedLabTestDTO): string {
  return String(test.orderItemId || test.testId || test.testCode || test.testName).trim().toLowerCase();
}

function buildOrderSearchValues(order: AnyRecord): string[] {
  return [
    order.id,
    order.orderNumber,
    order.code,
    order.patientId,
    order.patient?.id,
    order.patient?.patientId,
    order.patient?.fullName,
    order.patient?.name,
    order.patient?.phone,
    order.clinicianId,
    order.doctorId,
    order.clinician?.name,
    order.doctor?.name,
    order.priority,
    order.urgency,
    stringifyForSearch(getOrderItems(order)),
  ].filter(Boolean).map(String);
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

  throw notFound('The requested order was not found for this facility.');
}

async function findFacilityOrders(facilityId: string, options: LabQueueSearchOptions = {}): Promise<AnyRecord[]> {
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

async function safeUpdateOrderStatus(orderId: string, facilityId: string, status: string) {
  const order = model('order');
  if (!order?.updateMany) return;
  try {
    await order.updateMany({ where: { id: orderId, facilityId }, data: { status } });
  } catch (_error) {
    // Legacy order tables may not expose the same status values.
  }
}

export class LabWorkflowService {
  static getRequestedLabTests(order: AnyRecord): RequestedLabTestDTO[] {
    const normalized = getOrderItems(order).filter(isLabItem).map(normalizeRequestedLabTest);
    const seen = new Set<string>();
    return normalized.filter((test) => {
      const key = uniqueTestKey(test);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  static async getQueue(facilityId: string, options: LabQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const acceptedSamples = await model('labAcceptedSample')?.findMany?.({
      where: {
        facilityId,
        status: { in: [LAB_SAMPLE_STATUS.ACCEPTED, LAB_SAMPLE_STATUS.IN_PROGRESS, LAB_SAMPLE_STATUS.COMPLETED, LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN] },
      },
      select: { orderId: true },
    }).catch(() => []) || [];
    const acceptedOrderIds = new Set(acceptedSamples.map((sample: AnyRecord) => sample.orderId));

    const orders = await findFacilityOrders(facilityId, options);
    const queue = orders
      .filter((order) => !acceptedOrderIds.has(order.id))
      .map((order) => ({
        ...order,
        patientDisplayName: resolveOrderPatientText(order),
        requestedTests: this.getRequestedLabTests(order),
      }))
      .filter((order) => order.requestedTests.length > 0);

    if (!search) return queue;
    return queue.filter((order) => {
      const values = [...buildOrderSearchValues(order), stringifyForSearch(order.requestedTests)];
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
    const requestedTests = this.getRequestedLabTests(order);
    if (!requestedTests.length) throw notFound('No laboratory tests were found for this order.');
    return {
      ...order,
      patientDisplayName: resolveOrderPatientText(order),
      requestedTests,
    };
  }

  static async acceptSelectedTests(params: {
    facilityId: string;
    orderId: string;
    acceptedById: string;
    payload: AcceptLabTestsDTO;
  }) {
    const { facilityId, orderId, acceptedById, payload } = params;
    const selectedTests = parseArray<RequestedLabTestDTO>(payload.tests);
    if (!selectedTests.length) throw badRequest('Select at least one laboratory test before accepting the sample.');

    const order = await findOrderWithItems(facilityId, orderId);
    const requestedTests = this.getRequestedLabTests(order);
    if (!requestedTests.length) throw badRequest('This order does not contain laboratory tests.');

    const requestedByKey = new Map<string, RequestedLabTestDTO>();
    requestedTests.forEach((test) => requestedByKey.set(uniqueTestKey(test), test));

    const acceptedKeys = new Set<string>();
    const acceptedTests = selectedTests.map((selected) => {
      const key = uniqueTestKey(selected);
      if (!requestedByKey.has(key)) {
        throw badRequest(`The selected test "${selected.testName || selected.testCode || key}" is not part of this patient request.`);
      }
      if (acceptedKeys.has(key)) {
        throw badRequest(`The selected test "${selected.testName || selected.testCode || key}" was selected more than once.`);
      }
      acceptedKeys.add(key);
      return requestedByKey.get(key)!;
    });

    const existing = await model('labAcceptedSample')?.findFirst?.({ where: { facilityId, orderId } });
    if (existing) throw badRequest('This laboratory request has already been accepted.');

    const created = await model('labAcceptedSample').create({
      data: {
        facilityId,
        orderId,
        patientId: order.patientId || order.patient?.id,
        clinicianId: resolveOrderClinicianId(order),
        acceptedById,
        sampleCode: makeWorkflowCode('LAB'),
        priority: order.priority || order.urgency || 'ROUTINE',
        status: LAB_SAMPLE_STATUS.ACCEPTED,
        notes: safeText(payload.notes),
        tests: {
          create: acceptedTests.map((test) => ({
            facilityId,
            orderItemId: test.orderItemId || null,
            testId: test.testId || null,
            testCode: test.testCode || null,
            testName: test.testName,
            referenceRange: test.referenceRange || null,
            unit: test.unit || null,
            status: LAB_TEST_STATUS.PENDING,
          })),
        },
      },
      include: { tests: { orderBy: { createdAt: 'asc' } }, documents: true },
    });

    await safeUpdateOrderStatus(orderId, facilityId, acceptedTests.length < requestedTests.length ? ORDER_STATUS.PARTIALLY_ACCEPTED : ORDER_STATUS.ACCEPTED);
    await safeAuditLog({
      facilityId,
      actorId: acceptedById,
      action: 'LAB_SELECTED_TESTS_ACCEPTED',
      module: 'Laboratory',
      entityId: created.id,
      details: `${acceptedTests.length} of ${requestedTests.length} requested laboratory test(s) accepted for order ${orderId}.`,
      createdAt: new Date(),
    });

    return created;
  }

  static async getAcceptedSamples(facilityId: string, options: LabQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const samples = await model('labAcceptedSample').findMany({
      where: {
        facilityId,
        status: { in: [LAB_SAMPLE_STATUS.ACCEPTED, LAB_SAMPLE_STATUS.IN_PROGRESS, LAB_SAMPLE_STATUS.COMPLETED] },
      },
      include: { tests: { orderBy: { createdAt: 'asc' }, include: { documents: true } }, documents: true },
      orderBy: { acceptedAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    });

    if (!search) return samples;
    return samples.filter((sample: AnyRecord) => [
      sample.id,
      sample.sampleCode,
      sample.orderId,
      sample.patientId,
      sample.clinicianId,
      sample.priority,
      sample.status,
      stringifyForSearch(sample.tests || []),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  }

  static async getAcceptedSample(facilityId: string, sampleId: string) {
    const sample = await model('labAcceptedSample').findFirst({
      where: { id: sampleId, facilityId },
      include: { tests: { orderBy: { createdAt: 'asc' }, include: { documents: true } }, documents: true },
    });
    if (!sample) throw notFound('Accepted laboratory sample was not found.');
    return sample;
  }

  static async saveTestResult(params: {
    facilityId: string;
    sampleId: string;
    sampleTestId: string;
    enteredById: string;
    payload: SaveLabTestResultDTO;
  }) {
    const sample = await this.getAcceptedSample(params.facilityId, params.sampleId);
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Results have already been sent to the clinician and cannot be edited.');

    const test = sample.tests.find((item: AnyRecord) => item.id === params.sampleTestId);
    if (!test) throw notFound('Selected laboratory test was not found under this accepted sample.');
    if (test.status === LAB_TEST_STATUS.COMPLETED) throw badRequest('This test has already been completed. Reopen it before editing if your facility permits edits.');

    const parameters = parseArray<AnyRecord>(params.payload.parameters);
    const resultValue = safeText(params.payload.resultValue) || (parameters.length === 1 ? safeText(parameters[0].value) : null) || (parameters.length ? JSON.stringify(parameters) : null);
    if (!resultValue) throw badRequest('Enter a result value before saving this test.');

    const resultFlag = safeText(params.payload.resultFlag) || computeBasicFlag(resultValue, test.referenceRange);
    const updated = await model('labAcceptedSampleTest').update({
      where: { id: params.sampleTestId },
      data: {
        resultValue,
        resultFlag,
        resultNotes: safeText(params.payload.resultNotes || params.payload.notes) || (parameters.length > 1 ? JSON.stringify(parameters) : null),
        equipmentNotes: safeText(params.payload.equipmentNotes),
        enteredById: params.enteredById,
        enteredAt: new Date(),
        status: LAB_TEST_STATUS.IN_PROGRESS,
      },
      include: { documents: true },
    });

    await model('labAcceptedSample').update({
      where: { id: params.sampleId },
      data: { status: LAB_SAMPLE_STATUS.IN_PROGRESS },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.enteredById,
      action: 'LAB_TEST_RESULT_SAVED_STRICT',
      module: 'Laboratory',
      entityId: params.sampleTestId,
      details: `${updated.testName} result saved for sample ${sample.sampleCode}.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async completeTest(params: {
    facilityId: string;
    sampleId: string;
    sampleTestId: string;
    actorId: string;
  }) {
    const sample = await this.getAcceptedSample(params.facilityId, params.sampleId);
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Results have already been sent to the clinician.');

    const test = sample.tests.find((item: AnyRecord) => item.id === params.sampleTestId);
    if (!test) throw notFound('Selected laboratory test was not found under this accepted sample.');
    const hasResultValue = Boolean(safeText(test.resultValue));
    const hasDocument = Array.isArray(test.documents) && test.documents.length > 0;
    if (!hasResultValue && !hasDocument) throw badRequest('Save a result value or attach a result document before marking this test completed.');

    const updated = await model('labAcceptedSampleTest').update({
      where: { id: params.sampleTestId },
      data: { status: LAB_TEST_STATUS.COMPLETED, completedAt: new Date() },
      include: { documents: true },
    });

    const remaining = await model('labAcceptedSampleTest').count({
      where: {
        acceptedSampleId: params.sampleId,
        facilityId: params.facilityId,
        status: { not: LAB_TEST_STATUS.COMPLETED },
      },
    });
    if (remaining === 0) {
      await model('labAcceptedSample').update({
        where: { id: params.sampleId },
        data: { status: LAB_SAMPLE_STATUS.COMPLETED, completedAt: new Date() },
      });
    }

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'LAB_TEST_RESULT_COMPLETED_STRICT',
      module: 'Laboratory',
      entityId: params.sampleTestId,
      details: `${updated.testName} marked completed for sample ${sample.sampleCode}.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async reopenTest(params: {
    facilityId: string;
    sampleId: string;
    sampleTestId: string;
    actorId: string;
  }) {
    const sample = await this.getAcceptedSample(params.facilityId, params.sampleId);
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Sent results cannot be reopened from Accepted Samples.');

    const test = sample.tests.find((item: AnyRecord) => item.id === params.sampleTestId);
    if (!test) throw notFound('Selected laboratory test was not found under this accepted sample.');

    const updated = await model('labAcceptedSampleTest').update({
      where: { id: params.sampleTestId },
      data: { status: LAB_TEST_STATUS.IN_PROGRESS, completedAt: null },
      include: { documents: true },
    });
    await model('labAcceptedSample').update({ where: { id: params.sampleId }, data: { status: LAB_SAMPLE_STATUS.IN_PROGRESS } });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'LAB_TEST_REOPENED',
      module: 'Laboratory',
      entityId: params.sampleTestId,
      details: `${updated.testName} reopened for correction.`,
      createdAt: new Date(),
    });

    return updated;
  }

  static async attachTestDocument(params: {
    facilityId: string;
    sampleId: string;
    sampleTestId: string;
    uploadedById: string;
    file: LabDocumentMetadataDTO;
  }) {
    const sample = await this.getAcceptedSample(params.facilityId, params.sampleId);
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Cannot attach documents after results have been sent to the clinician.');
    const test = sample.tests.find((item: AnyRecord) => item.id === params.sampleTestId);
    if (!test) throw notFound('Selected laboratory test was not found under this accepted sample.');

    const document = await model('labTestResultDocument').create({
      data: {
        facilityId: params.facilityId,
        acceptedSampleId: params.sampleId,
        sampleTestId: params.sampleTestId,
        orderId: sample.orderId,
        patientId: sample.patientId,
        fileName: params.file.fileName,
        originalName: params.file.originalName,
        mimeType: params.file.mimeType,
        fileSize: params.file.fileSize,
        fileUrl: params.file.fileUrl,
        uploadedById: params.uploadedById,
      },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.uploadedById,
      action: 'LAB_TEST_RESULT_DOCUMENT_ATTACHED',
      module: 'Laboratory',
      entityId: document.id,
      details: `Document ${document.originalName} attached to ${test.testName}.`,
      createdAt: new Date(),
    });

    return document;
  }

  static async removeTestDocument(params: {
    facilityId: string;
    documentId: string;
    actorId: string;
  }) {
    const document = await model('labTestResultDocument').findFirst({ where: { id: params.documentId, facilityId: params.facilityId } });
    if (!document) throw notFound('Result document was not found.');

    const sample = await model('labAcceptedSample').findFirst({ where: { id: document.acceptedSampleId, facilityId: params.facilityId } });
    if (sample?.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('Cannot remove documents after results have been sent to the clinician.');

    await model('labTestResultDocument').delete({ where: { id: params.documentId } });
    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'LAB_TEST_RESULT_DOCUMENT_REMOVED',
      module: 'Laboratory',
      entityId: params.documentId,
      details: `Document ${document.originalName} removed from laboratory result.`,
      createdAt: new Date(),
    });
    return { deleted: true, documentId: params.documentId };
  }

  static async pushToClinician(facilityId: string, sampleId: string, actorId: string) {
    const sample = await model('labAcceptedSample').findFirst({
      where: { id: sampleId, facilityId },
      include: { tests: { include: { documents: true }, orderBy: { createdAt: 'asc' } }, documents: true },
    });
    if (!sample) throw notFound('Accepted laboratory sample was not found.');
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) throw badRequest('This result has already been sent to the clinician.');
    if (!sample.clinicianId) throw badRequest('This request does not have a clinician recipient.');
    if (!sample.tests?.length) throw badRequest('This accepted sample has no accepted tests.');

    const incomplete = sample.tests.filter((test: AnyRecord) => test.status !== LAB_TEST_STATUS.COMPLETED);
    if (incomplete.length > 0) {
      throw badRequest(`Complete all accepted tests before sending. Incomplete: ${incomplete.map((test: AnyRecord) => test.testName).join(', ')}`);
    }

    const sentAt = new Date();
    const inbox = await model('resultDeliveryInbox').create({
      data: {
        facilityId,
        resultType: 'LAB',
        sourceId: sample.id,
        orderId: sample.orderId,
        patientId: sample.patientId,
        clinicianId: sample.clinicianId,
        deliveredById: actorId,
        status: RESULT_DELIVERY_STATUS.SENT,
        metadata: buildJsonMetadata({
          sampleCode: sample.sampleCode,
          priority: sample.priority,
          tests: sample.tests.map((test: AnyRecord) => ({
            id: test.id,
            orderItemId: test.orderItemId,
            testId: test.testId,
            testCode: test.testCode,
            testName: test.testName,
            referenceRange: test.referenceRange,
            unit: test.unit,
            resultValue: test.resultValue,
            resultFlag: test.resultFlag,
            resultNotes: test.resultNotes,
            equipmentNotes: test.equipmentNotes,
            documents: test.documents || [],
          })),
        }),
      },
    });

    const updatedSample = await model('labAcceptedSample').update({
      where: { id: sampleId },
      data: {
        status: LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN,
        completedAt: sample.completedAt || sentAt,
        sentToClinicianAt: sentAt,
      },
      include: { tests: { include: { documents: true }, orderBy: { createdAt: 'asc' } }, documents: true },
    });

    await safeUpdateOrderStatus(sample.orderId, facilityId, ORDER_STATUS.SENT_TO_CLINICIAN);
    await safeNotification({
      facilityId,
      userId: sample.clinicianId,
      role: 'CLINICIAN',
      title: 'Laboratory result ready',
      message: `Laboratory result for order ${sample.orderId} has been sent to you.`,
      status: 'UNREAD',
      orderId: sample.orderId,
      resultId: inbox.id,
      createdAt: sentAt,
    });
    await safeAuditLog({
      facilityId,
      actorId,
      action: 'LAB_RESULT_PUSHED_TO_CLINICIAN_STRICT',
      module: 'Laboratory',
      entityId: sample.id,
      details: `Completed laboratory result sent directly to clinician ${sample.clinicianId}.`,
      createdAt: sentAt,
    });

    return { sample: updatedSample, inbox };
  }

  static async getResults(facilityId: string, options: LabQueueSearchOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const records = await model('resultDeliveryInbox').findMany({
      where: { facilityId, resultType: 'LAB' },
      orderBy: { deliveredAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    });

    if (!search) return records;
    return records.filter((record: AnyRecord) => [
      record.id,
      record.orderId,
      record.patientId,
      record.clinicianId,
      record.status,
      stringifyForSearch(record.metadata || {}),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  }
}

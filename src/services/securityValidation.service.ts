import { prisma } from './facilityScope.service';
import { SECURE_WORKFLOW_EVENT_TYPES } from '../constants/securityValidation.constants';
import type { LabSelectedTestInput, WorkflowSecurityEventInput } from '../types/securityValidation.types';
import { assertNoDuplicateSelectedTests, normalizeId } from '../utils/securityValidation.utils';

type AnyRecord = Record<string, any>;

function model(name: string): any {
  return (prisma as any)[name];
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

async function safeSecurityEvent(input: WorkflowSecurityEventInput) {
  const workflowEvent = model('facilityWorkflowEvent') || model('workflowEvent');
  const auditLog = model('auditLog');

  try {
    if (workflowEvent?.create) {
      await workflowEvent.create({
        data: {
          facilityId: input.facilityId || null,
          actorId: input.actorId || null,
          eventType: input.eventType,
          severity: input.severity || 'MEDIUM',
          patientId: input.patientId || null,
          orderId: input.orderId || null,
          resultId: input.resultId || null,
          documentId: input.documentId || null,
          message: input.message,
          metadata: input.metadata || {},
        },
      });
      return;
    }
  } catch (_error) {
    // Fall back to audit log below.
  }

  try {
    if (auditLog?.create) {
      await auditLog.create({
        data: {
          facilityId: input.facilityId || null,
          userId: input.actorId || null,
          action: input.eventType,
          entityType: 'WORKFLOW_SECURITY',
          entityId: input.orderId || input.resultId || input.documentId || input.facilityId || 'unknown',
          metadata: input.metadata || {},
        },
      });
    }
  } catch (_error) {
    // Security event logging must never break the request pipeline.
  }
}

export class SecurityValidationService {
  static async logSecurityEvent(input: WorkflowSecurityEventInput) {
    await safeSecurityEvent(input);
  }

  static async assertFacilityRecordAccess(options: {
    modelName: string;
    recordId: string;
    facilityId?: string | null;
    actorId?: string | null;
    eventMessage?: string;
  }): Promise<AnyRecord> {
    const resource = model(options.modelName);
    if (!resource?.findFirst) throw httpError(500, `${options.modelName} model is not available.`);

    const where: AnyRecord = { id: options.recordId };
    if (options.facilityId) where.facilityId = options.facilityId;

    const record = await resource.findFirst({ where });
    if (!record) {
      await safeSecurityEvent({
        facilityId: options.facilityId || null,
        actorId: options.actorId || null,
        eventType: SECURE_WORKFLOW_EVENT_TYPES.FACILITY_ACCESS_DENIED,
        severity: 'HIGH',
        message: options.eventMessage || `Blocked access to ${options.modelName}:${options.recordId}`,
        metadata: { modelName: options.modelName, recordId: options.recordId },
      });
      throw httpError(404, 'Record was not found for this facility.');
    }

    return record;
  }

  static async assertSelectedTestsBelongToOrder(options: {
    orderId: string;
    facilityId: string;
    selectedTests: LabSelectedTestInput[];
    actorId?: string | null;
  }) {
    const selectedTests = options.selectedTests || [];
    if (selectedTests.length === 0) throw httpError(400, 'Select at least one test before accepting the sample.');
    assertNoDuplicateSelectedTests(selectedTests);

    const orderItem = model('orderItem');
    if (!orderItem?.findMany) return true;

    const orderItems = await orderItem.findMany({ where: { orderId: options.orderId, facilityId: options.facilityId } });
    const allowedKeys = new Set<string>();

    for (const item of orderItems) {
      [item.id, item.testId, item.serviceId, item.catalogId, item.code, item.testCode, item.name, item.testName, item.serviceName]
        .map(normalizeId)
        .filter(Boolean)
        .forEach((key) => allowedKeys.add(String(key)));
    }

    const invalid = selectedTests.filter((test) => {
      const keys = [test.orderItemId, test.testId, test.testCode, test.testName].map(normalizeId).filter(Boolean);
      return keys.length === 0 || !keys.some((key) => allowedKeys.has(String(key)));
    });

    if (invalid.length > 0) {
      await safeSecurityEvent({
        facilityId: options.facilityId,
        actorId: options.actorId || null,
        orderId: options.orderId,
        eventType: SECURE_WORKFLOW_EVENT_TYPES.INVALID_TEST_SELECTION,
        severity: 'HIGH',
        message: 'Blocked lab acceptance because selected tests were not part of the original request.',
        metadata: { invalid },
      });
      throw httpError(400, 'One or more selected tests do not belong to the original request.');
    }

    return true;
  }

  static async assertNoExistingAcceptedSample(options: { orderId: string; facilityId: string; actorId?: string | null }) {
    const labAcceptedSample = model('labAcceptedSample');
    if (!labAcceptedSample?.findFirst) return true;

    const existing = await labAcceptedSample.findFirst({
      where: {
        orderId: options.orderId,
        facilityId: options.facilityId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
    });

    if (existing) {
      await safeSecurityEvent({
        facilityId: options.facilityId,
        actorId: options.actorId || null,
        orderId: options.orderId,
        eventType: SECURE_WORKFLOW_EVENT_TYPES.DUPLICATE_SAMPLE_ACCEPTANCE,
        severity: 'MEDIUM',
        message: 'Blocked duplicate lab sample acceptance.',
        metadata: { sampleId: existing.id },
      });
      throw httpError(409, 'This request has already been accepted into Accepted Samples.');
    }

    return true;
  }

  static async assertAllAcceptedLabTestsCompleted(options: { sampleId: string; facilityId: string; actorId?: string | null }) {
    const labAcceptedSampleTest = model('labAcceptedSampleTest');
    if (!labAcceptedSampleTest?.findMany) return true;

    const tests = await labAcceptedSampleTest.findMany({ where: { acceptedSampleId: options.sampleId, facilityId: options.facilityId } });
    if (tests.length === 0) throw httpError(400, 'No accepted tests were found for this sample.');

    const incomplete = tests.filter((test: AnyRecord) => test.status !== 'COMPLETED' && !test.completedAt);
    if (incomplete.length > 0) {
      await safeSecurityEvent({
        facilityId: options.facilityId,
        actorId: options.actorId || null,
        eventType: SECURE_WORKFLOW_EVENT_TYPES.INCOMPLETE_RESULT_DELIVERY_BLOCKED,
        severity: 'MEDIUM',
        message: 'Blocked result delivery because some accepted lab tests are incomplete.',
        metadata: { sampleId: options.sampleId, incompleteTestIds: incomplete.map((test: AnyRecord) => test.id) },
      });
      throw httpError(409, 'Complete all accepted tests before pushing results to the clinician.');
    }

    return true;
  }

  static async assertResultDocumentEditable(options: {
    parentModel: 'labAcceptedSample' | 'scanAcceptedRequest';
    parentId: string;
    facilityId: string;
    actorId?: string | null;
  }) {
    const parent = await this.assertFacilityRecordAccess({
      modelName: options.parentModel,
      recordId: options.parentId,
      facilityId: options.facilityId,
      actorId: options.actorId,
    });

    const status = String(parent.status || '').toUpperCase();
    if (['SENT_TO_CLINICIAN', 'ARCHIVED', 'CANCELLED'].includes(status)) {
      await safeSecurityEvent({
        facilityId: options.facilityId,
        actorId: options.actorId || null,
        eventType: SECURE_WORKFLOW_EVENT_TYPES.POST_DELIVERY_EDIT_BLOCKED,
        severity: 'HIGH',
        message: 'Blocked document mutation after result delivery.',
        metadata: { parentModel: options.parentModel, parentId: options.parentId, status },
      });
      throw httpError(409, 'Documents cannot be changed after results have been sent to the clinician.');
    }

    return parent;
  }
}

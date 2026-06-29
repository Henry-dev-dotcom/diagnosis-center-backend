import { prisma } from './facilityScope.service';
import { LAB_SAMPLE_STATUS, SCAN_STATUS } from '../constants/diagnosticWorkflow.constants';
import { RESULT_DOCUMENT_LIMITS, RESULT_DOCUMENT_TYPES } from '../constants/resultDocument.constants';
import type {
  AttachLabResultDocumentParams,
  AttachScanResultDocumentParams,
  RemoveResultDocumentParams,
  ResultDocumentListOptions,
} from '../types/resultDocument.types';
import {
  AnyRecord,
  httpError,
  normalizeSearch,
  searchDocumentRecord,
  toSafeSkip,
  toSafeTake,
  validateResultDocument,
} from '../utils/resultDocument.utils';

function model(name: string): any {
  return (prisma as any)[name];
}

async function safeAuditLog(data: AnyRecord) {
  const auditLog = model('auditLog');
  if (!auditLog?.create) return;
  try {
    await auditLog.create({ data });
  } catch (_error) {
    // Audit fields may differ in legacy deployments. Document upload must not fail because audit logging failed.
  }
}

async function safeGenericFileRecord(data: AnyRecord) {
  const fileModel = model('file');
  if (!fileModel?.create) return null;
  const attempts = [
    data,
    {
      facilityId: data.facilityId,
      fileName: data.fileName,
      originalName: data.originalName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      fileUrl: data.fileUrl,
      uploadedById: data.uploadedById,
      module: data.module,
      entityId: data.entityId,
    },
    {
      facilityId: data.facilityId,
      name: data.originalName,
      url: data.fileUrl,
      type: data.mimeType,
      size: data.fileSize,
      uploadedById: data.uploadedById,
    },
  ];

  for (const payload of attempts) {
    try {
      return await fileModel.create({ data: payload });
    } catch (_error) {
      continue;
    }
  }
  return null;
}

async function createWithFallback(modelName: string, data: AnyRecord) {
  const target = model(modelName);
  if (!target?.create) throw httpError(`${modelName} model is not available in Prisma.`, 500);
  const baseKeys = new Set([
    'facilityId',
    'acceptedSampleId',
    'sampleTestId',
    'scanAcceptedRequestId',
    'orderId',
    'patientId',
    'fileName',
    'originalName',
    'mimeType',
    'fileSize',
    'fileUrl',
    'uploadedById',
  ]);
  try {
    return await target.create({ data });
  } catch (error: any) {
    const baseData = Object.fromEntries(Object.entries(data).filter(([key]) => baseKeys.has(key)));
    return target.create({ data: baseData });
  }
}

async function softOrHardDelete(modelName: string, documentId: string, actorId: string, hardDelete = false) {
  const target = model(modelName);
  if (!target?.delete || !target?.update) throw httpError(`${modelName} model is not available in Prisma.`, 500);
  if (hardDelete) return target.delete({ where: { id: documentId } });
  try {
    return await target.update({
      where: { id: documentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId },
    });
  } catch (_error) {
    return target.delete({ where: { id: documentId } });
  }
}

export class ResultDocumentService {
  static async attachLabTestDocument(params: AttachLabResultDocumentParams) {
    validateResultDocument(params.file);

    const sample = await model('labAcceptedSample').findFirst({
      where: { id: params.acceptedSampleId, facilityId: params.facilityId },
      include: { tests: { include: { documents: true } } },
    });
    if (!sample) throw httpError('Accepted laboratory sample was not found.', 404);
    if (sample.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) {
      throw httpError('Cannot attach documents after the result has been sent to the clinician.', 400);
    }

    const test = sample.tests?.find((item: AnyRecord) => item.id === params.sampleTestId);
    if (!test) throw httpError('Selected laboratory test was not found under this accepted sample.', 404);
    const existingCount = (test.documents || []).filter((item: AnyRecord) => !item.isDeleted).length;
    if (existingCount >= RESULT_DOCUMENT_LIMITS.MAX_FILES_PER_TEST) {
      throw httpError(`This test already has the maximum of ${RESULT_DOCUMENT_LIMITS.MAX_FILES_PER_TEST} documents.`, 400);
    }

    const document = await createWithFallback('labTestResultDocument', {
      facilityId: params.facilityId,
      acceptedSampleId: params.acceptedSampleId,
      sampleTestId: params.sampleTestId,
      orderId: sample.orderId,
      patientId: sample.patientId,
      fileName: params.file.fileName,
      originalName: params.file.originalName,
      mimeType: params.file.mimeType,
      fileSize: params.file.fileSize,
      fileUrl: params.file.fileUrl,
      storageProvider: params.file.storageProvider || 'LOCAL',
      storageKey: params.file.storageKey || params.file.fileName,
      checksumSha256: params.file.checksumSha256 || null,
      extension: params.file.extension || null,
      documentType: params.file.documentType || RESULT_DOCUMENT_TYPES.LAB_RESULT_ATTACHMENT,
      uploadedById: params.uploadedById,
    });

    await safeGenericFileRecord({
      facilityId: params.facilityId,
      fileName: params.file.fileName,
      originalName: params.file.originalName,
      mimeType: params.file.mimeType,
      fileSize: params.file.fileSize,
      fileUrl: params.file.fileUrl,
      uploadedById: params.uploadedById,
      module: 'LAB_RESULT',
      entityId: params.sampleTestId,
      metadata: { acceptedSampleId: params.acceptedSampleId, documentId: document.id, testName: test.testName },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.uploadedById,
      action: 'LAB_RESULT_DOCUMENT_UPLOADED',
      module: 'Laboratory',
      entityId: document.id,
      details: `Document ${document.originalName} uploaded for ${test.testName}.`,
      createdAt: new Date(),
    });

    return document;
  }

  static async listLabTestDocuments(facilityId: string, sampleTestId: string, options: ResultDocumentListOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const records = await model('labTestResultDocument').findMany({
      where: { facilityId, sampleTestId, OR: [{ isDeleted: false }, { isDeleted: null }] },
      orderBy: { uploadedAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    }).catch(async () => model('labTestResultDocument').findMany({
      where: { facilityId, sampleTestId },
      orderBy: { uploadedAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    }));
    return records.filter((record: AnyRecord) => searchDocumentRecord(record, search));
  }

  static async removeLabTestDocument(params: RemoveResultDocumentParams) {
    const document = await model('labTestResultDocument').findFirst({ where: { id: params.documentId, facilityId: params.facilityId } });
    if (!document) throw httpError('Laboratory result document was not found.', 404);
    const sample = await model('labAcceptedSample').findFirst({ where: { id: document.acceptedSampleId, facilityId: params.facilityId } });
    if (sample?.status === LAB_SAMPLE_STATUS.SENT_TO_CLINICIAN) {
      throw httpError('Cannot remove documents after the result has been sent to the clinician.', 400);
    }

    await softOrHardDelete('labTestResultDocument', params.documentId, params.actorId, params.hardDelete);
    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'LAB_RESULT_DOCUMENT_REMOVED',
      module: 'Laboratory',
      entityId: params.documentId,
      details: `Document ${document.originalName} removed from laboratory result.`,
      createdAt: new Date(),
    });
    return { deleted: true, documentId: params.documentId };
  }

  static async attachScanDocument(params: AttachScanResultDocumentParams) {
    validateResultDocument(params.file);

    const scan = await model('scanAcceptedRequest').findFirst({
      where: { id: params.scanAcceptedRequestId, facilityId: params.facilityId },
      include: { documents: true },
    });
    if (!scan) throw httpError('Accepted scan request was not found.', 404);
    if (scan.status === SCAN_STATUS.SENT_TO_CLINICIAN) {
      throw httpError('Cannot attach documents after the scan result has been sent to the clinician.', 400);
    }
    const existingCount = (scan.documents || []).filter((item: AnyRecord) => !item.isDeleted).length;
    if (existingCount >= RESULT_DOCUMENT_LIMITS.MAX_FILES_PER_SCAN) {
      throw httpError(`This scan request already has the maximum of ${RESULT_DOCUMENT_LIMITS.MAX_FILES_PER_SCAN} documents.`, 400);
    }

    const document = await createWithFallback('scanResultDocument', {
      facilityId: params.facilityId,
      scanAcceptedRequestId: params.scanAcceptedRequestId,
      orderId: scan.orderId,
      patientId: scan.patientId,
      fileName: params.file.fileName,
      originalName: params.file.originalName,
      mimeType: params.file.mimeType,
      fileSize: params.file.fileSize,
      fileUrl: params.file.fileUrl,
      storageProvider: params.file.storageProvider || 'LOCAL',
      storageKey: params.file.storageKey || params.file.fileName,
      checksumSha256: params.file.checksumSha256 || null,
      extension: params.file.extension || null,
      documentType: params.file.documentType || RESULT_DOCUMENT_TYPES.SCAN_RESULT_ATTACHMENT,
      uploadedById: params.uploadedById,
    });

    await safeGenericFileRecord({
      facilityId: params.facilityId,
      fileName: params.file.fileName,
      originalName: params.file.originalName,
      mimeType: params.file.mimeType,
      fileSize: params.file.fileSize,
      fileUrl: params.file.fileUrl,
      uploadedById: params.uploadedById,
      module: 'SCAN_RESULT',
      entityId: params.scanAcceptedRequestId,
      metadata: { scanAcceptedRequestId: params.scanAcceptedRequestId, documentId: document.id, modality: scan.modality },
    });

    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.uploadedById,
      action: 'SCAN_RESULT_DOCUMENT_UPLOADED',
      module: 'Scan',
      entityId: document.id,
      details: `Document ${document.originalName} uploaded for scan request ${scan.scanCode || scan.id}.`,
      createdAt: new Date(),
    });

    return document;
  }

  static async listScanDocuments(facilityId: string, scanAcceptedRequestId: string, options: ResultDocumentListOptions = {}) {
    const search = normalizeSearch(options.search || options.q);
    const records = await model('scanResultDocument').findMany({
      where: { facilityId, scanAcceptedRequestId, OR: [{ isDeleted: false }, { isDeleted: null }] },
      orderBy: { uploadedAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    }).catch(async () => model('scanResultDocument').findMany({
      where: { facilityId, scanAcceptedRequestId },
      orderBy: { uploadedAt: 'desc' },
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    }));
    return records.filter((record: AnyRecord) => searchDocumentRecord(record, search));
  }

  static async removeScanDocument(params: RemoveResultDocumentParams) {
    const document = await model('scanResultDocument').findFirst({ where: { id: params.documentId, facilityId: params.facilityId } });
    if (!document) throw httpError('Scan result document was not found.', 404);
    const scan = await model('scanAcceptedRequest').findFirst({ where: { id: document.scanAcceptedRequestId, facilityId: params.facilityId } });
    if (scan?.status === SCAN_STATUS.SENT_TO_CLINICIAN) {
      throw httpError('Cannot remove documents after the scan result has been sent to the clinician.', 400);
    }

    await softOrHardDelete('scanResultDocument', params.documentId, params.actorId, params.hardDelete);
    await safeAuditLog({
      facilityId: params.facilityId,
      actorId: params.actorId,
      action: 'SCAN_RESULT_DOCUMENT_REMOVED',
      module: 'Scan',
      entityId: params.documentId,
      details: `Document ${document.originalName} removed from scan result.`,
      createdAt: new Date(),
    });
    return { deleted: true, documentId: params.documentId };
  }
}

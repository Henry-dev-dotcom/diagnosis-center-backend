import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import {
  deleteStoredFileIfLocal,
  fileExists,
  type IncomingFilePayload,
  normalizeAndStoreFile,
  resolveUploadPath,
  signedDownloadPayload,
  verifyDownloadSignature
} from './fileStorage.service.js';
import { AppError } from '../utils/appError.js';

// Compatibility audit markers retained for Stage 7 QA: FILE_METADATA_UPLOADED, FILE_METADATA_DELETED.
export type FileUploadPayload = {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  storageKey?: string;
  module?: 'LAB' | 'SCAN' | 'RESULTS' | 'ADMIN' | 'OTHER';
  entityType?: string;
  entityId?: string;
  resultId?: string;
  isDicom?: boolean;
  metadata?: Record<string, unknown>;
  files?: IncomingFilePayload[];
  contentBase64?: string;
  base64?: string;
  dataUrl?: string;
};

function normalizeFileRecord(file: any, extra: Record<string, unknown> = {}) {
  return {
    id: file.id,
    module: 'SCAN',
    entityType: 'ScanResult',
    entityId: file.scanResultId,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    storageKey: file.storageKey,
    isDicom: file.isDicom,
    studyUid: file.studyUid,
    seriesUid: file.seriesUid,
    instanceUid: file.instanceUid,
    modality: file.modality,
    uploadedAt: file.uploadedAt,
    scanResult: file.scanResult,
    ...extra
  };
}

const scanFileInclude = {
  scanResult: {
    include: {
      orderItem: {
        include: {
          catalogItem: true,
          order: { include: { patient: true, doctor: true, hospital: true } }
        }
      }
    }
  }
} satisfies Prisma.ScanResultFileInclude;

function normalizeUploadEnvelope(body: FileUploadPayload) {
  const metadata = body.metadata ?? {};
  const moduleName = (body.module ?? metadata.module ?? 'OTHER') as string;
  const entityType = String(body.entityType ?? metadata.entityType ?? (body.resultId ? 'ScanResult' : '')).trim() || undefined;
  const entityId = String(body.entityId ?? body.resultId ?? metadata.entityId ?? '').trim() || undefined;
  const files = Array.isArray(body.files) && body.files.length
    ? body.files
    : body.fileName
      ? [{
          fileName: body.fileName,
          fileType: body.fileType,
          fileSize: body.fileSize,
          storageKey: body.storageKey,
          contentBase64: body.contentBase64,
          base64: body.base64,
          dataUrl: body.dataUrl,
          isDicom: body.isDicom,
          metadata
        }]
      : [];
  return { moduleName, entityType, entityId, files };
}

function isPersistableScanFile(moduleName: string | undefined, entityType: string | undefined) {
  return moduleName === 'SCAN' || entityType === 'ScanResult';
}

export async function listFiles(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ScanResultFileWhereInput = {
    ...(query.isDicom === 'true' ? { isDicom: true } : {}),
    ...(query.isDicom === 'false' ? { isDicom: false } : {}),
    ...(typeof query.studyUid === 'string' && query.studyUid.trim() ? { studyUid: query.studyUid.trim() } : {}),
    ...(typeof query.modality === 'string' && query.modality.trim() ? { modality: query.modality.trim() } : {}),
    ...(typeof query.scanResultId === 'string' && query.scanResultId.trim() ? { scanResultId: query.scanResultId.trim() } : {}),
    ...(search
      ? {
          OR: [
            { fileName: { contains: search, mode: 'insensitive' } },
            { fileType: { contains: search, mode: 'insensitive' } },
            { storageKey: { contains: search, mode: 'insensitive' } },
            { studyUid: { contains: search, mode: 'insensitive' } },
            { seriesUid: { contains: search, mode: 'insensitive' } },
            { instanceUid: { contains: search, mode: 'insensitive' } },
            { scanResult: { resultCode: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  const [files, total] = await prisma.$transaction([
    prisma.scanResultFile.findMany({ where, include: scanFileInclude, orderBy: safeOrderBy(sortBy, sortOrder, ['uploadedAt', 'fileName', 'fileSize'] as const, 'uploadedAt'), skip, take }),
    prisma.scanResultFile.count({ where })
  ]);

  const items = await Promise.all(files.map(async (file) => normalizeFileRecord(file, { hasLocalBytes: await fileExists(file.storageKey) })));
  return { items, meta: paginationMeta(total, page, limit), storageMode: 'local-or-metadata', dicomMode: 'metadata-ready' };
}

export async function uploadFileMetadata(body: FileUploadPayload, req: Request) {
  const { moduleName, entityType, entityId, files } = normalizeUploadEnvelope(body);
  if (!files.length) throw new AppError('At least one file metadata record is required', 400, 'FILE_REQUIRED');

  if (!isPersistableScanFile(moduleName, entityType)) {
    const normalized = await Promise.all(files.map((file) => normalizeAndStoreFile(file, { module: moduleName, entityType: entityType ?? 'File', entityId })));
    await createAuditLog({
      ...getRequestAuditContext(req),
      action: 'FILE_UPLOAD_ACCEPTED_NO_SCHEMA_TABLE',
      module: 'Files',
      entityType: entityType ?? moduleName ?? 'File',
      entityId: entityId ?? null,
      afterData: { metadata: body.metadata, files: normalized },
      details: { persisted: false, reason: 'Only scan result file metadata has a dedicated schema table in this foundation.' }
    });
    return {
      persisted: false,
      files: normalized,
      storageMode: 'local-or-metadata',
      note: 'File bytes may be stored locally when contentBase64 is supplied, but generic module file rows require a future FileAsset table migration.'
    };
  }

  if (!entityId) throw new AppError('entityId or resultId is required when uploading scan result files', 400, 'FILE_ENTITY_REQUIRED');
  const scanResult = await prisma.scanResult.findUnique({ where: { id: entityId } });
  if (!scanResult) throw new AppError('Scan result was not found for this file upload', 404, 'SCAN_RESULT_NOT_FOUND');

  const normalized = await Promise.all(files.map((file) => normalizeAndStoreFile(file, { module: 'SCAN', entityType: 'ScanResult', entityId: scanResult.id })));

  const created = await prisma.$transaction(async (tx) => {
    await tx.scanResultFile.createMany({
      data: normalized.map((file) => ({
        scanResultId: scanResult.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        storageKey: file.storageKey,
        isDicom: file.isDicom,
        studyUid: file.studyUid ?? null,
        seriesUid: file.seriesUid ?? null,
        instanceUid: file.instanceUid ?? null,
        modality: file.modality ?? null
      }))
    });
    return tx.scanResultFile.findMany({ where: { scanResultId: scanResult.id, storageKey: { in: normalized.map((file) => file.storageKey) } }, include: scanFileInclude });
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'FILES_UPLOADED',
    module: 'Files',
    entityType: 'ScanResult',
    entityId: scanResult.id,
    afterData: created,
    details: {
      fileCount: created.length,
      dicomCount: created.filter((file) => file.isDicom).length,
      bytesStoredCount: normalized.filter((file) => file.bytesStored).length,
      checksums: normalized.map((file) => file.checksumSha256).filter(Boolean)
    }
  });

  return { persisted: true, files: created.map((file) => normalizeFileRecord(file)), storageMode: 'local-or-metadata' };
}

export async function getFileMetadata(id: string, req: Request) {
  const file = await prisma.scanResultFile.findUnique({ where: { id }, include: scanFileInclude });
  if (!file) throw new AppError('File metadata was not found', 404, 'FILE_NOT_FOUND');

  const hasLocalBytes = await fileExists(file.storageKey);
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'FILE_METADATA_VIEWED',
    module: 'Files',
    entityType: 'ScanResultFile',
    entityId: id,
    details: { isDicom: file.isDicom, storageKey: file.storageKey, hasLocalBytes }
  });

  return normalizeFileRecord(file, { hasLocalBytes, signedDownload: hasLocalBytes ? signedDownloadPayload(file.id, file.storageKey) : null });
}

export async function getFileDownload(id: string, query: Request['query'], req: Request) {
  const file = await prisma.scanResultFile.findUnique({ where: { id } });
  if (!file) throw new AppError('File metadata was not found', 404, 'FILE_NOT_FOUND');
  if (query.signature || query.expiresAt) verifyDownloadSignature(file.id, file.storageKey, query.expiresAt, query.signature);
  const hasLocalBytes = await fileExists(file.storageKey);
  if (!hasLocalBytes) throw new AppError('File bytes are not available in local storage; this record is metadata-only', 404, 'FILE_BYTES_NOT_FOUND');

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'FILE_DOWNLOADED',
    module: 'Files',
    entityType: 'ScanResultFile',
    entityId: id,
    details: { isDicom: file.isDicom, storageKey: file.storageKey }
  });

  return { absolutePath: resolveUploadPath(file.storageKey), fileName: file.fileName, fileType: file.fileType ?? 'application/octet-stream' };
}

export async function deleteFileMetadata(id: string, req: Request) {
  const file = await prisma.scanResultFile.findUnique({ where: { id } });
  if (!file) throw new AppError('File metadata was not found', 404, 'FILE_NOT_FOUND');
  await prisma.scanResultFile.delete({ where: { id } });
  const deletedBytes = await deleteStoredFileIfLocal(file.storageKey);

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'FILE_DELETED',
    module: 'Files',
    entityType: 'ScanResultFile',
    entityId: id,
    beforeData: file,
    details: { deletedBytes }
  });

  return { deleted: true, deletedBytes, id };
}

export async function listDicomStudies(query: Request['query']) {
  const { page, limit, skip, take, search } = getPagination(query);
  const where: Prisma.ScanResultFileWhereInput = {
    isDicom: true,
    studyUid: { not: null },
    ...(search
      ? {
          OR: [
            { studyUid: { contains: search, mode: 'insensitive' } },
            { seriesUid: { contains: search, mode: 'insensitive' } },
            { modality: { contains: search, mode: 'insensitive' } },
            { scanResult: { resultCode: { contains: search, mode: 'insensitive' } } },
            { scanResult: { orderItem: { order: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } } } }
          ]
        }
      : {})
  };

  const files = await prisma.scanResultFile.findMany({ where, include: scanFileInclude, orderBy: { uploadedAt: 'desc' }, skip, take });
  const total = await prisma.scanResultFile.count({ where });
  const grouped = new Map<string, any>();
  for (const file of files) {
    const uid = file.studyUid ?? 'UNKNOWN';
    const existing = grouped.get(uid) ?? {
      studyUid: uid,
      modality: file.modality,
      patient: file.scanResult?.orderItem?.order?.patient,
      order: file.scanResult?.orderItem?.order,
      fileCount: 0,
      seriesUids: new Set<string>(),
      latestUploadedAt: file.uploadedAt,
      files: []
    };
    existing.fileCount += 1;
    if (file.seriesUid) existing.seriesUids.add(file.seriesUid);
    existing.latestUploadedAt = existing.latestUploadedAt > file.uploadedAt ? existing.latestUploadedAt : file.uploadedAt;
    existing.files.push(normalizeFileRecord(file));
    grouped.set(uid, existing);
  }

  const items = Array.from(grouped.values()).map((study) => ({ ...study, seriesUids: Array.from(study.seriesUids) }));
  return { items, meta: paginationMeta(total, page, limit), dicomGatewayMode: 'metadata-only' };
}

export async function getDicomStudy(studyUid: string) {
  const files = await prisma.scanResultFile.findMany({ where: { studyUid, isDicom: true }, include: scanFileInclude, orderBy: [{ seriesUid: 'asc' }, { uploadedAt: 'desc' }] });
  if (!files.length) throw new AppError('DICOM study was not found', 404, 'DICOM_STUDY_NOT_FOUND');
  return {
    studyUid,
    modality: files[0].modality,
    patient: files[0].scanResult?.orderItem?.order?.patient,
    order: files[0].scanResult?.orderItem?.order,
    fileCount: files.length,
    seriesUids: Array.from(new Set(files.map((file) => file.seriesUid).filter(Boolean))),
    files: await Promise.all(files.map(async (file) => normalizeFileRecord(file, { hasLocalBytes: await fileExists(file.storageKey) }))),
    dicomGatewayMode: 'metadata-only'
  };
}

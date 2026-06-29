import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { RESULT_DOCUMENT_ALLOWED_EXTENSIONS, RESULT_DOCUMENT_ALLOWED_MIME_TYPES, RESULT_DOCUMENT_LIMITS } from '../constants/resultDocument.constants';
import type { ResultDocumentUploadFile } from '../types/resultDocument.types';

export type AnyRecord = Record<string, any>;

export function httpError(message: string, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function normalizeSearch(value: unknown): string {
  return safeString(value).toLowerCase();
}

export function toSafeTake(value: unknown, fallback = 50): number {
  const num = Number(value || fallback);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), 100);
}

export function toSafeSkip(value: unknown): number {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

export function getExtension(fileName: string): string {
  return path.extname(fileName || '').toLowerCase();
}

export function validateResultDocument(file: Partial<ResultDocumentUploadFile>) {
  const originalName = safeString(file.originalName || file.fileName);
  const mimeType = safeString(file.mimeType);
  const fileSize = Number(file.fileSize || 0);
  const extension = getExtension(originalName || safeString(file.fileUrl));

  if (!originalName) throw httpError('Document filename is required.', 400);
  if (!mimeType) throw httpError('Document MIME type is required.', 400);
  if (!fileSize || fileSize < 1) throw httpError('Document file size is required.', 400);
  if (fileSize > RESULT_DOCUMENT_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw httpError(`Document is too large. Maximum size is ${Math.floor(RESULT_DOCUMENT_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB.`, 413);
  }
  if (!RESULT_DOCUMENT_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw httpError('Unsupported document type. Upload PDF, Word, Excel, PNG, JPG, or JPEG files only.', 415);
  }
  if (!RESULT_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)) {
    throw httpError('Unsupported document extension. Upload PDF, Word, Excel, PNG, JPG, or JPEG files only.', 415);
  }
}

export async function checksumSha256(filePath?: string | null): Promise<string | null> {
  if (!filePath) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (_error) {
    return null;
  }
}

export function buildPublicUploadUrl(fileName: string): string {
  return `/uploads/results/${fileName}`;
}

export function buildStorageFileName(originalName: string): string {
  const extension = getExtension(originalName) || '.bin';
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = crypto.randomBytes(8).toString('hex');
  return `result-${stamp}-${random}${extension}`;
}

export function mapMulterFile(file: Express.Multer.File): ResultDocumentUploadFile {
  const storageKey = file.filename || buildStorageFileName(file.originalname);
  return {
    fileName: storageKey,
    originalName: file.originalname || storageKey,
    mimeType: file.mimetype,
    fileSize: file.size,
    fileUrl: buildPublicUploadUrl(storageKey),
    storageKey,
    storageProvider: 'LOCAL',
    extension: getExtension(file.originalname || storageKey),
  };
}

export function mapMetadataDocument(metadata: AnyRecord): ResultDocumentUploadFile {
  return {
    fileName: metadata.fileName || metadata.filename || metadata.name || metadata.originalName,
    originalName: metadata.originalName || metadata.originalname || metadata.name || metadata.fileName || metadata.filename,
    mimeType: metadata.mimeType || metadata.mimetype || 'application/octet-stream',
    fileSize: Number(metadata.fileSize || metadata.size || 0),
    fileUrl: metadata.fileUrl || metadata.url || metadata.path,
    storageKey: metadata.storageKey || metadata.key || null,
    storageProvider: metadata.storageProvider || metadata.provider || 'EXTERNAL',
    checksumSha256: metadata.checksumSha256 || metadata.sha256 || null,
    extension: metadata.extension || getExtension(metadata.originalName || metadata.fileName || metadata.url || ''),
  };
}

export function searchDocumentRecord(record: AnyRecord, search: string): boolean {
  if (!search) return true;
  return [
    record.id,
    record.orderId,
    record.patientId,
    record.originalName,
    record.fileName,
    record.mimeType,
    record.documentType,
    record.uploadedById,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

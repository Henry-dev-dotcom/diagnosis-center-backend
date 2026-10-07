import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';

export type IncomingFilePayload = {
  fileName?: string;
  name?: string;
  fileType?: string | null;
  type?: string | null;
  fileSize?: number | null;
  size?: number | null;
  storageKey?: string | null;
  contentBase64?: string | null;
  base64?: string | null;
  dataUrl?: string | null;
  isDicom?: boolean | null;
  studyUid?: string | null;
  seriesUid?: string | null;
  instanceUid?: string | null;
  modality?: string | null;
  metadata?: Record<string, unknown>;
};

export type NormalizedUploadFile = {
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  storageKey: string;
  storageDriver: 'local' | 'metadata';
  checksumSha256?: string;
  bytesStored: boolean;
  isDicom: boolean;
  studyUid?: string | null;
  seriesUid?: string | null;
  instanceUid?: string | null;
  modality?: string | null;
};

const DICOM_EXTENSIONS = /\.(dcm|dicom)$/i;

/**
 * What may be uploaded. Anything a browser can execute or render as active
 * content - HTML, SVG, JavaScript - is deliberately absent, so a stored file
 * served back from this origin can never become a stored-XSS payload.
 * UPLOAD_ALLOWED_MIME_TYPES (comma-separated) replaces this list for a
 * deployment that needs more.
 */
const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/dicom',
  // Scanner output (DICOM in particular) often arrives with no type at all.
  'application/octet-stream'
]);

function allowedMimeTypes(): Set<string> {
  if (!env.UPLOAD_ALLOWED_MIME_TYPES) return DEFAULT_ALLOWED_MIME_TYPES;
  const entries = env.UPLOAD_ALLOWED_MIME_TYPES.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return new Set(entries);
}

/** Lowercased media type without parameters: "Text/CSV; charset=utf-8" -> "text/csv". */
export function normalizeMimeType(value: string) {
  return value.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

type SniffedType = 'jpeg' | 'png' | 'gif' | 'webp' | 'pdf' | 'dicom';

/** Magic-byte check for the binary types we accept; null when nothing matches. */
function sniffBufferType(buffer: Buffer): SniffedType | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length > 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buffer.length > 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  // DICOM Part 10: a 128-byte preamble followed by "DICM".
  if (buffer.length > 132 && buffer.subarray(128, 132).toString('ascii') === 'DICM') return 'dicom';
  return null;
}

const SNIFFED_TO_MIME: Record<SniffedType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  dicom: 'application/dicom'
};

function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 180) || 'upload.bin';
}

function safeSegment(segment: string) {
  return segment.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80) || 'unknown';
}

function extractBase64(file: IncomingFilePayload) {
  const raw = file.contentBase64 ?? file.base64 ?? file.dataUrl ?? null;
  if (!raw) return null;
  const match = /^data:([^;]+);base64,(.*)$/i.exec(raw);
  return match ? match[2] : raw;
}

export function inferDicom(file: IncomingFilePayload) {
  const fileName = file.fileName ?? file.name ?? '';
  const fileType = file.fileType ?? file.type ?? '';
  return Boolean(file.isDicom) || DICOM_EXTENSIONS.test(fileName) || /dicom/i.test(String(fileType));
}

export function buildStorageKey(moduleName: string, entityType: string, entityId: string | undefined, fileName: string) {
  const today = new Date().toISOString().slice(0, 10);
  const unique = crypto.randomBytes(8).toString('hex');
  return [safeSegment(moduleName), safeSegment(entityType), safeSegment(entityId ?? 'unlinked'), today, `${unique}-${safeFileName(fileName)}`].join('/');
}

export function resolveUploadPath(storageKey: string) {
  const normalized = path.normalize(storageKey).replace(/^([/\\])+/, '');
  if (normalized.includes('..')) throw new AppError('Invalid storage key', 400, 'INVALID_STORAGE_KEY');
  return path.resolve(process.cwd(), env.UPLOAD_ROOT, normalized);
}

export async function normalizeAndStoreFile(file: IncomingFilePayload, context: { module: string; entityType: string; entityId?: string | null }): Promise<NormalizedUploadFile> {
  const fileName = String(file.fileName ?? file.name ?? '').trim();
  if (!fileName) throw new AppError('File name is required', 400, 'FILE_NAME_REQUIRED');

  const fileType = String(file.fileType ?? file.type ?? 'application/octet-stream').trim() || 'application/octet-stream';
  const declaredSize = Number(file.fileSize ?? file.size ?? 0);
  const base64 = extractBase64(file);
  let storageKey = String(file.storageKey ?? buildStorageKey(context.module, context.entityType, context.entityId ?? undefined, fileName)).trim();
  const isDicom = inferDicom(file);

  // Allowlist the declared type before touching any bytes. DICOM is exempt:
  // scanners send many transfer syntaxes and the study metadata is what matters.
  const mimeType = normalizeMimeType(fileType);
  if (!isDicom && !allowedMimeTypes().has(mimeType)) {
    throw new AppError(`Files of type "${mimeType}" cannot be uploaded`, 415, 'FILE_TYPE_NOT_ALLOWED');
  }

  if (declaredSize > env.MAX_UPLOAD_BYTES) {
    throw new AppError(`File exceeds maximum upload size of ${env.MAX_UPLOAD_BYTES} bytes`, 413, 'FILE_TOO_LARGE');
  }

  if (!base64 || env.UPLOAD_STORAGE_DRIVER === 'metadata') {
    return {
      fileName,
      fileType,
      fileSize: declaredSize || null,
      storageKey,
      storageDriver: 'metadata',
      bytesStored: false,
      isDicom,
      studyUid: String(file.studyUid ?? file.metadata?.studyUid ?? '').trim() || null,
      seriesUid: String(file.seriesUid ?? file.metadata?.seriesUid ?? '').trim() || null,
      instanceUid: String(file.instanceUid ?? file.metadata?.instanceUid ?? '').trim() || null,
      modality: String(file.modality ?? file.metadata?.modality ?? '').trim() || null
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new AppError('File content must be valid base64', 400, 'INVALID_BASE64_UPLOAD');
  }

  if (!buffer.byteLength) throw new AppError('File content is empty', 400, 'EMPTY_UPLOAD');
  if (buffer.byteLength > env.MAX_UPLOAD_BYTES) {
    throw new AppError(`File exceeds maximum upload size of ${env.MAX_UPLOAD_BYTES} bytes`, 413, 'FILE_TOO_LARGE');
  }

  // Trust bytes, not labels: a file whose magic bytes contradict its declared
  // type is rejected. Plain-text types (CSV, .txt) carry no magic bytes, so
  // only a contradiction - not an absence - fails.
  const sniffed = sniffBufferType(buffer);
  if (sniffed && SNIFFED_TO_MIME[sniffed] !== mimeType && !(isDicom && sniffed === 'dicom')) {
    throw new AppError('File content does not match its declared type', 415, 'FILE_TYPE_MISMATCH');
  }

  const absolutePath = resolveUploadPath(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
    const replacementKey = buildStorageKey(context.module, context.entityType, context.entityId ?? undefined, fileName);
    const replacementPath = resolveUploadPath(replacementKey);
    await fs.mkdir(path.dirname(replacementPath), { recursive: true });
    await fs.writeFile(replacementPath, buffer, { flag: 'wx' });
    storageKey = replacementKey;
  });

  return {
    fileName,
    fileType,
    fileSize: buffer.byteLength,
    storageKey,
    storageDriver: 'local',
    checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytesStored: true,
    isDicom,
    studyUid: String(file.studyUid ?? file.metadata?.studyUid ?? '').trim() || null,
    seriesUid: String(file.seriesUid ?? file.metadata?.seriesUid ?? '').trim() || null,
    instanceUid: String(file.instanceUid ?? file.metadata?.instanceUid ?? '').trim() || null,
    modality: String(file.modality ?? file.metadata?.modality ?? '').trim() || null
  };
}

export async function fileExists(storageKey: string) {
  try {
    const stat = await fs.stat(resolveUploadPath(storageKey));
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function deleteStoredFileIfLocal(storageKey: string) {
  try {
    await fs.unlink(resolveUploadPath(storageKey));
    return true;
  } catch {
    return false;
  }
}

export function signedDownloadPayload(fileId: string, storageKey: string) {
  const expiresAt = new Date(Date.now() + env.SIGNED_FILE_URL_TTL_MINUTES * 60_000);
  const payload = `${fileId}:${storageKey}:${expiresAt.toISOString()}`;
  const signature = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('hex');
  return {
    downloadUrl: `/api/files/${fileId}/download?expiresAt=${encodeURIComponent(expiresAt.toISOString())}&signature=${signature}`,
    expiresAt,
    signature
  };
}

export function verifyDownloadSignature(fileId: string, storageKey: string, expiresAt: unknown, signature: unknown) {
  const expires = new Date(String(expiresAt ?? ''));
  if (Number.isNaN(expires.getTime()) || expires.getTime() < Date.now()) {
    throw new AppError('Download link has expired', 403, 'DOWNLOAD_LINK_EXPIRED');
  }
  const payload = `${fileId}:${storageKey}:${expires.toISOString()}`;
  const expected = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('hex');
  if (typeof signature !== 'string' || signature.length !== expected.length) {
    throw new AppError('Invalid download signature', 403, 'INVALID_DOWNLOAD_SIGNATURE');
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new AppError('Invalid download signature', 403, 'INVALID_DOWNLOAD_SIGNATURE');
  }
}

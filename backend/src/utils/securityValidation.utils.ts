import path from 'path';
import crypto from 'crypto';
import {
  MAX_RESULT_DOCUMENT_SIZE_BYTES,
  RESULT_DOCUMENT_ALLOWED_EXTENSIONS,
  RESULT_DOCUMENT_ALLOWED_MIME_TYPES,
} from '../constants/securityValidation.constants';
import type { FileSecurityValidationInput, LabSelectedTestInput, SecureFacilityRequest } from '../types/securityValidation.types';

export function getActorId(req: SecureFacilityRequest): string | null {
  return req.user?.id || req.user?.userId || null;
}

export function getFacilityId(req: SecureFacilityRequest): string | null {
  return req.facilityId || String(req.headers['x-facility-id'] || '') || req.user?.facilityId || null;
}

export function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeId(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

export function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

export function assertNoDuplicateSelectedTests(selectedTests: LabSelectedTestInput[]) {
  const seen = new Set<string>();
  for (const test of selectedTests) {
    const key = test.orderItemId || test.testId || test.testCode || test.testName;
    if (!key) {
      const error = new Error('Each selected test must include an order item, test id, code, or name.');
      (error as any).statusCode = 400;
      throw error;
    }
    if (seen.has(String(key))) {
      const error = new Error(`Duplicate selected test detected: ${key}`);
      (error as any).statusCode = 409;
      throw error;
    }
    seen.add(String(key));
  }
}

export function validateResultDocumentFile(file: FileSecurityValidationInput) {
  const originalName = normalizeString(file.originalname);
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = normalizeString(file.mimetype).toLowerCase();
  const size = Number(file.size || 0);

  if (!originalName) {
    const error = new Error('Uploaded document must have a valid file name.');
    (error as any).statusCode = 400;
    throw error;
  }

  if (!RESULT_DOCUMENT_ALLOWED_EXTENSIONS.includes(extension as any)) {
    const error = new Error(`Unsupported file extension: ${extension || 'unknown'}.`);
    (error as any).statusCode = 415;
    throw error;
  }

  if (!RESULT_DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    const error = new Error(`Unsupported file type: ${mimeType || 'unknown'}.`);
    (error as any).statusCode = 415;
    throw error;
  }

  if (size <= 0 || size > MAX_RESULT_DOCUMENT_SIZE_BYTES) {
    const error = new Error(`File size must be greater than 0 and not exceed ${MAX_RESULT_DOCUMENT_SIZE_BYTES} bytes.`);
    (error as any).statusCode = 413;
    throw error;
  }
}

export function createChecksum(buffer?: Buffer | string | null): string | null {
  if (!buffer) return null;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function buildFacilityWhere(req: SecureFacilityRequest, extra: Record<string, unknown> = {}) {
  if (req.isSuperAdmin && !req.facilityId) return extra;
  const facilityId = getFacilityId(req);
  if (!facilityId) {
    const error = new Error('Facility context is required.');
    (error as any).statusCode = 400;
    throw error;
  }
  return { ...extra, facilityId };
}

export function assertUnlockedStatus(status: string | null | undefined, lockedStatuses: readonly string[], message: string) {
  if (status && lockedStatuses.includes(status as any)) {
    const error = new Error(message);
    (error as any).statusCode = 409;
    throw error;
  }
}

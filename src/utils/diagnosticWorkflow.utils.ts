import crypto from 'crypto';
import type { FacilityScopedRequest } from '../types/facility-request.types';

export function getActorId(req: FacilityScopedRequest): string {
  return req.user?.id || req.user?.userId || req.user?.sub || 'system';
}

export function getActorName(req: FacilityScopedRequest): string {
  return req.user?.name || req.user?.fullName || req.user?.email || getActorId(req);
}

export function getRequiredFacilityId(req: FacilityScopedRequest): string {
  if (!req.facilityId && !req.isSuperAdmin) {
    throw Object.assign(new Error('Facility context is required.'), { statusCode: 400 });
  }
  const facilityId = req.facilityId || String(req.params.facilityId || req.body.facilityId || req.query.facilityId || '');
  if (!facilityId) throw Object.assign(new Error('Facility ID is required.'), { statusCode: 400 });
  return facilityId;
}

export function normalizeSearch(value?: unknown): string {
  return String(value || '').trim();
}

export function makeCode(prefix: string): string {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

export function parseArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function computeResultFlag(value: string, low?: string | number | null, high?: string | number | null): string {
  const numericValue = Number(value);
  const numericLow = low === undefined || low === null || low === '' ? NaN : Number(low);
  const numericHigh = high === undefined || high === null || high === '' ? NaN : Number(high);
  if (Number.isNaN(numericValue)) return 'Normal';
  if (!Number.isNaN(numericLow) && numericValue < numericLow) return 'Low';
  if (!Number.isNaN(numericHigh) && numericValue > numericHigh) return 'High';
  return 'Normal';
}

export function buildMetadata(extra: Record<string, unknown> = {}) {
  return {
    source: 'diagnostic-workflow-api',
    generatedAt: new Date().toISOString(),
    ...extra,
  };
}

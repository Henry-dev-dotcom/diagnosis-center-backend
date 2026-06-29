import crypto from 'crypto';
import type { AnyRecord, RequestedScanDTO, ScanWorkflowRequest } from '../types/scanWorkflow.types';

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export function badRequest(message: string) {
  return httpError(400, message);
}

export function forbidden(message: string) {
  return httpError(403, message);
}

export function notFound(message: string) {
  return httpError(404, message);
}

export function conflict(message: string) {
  return httpError(409, message);
}

export function normalizeSearch(value?: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function safeText(value?: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

export function parseArray<T = AnyRecord>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value) return [];
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

export function stringifyForSearch(value: unknown): string {
  try {
    return JSON.stringify(value || '');
  } catch (_error) {
    return String(value || '');
  }
}

export function toSafeTake(value?: string | number, fallback = 50, max = 100): number {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function toSafeSkip(value?: string | number): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function buildJsonMetadata(value: unknown): AnyRecord {
  if (!value || typeof value !== 'object') return {};
  const copy = { ...(value as AnyRecord) };
  delete copy.patient;
  delete copy.clinician;
  delete copy.doctor;
  delete copy.hospital;
  delete copy.items;
  delete copy.orderItems;
  return copy;
}

export function makeWorkflowCode(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function resolveOrderPatientText(order: AnyRecord): string {
  return (
    order.patient?.fullName ||
    order.patient?.name ||
    [order.patient?.firstName, order.patient?.lastName].filter(Boolean).join(' ') ||
    order.patientName ||
    order.patientId ||
    'Unknown patient'
  );
}

export function resolveOrderClinicianId(order: AnyRecord): string | null {
  return (
    order.clinicianId ||
    order.doctorId ||
    order.requestedById ||
    order.clinician?.id ||
    order.doctor?.id ||
    null
  );
}

export function getRequiredFacilityId(req: ScanWorkflowRequest): string {
  const facilityId = req.resolvedFacilityId || req.facilityId || req.headers?.['x-facility-id'] || req.body?.facilityId || req.query?.facilityId;
  if (!facilityId) throw badRequest('Facility context is required.');
  return String(facilityId);
}

export function getActorId(req: ScanWorkflowRequest): string {
  const actorId = req.user?.id || req.user?.userId || req.body?.actorId;
  if (!actorId) throw forbidden('Authenticated user context is required.');
  return String(actorId);
}

export function getActorName(req: ScanWorkflowRequest): string | null {
  return req.user?.name || req.user?.fullName || req.user?.email || null;
}

export function buildOrderSearchValues(order: AnyRecord): string[] {
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
    stringifyForSearch(order.items || order.orderItems || order.services || []),
  ].filter(Boolean).map(String);
}

export function uniqueScanKey(scan: RequestedScanDTO): string {
  return String(scan.orderItemId || scan.scanId || scan.scanCode || scan.scanName).trim().toLowerCase();
}

export function createFileChecksum(input: { buffer?: Buffer; fileName?: string; fileSize?: number; originalName?: string }): string {
  if (input.buffer) return crypto.createHash('sha256').update(input.buffer).digest('hex');
  return crypto.createHash('sha256').update(`${input.fileName || ''}:${input.fileSize || 0}:${input.originalName || ''}`).digest('hex');
}

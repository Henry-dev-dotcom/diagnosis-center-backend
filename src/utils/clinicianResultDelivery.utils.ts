import { CLINICIAN_RESULT_PAGE_LIMITS } from '../constants/clinicianResultDelivery.constants';

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

export function parseDate(value: unknown): Date | undefined {
  const raw = safeString(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toSafeTake(value: unknown): number {
  const n = Number(value || CLINICIAN_RESULT_PAGE_LIMITS.DEFAULT_TAKE);
  if (!Number.isFinite(n) || n <= 0) return CLINICIAN_RESULT_PAGE_LIMITS.DEFAULT_TAKE;
  return Math.min(Math.floor(n), CLINICIAN_RESULT_PAGE_LIMITS.MAX_TAKE);
}

export function toSafeSkip(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function json(value: unknown): AnyRecord | null {
  if (!value) return null;
  if (typeof value === 'object') return value as AnyRecord;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return null;
  }
}

export function getPatientDisplayName(patient: AnyRecord | null | undefined): string {
  if (!patient) return 'Unknown patient';
  return patient.fullName || patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.patientCode || patient.id || 'Unknown patient';
}

export function getClinicianDisplayName(clinician: AnyRecord | null | undefined): string {
  if (!clinician) return 'Clinician';
  return clinician.fullName || clinician.name || `${clinician.firstName || ''} ${clinician.lastName || ''}`.trim() || clinician.email || 'Clinician';
}

export function buildResultTitle(source: string, patient?: AnyRecord | null): string {
  const patientName = getPatientDisplayName(patient);
  const label = source === 'SCAN' ? 'Imaging result' : source === 'LAB' ? 'Laboratory result' : 'Diagnostic result';
  return `${label} for ${patientName}`;
}

export function matchesSearch(record: AnyRecord, q: string): boolean {
  if (!q) return true;
  const payload = json(record.payload) || record.payload || {};
  const values = [
    record.id,
    record.orderId,
    record.patientId,
    record.clinicianId,
    record.resultId,
    record.title,
    record.summary,
    record.source,
    record.status,
    record.priority,
    record.patient?.fullName,
    record.patient?.name,
    record.patient?.patientCode,
    record.order?.orderNumber,
    payload?.sampleCode,
    payload?.scanCode,
    JSON.stringify(payload?.tests || payload?.documents || payload?.findings || payload || ''),
  ];
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
}

export function buildDateRange(from: unknown, to: unknown) {
  const gte = parseDate(from);
  const lte = parseDate(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

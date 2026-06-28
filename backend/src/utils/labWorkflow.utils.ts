export type AnyRecord = Record<string, any>;

export function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

export function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export function normalizeSearch(value?: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function toSafeTake(value?: unknown, fallback = 50, maximum = 100): number {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

export function toSafeSkip(value?: unknown): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function parseArray<T = AnyRecord>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

export function stringifyForSearch(value: unknown): string {
  try {
    return JSON.stringify(value || '').toLowerCase();
  } catch (_error) {
    return String(value || '').toLowerCase();
  }
}

export function makeWorkflowCode(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function buildJsonMetadata(data: AnyRecord): AnyRecord {
  return JSON.parse(JSON.stringify(data || {}));
}

export function safeText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text.length ? text : null;
}

export function computeBasicFlag(value: string, referenceRange?: string | null): string | null {
  if (!referenceRange) return null;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) return null;

  const range = String(referenceRange).match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (!range) return null;

  const low = Number(range[1]);
  const high = Number(range[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (numeric < low) return 'LOW';
  if (numeric > high) return 'HIGH';
  return 'NORMAL';
}

export function resolveOrderPatientText(order: AnyRecord): string {
  return order.patient?.fullName || order.patient?.name || order.patientName || order.patientId || '';
}

export function resolveOrderClinicianId(order: AnyRecord): string | null {
  return order.clinicianId || order.doctorId || order.requestedById || order.clinician?.id || order.doctor?.id || null;
}

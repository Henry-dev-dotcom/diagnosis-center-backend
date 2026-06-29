import type { AnyRecord, FacilityManagementRequest } from '../types/facilityManagement.types';

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

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function nullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length ? text : null;
}

export function normalizeCode(value: unknown): string {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function makeFacilityCode(name: string): string {
  const base = normalizeCode(name).slice(0, 16) || 'FACILITY';
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

export function toBool(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
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

export function getActor(req: FacilityManagementRequest) {
  return {
    actorId: req.user?.id || req.user?.userId || 'system',
    actorRole: req.user?.role || req.user?.roleKey || null,
    actorName: req.user?.name || req.user?.fullName || req.user?.email || null,
  };
}

export function isSuperAdmin(req: FacilityManagementRequest): boolean {
  const role = String(req.user?.role || req.user?.roleKey || '').toLowerCase();
  return Boolean(req.facilityContext?.isSuperAdmin || role === 'super_admin' || role === 'superadmin' || role === 'admin');
}

export function requireSuperAdmin(req: FacilityManagementRequest) {
  if (!isSuperAdmin(req)) {
    throw forbidden('Only a super admin can manage diagnostic facilities.');
  }
}

export function safeJson(value: unknown): AnyRecord | null {
  if (!value) return null;
  if (typeof value === 'object') return value as AnyRecord;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
  return null;
}

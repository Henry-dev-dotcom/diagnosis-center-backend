import crypto from 'crypto';
import { RECEPTION_PAGE_LIMITS, RECEPTION_PRIORITY } from '../constants/receptionWorkflow.constants';

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

export function buildDateRange(from: unknown, to: unknown) {
  const gte = parseDate(from);
  const lte = parseDate(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export function toSafeTake(value: unknown): number {
  const n = Number(value || RECEPTION_PAGE_LIMITS.DEFAULT_TAKE);
  if (!Number.isFinite(n) || n <= 0) return RECEPTION_PAGE_LIMITS.DEFAULT_TAKE;
  return Math.min(Math.floor(n), RECEPTION_PAGE_LIMITS.MAX_TAKE);
}

export function toSafeSkip(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function normalizePriority(value: unknown): string {
  const priority = safeString(value).toUpperCase();
  if (priority === RECEPTION_PRIORITY.URGENT || priority === RECEPTION_PRIORITY.STAT) return priority;
  return RECEPTION_PRIORITY.ROUTINE;
}

export function makeReceptionCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${date}-${random}`;
}

export function normalizePatientName(patient: AnyRecord): string {
  const fullName = patient.fullName || patient.name || `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
  return fullName || 'Walk-in Patient';
}

export function normalizeItems(items: AnyRecord[] = [], requestType: 'LAB' | 'SCAN') {
  return items.map((item, index) => {
    const name = item.testName || item.scanName || item.serviceName || item.name || item.label || `${requestType === 'LAB' ? 'Laboratory test' : 'Scan'} ${index + 1}`;
    const code = item.testCode || item.scanCode || item.serviceCode || item.code || item.id || `${requestType}-${index + 1}`;
    return {
      facilityId: item.facilityId,
      serviceType: requestType,
      type: requestType,
      category: requestType === 'LAB' ? 'LABORATORY' : 'IMAGING',
      serviceCode: String(code),
      serviceName: String(name),
      name: String(name),
      testName: requestType === 'LAB' ? String(name) : undefined,
      scanName: requestType === 'SCAN' ? String(name) : undefined,
      testCode: requestType === 'LAB' ? String(code) : undefined,
      scanCode: requestType === 'SCAN' ? String(code) : undefined,
      catalogId: item.catalogId || item.testId || item.scanId || item.serviceId || item.id || null,
      quantity: Number(item.quantity || 1),
      price: item.price ?? item.amount ?? null,
      priority: item.priority,
      referenceRange: item.referenceRange || item.normalRange || null,
      unit: item.unit || item.units || null,
      metadata: item.metadata || item,
    };
  });
}

export function matchesPatientSearch(patient: AnyRecord, q: string): boolean {
  if (!q) return true;
  const values = [
    patient.id,
    patient.patientCode,
    patient.patientId,
    patient.fullName,
    patient.name,
    patient.firstName,
    patient.lastName,
    patient.phone,
    patient.email,
    patient.nationalId,
  ];
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
}

export function matchesOrderSearch(order: AnyRecord, q: string): boolean {
  if (!q) return true;
  const values = [
    order.id,
    order.orderNumber,
    order.orderCode,
    order.patientId,
    order.clinicianId,
    order.requestType,
    order.priority,
    order.status,
    order.patient?.fullName,
    order.patient?.name,
    order.patient?.patientCode,
    JSON.stringify(order.items || order.orderItems || order.metadata || ''),
  ];
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
}

import type { Request, Response } from 'express';
import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { currentFacilityId, runAsSystem } from './tenantContext.js';

// Log rows carry facilityId when known. Callers outside a tenant context (for
// example 'finish' handlers) pass it explicitly; otherwise the current context is used.
export type AuditInput = {
  facilityId?: string | null;
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  details?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SystemEventInput = {
  facilityId?: string | null;
  actorId?: string | null;
  level?: 'debug' | 'info' | 'warn' | 'error' | string;
  source: string;
  message: string;
  details?: unknown;
};

export type ApiRequestLogInput = {
  facilityId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  method: string;
  path: string;
  statusCode?: number | null;
  durationMs?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function getRequestAuditContext(req: Request) {
  return {
    facilityId: req.user?.facilityId ?? null,
    actorId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null
  };
}

export async function createAuditLog(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        facilityId: input.facilityId ?? currentFacilityId(),
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        module: input.module,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        beforeData: toJsonValue(input.beforeData),
        afterData: toJsonValue(input.afterData),
        details: toJsonValue(input.details),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  } catch (error) {
    // Audit logging must not break primary clinical, billing, or access-control workflows.
    console.error('Audit log failed', error);
  }
}

export async function createSystemEvent(input: SystemEventInput) {
  try {
    await prisma.systemEvent.create({
      data: {
        facilityId: input.facilityId ?? currentFacilityId(),
        actorId: input.actorId ?? null,
        level: input.level ?? 'info',
        source: input.source,
        message: input.message,
        details: toJsonValue(input.details)
      }
    });
  } catch (error) {
    console.error('System event log failed', error);
  }
}

/*
  Request logs (one per API call) are written in batches: at most every
  second, or every 200 rows, and on shutdown. This takes a database write off
  every request. Audit logs are not batched.
*/
const pendingRequestLogs: Prisma.ApiRequestLogCreateManyInput[] = [];
let requestLogTimer: NodeJS.Timeout | null = null;
const REQUEST_LOG_FLUSH_MS = 1000;
const REQUEST_LOG_BATCH = 200;

export async function createApiRequestLog(input: ApiRequestLogInput) {
  pendingRequestLogs.push({
    facilityId: input.facilityId ?? currentFacilityId(),
    userId: input.userId ?? null,
    requestId: input.requestId ?? null,
    method: input.method,
    path: input.path,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  });
  if (pendingRequestLogs.length >= REQUEST_LOG_BATCH) void flushApiRequestLogs();
  else if (!requestLogTimer) {
    requestLogTimer = setTimeout(() => void flushApiRequestLogs(), REQUEST_LOG_FLUSH_MS);
    requestLogTimer.unref();
  }
}

export async function flushApiRequestLogs() {
  if (requestLogTimer) {
    clearTimeout(requestLogTimer);
    requestLogTimer = null;
  }
  if (!pendingRequestLogs.length) return;
  const batch = pendingRequestLogs.splice(0, pendingRequestLogs.length);
  try {
    // Each row carries its own facility (or none), so write them as they are.
    await runAsSystem('audit.request-log', () => prisma.apiRequestLog.createMany({ data: batch }));
  } catch (error) {
    console.error(`API request log failed (${batch.length} rows)`, error);
  }
}

export function moduleNameForPath(path: string) {
  const cleaned = path.replace(/^\/api\/?/, '').replace(/^\//, '');
  const [first] = cleaned.split('/');
  if (!first) return 'System';
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
}

export function actionForRequest(req: Request, explicitAction?: string) {
  if (explicitAction) return explicitAction.toUpperCase().replace(/\s+/g, '_');

  const path = req.originalUrl.toLowerCase();
  if (path.includes('/sign-off')) return `${req.method}_SIGN_OFF`;
  if (path.includes('/submit-review')) return `${req.method}_SUBMIT_REVIEW`;
  if (path.includes('/release')) return `${req.method}_RELEASE`;
  if (path.includes('/cancel')) return `${req.method}_CANCEL`;
  if (path.includes('/confirm')) return `${req.method}_CONFIRM`;
  if (path.includes('/check-in')) return `${req.method}_CHECK_IN`;
  if (path.includes('/accept')) return `${req.method}_ACCEPT`;
  if (path.includes('/reject')) return `${req.method}_REJECT`;
  if (path.includes('/payment')) return `${req.method}_PAYMENT`;
  if (path.includes('/download') || path.includes('/report')) return `${req.method}_REPORT_ACCESS`;

  if (req.method === 'POST') return 'CREATE';
  if (req.method === 'PATCH' || req.method === 'PUT') return 'UPDATE';
  if (req.method === 'DELETE') return 'DELETE';
  return 'READ';
}

export function shouldAuditSuccessfulRequest(req: Request) {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return true;

  const path = req.originalUrl.toLowerCase();
  return (
    path.includes('/audit-logs') ||
    path.includes('/system-events') ||
    path.includes('/api-request-logs') ||
    path.includes('/results/') ||
    path.includes('/reports') ||
    path.includes('/files/') ||
    path.includes('/delivery-logs')
  );
}

export function auditSuccessfulRequest(req: Request, res: Response, options?: { module?: string; action?: string; entityType?: string; entityId?: string | null; details?: unknown }) {
  if (res.statusCode >= 400) return;
  if (!shouldAuditSuccessfulRequest(req) && !options?.action) return;

  const context = getRequestAuditContext(req);
  void createAuditLog({
    ...context,
    action: actionForRequest(req, options?.action),
    module: options?.module ?? moduleNameForPath(req.originalUrl),
    entityType: options?.entityType ?? inferEntityType(req.originalUrl),
    entityId: options?.entityId ?? req.params.id ?? req.params.orderId ?? req.params.patientId ?? req.params.catalogItemId ?? null,
    details: {
      method: req.method,
      path: req.originalUrl,
      params: req.params,
      query: req.query,
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      ...((options?.details as Record<string, unknown> | undefined) ?? {})
    }
  });
}

function inferEntityType(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.includes('/patients')) return 'Patient';
  if (normalized.includes('/orders')) return 'Order';
  if (normalized.includes('/samples')) return 'LabSample';
  if (normalized.includes('/lab/results')) return 'LabResult';
  if (normalized.includes('/scan/results')) return 'ScanResult';
  if (normalized.includes('/scan/bookings')) return 'ScanBooking';
  if (normalized.includes('/billing/invoices')) return 'Invoice';
  if (normalized.includes('/payments')) return 'Payment';
  if (normalized.includes('/finance/shifts')) return 'CashierShift';
  if (normalized.includes('/finance/expenses')) return 'Expense';
  if (normalized.includes('/finance/ledger')) return 'LedgerEntry';
  if (normalized.includes('/admin/users')) return 'User';
  if (normalized.includes('/admin/hospitals')) return 'Hospital';
  if (normalized.includes('/admin/doctors')) return 'DoctorProfile';
  if (normalized.includes('/admin/catalog')) return 'CatalogItem';
  if (normalized.includes('/admin/reference-ranges')) return 'ReferenceRange';
  if (normalized.includes('/results')) return 'Result';
  if (normalized.includes('/reports')) return 'Report';
  if (normalized.includes('/notifications')) return 'Notification';
  if (normalized.includes('/files')) return 'File';
  return null;
}

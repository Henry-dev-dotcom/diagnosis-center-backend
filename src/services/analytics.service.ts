import {
  DeliveryStatus,
  ExpenseStatus,
  InvoiceStatus,
  LabResultStatus,
  LabSampleStatus,
  OrderStatus,
  Prisma,
  ReportStatus,
  ResultFlag,
  ScanStatus,
  ShiftStatus
} from '@prisma/client';
import type { Request } from 'express';
import { PHASE6_ROUTE_CONTRACTS } from '../config/phase6RouteMap.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../config/permissions.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { prisma } from './prisma.service.js';

function toDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateWhere(query: Request['query'], field = 'createdAt') {
  const from = toDate(query.from);
  const to = toDate(query.to);
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

function todayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

function money(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function sumDecimal<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce((sum, item) => sum + money(item[key] as Prisma.Decimal | number | null | undefined), 0);
}

function countGroup<T extends string | number | symbol>(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const group = String(row[key] ?? 'UNKNOWN');
    const count = Number((row._count as { _all?: number } | undefined)?._all ?? 0);
    result[group] = count;
    return result;
  }, {});
}

async function auditAnalyticsView(req: Request, action: string, module: string, details: Record<string, unknown>) {
  await createAuditLog({
    ...getRequestAuditContext(req),
    action,
    module,
    entityType: 'AnalyticsView',
    details
  });
}

export async function getExecutiveDashboard(query: Request['query'], req: Request) {
  const today = todayWindow();
  const orderWhere = dateWhere(query, 'submittedAt') as Prisma.OrderWhereInput;
  const createdWhere = dateWhere(query, 'createdAt') as Prisma.InvoiceWhereInput;

  const [
    todayOrders,
    todayVisits,
    todayPayments,
    orderStatus,
    invoiceStatus,
    labPending,
    scanPending,
    reportsAvailable,
    failedDeliveries,
    recentAudit
  ] = await prisma.$transaction([
    prisma.order.count({ where: { submittedAt: today } }),
    prisma.patientVisit.count({ where: { checkedInAt: today } }),
    prisma.payment.aggregate({ where: { createdAt: today }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: createdWhere, _sum: { total: true, amountPaid: true, balance: true }, _count: { _all: true } }),
    prisma.labSample.count({ where: { status: { in: [LabSampleStatus.ACCEPTED, LabSampleStatus.DRAFT, LabSampleStatus.PENDING_REVIEW] } } }),
    prisma.scanAcceptance.count({ where: { status: { in: [ScanStatus.ACCEPTED, ScanStatus.DRAFT, ScanStatus.PENDING_REVIEW] } } }),
    prisma.report.count({ where: { status: ReportStatus.GENERATED } }),
    prisma.deliveryLog.count({ where: { status: DeliveryStatus.FAILED } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { actor: { select: { id: true, name: true, username: true, role: true } } }
    })
  ]);

  const invoiceTotals = invoiceStatus.reduce(
    (totals, row) => ({
      total: totals.total + money(row._sum.total),
      paid: totals.paid + money(row._sum.amountPaid),
      balance: totals.balance + money(row._sum.balance)
    }),
    { total: 0, paid: 0, balance: 0 }
  );

  const alerts = [
    ...(failedDeliveries > 0 ? [{ type: 'DELIVERY_FAILURES', severity: 'warning', count: failedDeliveries, message: 'Delivery failures require review.' }] : []),
    ...(labPending > 0 ? [{ type: 'LAB_PENDING', severity: 'info', count: labPending, message: 'Lab items are still pending processing or review.' }] : []),
    ...(scanPending > 0 ? [{ type: 'SCAN_PENDING', severity: 'info', count: scanPending, message: 'Scan items are still pending processing or review.' }] : []),
    ...(invoiceTotals.balance > 0 ? [{ type: 'OUTSTANDING_BALANCE', severity: 'warning', amount: invoiceTotals.balance, message: 'There are unpaid or partially paid invoices.' }] : [])
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    today: {
      orders: todayOrders,
      visits: todayVisits,
      paymentCount: todayPayments._count._all,
      paymentTotal: money(todayPayments._sum.amount)
    },
    orderStatus,
    invoiceStatus,
    invoiceTotals,
    workQueues: { labPending, scanPending, reportsAvailable, failedDeliveries },
    alerts,
    recentAudit
  };

  await auditAnalyticsView(req, 'EXECUTIVE_DASHBOARD_VIEWED', 'Reports', { filters: query, alertCount: alerts.length });
  return payload;
}

export async function getFinanceDashboard(query: Request['query'], req: Request) {
  const paymentWhere = dateWhere(query, 'createdAt') as Prisma.PaymentWhereInput;
  const invoiceWhere = dateWhere(query, 'createdAt') as Prisma.InvoiceWhereInput;
  const expenseWhere = dateWhere(query, 'createdAt') as Prisma.ExpenseWhereInput;

  const [payments, paymentsByMethod, invoicesByStatus, expensesByStatus, openShifts, ledgerCredits, ledgerDebits, outstandingInvoices] = await prisma.$transaction([
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['method'], where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: invoiceWhere, _sum: { total: true, amountPaid: true, balance: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ['status'], where: expenseWhere, _sum: { totalAmount: true, amountPaid: true, balance: true }, _count: { _all: true } }),
    prisma.cashierShift.findMany({ where: { status: ShiftStatus.OPEN }, include: { user: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { startedAt: 'desc' } }),
    prisma.ledgerEntry.aggregate({ where: { ...(dateWhere(query, 'createdAt') as Prisma.LedgerEntryWhereInput), type: 'CREDIT' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...(dateWhere(query, 'createdAt') as Prisma.LedgerEntryWhereInput), type: 'DEBIT' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.INSURANCE_PENDING] }, balance: { gt: 0 } },
      include: { patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } }, order: { select: { id: true, orderCode: true } } },
      orderBy: { balance: 'desc' },
      take: 20
    })
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    payments: { count: payments._count._all, total: money(payments._sum.amount), byMethod: paymentsByMethod },
    invoices: { byStatus: invoicesByStatus },
    expenses: { byStatus: expensesByStatus },
    cashControl: { openShifts, openShiftCount: openShifts.length },
    ledger: {
      credits: money(ledgerCredits._sum.amount),
      debits: money(ledgerDebits._sum.amount),
      net: money(ledgerCredits._sum.amount) - money(ledgerDebits._sum.amount)
    },
    topOutstandingInvoices: outstandingInvoices
  };

  await auditAnalyticsView(req, 'FINANCE_DASHBOARD_VIEWED', 'Reports', { filters: query });
  return payload;
}

export async function getLabDashboard(query: Request['query'], req: Request) {
  const [samplesByStatus, resultsByStatus, abnormalFlags, topTests, pendingReview, qcRuns, inventoryAlerts] = await prisma.$transaction([
    prisma.labSample.groupBy({ by: ['status'], where: dateWhere(query, 'acceptedAt') as Prisma.LabSampleWhereInput, _count: { _all: true } }),
    prisma.labResult.groupBy({ by: ['status'], where: dateWhere(query, 'createdAt') as Prisma.LabResultWhereInput, _count: { _all: true } }),
    prisma.labResultParameter.groupBy({ by: ['flag'], where: { flag: { in: [ResultFlag.LOW, ResultFlag.HIGH, ResultFlag.CRITICAL] } }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ['catalogItemId'], where: { type: 'LAB', ...(dateWhere(query, 'createdAt') as Prisma.OrderItemWhereInput) }, _count: { _all: true }, orderBy: { _count: { catalogItemId: 'desc' } }, take: 10 }),
    prisma.labResult.findMany({ where: { status: LabResultStatus.PENDING_REVIEW }, include: { patient: true, orderItem: { include: { catalogItem: true, order: true } } }, orderBy: { updatedAt: 'desc' }, take: 20 }),
    prisma.qualityControlRun.findMany({ where: dateWhere(query, 'createdAt') as Prisma.QualityControlRunWhereInput, orderBy: { createdAt: 'desc' }, take: 20, include: { performedBy: { select: { id: true, name: true, role: true } } } }),
    prisma.inventoryItem.findMany({ where: { currentStock: { lte: 5 } }, orderBy: { currentStock: 'asc' }, take: 20 })
  ]);

  const catalogIds = topTests.map((row) => row.catalogItemId).filter(Boolean) as string[];
  const catalog = await prisma.catalogItem.findMany({ where: { id: { in: catalogIds } }, select: { id: true, catalogCode: true, name: true, type: true } });
  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    samplesByStatus,
    resultsByStatus,
    abnormalFlags,
    topTests: topTests.map((row) => ({ ...row, catalogItem: row.catalogItemId ? catalogById.get(row.catalogItemId) : null })),
    pendingReview,
    qcRuns,
    inventoryAlerts
  };

  await auditAnalyticsView(req, 'LAB_DASHBOARD_VIEWED', 'Reports', { filters: query });
  return payload;
}

export async function getScanDashboard(query: Request['query'], req: Request) {
  const [acceptanceByStatus, resultsByStatus, bookingByStatus, dicomFiles, retakes, pendingReview] = await prisma.$transaction([
    prisma.scanAcceptance.groupBy({ by: ['status'], where: dateWhere(query, 'acceptedAt') as Prisma.ScanAcceptanceWhereInput, _count: { _all: true } }),
    prisma.scanResult.groupBy({ by: ['status'], where: dateWhere(query, 'createdAt') as Prisma.ScanResultWhereInput, _count: { _all: true } }),
    prisma.scanBooking.groupBy({ by: ['status'], where: dateWhere(query, 'startAt') as Prisma.ScanBookingWhereInput, _count: { _all: true } }),
    prisma.scanResultFile.groupBy({ by: ['modality'], where: { isDicom: true }, _count: { _all: true }, _sum: { fileSize: true } }),
    prisma.scanRetake.findMany({ where: dateWhere(query, 'createdAt') as Prisma.ScanRetakeWhereInput, include: { requestedBy: { select: { id: true, name: true, role: true } }, scanResult: { include: { orderItem: { include: { order: { include: { patient: true } }, catalogItem: true } } } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.scanResult.findMany({ where: { status: ScanStatus.PENDING_REVIEW }, include: { orderItem: { include: { catalogItem: true, order: { include: { patient: true, doctor: { include: { user: true } } } } } }, files: true }, orderBy: { updatedAt: 'desc' }, take: 20 })
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    acceptanceByStatus,
    resultsByStatus,
    bookingByStatus,
    dicomFiles,
    retakes,
    pendingReview
  };

  await auditAnalyticsView(req, 'SCAN_DASHBOARD_VIEWED', 'Reports', { filters: query });
  return payload;
}

export async function getReceptionDashboard(query: Request['query'], req: Request) {
  const [incomingOrders, dailyVisits, appointmentStatus, resultInbox, duplicateFlags, walkInOrders] = await prisma.$transaction([
    prisma.order.count({ where: { status: OrderStatus.SUBMITTED } }),
    prisma.patientVisit.findMany({ where: dateWhere(query, 'checkedInAt') as Prisma.PatientVisitWhereInput, include: { patient: true, order: true, checkedInBy: { select: { id: true, name: true, role: true } } }, orderBy: { checkedInAt: 'desc' }, take: 50 }),
    prisma.appointment.groupBy({ by: ['status'], where: dateWhere(query, 'scheduledDate') as Prisma.AppointmentWhereInput, _count: { _all: true } }),
    prisma.report.count({ where: { status: ReportStatus.GENERATED } }),
    prisma.patientDuplicateFlag.groupBy({ by: ['status'], where: dateWhere(query, 'createdAt') as Prisma.PatientDuplicateFlagWhereInput, _count: { _all: true } }),
    prisma.order.count({ where: { ...(dateWhere(query, 'submittedAt') as Prisma.OrderWhereInput), clinicalNotes: { contains: 'Walk-in', mode: 'insensitive' } } })
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    incomingOrders,
    dailyVisits,
    appointmentStatus,
    generatedResultsInInbox: resultInbox,
    duplicateFlags,
    walkInOrders
  };

  await auditAnalyticsView(req, 'RECEPTION_DASHBOARD_VIEWED', 'Reports', { filters: query });
  return payload;
}

export async function getAuditReviewDashboard(query: Request['query'], req: Request) {
  const auditWhere = dateWhere(query, 'createdAt') as Prisma.AuditLogWhereInput;
  const requestWhere = dateWhere(query, 'createdAt') as Prisma.ApiRequestLogWhereInput;
  const [byModule, byAction, byActorRole, unauthorizedAttempts, apiErrors, slowRequests, systemEvents] = await prisma.$transaction([
    prisma.auditLog.groupBy({ by: ['module'], where: auditWhere, _count: { _all: true }, orderBy: { _count: { module: 'desc' } }, take: 20 }),
    prisma.auditLog.groupBy({ by: ['action'], where: auditWhere, _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 20 }),
    prisma.auditLog.groupBy({ by: ['actorRole'], where: auditWhere, _count: { _all: true } }),
    prisma.auditLog.findMany({ where: { ...auditWhere, OR: [{ action: { contains: 'DENIED', mode: 'insensitive' } }, { action: { contains: 'UNAUTHORIZED', mode: 'insensitive' } }, { action: { contains: 'FAILED', mode: 'insensitive' } }] }, include: { actor: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.apiRequestLog.groupBy({ by: ['statusCode'], where: { ...requestWhere, statusCode: { gte: 400 } }, _count: { _all: true }, orderBy: { statusCode: 'asc' } }),
    prisma.apiRequestLog.findMany({ where: { ...requestWhere, durationMs: { gte: 1000 } }, include: { user: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { durationMs: 'desc' }, take: 25 }),
    prisma.systemEvent.groupBy({ by: ['level'], where: dateWhere(query, 'createdAt') as Prisma.SystemEventWhereInput, _count: { _all: true } })
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    filters: query,
    audit: { byModule, byAction, byActorRole, unauthorizedAttempts },
    apiRequests: { errorStatusCounts: apiErrors, slowRequests },
    systemEvents
  };

  await auditAnalyticsView(req, 'AUDIT_REVIEW_DASHBOARD_VIEWED', 'Admin', { filters: query });
  return payload;
}

export async function exportAuditReview(query: Request['query'], req: Request) {
  const auditWhere = dateWhere(query, 'createdAt') as Prisma.AuditLogWhereInput;
  const [auditLogs, systemEvents, apiRequestLogs, summary] = await Promise.all([
    prisma.auditLog.findMany({ where: auditWhere, include: { actor: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.systemEvent.findMany({ where: dateWhere(query, 'createdAt') as Prisma.SystemEventWhereInput, include: { actor: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.apiRequestLog.findMany({ where: dateWhere(query, 'createdAt') as Prisma.ApiRequestLogWhereInput, include: { user: { select: { id: true, name: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    getAuditReviewDashboard(query, req)
  ]);

  const payload = {
    exportType: 'audit-review',
    generatedAt: new Date().toISOString(),
    generatedBy: req.user ? { id: req.user.id, name: req.user.name, role: req.user.role } : null,
    filters: query,
    counts: { auditLogs: auditLogs.length, systemEvents: systemEvents.length, apiRequestLogs: apiRequestLogs.length },
    summary,
    auditLogs,
    systemEvents,
    apiRequestLogs
  };

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'AUDIT_REVIEW_EXPORTED',
    module: 'Admin',
    entityType: 'AuditExport',
    details: { filters: query, counts: payload.counts }
  });

  return payload;
}

export async function exportAdminFullBundle(query: Request['query'], req: Request) {
  const [counts, hospitals, departments, equipment, catalog, referenceRanges, users, doctors, dashboard, audit] = await Promise.all([
    prisma.$transaction([
      prisma.user.count(),
      prisma.hospital.count(),
      prisma.doctorProfile.count(),
      prisma.patient.count(),
      prisma.catalogItem.count(),
      prisma.referenceRange.count(),
      prisma.order.count(),
      prisma.invoice.count(),
      prisma.report.count(),
      prisma.auditLog.count()
    ]),
    prisma.hospital.findMany({ orderBy: { name: 'asc' } }),
    prisma.department.findMany({ orderBy: { code: 'asc' } }),
    prisma.equipment.findMany({ include: { department: true }, orderBy: { name: 'asc' } }),
    prisma.catalogItem.findMany({ include: { department: true, parameters: { include: { ranges: true }, orderBy: { sortOrder: 'asc' } } }, orderBy: { catalogCode: 'asc' } }),
    prisma.referenceRange.findMany({ include: { parameter: { include: { catalogItem: true } } }, orderBy: [{ parameter: { name: 'asc' } }, { ageMin: 'asc' }] }),
    prisma.user.findMany({ select: { id: true, name: true, username: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    prisma.doctorProfile.findMany({ include: { user: { select: { id: true, name: true, username: true, email: true, role: true, status: true } }, hospital: true }, orderBy: { createdAt: 'asc' } }),
    getExecutiveDashboard(query, req),
    getAuditReviewDashboard(query, req)
  ]);

  const payload = {
    exportType: 'admin-full-bundle',
    generatedAt: new Date().toISOString(),
    generatedBy: req.user ? { id: req.user.id, name: req.user.name, role: req.user.role } : null,
    filters: query,
    counts: {
      users: counts[0],
      hospitals: counts[1],
      doctors: counts[2],
      patients: counts[3],
      catalogItems: counts[4],
      referenceRanges: counts[5],
      orders: counts[6],
      invoices: counts[7],
      reports: counts[8],
      auditLogs: counts[9]
    },
    configuration: { hospitals, departments, equipment, catalog, referenceRanges, users, doctors },
    access: { permissions: PERMISSIONS, rolePermissions: ROLE_PERMISSIONS, routeContracts: PHASE6_ROUTE_CONTRACTS },
    dashboards: { executive: dashboard, audit }
  };

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'ADMIN_FULL_EXPORT_GENERATED',
    module: 'Admin',
    entityType: 'AdminExport',
    details: { filters: query, counts: payload.counts }
  });

  return payload;
}

import {
  DeliveryChannel,
  DeliveryStatus,
  InvoiceStatus,
  LabResultStatus,
  LedgerEntryType,
  OrderStatus,
  Prisma,
  ReportStatus,
  ResultFlag,
  ScanStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta } from './query.service.js';

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

function money(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

async function deliverySummary(query: Request['query']) {
  const where = dateWhere(query, 'createdAt') as Prisma.DeliveryLogWhereInput;
  const [byStatus, byChannel, recentFailures] = await prisma.$transaction([
    prisma.deliveryLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.deliveryLog.groupBy({ by: ['channel'], where, _count: { _all: true } }),
    prisma.deliveryLog.findMany({
      where: { ...where, status: DeliveryStatus.FAILED },
      include: { report: { select: { id: true, reportCode: true } }, notification: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ]);
  return { byStatus, byChannel, recentFailures };
}

export async function getReportsOverview(query: Request['query']) {
  const reportWhere = dateWhere(query, 'generatedAt') as Prisma.ReportWhereInput;
  const orderWhere = dateWhere(query, 'submittedAt') as Prisma.OrderWhereInput;
  const [reportsByStatus, ordersByStatus, invoicesByStatus] = await prisma.$transaction([
    prisma.report.groupBy({ by: ['status'], where: reportWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ['status'], where: dateWhere(query, 'createdAt') as Prisma.InvoiceWhereInput, _sum: { total: true, amountPaid: true, balance: true }, _count: { _all: true } })
  ]);
  const delivery = await deliverySummary(query);

  return { reportsByStatus, ordersByStatus, invoicesByStatus, delivery };
}

export async function getTurnaroundTimeReport(query: Request['query']) {
  const orderWhere = dateWhere(query, 'submittedAt') as Prisma.OrderWhereInput;
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      items: { include: { catalogItem: { select: { id: true, name: true, type: true } } } },
      reports: true
    },
    orderBy: { submittedAt: 'desc' },
    take: 200
  });

  const rows = orders.map((order) => {
    const releaseAt = order.releasedAt ?? order.reports[0]?.generatedAt ?? null;
    const turnaroundHours = releaseAt ? Math.round(((releaseAt.getTime() - order.submittedAt.getTime()) / 3_600_000) * 10) / 10 : null;
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      patient: order.patient,
      status: order.status,
      submittedAt: order.submittedAt,
      releasedAt: releaseAt,
      turnaroundHours,
      itemCount: order.items.length,
      itemTypes: [...new Set(order.items.map((item) => item.type))]
    };
  });

  const completedRows = rows.filter((row) => row.turnaroundHours !== null) as Array<(typeof rows)[number] & { turnaroundHours: number }>;
  const averageHours = completedRows.length ? completedRows.reduce((sum, row) => sum + row.turnaroundHours, 0) / completedRows.length : 0;
  return { averageHours: Math.round(averageHours * 10) / 10, rows };
}

export async function getOrderVolumeReport(query: Request['query']) {
  const where = dateWhere(query, 'submittedAt') as Prisma.OrderWhereInput;
  const [byStatus, byUrgency, labItems, scanItems, recentOrders] = await prisma.$transaction([
    prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['urgency'], where, _count: { _all: true } }),
    prisma.orderItem.count({ where: { type: 'LAB', order: where } }),
    prisma.orderItem.count({ where: { type: 'SCAN', order: where } }),
    prisma.order.findMany({
      where,
      include: { patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } }, doctor: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { submittedAt: 'desc' },
      take: 20
    })
  ]);
  return { byStatus, byUrgency, itemTypeCounts: { lab: labItems, scan: scanItems }, recentOrders };
}

export async function getRevenueReport(query: Request['query']) {
  const invoiceWhere = dateWhere(query, 'createdAt') as Prisma.InvoiceWhereInput;
  const paymentWhere = dateWhere(query, 'createdAt') as Prisma.PaymentWhereInput;
  const [invoiceTotals, paymentTotals, paymentsByMethod, ledgerCredits] = await prisma.$transaction([
    prisma.invoice.aggregate({ where: invoiceWhere, _sum: { total: true, amountPaid: true, balance: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['method'], where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...(dateWhere(query, 'createdAt') as Prisma.LedgerEntryWhereInput), type: LedgerEntryType.CREDIT }, _sum: { amount: true }, _count: { _all: true } })
  ]);
  return { invoiceTotals, paymentTotals, paymentsByMethod, ledgerCredits };
}

export async function getOutstandingReport(query: Request['query']) {
  const { page, limit, skip, take } = getPagination(query);
  const where: Prisma.InvoiceWhereInput = {
    ...dateWhere(query, 'createdAt'),
    status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.INSURANCE_PENDING] },
    balance: { gt: 0 }
  };
  const [items, total, aggregate] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: { patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } }, hospital: { select: { id: true, code: true, name: true } }, order: { select: { id: true, orderCode: true, submittedAt: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { balance: true, total: true }, _count: { _all: true } })
  ]);
  return { items, aggregate, meta: paginationMeta(total, page, limit) };
}

export async function getAbnormalResultsReport(query: Request['query']) {
  const { page, limit, skip, take } = getPagination(query);
  const createdWhere = dateWhere(query, 'createdAt');
  const where: Prisma.LabResultParameterWhereInput = {
    flag: { in: [ResultFlag.LOW, ResultFlag.HIGH, ResultFlag.CRITICAL] },
    labResult: createdWhere ? createdWhere as Prisma.LabResultWhereInput : undefined
  };
  const [items, total, byFlag] = await prisma.$transaction([
    prisma.labResultParameter.findMany({
      where,
      include: {
        labResult: {
          include: {
            patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
            orderItem: { include: { catalogItem: { select: { id: true, catalogCode: true, name: true } }, order: { select: { id: true, orderCode: true } } } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.labResultParameter.count({ where }),
    prisma.labResultParameter.groupBy({ by: ['flag'], where, _count: { _all: true } })
  ]);
  return { items, byFlag, meta: paginationMeta(total, page, limit) };
}

export async function getStaffProductivityReport(query: Request['query']) {
  const auditWhere = dateWhere(query, 'createdAt') as Prisma.AuditLogWhereInput;
  const [auditByActor, labSigned, scanSigned, payments] = await prisma.$transaction([
    prisma.auditLog.groupBy({ by: ['actorId', 'action', 'module'], where: auditWhere, _count: { _all: true } }),
    prisma.labResult.groupBy({ by: ['enteredById', 'status'], where: { ...(dateWhere(query, 'updatedAt') as Prisma.LabResultWhereInput), status: LabResultStatus.SIGNED_OFF }, _count: { _all: true } }),
    prisma.scanResult.groupBy({ by: ['reportedById', 'status'], where: { ...(dateWhere(query, 'updatedAt') as Prisma.ScanResultWhereInput), status: ScanStatus.SIGNED_OFF }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['receivedById'], where: dateWhere(query, 'createdAt') as Prisma.PaymentWhereInput, _sum: { amount: true }, _count: { _all: true } })
  ]);
  return { auditByActor, labSigned, scanSigned, payments };
}

export async function getResultsDeliveryReport(query: Request['query']) {
  return deliverySummary(query);
}

export async function exportReport(query: Request['query'], req: Request) {
  const moduleName = typeof query.module === 'string' ? query.module : 'all';
  const exportPayload = {
    module: moduleName,
    generatedAt: new Date(),
    generatedBy: req.user ? { id: req.user.id, name: req.user.name, role: req.user.role } : null,
    filters: query,
    overview: await getReportsOverview(query),
    orderVolume: moduleName === 'all' || moduleName === 'orders' ? await getOrderVolumeReport(query) : null,
    revenue: moduleName === 'all' || moduleName === 'finance' ? await getRevenueReport(query) : null,
    delivery: moduleName === 'all' || moduleName === 'delivery' ? await getResultsDeliveryReport(query) : null
  };

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'REPORT_EXPORTED',
    module: 'Reports',
    entityType: 'ReportExport',
    details: { module: moduleName, filters: query }
  });

  return exportPayload;
}

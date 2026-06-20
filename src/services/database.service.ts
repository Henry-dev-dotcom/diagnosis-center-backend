import { prisma } from './prisma.service.js';

// Backend Phase 2: PostgreSQL + Prisma database summary service.

export async function getDatabaseSummary() {
  const [
    users,
    sessions,
    hospitals,
    doctors,
    patients,
    departments,
    equipment,
    catalogItems,
    referenceParameters,
    referenceRanges,
    orders,
    orderItems,
    labSamples,
    labResults,
    scanResults,
    invoices,
    payments,
    cashierShifts,
    expenses,
    ledgerEntries,
    reports,
    notifications,
    deliveryLogs,
    auditLogs
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userSession.count(),
    prisma.hospital.count(),
    prisma.doctorProfile.count(),
    prisma.patient.count(),
    prisma.department.count(),
    prisma.equipment.count(),
    prisma.catalogItem.count(),
    prisma.referenceParameter.count(),
    prisma.referenceRange.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.labSample.count(),
    prisma.labResult.count(),
    prisma.scanResult.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.cashierShift.count(),
    prisma.expense.count(),
    prisma.ledgerEntry.count(),
    prisma.report.count(),
    prisma.notification.count(),
    prisma.deliveryLog.count(),
    prisma.auditLog.count()
  ]);

  return {
    identity: { users, sessions, doctors },
    organization: { hospitals, departments, equipment },
    patients,
    catalog: { catalogItems, referenceParameters, referenceRanges },
    orders: { orders, orderItems },
    laboratory: { labSamples, labResults },
    imaging: { scanResults },
    finance: { invoices, payments, cashierShifts, expenses, ledgerEntries },
    delivery: { reports, notifications, deliveryLogs },
    auditLogs
  };
}

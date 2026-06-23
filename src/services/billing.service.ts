import {
  FloatTransactionType,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ShiftStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { roundMoney, calculateInvoiceStatus } from '../utils/money.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';

const invoiceInclude = {
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      insuranceProvider: true,
      policyNumber: true
    }
  },
  hospital: { select: { id: true, name: true, code: true } },
  order: {
    select: {
      id: true,
      orderCode: true,
      status: true,
      urgency: true,
      submittedAt: true,
      doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true } } } }
    }
  },
  items: {
    include: {
      catalogItem: { select: { id: true, catalogCode: true, name: true, type: true, price: true } },
      orderItem: { select: { id: true, type: true, status: true } }
    },
    orderBy: { description: 'asc' as const }
  },
  payments: {
    include: {
      receivedBy: { select: { id: true, name: true, role: true } },
      receipt: true,
      shift: { select: { id: true, shiftCode: true, status: true } }
    },
    orderBy: { createdAt: 'desc' as const }
  },
  createdBy: { select: { id: true, name: true, role: true } }
} satisfies Prisma.InvoiceInclude;

type UpdateInvoicePayload = {
  status?: InvoiceStatus;
  insuranceProvider?: string | null;
  insuranceClaimNumber?: string | null;
  discountAmount?: number;
  adjustmentReason?: string | null;
  notes?: string | null;
};

type PaymentPayload = {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt?: Date | string | null;
  notes?: string | null;
};

type RefundPayload = {
  amount: number;
  reason: string;
  supervisorApprovalId: string;
};

function clean(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDate(value?: Date | string | null) {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

async function nextPaymentCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.payment.count();
  return `PAY-${String(count + 1).padStart(4, '0')}`;
}

async function nextReceiptCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.receipt.count();
  return `RCPT-${String(count + 1).padStart(4, '0')}`;
}

async function nextLedgerCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.ledgerEntry.count();
  return `LED-${String(count + 1).padStart(4, '0')}`;
}

async function assertInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) throw new AppError('Invoice was not found', 404, 'INVOICE_NOT_FOUND');
  return invoice;
}

async function getOpenShiftForActor(actorId: string) {
  const shift = await prisma.cashierShift.findFirst({
    where: { userId: actorId, status: ShiftStatus.OPEN },
    orderBy: { startedAt: 'desc' }
  });
  if (!shift) throw new AppError('An active cashier shift is required before recording payments', 409, 'ACTIVE_SHIFT_REQUIRED');
  return shift;
}

export async function listInvoices(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.InvoiceWhereInput = {
    ...(query.status ? { status: String(query.status) as InvoiceStatus } : {}),
    ...(query.patientId ? { patientId: String(query.patientId) } : {}),
    ...(query.hospitalId ? { hospitalId: String(query.hospitalId) } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {})
          }
        }
      : {}),
    ...(search
      ? {
          OR: [
            { invoiceCode: { contains: search, mode: 'insensitive' } },
            { order: { orderCode: { contains: search, mode: 'insensitive' } } },
            { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
            { insuranceClaimRef: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [items, total, totals] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'invoiceCode', 'total', 'balance'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({
      where,
      _sum: { total: true, amountPaid: true, balance: true }
    })
  ]);

  return {
    items,
    totals: {
      billed: Number(totals._sum.total ?? 0),
      paid: Number(totals._sum.amountPaid ?? 0),
      outstanding: Number(totals._sum.balance ?? 0)
    },
    meta: paginationMeta(total, page, limit)
  };
}

export async function getInvoice(invoiceId: string) {
  await assertInvoice(invoiceId);
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
}

export async function updateInvoice(invoiceId: string, body: UpdateInvoicePayload, req: Request) {
  const before = await assertInvoice(invoiceId);
  const nextDiscount = body.discountAmount !== undefined ? roundMoney(Number(body.discountAmount)) : Number(before.discount);
  const nextTotal = roundMoney(Number(before.subtotal) + Number(before.tax) - nextDiscount);
  const nextPaid = Math.min(Number(before.amountPaid), nextTotal);
  const nextBalance = Math.max(nextTotal - nextPaid, 0);

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      ...(body.status ? { status: body.status } : { status: calculateInvoiceStatus(nextTotal, nextPaid, before.status) }),
      ...(body.discountAmount !== undefined ? { discount: nextDiscount, total: nextTotal, amountPaid: nextPaid, balance: nextBalance } : {}),
      ...(body.insuranceClaimNumber ? { insuranceClaimRef: clean(body.insuranceClaimNumber) as string } : {})
    },
    include: invoiceInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'INVOICE_UPDATED',
    module: 'Billing',
    entityType: 'Invoice',
    entityId: updated.id,
    beforeData: before,
    afterData: updated,
    details: {
      adjustmentReason: clean(body.adjustmentReason),
      notes: clean(body.notes),
      insuranceProvider: clean(body.insuranceProvider)
    }
  });

  return updated;
}

export async function recordInvoicePayment(invoiceId: string, body: PaymentPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await assertInvoice(invoiceId);
  if (([InvoiceStatus.REFUNDED, InvoiceStatus.WRITTEN_OFF] as InvoiceStatus[]).includes(before.status)) {
    throw new AppError('Payments cannot be added to refunded or written-off invoices', 409, 'INVOICE_PAYMENT_BLOCKED');
  }
  const amount = roundMoney(Number(body.amount));
  if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_PAYMENT_AMOUNT');
  if (amount > Number(before.balance)) throw new AppError('Payment amount cannot exceed invoice balance', 409, 'PAYMENT_EXCEEDS_BALANCE');

  const openShift = await getOpenShiftForActor(req.user.id);

  const created = await prisma.$transaction(async (tx) => {
    const paymentCode = await nextPaymentCode(tx);
    const receiptCode = await nextReceiptCode(tx);
    const payment = await tx.payment.create({
      data: {
        paymentCode,
        invoiceId,
        shiftId: openShift.id,
        receivedById: req.user?.id ?? null,
        method: body.method,
        status: PaymentStatus.COMPLETED,
        amount,
        reference: clean(body.reference) as string | null,
        note: clean(body.notes) as string | null,
        createdAt: toDate(body.paidAt)
      }
    });

    const floatTransaction = await tx.floatTransaction.create({
      data: {
        shiftId: openShift.id,
        userId: req.user?.id ?? null,
        paymentId: payment.id,
        type: FloatTransactionType.PAYMENT,
        method: body.method,
        amount,
        description: `Payment received for invoice ${before.invoiceCode}`,
        reference: payment.paymentCode,
        createdAt: payment.createdAt
      }
    });

    const newAmountPaid = roundMoney(Number(before.amountPaid) + amount);
    const newBalance = roundMoney(Math.max(Number(before.total) - newAmountPaid, 0));
    const invoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: calculateInvoiceStatus(Number(before.total), newAmountPaid, before.status)
      }
    });

    await tx.cashierShift.update({
      where: { id: openShift.id },
      data: { expectedCash: { increment: body.method === PaymentMethod.CASH ? amount : 0 } }
    });

    const ledgerCode = await nextLedgerCode(tx);
    const previousBalance = await tx.ledgerEntry.findFirst({ orderBy: { createdAt: 'desc' }, select: { runningBalance: true } });
    await tx.ledgerEntry.create({
      data: {
        entryCode: ledgerCode,
        type: LedgerEntryType.CREDIT,
        description: `Payment received for invoice ${before.invoiceCode}`,
        amount,
        runningBalance: Number(previousBalance?.runningBalance ?? 0) + amount,
        paymentId: payment.id,
        floatTransactionId: floatTransaction.id,
        userId: req.user?.id ?? null,
        createdAt: payment.createdAt
      }
    });

    const receipt = await tx.receipt.create({ data: { receiptCode, paymentId: payment.id, issuedAt: payment.createdAt } });
    return { payment, receipt, invoice };
  });

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'PAYMENT_RECORDED',
    module: 'Billing',
    entityType: 'Payment',
    entityId: created.payment.id,
    beforeData: before,
    afterData: invoice,
    details: {
      paymentCode: created.payment.paymentCode,
      receiptCode: created.receipt.receiptCode,
      amount,
      method: body.method,
      shiftId: openShift.id
    }
  });

  return { invoice, payment: created.payment, receipt: created.receipt };
}

export async function recordInvoiceRefund(invoiceId: string, body: RefundPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await assertInvoice(invoiceId);
  const amount = roundMoney(Number(body.amount));
  if (amount <= 0) throw new AppError('Refund amount must be greater than zero', 400, 'INVALID_REFUND_AMOUNT');
  if (amount > Number(before.amountPaid)) throw new AppError('Refund amount cannot exceed paid amount', 409, 'REFUND_EXCEEDS_PAID_AMOUNT');
  const openShift = await getOpenShiftForActor(req.user.id);

  const updated = await prisma.$transaction(async (tx) => {
    const floatTransaction = await tx.floatTransaction.create({
      data: {
        shiftId: openShift.id,
        userId: req.user?.id ?? null,
        type: FloatTransactionType.REFUND,
        method: PaymentMethod.CASH,
        amount,
        description: `Refund for invoice ${before.invoiceCode}: ${body.reason}`,
        reference: body.supervisorApprovalId
      }
    });

    const newAmountPaid = roundMoney(Math.max(Number(before.amountPaid) - amount, 0));
    const newBalance = roundMoney(Math.max(Number(before.total) - newAmountPaid, 0));
    const invoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newAmountPaid <= 0 ? InvoiceStatus.REFUNDED : calculateInvoiceStatus(Number(before.total), newAmountPaid)
      }
    });

    const previousBalance = await tx.ledgerEntry.findFirst({ orderBy: { createdAt: 'desc' }, select: { runningBalance: true } });
    await tx.ledgerEntry.create({
      data: {
        entryCode: await nextLedgerCode(tx),
        type: LedgerEntryType.DEBIT,
        description: `Refund for invoice ${before.invoiceCode}`,
        amount,
        runningBalance: Number(previousBalance?.runningBalance ?? 0) - amount,
        floatTransactionId: floatTransaction.id,
        userId: req.user?.id ?? null
      }
    });

    return invoice;
  });

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: updated.id }, include: invoiceInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'REFUND_RECORDED',
    module: 'Billing',
    entityType: 'Invoice',
    entityId: invoice.id,
    beforeData: before,
    afterData: invoice,
    details: { amount, reason: body.reason, supervisorApprovalId: body.supervisorApprovalId, shiftId: openShift.id }
  });

  return invoice;
}

export async function getReceipt(receiptId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      payment: {
        include: {
          invoice: { include: invoiceInclude },
          receivedBy: { select: { id: true, name: true, role: true } }
        }
      }
    }
  });
  if (!receipt) throw new AppError('Receipt was not found', 404, 'RECEIPT_NOT_FOUND');
  return receipt;
}

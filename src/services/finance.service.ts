import {
  ExpenseStatus,
  FloatTransactionType,
  LedgerEntryType,
  PaymentMethod,
  Prisma,
  ShiftStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';

type StartShiftPayload = {
  openingFloat?: number;
  notes?: string | null;
};

type CloseShiftPayload = {
  closingCash: number;
  closingMobileMoney?: number;
  closingCard?: number;
  closingBankTransfer?: number;
  notes?: string | null;
};

type FloatAdjustmentPayload = {
  type: 'MONEY_IN' | 'MONEY_OUT' | 'ADJUSTMENT';
  amount: number;
  reason: string;
};

type ExpensePayload = {
  vendorName?: string | null;
  vendor?: string | null;
  category: string;
  description: string;
  amount: number;
  incurredAt?: Date | string | null;
  notes?: string | null;
};

type UpdateExpensePayload = Partial<ExpensePayload>;

type ExpensePaymentPayload = {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt?: Date | string | null;
  notes?: string | null;
};

type ExpenseWriteOffPayload = {
  reason: string;
  supervisorApprovalId: string;
};

const shiftInclude = {
  user: { select: { id: true, name: true, role: true, username: true } },
  payments: { select: { id: true, paymentCode: true, amount: true, method: true, status: true, createdAt: true } },
  floatTransactions: { orderBy: { createdAt: 'desc' as const }, take: 50 }
} satisfies Prisma.CashierShiftInclude;

const expenseInclude = {
  createdBy: { select: { id: true, name: true, role: true } },
  payments: { include: { paidBy: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' as const } },
  ledgerEntries: { orderBy: { createdAt: 'desc' as const }, take: 10 }
} satisfies Prisma.ExpenseInclude;

function clean(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toDate(value?: Date | string | null) {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function expenseStatus(total: number, paid: number) {
  if (paid <= 0) return ExpenseStatus.UNPAID;
  if (paid >= total) return ExpenseStatus.PAID;
  return ExpenseStatus.PARTIAL;
}

async function nextShiftCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.cashierShift.count();
  return `SHIFT-${String(count + 1).padStart(4, '0')}`;
}

async function nextExpenseCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.expense.count();
  return `EXP-${String(count + 1).padStart(4, '0')}`;
}

async function nextLedgerCode(tx: Prisma.TransactionClient = prisma) {
  const count = await tx.ledgerEntry.count();
  return `LED-${String(count + 1).padStart(4, '0')}`;
}

async function getOpenShift(actorId: string) {
  return prisma.cashierShift.findFirst({ where: { userId: actorId, status: ShiftStatus.OPEN }, orderBy: { startedAt: 'desc' } });
}

async function requireOpenShift(actorId: string) {
  const shift = await getOpenShift(actorId);
  if (!shift) throw new AppError('An active cashier shift is required for this finance action', 409, 'ACTIVE_SHIFT_REQUIRED');
  return shift;
}

async function getPreviousLedgerBalance(tx: Prisma.TransactionClient = prisma) {
  const entry = await tx.ledgerEntry.findFirst({ orderBy: { createdAt: 'desc' }, select: { runningBalance: true } });
  return Number(entry?.runningBalance ?? 0);
}

function buildDateWhere(query: Request['query'], field: 'createdAt' | 'startedAt' = 'createdAt') {
  return query.from || query.to
    ? {
        [field]: {
          ...(query.from ? { gte: new Date(String(query.from)) } : {}),
          ...(query.to ? { lte: new Date(String(query.to)) } : {})
        }
      }
    : {};
}

export async function startShift(body: StartShiftPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const existing = await getOpenShift(req.user.id);
  if (existing) throw new AppError('This cashier already has an active shift', 409, 'SHIFT_ALREADY_OPEN', { shiftId: existing.id });

  const openingFloat = roundMoney(Number(body.openingFloat ?? 0));
  const shift = await prisma.$transaction(async (tx) => {
    const shiftCode = await nextShiftCode(tx);
    const createdShift = await tx.cashierShift.create({
      data: {
        shiftCode,
        userId: req.user?.id ?? '',
        type: 'Cashier',
        status: ShiftStatus.OPEN,
        openingFloat,
        expectedCash: openingFloat,
        startNotes: clean(body.notes) as string | null
      }
    });

    if (openingFloat > 0) {
      await tx.floatTransaction.create({
        data: {
          shiftId: createdShift.id,
          userId: req.user?.id ?? null,
          type: FloatTransactionType.MONEY_IN,
          method: PaymentMethod.CASH,
          amount: openingFloat,
          description: 'Opening float',
          reference: createdShift.shiftCode
        }
      });
    }

    return createdShift;
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SHIFT_STARTED',
    module: 'Finance',
    entityType: 'CashierShift',
    entityId: shift.id,
    afterData: shift,
    details: { openingFloat }
  });

  return prisma.cashierShift.findUniqueOrThrow({ where: { id: shift.id }, include: shiftInclude });
}

export async function closeShift(shiftId: string, body: CloseShiftPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.cashierShift.findUnique({ where: { id: shiftId }, include: { payments: true } });
  if (!before) throw new AppError('Cashier shift was not found', 404, 'SHIFT_NOT_FOUND');
  if (before.status !== ShiftStatus.OPEN) throw new AppError('Only open shifts can be closed', 409, 'SHIFT_NOT_OPEN');
  if (before.userId !== req.user.id) throw new AppError('You can only close your own active cashier shift', 403, 'SHIFT_SCOPE_DENIED');

  const countedCash = roundMoney(Number(body.closingCash));
  const variance = roundMoney(countedCash - Number(before.expectedCash));
  const updated = await prisma.cashierShift.update({
    where: { id: shiftId },
    data: {
      status: ShiftStatus.CLOSED,
      countedCash,
      variance,
      closeNotes: clean(body.notes) as string | null,
      closedAt: new Date()
    },
    include: shiftInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SHIFT_CLOSED',
    module: 'Finance',
    entityType: 'CashierShift',
    entityId: updated.id,
    beforeData: before,
    afterData: updated,
    details: {
      countedCash,
      closingMobileMoney: body.closingMobileMoney ?? 0,
      closingCard: body.closingCard ?? 0,
      closingBankTransfer: body.closingBankTransfer ?? 0,
      variance
    }
  });

  return updated;
}

export async function getCurrentShift(req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const shift = await getOpenShift(req.user.id);
  return shift ? prisma.cashierShift.findUnique({ where: { id: shift.id }, include: shiftInclude }) : null;
}

export async function listShifts(query: Request['query'], req: Request) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.CashierShiftWhereInput = {
    ...(query.status ? { status: String(query.status) as ShiftStatus } : {}),
    ...(query.userId ? { userId: String(query.userId) } : {}),
    ...buildDateWhere(query, 'startedAt'),
    ...(search
      ? {
          OR: [
            { shiftCode: { contains: search, mode: 'insensitive' } },
            { user: { name: { contains: search, mode: 'insensitive' } } },
            { user: { username: { contains: search, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  if (req.user?.role !== 'ADMIN') where.userId = req.user?.id ?? '__no_access__';

  const [items, total] = await prisma.$transaction([
    prisma.cashierShift.findMany({
      where,
      include: shiftInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['startedAt', 'closedAt', 'shiftCode', 'expectedCash'] as const, 'startedAt'),
      skip,
      take
    }),
    prisma.cashierShift.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function listFloatTransactions(query: Request['query'], req: Request) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.FloatTransactionWhereInput = {
    ...(query.shiftId ? { shiftId: String(query.shiftId) } : {}),
    ...(query.type ? { type: String(query.type) as FloatTransactionType } : {}),
    ...(query.method ? { method: String(query.method) as PaymentMethod } : {}),
    ...buildDateWhere(query),
    ...(req.user?.role !== 'ADMIN' ? { userId: req.user?.id ?? '__no_access__' } : {}),
    ...(search
      ? {
          OR: [{ description: { contains: search, mode: 'insensitive' } }, { reference: { contains: search, mode: 'insensitive' } }]
        }
      : {})
  };

  const [items, total, totals] = await prisma.$transaction([
    prisma.floatTransaction.findMany({
      where,
      include: {
        shift: { select: { id: true, shiftCode: true, status: true } },
        user: { select: { id: true, name: true, role: true } },
        payment: { select: { id: true, paymentCode: true, invoiceId: true } }
      },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'amount'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.floatTransaction.count({ where }),
    prisma.floatTransaction.groupBy({ by: ['type'], where, _sum: { amount: true } })
  ]);

  return { items, totals, meta: paginationMeta(total, page, limit) };
}

export async function createFloatAdjustment(body: FloatAdjustmentPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const shift = await requireOpenShift(req.user.id);
  const amount = roundMoney(Number(body.amount));
  const transactionType = body.type as FloatTransactionType;

  const created = await prisma.$transaction(async (tx) => {
    const floatTransaction = await tx.floatTransaction.create({
      data: {
        shiftId: shift.id,
        userId: req.user?.id ?? null,
        type: transactionType,
        method: PaymentMethod.CASH,
        amount,
        description: body.reason,
        reference: `ADJ-${Date.now()}`
      }
    });

    const delta = transactionType === FloatTransactionType.MONEY_OUT ? -amount : amount;
    await tx.cashierShift.update({ where: { id: shift.id }, data: { expectedCash: { increment: delta } } });
    const previousBalance = await getPreviousLedgerBalance(tx);
    await tx.ledgerEntry.create({
      data: {
        entryCode: await nextLedgerCode(tx),
        type: delta >= 0 ? LedgerEntryType.CREDIT : LedgerEntryType.DEBIT,
        description: `Float adjustment: ${body.reason}`,
        amount,
        runningBalance: previousBalance + delta,
        floatTransactionId: floatTransaction.id,
        userId: req.user?.id ?? null
      }
    });

    return floatTransaction;
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'FLOAT_ADJUSTMENT_RECORDED',
    module: 'Finance',
    entityType: 'FloatTransaction',
    entityId: created.id,
    afterData: created,
    details: { shiftId: shift.id, type: body.type, amount, reason: body.reason }
  });

  return created;
}

export async function listExpenses(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.ExpenseWhereInput = {
    ...(query.status ? { status: String(query.status) as ExpenseStatus } : {}),
    ...(query.category ? { category: { equals: String(query.category), mode: 'insensitive' } } : {}),
    ...buildDateWhere(query),
    ...(search
      ? {
          OR: [
            { expenseCode: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { vendor: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [items, total, totals] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'expenseCode', 'totalAmount', 'balance'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { totalAmount: true, amountPaid: true, balance: true } })
  ]);

  return {
    items,
    totals: {
      total: Number(totals._sum.totalAmount ?? 0),
      paid: Number(totals._sum.amountPaid ?? 0),
      outstanding: Number(totals._sum.balance ?? 0)
    },
    meta: paginationMeta(total, page, limit)
  };
}

export async function createExpense(body: ExpensePayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const amount = roundMoney(Number(body.amount));
  const expense = await prisma.expense.create({
    data: {
      expenseCode: await nextExpenseCode(),
      description: body.description.trim(),
      category: body.category.trim(),
      vendor: (clean(body.vendorName) ?? clean(body.vendor)) as string | null,
      status: ExpenseStatus.UNPAID,
      totalAmount: amount,
      amountPaid: 0,
      balance: amount,
      createdById: req.user.id,
      createdAt: toDate(body.incurredAt)
    },
    include: expenseInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'EXPENSE_CREATED',
    module: 'Finance',
    entityType: 'Expense',
    entityId: expense.id,
    afterData: expense,
    details: { notes: clean(body.notes) }
  });

  return expense;
}

export async function updateExpense(expenseId: string, body: UpdateExpensePayload, req: Request) {
  const before = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!before) throw new AppError('Expense was not found', 404, 'EXPENSE_NOT_FOUND');
  if (before.status === ExpenseStatus.WRITTEN_OFF) throw new AppError('Written-off expenses cannot be edited', 409, 'EXPENSE_WRITTEN_OFF');

  const nextTotal = body.amount !== undefined ? roundMoney(Number(body.amount)) : Number(before.totalAmount);
  if (nextTotal < Number(before.amountPaid)) throw new AppError('Expense total cannot be below amount already paid', 409, 'EXPENSE_TOTAL_BELOW_PAID');
  const nextBalance = roundMoney(nextTotal - Number(before.amountPaid));

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(body.description ? { description: body.description.trim() } : {}),
      ...(body.category ? { category: body.category.trim() } : {}),
      ...(body.vendorName || body.vendor ? { vendor: (clean(body.vendorName) ?? clean(body.vendor)) as string | null } : {}),
      ...(body.amount !== undefined ? { totalAmount: nextTotal, balance: nextBalance, status: expenseStatus(nextTotal, Number(before.amountPaid)) } : {})
    },
    include: expenseInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'EXPENSE_UPDATED',
    module: 'Finance',
    entityType: 'Expense',
    entityId: updated.id,
    beforeData: before,
    afterData: updated,
    details: { notes: clean(body.notes) }
  });

  return updated;
}

export async function recordExpensePayment(expenseId: string, body: ExpensePaymentPayload, req: Request) {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const before = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!before) throw new AppError('Expense was not found', 404, 'EXPENSE_NOT_FOUND');
  if (before.status === ExpenseStatus.WRITTEN_OFF) throw new AppError('Written-off expenses cannot receive payments', 409, 'EXPENSE_WRITTEN_OFF');
  const amount = roundMoney(Number(body.amount));
  if (amount > Number(before.balance)) throw new AppError('Expense payment cannot exceed outstanding balance', 409, 'EXPENSE_PAYMENT_EXCEEDS_BALANCE');

  const payment = await prisma.$transaction(async (tx) => {
    const expensePayment = await tx.expensePayment.create({
      data: {
        expenseId,
        paidById: req.user?.id ?? null,
        method: body.method,
        amount,
        reference: clean(body.reference) as string | null,
        createdAt: toDate(body.paidAt)
      }
    });

    const newPaid = roundMoney(Number(before.amountPaid) + amount);
    const newBalance = roundMoney(Math.max(Number(before.totalAmount) - newPaid, 0));
    await tx.expense.update({
      where: { id: expenseId },
      data: {
        amountPaid: newPaid,
        balance: newBalance,
        status: expenseStatus(Number(before.totalAmount), newPaid)
      }
    });

    const previousBalance = await getPreviousLedgerBalance(tx);
    await tx.ledgerEntry.create({
      data: {
        entryCode: await nextLedgerCode(tx),
        type: LedgerEntryType.DEBIT,
        description: `Expense payment for ${before.expenseCode}: ${before.description}`,
        amount,
        runningBalance: previousBalance - amount,
        expenseId,
        expensePaymentId: expensePayment.id,
        userId: req.user?.id ?? null,
        createdAt: expensePayment.createdAt
      }
    });

    return expensePayment;
  });

  const expense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseId }, include: expenseInclude });
  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'EXPENSE_PAYMENT_RECORDED',
    module: 'Finance',
    entityType: 'ExpensePayment',
    entityId: payment.id,
    beforeData: before,
    afterData: expense,
    details: { amount, method: body.method, notes: clean(body.notes) }
  });

  return { expense, payment };
}

export async function writeOffExpense(expenseId: string, body: ExpenseWriteOffPayload, req: Request) {
  const before = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!before) throw new AppError('Expense was not found', 404, 'EXPENSE_NOT_FOUND');
  if (before.status === ExpenseStatus.PAID) throw new AppError('Paid expenses cannot be written off', 409, 'EXPENSE_ALREADY_PAID');

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: ExpenseStatus.WRITTEN_OFF,
      writtenOffReason: body.reason,
      supervisorApprovalNote: body.supervisorApprovalId
    },
    include: expenseInclude
  });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'EXPENSE_WRITTEN_OFF',
    module: 'Finance',
    entityType: 'Expense',
    entityId: updated.id,
    beforeData: before,
    afterData: updated,
    details: { reason: body.reason, supervisorApprovalId: body.supervisorApprovalId }
  });

  return updated;
}

export async function listLedger(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.LedgerEntryWhereInput = {
    ...(query.type ? { type: String(query.type) as LedgerEntryType } : {}),
    ...buildDateWhere(query),
    ...(search ? { OR: [{ entryCode: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {})
  };

  const [items, total, totals] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        payment: { select: { id: true, paymentCode: true, invoiceId: true } },
        expense: { select: { id: true, expenseCode: true, category: true } },
        expensePayment: { select: { id: true, method: true, amount: true } },
        floatTransaction: { select: { id: true, type: true, method: true, reference: true } }
      },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'entryCode', 'amount'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.groupBy({ by: ['type'], where, _sum: { amount: true } })
  ]);

  return { items, totals, meta: paginationMeta(total, page, limit) };
}

export async function getFinanceAnalytics(query: Request['query']) {
  const dateWhere = buildDateWhere(query);
  const [invoiceTotals, invoiceStatus, paymentsByMethod, expenseTotals, expenseByStatus, ledgerTotals, openShifts] = await prisma.$transaction([
    prisma.invoice.aggregate({ where: dateWhere, _sum: { total: true, amountPaid: true, balance: true }, _count: true }),
    prisma.invoice.groupBy({ by: ['status'], where: dateWhere, _sum: { total: true, balance: true }, _count: true }),
    prisma.payment.groupBy({ by: ['method'], where: dateWhere, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where: dateWhere, _sum: { totalAmount: true, amountPaid: true, balance: true }, _count: true }),
    prisma.expense.groupBy({ by: ['status'], where: dateWhere, _sum: { totalAmount: true, balance: true }, _count: true }),
    prisma.ledgerEntry.groupBy({ by: ['type'], where: dateWhere, _sum: { amount: true }, _count: true }),
    prisma.cashierShift.count({ where: { status: ShiftStatus.OPEN } })
  ]);

  const credit = ledgerTotals.find((item) => item.type === LedgerEntryType.CREDIT)?._sum.amount ?? 0;
  const debit = ledgerTotals.find((item) => item.type === LedgerEntryType.DEBIT)?._sum.amount ?? 0;

  return {
    invoices: {
      count: invoiceTotals._count,
      billed: Number(invoiceTotals._sum.total ?? 0),
      paid: Number(invoiceTotals._sum.amountPaid ?? 0),
      outstanding: Number(invoiceTotals._sum.balance ?? 0),
      byStatus: invoiceStatus
    },
    payments: { byMethod: paymentsByMethod },
    expenses: {
      count: expenseTotals._count,
      total: Number(expenseTotals._sum.totalAmount ?? 0),
      paid: Number(expenseTotals._sum.amountPaid ?? 0),
      outstanding: Number(expenseTotals._sum.balance ?? 0),
      byStatus: expenseByStatus
    },
    ledger: {
      credits: Number(credit),
      debits: Number(debit),
      net: Number(credit) - Number(debit),
      byType: ledgerTotals
    },
    shifts: { open: openShifts }
  };
}

export async function getReceivableAgeing(query: Request['query']) {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      balance: { gt: 0 },
      ...(query.hospitalId ? { hospitalId: String(query.hospitalId) } : {})
    },
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      hospital: { select: { id: true, name: true, code: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  const buckets = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0
  };

  const items = invoices.map((invoice) => {
    const ageDays = Math.max(Math.floor((now.getTime() - invoice.createdAt.getTime()) / 86_400_000), 0);
    const balance = Number(invoice.balance);
    if (ageDays <= 0) buckets.current += balance;
    else if (ageDays <= 30) buckets.days1to30 += balance;
    else if (ageDays <= 60) buckets.days31to60 += balance;
    else if (ageDays <= 90) buckets.days61to90 += balance;
    else buckets.over90 += balance;
    return { ...invoice, ageDays };
  });

  return { buckets, items };
}

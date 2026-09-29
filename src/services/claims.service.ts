import type { Request } from 'express';
import {
  ClaimBatchStatus,
  ClaimStatus,
  EncounterStatus,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type SchemeType
} from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { calculateInvoiceStatus, roundMoney } from '../utils/money.js';
import { AppError } from '../utils/appError.js';

/*
  Insurance claims (Phase 4D). A completed visit's unpaid invoices are claimed
  from a scheme the patient belongs to. While claimed, invoices are
  INSURANCE_PENDING (the cashier cannot take payment on them). Claims are
  submitted in a monthly batch per scheme, adjudicated line by line, and paid;
  the scheme's payment is applied to the invoices as INSURANCE payments. What
  the scheme rejects or does not pay returns to the invoice balance.
*/

const staff = { select: { id: true, name: true } } as const;
const money = (v: Prisma.Decimal | number | null | undefined) => roundMoney(Number(v ?? 0));
const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

async function audit(req: Request, action: string, claimId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Claims', entityType: 'Claim', entityId: claimId, details });
}

/* ----------------------------------------------------------------- schemes */

export async function listSchemes() {
  return { items: await prisma.insuranceScheme.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }) };
}

export async function createScheme(body: { code: string; name: string; type: SchemeType }, req: Request) {
  try {
    const scheme = await prisma.insuranceScheme.create({ data: body });
    await createAuditLog({ ...getRequestAuditContext(req), action: 'SCHEME_CREATED', module: 'Claims', entityType: 'InsuranceScheme', entityId: scheme.id, details: body });
    return scheme;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A scheme with that code already exists', 409, 'SCHEME_CODE_TAKEN');
    throw error;
  }
}

export async function updateScheme(id: string, body: { name?: string; isActive?: boolean }, req: Request) {
  if (!(await prisma.insuranceScheme.findUnique({ where: { id } }))) throw new AppError('Scheme not found', 404, 'SCHEME_NOT_FOUND');
  const scheme = await prisma.insuranceScheme.update({ where: { id }, data: body });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'SCHEME_UPDATED', module: 'Claims', entityType: 'InsuranceScheme', entityId: id, details: body });
  return scheme;
}

/* ------------------------------------------------------------- memberships */

export async function listMemberships(patientId: string) {
  if (!(await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  return { items: await prisma.patientInsurance.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, include: { scheme: true } }) };
}

export async function addMembership(patientId: string, body: { schemeId: string; membershipNumber: string; expiresAt?: Date }, req: Request) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const scheme = await prisma.insuranceScheme.findUnique({ where: { id: body.schemeId } });
  if (!scheme || !scheme.isActive) throw new AppError('Choose an active scheme', 400, 'SCHEME_NOT_FOUND');
  // A renewed card replaces the old membership of the same scheme.
  await prisma.$transaction([
    prisma.patientInsurance.updateMany({ where: { patientId, schemeId: scheme.id, status: 'Active' }, data: { status: 'Replaced' } }),
    prisma.patientInsurance.create({
      data: { patientId, schemeId: scheme.id, provider: scheme.name, policyNumber: body.membershipNumber, expiresAt: body.expiresAt ?? null, status: 'Active' }
    })
  ]);
  await createAuditLog({ ...getRequestAuditContext(req), action: 'MEMBERSHIP_ADDED', module: 'Claims', entityType: 'Patient', entityId: patientId, details: { scheme: scheme.code } });
  return listMemberships(patientId);
}

async function activeMembership(patientId: string, schemeId: string, on: Date) {
  const rows = await prisma.patientInsurance.findMany({ where: { patientId, schemeId, status: 'Active' }, orderBy: { createdAt: 'desc' } });
  return rows.find((m) => !m.expiresAt || m.expiresAt >= new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()))) ?? null;
}

/* ------------------------------------------------------------------ claims */

const claimInclude = {
  scheme: true,
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true } },
  encounter: { select: { id: true, encounterCode: true, type: true, clinic: true, startedAt: true, completedAt: true } },
  batch: { select: { id: true, batchCode: true, period: true, status: true } },
  createdBy: staff,
  lines: { orderBy: { description: 'asc' as const }, include: { invoice: { select: { id: true, invoiceCode: true, status: true, balance: true } } } }
} satisfies Prisma.ClaimInclude;

export async function listClaims(query: { status?: ClaimStatus; schemeId?: string; batchId?: string; patientId?: string; limit: number }) {
  const items = await prisma.claim.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.schemeId ? { schemeId: query.schemeId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    include: { scheme: { select: { id: true, code: true, name: true } }, patient: claimInclude.patient, encounter: claimInclude.encounter, batch: claimInclude.batch }
  });
  const totals = await prisma.claim.groupBy({ by: ['status'], where: query.schemeId ? { schemeId: query.schemeId } : {}, _sum: { claimedAmount: true, paidAmount: true }, _count: true });
  return {
    items,
    totals: totals.map((t) => ({ status: t.status, count: t._count, claimed: money(t._sum.claimedAmount), paid: money(t._sum.paidAmount) }))
  };
}

export async function getClaim(id: string) {
  const claim = await prisma.claim.findUnique({ where: { id }, include: claimInclude });
  if (!claim) throw new AppError('Claim not found', 404, 'CLAIM_NOT_FOUND');
  return claim;
}

/** Completed visits in the last 90 days whose patient belongs to the scheme and that still have unclaimed, unpaid invoices. */
export async function claimCandidates(query: { schemeId: string }) {
  const scheme = await prisma.insuranceScheme.findUnique({ where: { id: query.schemeId } });
  if (!scheme) throw new AppError('Scheme not found', 404, 'SCHEME_NOT_FOUND');
  const since = new Date(Date.now() - 90 * 86_400_000);
  const encounters = await prisma.encounter.findMany({
    where: {
      status: EncounterStatus.COMPLETED,
      completedAt: { gte: since },
      patient: { insuranceRecords: { some: { schemeId: scheme.id, status: 'Active' } } },
      invoices: { some: { status: InvoiceStatus.UNPAID } },
      claims: { none: { schemeId: scheme.id, status: { not: ClaimStatus.CANCELLED } } }
    },
    orderBy: { completedAt: 'desc' },
    take: 200,
    include: {
      patient: claimInclude.patient,
      invoices: { where: { status: InvoiceStatus.UNPAID }, select: { id: true, invoiceCode: true, total: true } },
      _count: { select: { diagnoses: true } }
    }
  });
  return { items: encounters.map((e) => ({ ...e, claimable: money(e.invoices.reduce((sum, i) => sum + Number(i.total), 0)) })) };
}

export async function createClaim(body: { encounterId: string; schemeId: string; invoiceIds?: string[] }, req: Request) {
  const encounter = await prisma.encounter.findUnique({
    where: { id: body.encounterId },
    include: { diagnoses: { orderBy: { createdAt: 'asc' } }, invoices: { include: { items: { include: { catalogItem: { select: { tariffCode: true } } } } } } }
  });
  if (!encounter) throw new AppError('Visit not found', 404, 'ENCOUNTER_NOT_FOUND');
  if (encounter.status !== EncounterStatus.COMPLETED) throw new AppError('Claim a visit once it is completed', 409, 'ENCOUNTER_NOT_COMPLETED');
  if (encounter.diagnoses.length === 0) throw new AppError('A claim needs at least one diagnosis on the visit', 409, 'DIAGNOSIS_REQUIRED');
  const scheme = await prisma.insuranceScheme.findUnique({ where: { id: body.schemeId } });
  if (!scheme || !scheme.isActive) throw new AppError('Choose an active scheme', 400, 'SCHEME_NOT_FOUND');
  const attendanceDate = encounter.startedAt;
  const membership = await activeMembership(encounter.patientId, scheme.id, attendanceDate);
  if (!membership) throw new AppError(`The patient had no valid ${scheme.name} membership on the day of the visit`, 409, 'NO_VALID_MEMBERSHIP');

  // Unpaid invoices only: anything the patient has started paying stays with the patient.
  const invoices = encounter.invoices.filter((i) => i.status === InvoiceStatus.UNPAID && (!body.invoiceIds || body.invoiceIds.includes(i.id)));
  if (body.invoiceIds?.some((id) => !invoices.find((i) => i.id === id))) throw new AppError('Only this visit’s unpaid invoices can be claimed', 400, 'INVOICE_NOT_CLAIMABLE');
  const lines = invoices.flatMap((invoice) =>
    invoice.items.map((item) => ({ invoiceId: invoice.id, invoiceItemId: item.id, description: item.description, tariffCode: item.catalogItem?.tariffCode ?? null, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.total }))
  );
  if (lines.length === 0) throw new AppError('Nothing on this visit is left to claim', 409, 'NOTHING_TO_CLAIM');
  const claimedAmount = roundMoney(lines.reduce((sum, l) => sum + Number(l.amount), 0));

  try {
    const id = await prisma.$transaction(async (tx) => {
      const claimCode = await nextCode(tx, 'CLM');
      const claim = await tx.claim.create({
        data: {
          claimCode,
          schemeId: scheme.id,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          membershipNumber: membership.policyNumber,
          attendanceDate,
          diagnoses: encounter.diagnoses.map((d) => ({ code: d.code, description: d.description, type: d.type })),
          claimedAmount,
          createdById: req.user?.id ?? null,
          lines: { create: lines }
        }
      });
      // Only still-unpaid invoices move; a payment taken in the meantime makes the claim fail as a whole.
      const moved = await tx.invoice.updateMany({ where: { id: { in: invoices.map((i) => i.id) }, status: InvoiceStatus.UNPAID }, data: { status: InvoiceStatus.INSURANCE_PENDING, insuranceClaimRef: claimCode } });
      if (moved.count !== invoices.length) throw new AppError('An invoice on this visit was just paid or claimed; refresh and try again', 409, 'INVOICE_CHANGED');
      return claim.id;
    });
    await audit(req, 'CLAIM_CREATED', id, { scheme: scheme.code, claimedAmount });
    return getClaim(id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('This visit already has a claim with that scheme', 409, 'CLAIM_EXISTS');
    throw error;
  }
}

async function loadClaim(id: string, allowed: ClaimStatus[]) {
  const claim = await prisma.claim.findUnique({ where: { id }, include: { lines: true, scheme: true } });
  if (!claim) throw new AppError('Claim not found', 404, 'CLAIM_NOT_FOUND');
  if (!allowed.includes(claim.status)) throw new AppError(`This claim is ${claim.status.toLowerCase()}`, 409, 'CLAIM_WRONG_STATUS');
  return claim;
}

/** Returns claimed invoices to the patient: status from what has been paid, claim reference cleared. */
async function releaseInvoices(tx: Prisma.TransactionClient, invoiceIds: string[]) {
  for (const id of [...new Set(invoiceIds)]) {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (invoice.status !== InvoiceStatus.INSURANCE_PENDING) continue;
    await tx.invoice.update({ where: { id }, data: { status: calculateInvoiceStatus(Number(invoice.total), Number(invoice.amountPaid)), insuranceClaimRef: null } });
  }
}

export async function cancelClaim(id: string, body: { reason: string }, req: Request) {
  const claim = await loadClaim(id, [ClaimStatus.DRAFT, ClaimStatus.QUERIED]);
  await prisma.$transaction(async (tx) => {
    await tx.claim.update({ where: { id }, data: { status: ClaimStatus.CANCELLED, rejectionReason: body.reason, batchId: null } });
    await releaseInvoices(tx, claim.lines.map((l) => l.invoiceId));
  });
  await audit(req, 'CLAIM_CANCELLED', id, { reason: body.reason });
  return getClaim(id);
}

/** Puts draft (or answered) claims into their scheme's batch for the month of attendance. */
export async function submitClaims(body: { claimIds: string[] }, req: Request) {
  const claims = await prisma.claim.findMany({ where: { id: { in: body.claimIds } } });
  if (claims.length !== new Set(body.claimIds).size) throw new AppError('One of those claims was not found', 404, 'CLAIM_NOT_FOUND');
  const blocked = claims.find((c) => c.status !== ClaimStatus.DRAFT && c.status !== ClaimStatus.QUERIED);
  if (blocked) throw new AppError(`${blocked.claimCode} is ${blocked.status.toLowerCase()} and cannot be submitted`, 409, 'CLAIM_WRONG_STATUS');

  await prisma.$transaction(async (tx) => {
    for (const claim of claims) {
      const period = monthOf(claim.attendanceDate);
      let batch = await tx.claimBatch.findUnique({ where: { facilityId_schemeId_period: { facilityId: claim.facilityId, schemeId: claim.schemeId, period } } });
      if (!batch) batch = await tx.claimBatch.create({ data: { batchCode: await nextCode(tx, 'CLB'), schemeId: claim.schemeId, period } });
      if (batch.status !== ClaimBatchStatus.OPEN) throw new AppError(`The ${period} batch (${batch.batchCode}) has already been sent; ${claim.claimCode} cannot join it`, 409, 'BATCH_CLOSED');
      await tx.claim.update({ where: { id: claim.id }, data: { status: ClaimStatus.SUBMITTED, submittedAt: new Date(), batchId: batch.id, queryNote: claim.status === ClaimStatus.QUERIED ? claim.queryNote : null } });
    }
  });
  for (const claim of claims) await audit(req, 'CLAIM_SUBMITTED', claim.id);
  return listClaims({ limit: 100, schemeId: claims[0]?.schemeId });
}

export async function listBatches(query: { schemeId?: string }) {
  const batches = await prisma.claimBatch.findMany({
    where: query.schemeId ? { schemeId: query.schemeId } : {},
    orderBy: [{ period: 'desc' }],
    take: 60,
    include: { scheme: { select: { code: true, name: true } }, claims: { select: { status: true, claimedAmount: true, approvedAmount: true, paidAmount: true } } }
  });
  return {
    items: batches.map(({ claims, ...b }) => ({
      ...b,
      claimCount: claims.length,
      claimed: money(claims.reduce((s, c) => s + Number(c.claimedAmount), 0)),
      approved: money(claims.reduce((s, c) => s + Number(c.approvedAmount ?? 0), 0)),
      paid: money(claims.reduce((s, c) => s + Number(c.paidAmount), 0))
    }))
  };
}

/** Marks a batch as sent to the scheme; claims for that month can no longer join it. */
export async function closeBatch(id: string, req: Request) {
  const batch = await prisma.claimBatch.findUnique({ where: { id } });
  if (!batch) throw new AppError('Batch not found', 404, 'BATCH_NOT_FOUND');
  if (batch.status !== ClaimBatchStatus.OPEN) throw new AppError('This batch has already been sent', 409, 'BATCH_CLOSED');
  await prisma.claimBatch.update({ where: { id }, data: { status: ClaimBatchStatus.SUBMITTED, submittedAt: new Date() } });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'CLAIM_BATCH_SENT', module: 'Claims', entityType: 'ClaimBatch', entityId: id });
  return listBatches({ schemeId: batch.schemeId });
}

/** The scheme asks a question; the claim goes back to the facility to answer and resubmit. */
export async function queryClaim(id: string, body: { note: string }, req: Request) {
  await loadClaim(id, [ClaimStatus.SUBMITTED]);
  await prisma.claim.update({ where: { id }, data: { status: ClaimStatus.QUERIED, queryNote: body.note } });
  await audit(req, 'CLAIM_QUERIED', id, { note: body.note });
  return getClaim(id);
}

/** Records the scheme's decision, line by line. A line not listed is approved in full. */
export async function adjudicateClaim(
  id: string,
  body: { decision: 'APPROVE' | 'REJECT'; reason?: string; lines?: Array<{ lineId: string; approvedAmount: number; rejectedReason?: string }> },
  req: Request
) {
  const claim = await loadClaim(id, [ClaimStatus.SUBMITTED]);
  if (body.decision === 'REJECT') {
    if (!body.reason) throw new AppError('Give the scheme’s reason for rejecting the claim', 400, 'REASON_REQUIRED');
    await prisma.$transaction(async (tx) => {
      await tx.claim.update({ where: { id }, data: { status: ClaimStatus.REJECTED, approvedAmount: 0, rejectionReason: body.reason, decidedAt: new Date() } });
      await tx.claimLine.updateMany({ where: { claimId: id }, data: { approvedAmount: 0 } });
      await releaseInvoices(tx, claim.lines.map((l) => l.invoiceId));
    });
    await audit(req, 'CLAIM_REJECTED', id, { reason: body.reason });
    return getClaim(id);
  }

  const decisions = new Map((body.lines ?? []).map((l) => [l.lineId, l]));
  for (const lineId of decisions.keys()) if (!claim.lines.find((l) => l.id === lineId)) throw new AppError('That line is not on this claim', 400, 'LINE_NOT_ON_CLAIM');
  const outcome = claim.lines.map((line) => {
    const d = decisions.get(line.id);
    const approved = d ? roundMoney(d.approvedAmount) : money(line.amount);
    if (approved < 0 || approved > money(line.amount)) throw new AppError(`The approved amount for "${line.description}" must be between 0 and ${money(line.amount).toFixed(2)}`, 400, 'INVALID_APPROVED_AMOUNT');
    if (approved < money(line.amount) && !d?.rejectedReason) throw new AppError(`Give the reason the scheme cut "${line.description}"`, 400, 'REASON_REQUIRED');
    return { line, approved, reason: approved < money(line.amount) ? d?.rejectedReason ?? null : null };
  });
  const approvedAmount = roundMoney(outcome.reduce((s, o) => s + o.approved, 0));

  await prisma.$transaction(async (tx) => {
    for (const o of outcome) await tx.claimLine.update({ where: { id: o.line.id }, data: { approvedAmount: o.approved, rejectedReason: o.reason } });
    await tx.claim.update({
      where: { id },
      data: approvedAmount > 0
        ? { status: ClaimStatus.APPROVED, approvedAmount, decidedAt: new Date() }
        : { status: ClaimStatus.REJECTED, approvedAmount: 0, rejectionReason: 'Every line was rejected', decidedAt: new Date() }
    });
    if (approvedAmount === 0) await releaseInvoices(tx, claim.lines.map((l) => l.invoiceId));
  });
  await audit(req, approvedAmount > 0 ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', id, { approvedAmount });
  return getClaim(id);
}

/**
 * Applies the scheme's payment. Each invoice receives its approved share
 * (scaled down if the scheme paid less than it approved) as an INSURANCE
 * payment; the rest of each invoice returns to the patient's balance.
 */
export async function recordClaimPayment(id: string, body: { amount: number; reference: string; paidAt?: Date }, req: Request) {
  const claim = await loadClaim(id, [ClaimStatus.APPROVED]);
  const approved = money(claim.approvedAmount);
  const amount = roundMoney(body.amount);
  if (amount <= 0 || amount > approved) throw new AppError(`The payment must be more than 0 and at most the approved ${approved.toFixed(2)}`, 400, 'INVALID_PAYMENT_AMOUNT');
  const paidAt = body.paidAt ?? new Date();

  // Approved amount per invoice, then this payment's share of it (the last invoice takes the rounding remainder).
  const perInvoice = new Map<string, number>();
  for (const line of claim.lines) perInvoice.set(line.invoiceId, roundMoney((perInvoice.get(line.invoiceId) ?? 0) + money(line.approvedAmount)));
  const entries = [...perInvoice.entries()].filter(([, a]) => a > 0);
  let remaining = amount;
  const shares = entries.map(([invoiceId, share], index) => {
    const value = index === entries.length - 1 ? remaining : roundMoney((share / approved) * amount);
    remaining = roundMoney(remaining - value);
    return { invoiceId, value };
  });

  await prisma.$transaction(async (tx) => {
    let running = Number((await tx.ledgerEntry.findFirst({ orderBy: { createdAt: 'desc' }, select: { runningBalance: true } }))?.runningBalance ?? 0);
    for (const { invoiceId, value } of shares) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const pay = Math.min(value, money(invoice.balance));
      if (pay > 0) {
        const payment = await tx.payment.create({
          data: { paymentCode: await nextCode(tx, 'PAY'), invoiceId, receivedById: req.user?.id ?? null, method: PaymentMethod.INSURANCE, status: PaymentStatus.COMPLETED, amount: pay, reference: body.reference, note: `${claim.scheme.name} claim ${claim.claimCode}`, createdAt: paidAt }
        });
        running = roundMoney(running + pay);
        await tx.ledgerEntry.create({
          data: { entryCode: await nextCode(tx, 'LED'), type: LedgerEntryType.CREDIT, description: `${claim.scheme.name} payment for claim ${claim.claimCode}`, amount: pay, runningBalance: running, paymentId: payment.id, userId: req.user?.id ?? null, createdAt: paidAt }
        });
      }
      const amountPaid = roundMoney(Number(invoice.amountPaid) + pay);
      const balance = roundMoney(Math.max(Number(invoice.total) - amountPaid, 0));
      await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid, balance, status: calculateInvoiceStatus(Number(invoice.total), amountPaid), insuranceClaimRef: claim.claimCode } });
    }
    // Invoices whose lines were all cut also go back to the patient.
    await releaseInvoices(tx, claim.lines.map((l) => l.invoiceId).filter((invoiceId) => !shares.find((s) => s.invoiceId === invoiceId)));
    await tx.claim.update({ where: { id }, data: { status: ClaimStatus.PAID, paidAmount: amount, paymentReference: body.reference, paidAt } });
  });
  await audit(req, 'CLAIM_PAID', id, { amount, reference: body.reference });
  return getClaim(id);
}


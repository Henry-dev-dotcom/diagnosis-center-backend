import type { Request } from 'express';
import { InvoiceStatus, Prisma, PrescriptionStatus, StockMovementType } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode as issueCode } from './codeSequence.service.js';
import { isModuleEnabled } from './facilityAccess.service.js';
import { allergyConflicts } from './allergyCheck.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Pharmacy (Phase 4A). Stock lives in batches with expiry dates; every change
  is a StockMovement, so the ledger explains every quantity on hand. Expired
  batches are never dispensed; dispensing draws from the batch that expires
  first. Batch updates are conditional (quantityOnHand >= amount), and the
  database forbids negative stock, so concurrent dispensing cannot oversell.
*/

const DAY_MS = 86_400_000;
const EXPIRY_WARNING_DAYS = 90;

async function audit(req: Request, action: string, entityType: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Pharmacy', entityType, entityId, details });
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type DrugWithBatches = Prisma.DrugGetPayload<{ include: { batches: true } }>;

/** Quantities that matter at the counter: usable (unexpired) stock, expired stock awaiting write-off, next expiry. */
function withStock(drug: DrugWithBatches) {
  const today = startOfToday();
  const usable = drug.batches.filter((b) => b.expiryDate >= today && b.quantityOnHand > 0);
  const expired = drug.batches.filter((b) => b.expiryDate < today && b.quantityOnHand > 0);
  const onHand = usable.reduce((sum, b) => sum + b.quantityOnHand, 0);
  const nextExpiry = usable.map((b) => b.expiryDate).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const { batches, ...rest } = drug;
  return {
    ...rest,
    onHand,
    expiredOnHand: expired.reduce((sum, b) => sum + b.quantityOnHand, 0),
    lowStock: onHand <= drug.reorderLevel,
    nextExpiry,
    expiringSoon: Boolean(nextExpiry && nextExpiry.getTime() - today.getTime() <= EXPIRY_WARNING_DAYS * DAY_MS),
    batches: batches
      .filter((b) => b.quantityOnHand > 0)
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
      .map((b) => ({ ...b, expired: b.expiryDate < today }))
  };
}

function searchWhere(q?: string): Prisma.DrugWhereInput {
  if (!q) return {};
  return {
    OR: [
      { genericName: { contains: q, mode: 'insensitive' } },
      { brandName: { contains: q, mode: 'insensitive' } },
      { drugCode: { contains: q, mode: 'insensitive' } }
    ]
  };
}

/* ------------------------------------------------------------------ drugs */

export async function listDrugs(query: { q?: string; includeInactive?: 'true' | 'false' }) {
  const drugs = await prisma.drug.findMany({
    where: { ...searchWhere(query.q), ...(query.includeInactive === 'true' ? {} : { isActive: true }) },
    include: { batches: true },
    orderBy: { genericName: 'asc' },
    take: 200
  });
  return { items: drugs.map(withStock) };
}

/** The prescriber's view: active drugs and whether they are in stock. */
export async function formulary(q?: string) {
  if (!(await isModuleEnabled('pharmacy'))) return { items: [] };
  const drugs = await prisma.drug.findMany({ where: { isActive: true, ...searchWhere(q) }, include: { batches: true }, orderBy: { genericName: 'asc' }, take: 25 });
  return {
    items: drugs.map((d) => {
      const stock = withStock(d);
      return { id: d.id, drugCode: d.drugCode, genericName: d.genericName, brandName: d.brandName, strength: d.strength, dosageForm: d.dosageForm, unit: d.unit, onHand: stock.onHand };
    })
  };
}

async function loadDrug(id: string) {
  const drug = await prisma.drug.findUnique({ where: { id }, include: { batches: true } });
  if (!drug) throw new AppError('Drug not found', 404, 'DRUG_NOT_FOUND');
  return drug;
}

export async function createDrug(input: Prisma.DrugUncheckedCreateInput, req: Request) {
  try {
    const drug = await prisma.drug.create({ data: input, include: { batches: true } });
    await audit(req, 'DRUG_CREATED', 'Drug', drug.id, { drugCode: drug.drugCode, genericName: drug.genericName });
    return withStock(drug);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('A drug with that code already exists', 409, 'DRUG_CODE_TAKEN');
    }
    throw error;
  }
}

export async function updateDrug(id: string, input: Prisma.DrugUncheckedUpdateInput, req: Request) {
  await loadDrug(id);
  const drug = await prisma.drug.update({ where: { id }, data: input, include: { batches: true } });
  await audit(req, 'DRUG_UPDATED', 'Drug', id, input);
  return withStock(drug);
}

/* ------------------------------------------------------------------ stock */

export async function receiveBatch(
  drugId: string,
  body: { batchNumber: string; expiryDate: Date; quantity: number; costPrice?: number; supplier?: string },
  req: Request
) {
  await loadDrug(drugId);
  if (body.expiryDate < startOfToday()) throw new AppError('This batch has already expired and cannot be received', 400, 'BATCH_EXPIRED');
  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.drugBatch.create({
        data: {
          drugId,
          batchNumber: body.batchNumber,
          expiryDate: body.expiryDate,
          quantityReceived: body.quantity,
          quantityOnHand: body.quantity,
          costPrice: body.costPrice ?? null,
          supplier: body.supplier ?? null,
          receivedById: req.user?.id ?? null
        }
      });
      await tx.stockMovement.create({
        data: { drugId, batchId: batch.id, type: StockMovementType.RECEIPT, quantity: body.quantity, reason: body.supplier ? `Received from ${body.supplier}` : 'Stock received', actorId: req.user?.id ?? null }
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('That batch number is already recorded for this drug; adjust it instead', 409, 'BATCH_EXISTS');
    }
    throw error;
  }
  await audit(req, 'STOCK_RECEIVED', 'Drug', drugId, { batchNumber: body.batchNumber, quantity: body.quantity });
  return withStock(await loadDrug(drugId));
}

export async function adjustStock(
  drugId: string,
  body: { batchId: string; quantity: number; kind: 'ADJUSTMENT' | 'EXPIRY_WRITE_OFF'; reason: string },
  req: Request
) {
  const batch = await prisma.drugBatch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.drugId !== drugId) throw new AppError('Batch not found for this drug', 404, 'BATCH_NOT_FOUND');
  if (body.kind === 'EXPIRY_WRITE_OFF' && body.quantity > 0) throw new AppError('A write-off removes stock; use a negative quantity', 400, 'INVALID_WRITE_OFF');

  await prisma.$transaction(async (tx) => {
    const changed = await tx.drugBatch.updateMany({
      where: { id: batch.id, ...(body.quantity < 0 ? { quantityOnHand: { gte: -body.quantity } } : {}) },
      data: { quantityOnHand: { increment: body.quantity } }
    });
    if (changed.count !== 1) throw new AppError(`Only ${batch.quantityOnHand} left in batch ${batch.batchNumber}`, 409, 'INSUFFICIENT_STOCK');
    await tx.stockMovement.create({
      data: {
        drugId,
        batchId: batch.id,
        type: body.kind === 'EXPIRY_WRITE_OFF' ? StockMovementType.EXPIRY_WRITE_OFF : StockMovementType.ADJUSTMENT,
        quantity: body.quantity,
        reason: body.reason,
        actorId: req.user?.id ?? null
      }
    });
  });
  await audit(req, 'STOCK_ADJUSTED', 'Drug', drugId, body);
  return withStock(await loadDrug(drugId));
}

export async function listMovements(drugId: string) {
  await loadDrug(drugId);
  const items = await prisma.stockMovement.findMany({
    where: { drugId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { batch: { select: { batchNumber: true, expiryDate: true } }, actor: { select: { name: true } } }
  });
  return { items };
}

/* -------------------------------------------------------------- dispensing */

const queueInclude = {
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      gender: true,
      allergies: { where: { active: true }, select: { id: true, substance: true, reaction: true, severity: true } }
    }
  },
  prescriber: { select: { id: true, name: true } },
  encounter: { select: { id: true, encounterCode: true, type: true } },
  items: { include: { drug: { select: { id: true, drugCode: true, genericName: true, brandName: true, strength: true, dosageForm: true, unit: true, unitPrice: true } } } },
  dispensations: { orderBy: { dispensedAt: 'desc' }, include: { items: true, dispensedBy: { select: { name: true } } } }
} satisfies Prisma.PrescriptionInclude;

export async function dispensingQueue(status: 'PENDING' | 'DISPENSED') {
  const statuses = status === 'PENDING' ? [PrescriptionStatus.ACTIVE, PrescriptionStatus.PARTIALLY_DISPENSED] : [PrescriptionStatus.DISPENSED];
  const items = await prisma.prescription.findMany({
    where: { status: { in: statuses } },
    include: queueInclude,
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 100
  });
  return { items };
}

export async function getPrescriptionForDispensing(id: string) {
  const prescription = await prisma.prescription.findUnique({ where: { id }, include: queueInclude });
  if (!prescription) throw new AppError('Prescription not found', 404, 'PRESCRIPTION_NOT_FOUND');
  return prescription;
}

export async function dispense(
  prescriptionId: string,
  body: { items: Array<{ prescriptionItemId: string; drugId: string; quantity: number }>; notes?: string; allergyOverrideReason?: string },
  req: Request
) {
  const prescription = await getPrescriptionForDispensing(prescriptionId);
  if (prescription.status !== PrescriptionStatus.ACTIVE && prescription.status !== PrescriptionStatus.PARTIALLY_DISPENSED) {
    throw new AppError('This prescription is not awaiting dispensing', 409, 'PRESCRIPTION_NOT_PENDING');
  }

  const itemsById = new Map(prescription.items.map((item) => [item.id, item]));
  const drugIds = [...new Set(body.items.map((line) => line.drugId))];
  const drugs = new Map((await prisma.drug.findMany({ where: { id: { in: drugIds } } })).map((d) => [d.id, d]));

  for (const line of body.items) {
    const item = itemsById.get(line.prescriptionItemId);
    if (!item) throw new AppError('A line is not part of this prescription', 400, 'ITEM_NOT_ON_PRESCRIPTION');
    const drug = drugs.get(line.drugId);
    if (!drug || !drug.isActive) throw new AppError('A chosen drug is not in the active drug list', 400, 'DRUG_NOT_AVAILABLE');
    if (item.quantity !== null && item.quantityDispensed + line.quantity > item.quantity) {
      throw new AppError(`Only ${item.quantity - item.quantityDispensed} more of ${item.drugName} can be supplied on this prescription`, 400, 'QUANTITY_EXCEEDS_PRESCRIPTION');
    }
  }
  if (new Set(body.items.map((l) => l.prescriptionItemId)).size !== body.items.length) {
    throw new AppError('Each prescription line can appear once per dispensing', 400, 'DUPLICATE_LINE');
  }

  // Allergy safety net: block unless the pharmacist records why they are proceeding.
  const conflicts = allergyConflicts(
    prescription.patient.allergies,
    body.items.flatMap((line) => {
      const drug = drugs.get(line.drugId)!;
      return [drug.genericName, drug.brandName, itemsById.get(line.prescriptionItemId)!.drugName];
    })
  );
  if (conflicts.length && !body.allergyOverrideReason) {
    throw new AppError(`Recorded allergy: ${conflicts.join(', ')}. Confirm with the prescriber, then give a reason to dispense anyway.`, 409, 'ALLERGY_CONFLICT', { allergies: conflicts });
  }

  const charge = await isModuleEnabled('billing');
  const today = startOfToday();

  const dispensationId = await prisma.$transaction(async (tx) => {
    const dispensation = await tx.dispensation.create({
      data: {
        dispensationCode: await issueCode(tx, 'DSP'),
        prescriptionId,
        dispensedById: req.user?.id ?? null,
        notes: body.notes ?? null,
        allergyOverride: conflicts.length ? `${conflicts.join(', ')}: ${body.allergyOverrideReason}` : null
      }
    });

    let total = new Prisma.Decimal(0);
    const invoiceLines: Array<{ description: string; quantity: number; unitPrice: Prisma.Decimal; total: Prisma.Decimal }> = [];

    for (const line of body.items) {
      const drug = drugs.get(line.drugId)!;
      const dispensedItem = await tx.dispensationItem.create({
        data: { dispensationId: dispensation.id, prescriptionItemId: line.prescriptionItemId, drugId: drug.id, quantity: line.quantity, unitPrice: drug.unitPrice }
      });

      // First expiry, first out; expired batches are never used.
      const batches = await tx.drugBatch.findMany({
        where: { drugId: drug.id, quantityOnHand: { gt: 0 }, expiryDate: { gte: today } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }]
      });
      const available = batches.reduce((sum, b) => sum + b.quantityOnHand, 0);
      if (available < line.quantity) {
        throw new AppError(`Not enough ${drug.genericName} in stock: ${available} ${drug.unit}(s) available`, 409, 'INSUFFICIENT_STOCK', { drugId: drug.id, available });
      }
      let remaining = line.quantity;
      for (const batch of batches) {
        if (remaining === 0) break;
        const take = Math.min(remaining, batch.quantityOnHand);
        const changed = await tx.drugBatch.updateMany({
          where: { id: batch.id, quantityOnHand: { gte: take } },
          data: { quantityOnHand: { decrement: take } }
        });
        // Someone else dispensed from this batch in the meantime; the whole dispensing rolls back.
        if (changed.count !== 1) throw new AppError('Stock changed while dispensing; please try again', 409, 'STOCK_CHANGED');
        await tx.stockMovement.create({
          data: { drugId: drug.id, batchId: batch.id, type: StockMovementType.DISPENSE, quantity: -take, dispensationItemId: dispensedItem.id, reason: prescription.prescriptionCode, actorId: req.user?.id ?? null }
        });
        remaining -= take;
      }

      await tx.prescriptionItem.update({
        where: { id: line.prescriptionItemId },
        data: { quantityDispensed: { increment: line.quantity }, drugId: itemsById.get(line.prescriptionItemId)!.drugId ?? drug.id }
      });

      const lineTotal = drug.unitPrice.mul(line.quantity);
      total = total.add(lineTotal);
      invoiceLines.push({ description: [drug.genericName, drug.strength, drug.dosageForm].filter(Boolean).join(' '), quantity: line.quantity, unitPrice: drug.unitPrice, total: lineTotal });
    }

    // Complete when every line has been supplied in full (lines without a prescribed quantity count once supplied).
    const refreshed = await tx.prescriptionItem.findMany({ where: { prescriptionId } });
    const complete = refreshed.every((item) => (item.quantity === null ? item.quantityDispensed > 0 : item.quantityDispensed >= item.quantity));
    await tx.prescription.update({
      where: { id: prescriptionId },
      data: { status: complete ? PrescriptionStatus.DISPENSED : PrescriptionStatus.PARTIALLY_DISPENSED }
    });

    if (charge && total.gt(0)) {
      const invoice = await tx.invoice.create({
        data: {
          invoiceCode: await issueCode(tx, 'INV'),
          encounterId: prescription.encounterId,
          patientId: prescription.patientId,
          status: InvoiceStatus.UNPAID,
          subtotal: total,
          total,
          balance: total,
          createdById: req.user?.id ?? null,
          items: { create: invoiceLines }
        }
      });
      await tx.dispensation.update({ where: { id: dispensation.id }, data: { invoiceId: invoice.id } });
    }
    return dispensation.id;
  });

  await audit(req, 'PRESCRIPTION_DISPENSED', 'Prescription', prescriptionId, {
    dispensationId,
    lines: body.items.length,
    allergyOverride: conflicts.length ? body.allergyOverrideReason : undefined
  });
  return getPrescriptionForDispensing(prescriptionId);
}

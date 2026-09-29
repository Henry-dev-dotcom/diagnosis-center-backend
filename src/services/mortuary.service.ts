import type { Request } from 'express';
import { CatalogItemType, DeceasedStatus, InvoiceStatus, Prisma, type PlaceOfDeath } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { isModuleEnabled } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Mortuary (Phase 4D). The deceased register holds every body in the
  facility's care, with a unique body tag and one body per slot. Only a
  doctor certifies the cause of death. A body is released to an identified
  collector once the death is certified, or, in a police case, once the
  police have cleared it. Storage is charged per day (the MORT-DAY service
  item) when the deceased has a patient record and Billing is on.
*/

const DAY_MS = 86_400_000;
const STORAGE_ITEM_CODE = 'MORT-DAY';
const staff = { select: { id: true, name: true } } as const;

async function audit(req: Request, action: string, id: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Mortuary', entityType: 'DeceasedRecord', entityId: id, details });
}

const include = {
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true } },
  encounter: { select: { id: true, encounterCode: true, type: true } },
  slot: true,
  certifiedBy: staff,
  registeredBy: staff,
  releasedBy: staff
} satisfies Prisma.DeceasedRecordInclude;

export async function listSlots() {
  const slots = await prisma.mortuarySlot.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    include: { bodies: { where: { status: DeceasedStatus.IN_STORAGE }, select: { id: true, caseCode: true, fullName: true, bodyTag: true, admittedAt: true } } }
  });
  return { items: slots.map(({ bodies, ...slot }) => ({ ...slot, occupant: bodies[0] ?? null })) };
}

export async function createSlot(body: { code: string }, req: Request) {
  try {
    const slot = await prisma.mortuarySlot.create({ data: body });
    await createAuditLog({ ...getRequestAuditContext(req), action: 'MORTUARY_SLOT_CREATED', module: 'Mortuary', entityType: 'MortuarySlot', entityId: slot.id, details: body });
    return slot;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A slot with that code already exists', 409, 'SLOT_CODE_TAKEN');
    throw error;
  }
}

export async function listDeceased(query: { status?: DeceasedStatus; search?: string }) {
  const items = await prisma.deceasedRecord.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ fullName: { contains: query.search, mode: 'insensitive' } }, { caseCode: { contains: query.search, mode: 'insensitive' } }, { bodyTag: { contains: query.search, mode: 'insensitive' } }] } : {})
    },
    orderBy: { admittedAt: 'desc' },
    take: 200,
    include
  });
  return { items };
}

export async function getDeceased(id: string) {
  const record = await prisma.deceasedRecord.findUnique({ where: { id }, include });
  if (!record) throw new AppError('Record not found', 404, 'DECEASED_NOT_FOUND');
  return record;
}

function uniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function registerDeceased(
  body: {
    patientId?: string;
    fullName?: string;
    sex?: string;
    estimatedAgeYears?: number;
    dateOfDeath: Date;
    placeOfDeath: PlaceOfDeath;
    encounterId?: string;
    slotId: string;
    bodyTag: string;
    policeCase: boolean;
    policeReference?: string;
    notes?: string;
  },
  req: Request
) {
  if (body.dateOfDeath > new Date(Date.now() + 5 * 60_000)) throw new AppError('The date of death cannot be in the future', 400, 'DEATH_IN_FUTURE');
  let fullName = body.fullName;
  let sex = body.sex;
  if (body.patientId) {
    const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, include: { deceasedRecord: { select: { caseCode: true } } } });
    if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    if (patient.deceasedRecord) throw new AppError(`This patient is already on the deceased register (${patient.deceasedRecord.caseCode})`, 409, 'ALREADY_REGISTERED');
    fullName = `${patient.firstName} ${patient.lastName}`;
    sex = patient.gender ?? sex ?? 'Unknown';
    // A death on a ward stay closes nothing automatically; the discharge (outcome DECEASED) is recorded on the ward.
  }
  if (!fullName || !sex) throw new AppError('Give the name (or "Unknown") and sex of the deceased', 400, 'IDENTITY_REQUIRED');
  if (body.encounterId) {
    const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId }, select: { patientId: true } });
    if (!encounter || encounter.patientId !== body.patientId) throw new AppError('That visit is not this patient’s', 400, 'ENCOUNTER_MISMATCH');
  }
  const slot = await prisma.mortuarySlot.findUnique({ where: { id: body.slotId } });
  if (!slot || !slot.isActive) throw new AppError('Choose an active slot', 400, 'SLOT_NOT_FOUND');

  try {
    const id = await prisma.$transaction(async (tx) =>
      (await tx.deceasedRecord.create({
        data: {
          caseCode: await nextCode(tx, 'MOR'),
          patientId: body.patientId ?? null,
          fullName,
          sex,
          estimatedAgeYears: body.estimatedAgeYears ?? null,
          dateOfDeath: body.dateOfDeath,
          placeOfDeath: body.placeOfDeath,
          encounterId: body.encounterId ?? null,
          slotId: slot.id,
          bodyTag: body.bodyTag,
          policeCase: body.policeCase,
          policeReference: body.policeReference ?? null,
          notes: body.notes ?? null,
          registeredById: req.user?.id ?? null
        }
      })).id
    );
    await audit(req, 'DECEASED_REGISTERED', id, { placeOfDeath: body.placeOfDeath, policeCase: body.policeCase });
    return getDeceased(id);
  } catch (error) {
    if (uniqueViolation(error)) {
      const target = String((error as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
      if (target.includes('bodyTag')) throw new AppError('That body tag is already in use', 409, 'TAG_TAKEN');
      if (target.includes('patientId')) throw new AppError('This patient is already on the deceased register', 409, 'ALREADY_REGISTERED');
      throw new AppError('That slot is already occupied', 409, 'SLOT_OCCUPIED');
    }
    throw error;
  }
}

async function loadStored(id: string) {
  const record = await prisma.deceasedRecord.findUnique({ where: { id } });
  if (!record) throw new AppError('Record not found', 404, 'DECEASED_NOT_FOUND');
  if (record.status !== DeceasedStatus.IN_STORAGE) throw new AppError('This body has been released', 409, 'ALREADY_RELEASED');
  return record;
}

/** The medical certificate of cause of death: doctors only (enforced by the route permission). */
export async function certifyDeath(id: string, body: { causeOfDeath: string; causeIcd10?: string }, req: Request) {
  await loadStored(id);
  await prisma.deceasedRecord.update({ where: { id }, data: { causeOfDeath: body.causeOfDeath, causeIcd10: body.causeIcd10?.toUpperCase() ?? null, certifiedById: req.user?.id ?? null, certifiedAt: new Date() } });
  await audit(req, 'DEATH_CERTIFIED', id, body);
  return getDeceased(id);
}

export async function recordPoliceClearance(id: string, body: { clearanceRef: string }, req: Request) {
  const record = await loadStored(id);
  if (!record.policeCase) throw new AppError('This is not a police case', 409, 'NOT_POLICE_CASE');
  await prisma.deceasedRecord.update({ where: { id }, data: { policeClearanceRef: body.clearanceRef } });
  await audit(req, 'POLICE_CLEARANCE_RECORDED', id, body);
  return getDeceased(id);
}

export async function moveSlot(id: string, body: { slotId: string }, req: Request) {
  const record = await loadStored(id);
  if (record.slotId === body.slotId) throw new AppError('The body is already in that slot', 400, 'SAME_SLOT');
  const slot = await prisma.mortuarySlot.findUnique({ where: { id: body.slotId } });
  if (!slot || !slot.isActive) throw new AppError('Choose an active slot', 400, 'SLOT_NOT_FOUND');
  try {
    await prisma.deceasedRecord.update({ where: { id }, data: { slotId: slot.id } });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(`Slot ${slot.code} is occupied`, 409, 'SLOT_OCCUPIED');
    throw error;
  }
  await audit(req, 'BODY_MOVED', id, { slot: slot.code });
  return getDeceased(id);
}

export async function releaseBody(id: string, body: { releasedTo: string; relationship: string; idNumber: string; notes?: string }, req: Request) {
  const record = await loadStored(id);
  if (!record.causeOfDeath && !(record.policeCase && record.policeClearanceRef)) {
    throw new AppError(record.policeCase ? 'Record the police clearance before release' : 'A doctor must certify the cause of death before release', 409, record.policeCase ? 'POLICE_CLEARANCE_REQUIRED' : 'CERTIFICATION_REQUIRED');
  }
  if (record.policeCase && !record.policeClearanceRef) throw new AppError('Record the police clearance before release', 409, 'POLICE_CLEARANCE_REQUIRED');
  const releasedAt = new Date();
  const storageDays = Math.max(1, Math.ceil((releasedAt.getTime() - record.admittedAt.getTime()) / DAY_MS));
  const item = record.patientId && (await isModuleEnabled('billing'))
    ? await prisma.catalogItem.findFirst({ where: { catalogCode: STORAGE_ITEM_CODE, type: CatalogItemType.SERVICE, isActive: true } })
    : null;

  let invoiceCode: string | null = null;
  await prisma.$transaction(async (tx) => {
    const changed = await tx.deceasedRecord.updateMany({
      where: { id, status: DeceasedStatus.IN_STORAGE },
      data: { status: DeceasedStatus.RELEASED, releasedAt, releasedTo: body.releasedTo, releasedToRelation: body.relationship, releasedToIdNumber: body.idNumber, releasedById: req.user?.id ?? null, storageDays, slotId: null, notes: body.notes ? `${record.notes ? `${record.notes}\n` : ''}${body.notes}` : record.notes }
    });
    if (changed.count !== 1) throw new AppError('This body has just been released', 409, 'ALREADY_RELEASED');
    if (item && record.patientId) {
      const total = item.price.mul(storageDays);
      invoiceCode = await nextCode(tx, 'INV');
      await tx.invoice.create({
        data: {
          invoiceCode,
          patientId: record.patientId,
          encounterId: record.encounterId,
          status: InvoiceStatus.UNPAID,
          subtotal: total,
          total,
          balance: total,
          createdById: req.user?.id ?? null,
          items: { create: [{ catalogItemId: item.id, description: `${item.name}: ${storageDays} day${storageDays === 1 ? '' : 's'} (${record.caseCode})`, quantity: storageDays, unitPrice: item.price, total }] }
        }
      });
    }
  });
  await audit(req, 'BODY_RELEASED', id, { releasedTo: body.releasedTo, storageDays, invoiceCode });
  return { ...(await getDeceased(id)), invoiceCode };
}

/** Patients on the deceased register cannot be given new visits or admissions. */
export async function assertPatientAlive(patientId: string) {
  const record = await prisma.deceasedRecord.findUnique({ where: { patientId }, select: { caseCode: true, dateOfDeath: true } });
  if (record) throw new AppError(`This patient is recorded as deceased (${record.caseCode}, ${record.dateOfDeath.toISOString().slice(0, 10)})`, 409, 'PATIENT_DECEASED');
}

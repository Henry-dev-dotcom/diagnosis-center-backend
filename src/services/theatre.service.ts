import type { Request } from 'express';
import {
  CatalogItemType,
  ClinicalNoteType,
  EncounterStatus,
  InvoiceStatus,
  Prisma,
  SurgeryStatus,
  UserRole,
  type AnaesthesiaType,
  type SurgeryUrgency
} from '@prisma/client';
import { prisma } from './prisma.service.js';
import { isModuleEnabled } from './facilityAccess.service.js';
import { nextCode as issueCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Operating theatre (Phase 4B). A Surgery belongs to an open visit or inpatient
  stay, so its operation note joins that clinical record. Each step follows the
  WHO Surgical Safety Checklist: SIGN IN before anaesthesia moves the case into
  theatre, TIME OUT before the incision starts the operation, and SIGN OUT with
  the operation note completes it. A theatre cannot be double-booked: bookings
  for one theatre are serialised with a transaction-scoped advisory lock and
  checked for overlap inside it.
*/

const OPEN_ENCOUNTER: EncounterStatus[] = [EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];
const BOOKED: SurgeryStatus[] = [SurgeryStatus.SCHEDULED, SurgeryStatus.IN_THEATRE];
const MINUTE_MS = 60_000;

const staff = { select: { id: true, name: true } } as const;

async function audit(req: Request, action: string, surgeryId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Theatre', entityType: 'Surgery', entityId: surgeryId, details });
}

/* ---------------------------------------------------------------- theatres */

export async function listTheatres() {
  return { items: await prisma.theatre.findMany({ orderBy: { name: 'asc' } }) };
}

export async function createTheatre(body: { code: string; name: string }, req: Request) {
  try {
    const theatre = await prisma.theatre.create({ data: body });
    await createAuditLog({ ...getRequestAuditContext(req), action: 'THEATRE_CREATED', module: 'Theatre', entityType: 'Theatre', entityId: theatre.id, details: body });
    return theatre;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A theatre with that code already exists', 409, 'THEATRE_CODE_TAKEN');
    throw error;
  }
}

export async function updateTheatre(id: string, body: { name?: string; isActive?: boolean }, req: Request) {
  const theatre = await prisma.theatre.findUnique({ where: { id } });
  if (!theatre) throw new AppError('Theatre not found', 404, 'THEATRE_NOT_FOUND');
  const updated = await prisma.theatre.update({ where: { id }, data: body });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'THEATRE_UPDATED', module: 'Theatre', entityType: 'Theatre', entityId: id, details: body });
  return updated;
}

/* --------------------------------------------------------------- surgeries */

const surgeryInclude = {
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
  encounter: { select: { id: true, encounterCode: true, type: true, status: true, admission: { select: { id: true, admissionCode: true, ward: { select: { name: true } }, bed: { select: { label: true } } } } } },
  theatre: { select: { id: true, code: true, name: true } },
  procedureItem: { select: { id: true, name: true, price: true } },
  surgeon: staff,
  bookedBy: staff
} satisfies Prisma.SurgeryInclude;

export async function listSurgeries(query: { date?: Date; theatreId?: string; status?: SurgeryStatus; patientId?: string }) {
  const where: Prisma.SurgeryWhereInput = {};
  if (query.theatreId) where.theatreId = query.theatreId;
  if (query.status) where.status = query.status;
  if (query.patientId) where.patientId = query.patientId;
  if (query.date) {
    const day = new Date(Date.UTC(query.date.getUTCFullYear(), query.date.getUTCMonth(), query.date.getUTCDate()));
    where.scheduledStart = { gte: day, lt: new Date(day.getTime() + 1440 * MINUTE_MS) };
  }
  const items = await prisma.surgery.findMany({ where, orderBy: { scheduledStart: 'asc' }, take: 200, include: surgeryInclude });
  return { items };
}

export async function getSurgery(id: string) {
  const surgery = await prisma.surgery.findUnique({ where: { id }, include: surgeryInclude });
  if (!surgery) throw new AppError('Operation not found', 404, 'SURGERY_NOT_FOUND');
  return surgery;
}

async function loadSurgery(id: string, allowed: SurgeryStatus[]) {
  const surgery = await prisma.surgery.findUnique({ where: { id } });
  if (!surgery) throw new AppError('Operation not found', 404, 'SURGERY_NOT_FOUND');
  if (!allowed.includes(surgery.status)) {
    throw new AppError(`This operation is ${surgery.status.toLowerCase().replace(/_/g, ' ')}`, 409, 'SURGERY_WRONG_STATUS');
  }
  return surgery;
}

/** Holds the theatre's booking lock for the rest of the transaction, then rejects overlapping cases. */
async function assertTheatreFree(tx: Prisma.TransactionClient, theatreId: string, start: Date, end: Date, exceptId?: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`theatre:${theatreId}`}::text))`;
  const clash = await tx.surgery.findFirst({
    where: { theatreId, status: { in: BOOKED }, scheduledStart: { lt: end }, scheduledEnd: { gt: start }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { surgeryCode: true, procedureName: true, scheduledStart: true }
  });
  if (clash) {
    throw new AppError(`The theatre is booked then (${clash.surgeryCode}, ${clash.procedureName})`, 409, 'THEATRE_DOUBLE_BOOKED');
  }
}

async function assertTheatre(theatreId: string) {
  const theatre = await prisma.theatre.findUnique({ where: { id: theatreId } });
  if (!theatre) throw new AppError('Theatre not found', 404, 'THEATRE_NOT_FOUND');
  if (!theatre.isActive) throw new AppError(`${theatre.name} is closed`, 409, 'THEATRE_CLOSED');
}

async function assertSurgeon(surgeonId: string) {
  const surgeon = await prisma.user.findUnique({ where: { id: surgeonId }, select: { role: true, status: true } });
  if (!surgeon || surgeon.role !== UserRole.DOCTOR || surgeon.status !== 'ACTIVE') {
    throw new AppError('The surgeon must be an active doctor at this facility', 400, 'INVALID_SURGEON');
  }
}

async function procedureItem(id: string | undefined) {
  if (!id) return null;
  const item = await prisma.catalogItem.findUnique({ where: { id } });
  if (!item || !item.isActive || item.type !== CatalogItemType.SERVICE) {
    throw new AppError('The procedure must be an active service item from the catalog', 400, 'INVALID_PROCEDURE_ITEM');
  }
  return item;
}

export async function scheduleSurgery(
  body: {
    encounterId: string;
    theatreId: string;
    procedureItemId?: string;
    procedureName?: string;
    urgency: SurgeryUrgency;
    anaesthesia?: AnaesthesiaType;
    scheduledStart: Date;
    durationMinutes: number;
    surgeonId?: string;
    anaesthetistName?: string;
    assistants?: string;
    preopDiagnosis?: string;
  },
  req: Request
) {
  const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId }, select: { id: true, patientId: true, status: true } });
  if (!encounter) throw new AppError('Visit not found', 404, 'ENCOUNTER_NOT_FOUND');
  if (!OPEN_ENCOUNTER.includes(encounter.status)) throw new AppError('Book the operation on an open visit or inpatient stay', 409, 'ENCOUNTER_CLOSED');
  await assertTheatre(body.theatreId);
  const item = await procedureItem(body.procedureItemId);
  const procedureName = body.procedureName ?? item?.name;
  if (!procedureName) throw new AppError('Name the procedure', 400, 'PROCEDURE_REQUIRED');
  const surgeonId = body.surgeonId ?? (req.user?.role === UserRole.DOCTOR ? req.user.id : undefined);
  if (surgeonId) await assertSurgeon(surgeonId);
  const start = body.scheduledStart;
  const end = new Date(start.getTime() + body.durationMinutes * MINUTE_MS);

  const id = await prisma.$transaction(async (tx) => {
    await assertTheatreFree(tx, body.theatreId, start, end);
    const surgery = await tx.surgery.create({
      data: {
        surgeryCode: await issueCode(tx, 'SRG'),
        patientId: encounter.patientId,
        encounterId: encounter.id,
        theatreId: body.theatreId,
        procedureItemId: item?.id ?? null,
        procedureName,
        urgency: body.urgency,
        anaesthesia: body.anaesthesia ?? null,
        scheduledStart: start,
        scheduledEnd: end,
        surgeonId: surgeonId ?? null,
        anaesthetistName: body.anaesthetistName ?? null,
        assistants: body.assistants ?? null,
        preopDiagnosis: body.preopDiagnosis ?? null,
        bookedById: req.user?.id ?? null
      }
    });
    return surgery.id;
  });
  await audit(req, 'SURGERY_SCHEDULED', id, { theatreId: body.theatreId, scheduledStart: start, urgency: body.urgency });
  return getSurgery(id);
}

export async function rescheduleSurgery(
  id: string,
  body: { theatreId?: string; scheduledStart?: Date; durationMinutes?: number; surgeonId?: string; anaesthetistName?: string; assistants?: string; anaesthesia?: AnaesthesiaType },
  req: Request
) {
  const surgery = await loadSurgery(id, [SurgeryStatus.SCHEDULED]);
  const theatreId = body.theatreId ?? surgery.theatreId;
  if (body.theatreId) await assertTheatre(body.theatreId);
  if (body.surgeonId) await assertSurgeon(body.surgeonId);
  const start = body.scheduledStart ?? surgery.scheduledStart;
  const minutes = body.durationMinutes ?? (surgery.scheduledEnd.getTime() - surgery.scheduledStart.getTime()) / MINUTE_MS;
  const end = new Date(start.getTime() + minutes * MINUTE_MS);

  await prisma.$transaction(async (tx) => {
    await assertTheatreFree(tx, theatreId, start, end, id);
    await tx.surgery.update({
      where: { id },
      data: {
        theatreId,
        scheduledStart: start,
        scheduledEnd: end,
        ...(body.surgeonId ? { surgeonId: body.surgeonId } : {}),
        ...(body.anaesthetistName !== undefined ? { anaesthetistName: body.anaesthetistName } : {}),
        ...(body.assistants !== undefined ? { assistants: body.assistants } : {}),
        ...(body.anaesthesia ? { anaesthesia: body.anaesthesia } : {})
      }
    });
  });
  await audit(req, 'SURGERY_RESCHEDULED', id, { theatreId, scheduledStart: start, durationMinutes: minutes });
  return getSurgery(id);
}

function checklistEntry(answers: Record<string, unknown>, req: Request) {
  return { ...answers, by: req.user?.name ?? req.user?.id ?? null, byId: req.user?.id ?? null, at: new Date().toISOString() };
}

function withChecklist(current: Prisma.JsonValue, phase: string, entry: Record<string, unknown>) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return { ...base, [phase]: entry } as Prisma.InputJsonObject;
}

/** SIGN IN, before induction of anaesthesia: the patient is in theatre. */
export async function signIn(id: string, body: { anaesthesia: AnaesthesiaType; answers: Record<string, unknown> }, req: Request) {
  const surgery = await loadSurgery(id, [SurgeryStatus.SCHEDULED]);
  const now = new Date();
  // The status condition makes a second, simultaneous sign-in fail instead of overwriting.
  const changed = await prisma.surgery.updateMany({
    where: { id, status: SurgeryStatus.SCHEDULED },
    data: { status: SurgeryStatus.IN_THEATRE, anaesthesia: body.anaesthesia, signInAt: now, checklist: withChecklist(surgery.checklist, 'signIn', checklistEntry(body.answers, req)) }
  });
  if (changed.count !== 1) throw new AppError('This operation was just signed in by someone else', 409, 'SURGERY_WRONG_STATUS');
  await audit(req, 'SURGERY_SIGN_IN', id, { anaesthesia: body.anaesthesia });
  return getSurgery(id);
}

/** TIME OUT, before skin incision: the operation starts. */
export async function timeOut(id: string, body: { answers: Record<string, unknown> }, req: Request) {
  const surgery = await loadSurgery(id, [SurgeryStatus.IN_THEATRE]);
  if (surgery.timeOutAt) throw new AppError('Time out has already been done', 409, 'CHECKLIST_DONE');
  const now = new Date();
  await prisma.surgery.update({ where: { id }, data: { timeOutAt: now, startedAt: now, checklist: withChecklist(surgery.checklist, 'timeOut', checklistEntry(body.answers, req)) } });
  await audit(req, 'SURGERY_TIME_OUT', id);
  return getSurgery(id);
}

/** SIGN OUT and the operation note: closes the case, writes the note to the record and charges the procedure. */
export async function completeSurgery(
  id: string,
  body: {
    answers: Record<string, unknown>;
    procedurePerformed: string;
    findings: string;
    complications?: string;
    bloodLossMl?: number;
    specimens?: string;
    postOpPlan: string;
  },
  req: Request
) {
  const surgery = await loadSurgery(id, [SurgeryStatus.IN_THEATRE]);
  if (!surgery.timeOutAt) throw new AppError('Do the time out before recording the operation', 409, 'TIME_OUT_REQUIRED');
  const item = surgery.procedureItemId ? await prisma.catalogItem.findUnique({ where: { id: surgery.procedureItemId } }) : null;
  const charge = item && item.price.gt(0) && (await isModuleEnabled('billing'));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const closed = await tx.surgery.updateMany({
      where: { id, status: SurgeryStatus.IN_THEATRE },
      data: {
        status: SurgeryStatus.COMPLETED,
        signOutAt: now,
        endedAt: now,
        checklist: withChecklist(surgery.checklist, 'signOut', checklistEntry(body.answers, req)),
        procedurePerformed: body.procedurePerformed,
        findings: body.findings,
        complications: body.complications ?? null,
        bloodLossMl: body.bloodLossMl ?? null,
        specimens: body.specimens ?? null,
        postOpPlan: body.postOpPlan
      }
    });
    if (closed.count !== 1) throw new AppError('This operation was just completed by someone else', 409, 'SURGERY_WRONG_STATUS');

    await tx.clinicalNote.create({
      data: {
        type: ClinicalNoteType.OPERATION,
        encounterId: surgery.encounterId,
        patientId: surgery.patientId,
        authorId: req.user?.id ?? null,
        subjective: `${surgery.surgeryCode}: ${body.procedurePerformed}`,
        objective: body.findings,
        assessment: [body.complications ? `Complications: ${body.complications}` : 'No complications recorded', body.bloodLossMl != null ? `Estimated blood loss ${body.bloodLossMl} ml` : null, body.specimens ? `Specimens: ${body.specimens}` : null]
          .filter(Boolean)
          .join('. '),
        plan: body.postOpPlan
      }
    });

    if (charge && item) {
      await tx.invoice.create({
        data: {
          invoiceCode: await issueCode(tx, 'INV'),
          encounterId: surgery.encounterId,
          patientId: surgery.patientId,
          status: InvoiceStatus.UNPAID,
          subtotal: item.price,
          total: item.price,
          balance: item.price,
          createdById: req.user?.id ?? null,
          items: { create: [{ catalogItemId: item.id, description: `${item.name} (${surgery.surgeryCode})`, quantity: 1, unitPrice: item.price, total: item.price }] }
        }
      });
    }
  });
  await audit(req, 'SURGERY_COMPLETED', id, { charged: Boolean(charge) });
  return getSurgery(id);
}

/** Cancel or postpone: allowed until the time out, never once the operation has started. */
export async function cancelSurgery(id: string, body: { reason: string }, req: Request) {
  const surgery = await loadSurgery(id, BOOKED);
  if (surgery.timeOutAt) throw new AppError('The operation has started; complete it with the operation note', 409, 'SURGERY_STARTED');
  await prisma.surgery.update({ where: { id }, data: { status: SurgeryStatus.CANCELLED, cancelReason: body.reason } });
  await audit(req, 'SURGERY_CANCELLED', id, { reason: body.reason });
  return getSurgery(id);
}

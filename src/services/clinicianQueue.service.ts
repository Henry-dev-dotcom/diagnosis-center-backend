import type { Request } from 'express';
import { EncounterStatus, EncounterType, Prisma } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getEncounter } from './encounter.service.js';
import { deriveQueueState, testProgress, type QueueState } from './queueState.js';
import { AppError } from '../utils/appError.js';

/*
  The clinician's queue, and pausing a visit while tests are done.

  A doctor sees three lists: patients waiting for them, patients sent off for tests,
  and patients whose tests are back. "Send to Lab & Suspend" parks the visit - it stays
  open, the patient stays in the building, and the visit comes back to the doctor by
  itself when the results are signed off (see queueState.ts).
*/

const OPEN: EncounterStatus[] = [EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];

const patientSelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  phone: true
} satisfies Prisma.PatientSelect;
const staffSelect = { select: { id: true, name: true, role: true } } as const;

async function audit(req: Request, action: string, encounterId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Encounters', entityType: 'Encounter', entityId: encounterId, details });
}

const isAdmin = (req: Request) => req.user?.role === 'ADMIN';

/** Only the clinician seeing the patient (or an administrator) may pause or resume their visit. */
function assertOwnsVisit(encounter: { attendingId: string | null }, req: Request) {
  if (isAdmin(req) || !encounter.attendingId || encounter.attendingId === req.user?.id) return;
  throw new AppError('Another clinician is seeing this patient', 409, 'ENCOUNTER_IN_CONSULTATION');
}

async function loadOpen(id: string) {
  const encounter = await prisma.encounter.findUnique({
    where: { id },
    include: { orders: { include: { items: { select: { status: true, catalogItem: { select: { name: true } } } } } } }
  });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  if (!OPEN.includes(encounter.status)) {
    throw new AppError('This visit is closed and can no longer be changed', 409, 'ENCOUNTER_CLOSED');
  }
  return encounter;
}

export async function getClinicianQueue(query: { scope?: 'mine' | 'all' }, req: Request) {
  // A doctor's pending and ready lists are their own patients; the waiting list is shared by everyone.
  const scope = query.scope ?? (req.user?.role === 'DOCTOR' ? 'mine' : 'all');

  const rows = await prisma.encounter.findMany({
    where: { status: { in: OPEN }, type: { not: EncounterType.INPATIENT } },
    take: 400,
    // Most urgent first, then longest waiting.
    orderBy: [{ triageLevel: 'asc' }, { startedAt: 'asc' }],
    include: {
      patient: { select: patientSelect },
      attending: staffSelect,
      orders: { include: { items: { select: { status: true, catalogItem: { select: { name: true } } } } } }
    }
  });

  const buckets: Record<'new' | 'inConsultation' | 'pendingLabs' | 'reviewReady', Array<{ suspendedAt: Date | null }>> = {
    new: [],
    inConsultation: [],
    pendingLabs: [],
    reviewReady: []
  };
  for (const row of rows) {
    const queueState: QueueState = deriveQueueState(row, row.orders);
    const { orders, ...encounter } = row;
    const item = { ...encounter, queueState, tests: testProgress(orders) };
    if (queueState === 'NEW') {
      buckets.new.push(item);
      continue;
    }
    if (scope === 'mine' && row.attendingId !== req.user?.id) continue;
    if (queueState === 'IN_CONSULTATION') buckets.inConsultation.push(item);
    else if (queueState === 'PENDING_LABS') buckets.pendingLabs.push(item);
    else if (queueState === 'REVIEW_READY') buckets.reviewReady.push(item);
  }
  // Longest-parked first within the two paused lists.
  const bySuspended = (a: { suspendedAt: Date | null }, b: { suspendedAt: Date | null }) => +new Date(a.suspendedAt ?? 0) - +new Date(b.suspendedAt ?? 0);
  buckets.pendingLabs.sort(bySuspended);
  buckets.reviewReady.sort(bySuspended);

  return {
    scope,
    counts: {
      new: buckets.new.length,
      inConsultation: buckets.inConsultation.length,
      pendingLabs: buckets.pendingLabs.length,
      reviewReady: buckets.reviewReady.length
    },
    ...buckets
  };
}

export async function suspendEncounter(id: string, req: Request) {
  const encounter = await loadOpen(id);
  if (encounter.status !== EncounterStatus.IN_CONSULTATION) {
    throw new AppError('Start the consultation before sending the patient for tests', 409, 'ENCOUNTER_NOT_IN_CONSULTATION');
  }
  assertOwnsVisit(encounter, req);
  if (encounter.suspendedAt) throw new AppError('This visit is already paused for results', 409, 'ENCOUNTER_ALREADY_SUSPENDED');
  const waitingOn = testProgress(encounter.orders).outstanding.length;
  if (waitingOn === 0) {
    throw new AppError('Order at least one test or scan before pausing the visit for results', 409, 'NOTHING_TO_WAIT_FOR');
  }
  await prisma.encounter.update({ where: { id }, data: { suspendedAt: new Date() } });
  await audit(req, 'ENCOUNTER_SUSPENDED', id, { waitingOn });
  return getEncounter(id);
}

export async function resumeEncounter(id: string, req: Request) {
  const encounter = await loadOpen(id);
  if (!encounter.suspendedAt) throw new AppError('This visit is not paused', 409, 'ENCOUNTER_NOT_SUSPENDED');
  assertOwnsVisit(encounter, req);
  await prisma.encounter.update({ where: { id }, data: { suspendedAt: null } });
  await audit(req, 'ENCOUNTER_RESUMED', id);
  return getEncounter(id);
}

/* ----------------------------------------------------------------- drafts */

export async function getDraft(id: string, req: Request) {
  const encounter = await prisma.encounter.findUnique({ where: { id }, select: { id: true } });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  const draft = await prisma.encounterDraft.findUnique({ where: { encounterId_authorId: { encounterId: id, authorId: String(req.user?.id) } } });
  return draft ? { data: draft.data, updatedAt: draft.updatedAt } : { data: null, updatedAt: null };
}

export async function saveDraft(id: string, data: Prisma.InputJsonObject, req: Request) {
  await loadOpen(id);
  const authorId = String(req.user?.id);
  const draft = await prisma.encounterDraft.upsert({
    where: { encounterId_authorId: { encounterId: id, authorId } },
    create: { encounterId: id, authorId, data },
    update: { data }
  });
  // Drafts hold half-written clinical text, so the audit trail records that one was saved, never what it said.
  await audit(req, 'ENCOUNTER_DRAFT_SAVED', id);
  return { data: draft.data, updatedAt: draft.updatedAt };
}

export async function deleteDraft(id: string, req: Request) {
  await prisma.encounterDraft.deleteMany({ where: { encounterId: id, authorId: String(req.user?.id) } });
  return { data: null, updatedAt: null };
}

import type { Request } from 'express';
import { BloodRequestStatus, BloodRequestUrgency, BloodUnitStatus, Prisma, TransfusionReaction, type BloodComponent } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { SHELF_LIFE_DAYS, donationProblem, isCompatible, isEmergencyReleasable, type BloodGroup } from './bloodCompatibility.js';
import { AppError } from '../utils/appError.js';

/*
  Blood bank (Phase 4D). Every unit starts in QUARANTINE and is released only
  when all screening markers for its donation are negative; a reactive result
  discards every unit from that donation. A unit is reserved for one request
  by a compatible crossmatch, issued, and transfused. Group compatibility is
  checked before a crossmatch can even be recorded, and no expired unit is
  ever reserved or issued. Emergency release allows O-negative red cells
  without a crossmatch, with a reason.
*/

const staff = { select: { id: true, name: true } } as const;
const DAY_MS = 86_400_000;
const SCREENS = ['hiv', 'hepatitisB', 'hepatitisC', 'syphilis'] as const;
const SCREEN_NAME: Record<(typeof SCREENS)[number], string> = { hiv: 'HIV', hepatitisB: 'hepatitis B', hepatitisC: 'hepatitis C', syphilis: 'syphilis' };
const COMPONENT_SUFFIX: Record<BloodComponent, string> = { WHOLE_BLOOD: 'WB', PACKED_RED_CELLS: 'PRC', PLATELETS: 'PLT', FRESH_FROZEN_PLASMA: 'FFP', CRYOPRECIPITATE: 'CRY' };

async function audit(req: Request, action: string, entityType: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Blood bank', entityType, entityId, details });
}

/** Marks out-of-date units EXPIRED (a reserved unit loses its reservation). Run before stock is read or used. */
export async function expireUnits(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const now = new Date();
  await client.bloodUnit.updateMany({ where: { status: { in: [BloodUnitStatus.QUARANTINE, BloodUnitStatus.AVAILABLE] }, expiresAt: { lte: now } }, data: { status: BloodUnitStatus.EXPIRED } });
  await client.bloodUnit.updateMany({ where: { status: BloodUnitStatus.RESERVED, expiresAt: { lte: now } }, data: { status: BloodUnitStatus.EXPIRED, reservedForRequestId: null } });
}

/* ------------------------------------------------------------------ donors */

export async function listDonors(query: { search?: string }) {
  const items = await prisma.bloodDonor.findMany({
    where: query.search ? { OR: [{ firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }, { donorCode: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } : {},
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return { items };
}

export async function getDonor(id: string) {
  const donor = await prisma.bloodDonor.findUnique({ where: { id }, include: { donations: { orderBy: { collectedAt: 'desc' }, include: { units: true, takenBy: staff } } } });
  if (!donor) throw new AppError('Donor not found', 404, 'DONOR_NOT_FOUND');
  return donor;
}

export async function registerDonor(body: { firstName: string; lastName: string; dateOfBirth: Date; gender: string; phone?: string }, req: Request) {
  const id = await prisma.$transaction(async (tx) => (await tx.bloodDonor.create({ data: { ...body, donorCode: await nextCode(tx, 'DNR') } })).id);
  await audit(req, 'DONOR_REGISTERED', 'BloodDonor', id);
  return getDonor(id);
}

export async function deferDonor(id: string, body: { until: Date; reason: string }, req: Request) {
  if (!(await prisma.bloodDonor.findUnique({ where: { id } }))) throw new AppError('Donor not found', 404, 'DONOR_NOT_FOUND');
  await prisma.bloodDonor.update({ where: { id }, data: { deferredUntil: body.until, deferralReason: body.reason } });
  await audit(req, 'DONOR_DEFERRED', 'BloodDonor', id, body);
  return getDonor(id);
}

/* --------------------------------------------------------------- donations */

export async function recordDonation(
  donorId: string,
  body: { bloodGroup: BloodGroup; volumeMl: number; haemoglobin: number; weightKg: number; components: BloodComponent[] },
  req: Request
) {
  const donor = await prisma.bloodDonor.findUnique({ where: { id: donorId } });
  if (!donor) throw new AppError('Donor not found', 404, 'DONOR_NOT_FOUND');
  const collectedAt = new Date();
  const problem = donationProblem(donor, { weightKg: body.weightKg, haemoglobin: body.haemoglobin }, collectedAt);
  if (problem) throw new AppError(problem, 409, 'DONOR_NOT_ELIGIBLE');
  if (donor.bloodGroup && donor.bloodGroup !== body.bloodGroup) {
    throw new AppError(`This donor was grouped ${donor.bloodGroup} before; regroup the sample before recording ${body.bloodGroup}`, 409, 'GROUP_MISMATCH');
  }

  const id = await prisma.$transaction(async (tx) => {
    const donationCode = await nextCode(tx, 'DON');
    const donation = await tx.bloodDonation.create({
      data: { donationCode, donorId, bloodGroup: body.bloodGroup, volumeMl: body.volumeMl, haemoglobin: body.haemoglobin, weightKg: body.weightKg, takenById: req.user?.id ?? null, collectedAt }
    });
    for (const component of body.components) {
      await tx.bloodUnit.create({
        data: {
          unitCode: `${donationCode}-${COMPONENT_SUFFIX[component]}`,
          donationId: donation.id,
          bloodGroup: body.bloodGroup,
          component,
          // Whole blood keeps the collected volume; components are recorded at typical volumes for the bag.
          volumeMl: component === 'WHOLE_BLOOD' ? body.volumeMl : component === 'PACKED_RED_CELLS' ? 280 : component === 'FRESH_FROZEN_PLASMA' ? 220 : component === 'PLATELETS' ? 50 : 30,
          collectedAt,
          expiresAt: new Date(collectedAt.getTime() + SHELF_LIFE_DAYS[component] * DAY_MS)
        }
      });
    }
    await tx.bloodDonor.update({ where: { id: donorId }, data: { bloodGroup: body.bloodGroup, lastDonationAt: collectedAt } });
    return donation.id;
  });
  await audit(req, 'DONATION_RECORDED', 'BloodDonation', id, { components: body.components });
  return getDonor(donorId);
}

/** Screening is on the donation's sample, so the result applies to every unit made from it. */
export async function recordScreening(donationId: string, body: Record<(typeof SCREENS)[number], 'POSITIVE' | 'NEGATIVE'>, req: Request) {
  const donation = await prisma.bloodDonation.findUnique({ where: { id: donationId }, include: { units: true } });
  if (!donation) throw new AppError('Donation not found', 404, 'DONATION_NOT_FOUND');
  const pending = donation.units.filter((u) => u.status === BloodUnitStatus.QUARANTINE);
  if (pending.length === 0) throw new AppError('No units from this donation are waiting for screening', 409, 'NOT_IN_QUARANTINE');
  const reactive = SCREENS.filter((k) => body[k] === 'POSITIVE');
  const screening = Object.fromEntries(SCREENS.map((k) => [k, body[k]]));
  await prisma.bloodUnit.updateMany({
    where: { id: { in: pending.map((u) => u.id) }, status: BloodUnitStatus.QUARANTINE },
    data: reactive.length
      ? { status: BloodUnitStatus.DISCARDED, screening, discardReason: `Reactive screening: ${reactive.map((k) => SCREEN_NAME[k]).join(', ')}` }
      : { status: BloodUnitStatus.AVAILABLE, screening }
  });
  if (reactive.length) {
    // Defer the donor and have them referred for counselling and confirmatory testing.
    await prisma.bloodDonor.update({ where: { id: donation.donorId }, data: { deferredUntil: new Date(Date.now() + 100 * 365 * DAY_MS), deferralReason: 'Reactive screening result: refer for confirmatory testing and counselling' } });
  }
  await audit(req, reactive.length ? 'DONATION_DISCARDED_REACTIVE' : 'DONATION_RELEASED', 'BloodDonation', donationId, { units: pending.length });
  return { released: reactive.length === 0, reactive: reactive.map((k) => SCREEN_NAME[k]), units: pending.length };
}

/* --------------------------------------------------------------- inventory */

export async function listUnits(query: { status?: BloodUnitStatus; bloodGroup?: string; component?: BloodComponent }) {
  await expireUnits();
  const items = await prisma.bloodUnit.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(query.bloodGroup ? { bloodGroup: query.bloodGroup } : {}), ...(query.component ? { component: query.component } : {}) },
    orderBy: { expiresAt: 'asc' },
    take: 500,
    include: { donation: { select: { donationCode: true } }, reservedFor: { select: { id: true, requestCode: true } } }
  });
  return { items };
}

/** Available stock by group and component, soonest-expiring first within each. */
export async function stockSummary() {
  await expireUnits();
  const rows = await prisma.bloodUnit.groupBy({ by: ['bloodGroup', 'component', 'status'], where: { status: { in: [BloodUnitStatus.AVAILABLE, BloodUnitStatus.QUARANTINE, BloodUnitStatus.RESERVED] } }, _count: true });
  const soon = await prisma.bloodUnit.count({ where: { status: BloodUnitStatus.AVAILABLE, expiresAt: { lte: new Date(Date.now() + 3 * DAY_MS) } } });
  return { rows: rows.map((r) => ({ bloodGroup: r.bloodGroup, component: r.component, status: r.status, count: r._count })), expiringWithin3Days: soon };
}

export async function discardUnit(id: string, body: { reason: string }, req: Request) {
  const unit = await prisma.bloodUnit.findUnique({ where: { id } });
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  const allowed: BloodUnitStatus[] = [BloodUnitStatus.QUARANTINE, BloodUnitStatus.AVAILABLE, BloodUnitStatus.RESERVED, BloodUnitStatus.EXPIRED];
  if (!allowed.includes(unit.status)) throw new AppError(`A ${unit.status.toLowerCase()} unit cannot be discarded`, 409, 'UNIT_WRONG_STATUS');
  await prisma.bloodUnit.update({ where: { id }, data: { status: BloodUnitStatus.DISCARDED, discardReason: body.reason, reservedForRequestId: null } });
  await audit(req, 'UNIT_DISCARDED', 'BloodUnit', id, body);
  return prisma.bloodUnit.findUniqueOrThrow({ where: { id } });
}

/* ---------------------------------------------------------------- requests */

const requestInclude = {
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true } },
  encounter: { select: { id: true, encounterCode: true, type: true } },
  requestedBy: staff,
  reservedUnits: true,
  crossmatches: { orderBy: { performedAt: 'asc' as const }, include: { unit: { select: { unitCode: true, bloodGroup: true } }, performedBy: staff } },
  transfusions: { orderBy: { issuedAt: 'asc' as const }, include: { unit: { select: { unitCode: true, bloodGroup: true, component: true } }, issuedBy: staff, givenBy: staff } }
} satisfies Prisma.BloodRequestInclude;

export async function listRequests(query: { status?: BloodRequestStatus; patientId?: string }) {
  const items = await prisma.bloodRequest.findMany({
    where: { ...(query.status ? { status: query.status } : { status: { in: [BloodRequestStatus.PENDING, BloodRequestStatus.CROSSMATCHED, BloodRequestStatus.ISSUED] } }), ...(query.patientId ? { patientId: query.patientId } : {}) },
    // Emergencies first, then oldest.
    orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
    take: 200,
    include: requestInclude
  });
  return { items };
}

export async function getRequest(id: string) {
  await expireUnits();
  const request = await prisma.bloodRequest.findUnique({ where: { id }, include: requestInclude });
  if (!request) throw new AppError('Blood request not found', 404, 'BLOOD_REQUEST_NOT_FOUND');
  return request;
}

export async function createRequest(
  body: { patientId: string; encounterId?: string; patientGroup: BloodGroup; component: BloodComponent; unitsRequested: number; urgency: BloodRequestUrgency; indication: string; haemoglobin?: number },
  req: Request
) {
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  if (body.encounterId) {
    const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId }, select: { patientId: true } });
    if (!encounter || encounter.patientId !== patient.id) throw new AppError('That visit is not this patient’s', 400, 'ENCOUNTER_MISMATCH');
  }
  const id = await prisma.$transaction(async (tx) => (await tx.bloodRequest.create({ data: { ...body, requestCode: await nextCode(tx, 'BRQ'), requestedById: req.user?.id ?? null } })).id);
  await audit(req, 'BLOOD_REQUESTED', 'BloodRequest', id, { component: body.component, units: body.unitsRequested, urgency: body.urgency });
  return getRequest(id);
}

async function loadOpenRequest(id: string) {
  const request = await prisma.bloodRequest.findUnique({ where: { id }, include: { reservedUnits: true, transfusions: true } });
  if (!request) throw new AppError('Blood request not found', 404, 'BLOOD_REQUEST_NOT_FOUND');
  const open: BloodRequestStatus[] = [BloodRequestStatus.PENDING, BloodRequestStatus.CROSSMATCHED, BloodRequestStatus.ISSUED];
  if (!open.includes(request.status)) throw new AppError(`This request is ${request.status.toLowerCase()}`, 409, 'REQUEST_CLOSED');
  return request;
}

/** Checks a unit can go to this request: available, in date, the right component and a compatible group. */
function assertUsable(unit: { status: BloodUnitStatus; expiresAt: Date; component: BloodComponent; bloodGroup: string; unitCode: string }, request: { component: BloodComponent; patientGroup: string }, expected: BloodUnitStatus) {
  if (unit.expiresAt <= new Date()) throw new AppError(`${unit.unitCode} has expired and must not be used`, 409, 'UNIT_EXPIRED');
  if (unit.status !== expected) throw new AppError(`${unit.unitCode} is ${unit.status.toLowerCase()}`, 409, 'UNIT_WRONG_STATUS');
  if (unit.component !== request.component) throw new AppError(`${unit.unitCode} is ${unit.component.toLowerCase().replace(/_/g, ' ')}; the request is for ${request.component.toLowerCase().replace(/_/g, ' ')}`, 409, 'WRONG_COMPONENT');
  if (!isCompatible(request.component, request.patientGroup as BloodGroup, unit.bloodGroup as BloodGroup)) {
    throw new AppError(`${unit.bloodGroup} ${request.component.toLowerCase().replace(/_/g, ' ')} is not compatible with a ${request.patientGroup} patient`, 409, 'ABO_INCOMPATIBLE');
  }
}

export async function recordCrossmatch(requestId: string, body: { unitId: string; compatible: boolean; notes?: string }, req: Request) {
  await expireUnits();
  const request = await loadOpenRequest(requestId);
  const unit = await prisma.bloodUnit.findUnique({ where: { id: body.unitId } });
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  assertUsable(unit, request, BloodUnitStatus.AVAILABLE);
  if (body.compatible && request.reservedUnits.length + request.transfusions.length >= request.unitsRequested) {
    throw new AppError(`All ${request.unitsRequested} unit${request.unitsRequested === 1 ? '' : 's'} for this request are already matched`, 409, 'ENOUGH_UNITS');
  }
  await prisma.$transaction(async (tx) => {
    await tx.crossmatch.create({ data: { requestId, unitId: unit.id, compatible: body.compatible, notes: body.notes ?? null, performedById: req.user?.id ?? null } });
    if (body.compatible) {
      const reserved = await tx.bloodUnit.updateMany({ where: { id: unit.id, status: BloodUnitStatus.AVAILABLE }, data: { status: BloodUnitStatus.RESERVED, reservedForRequestId: requestId } });
      if (reserved.count !== 1) throw new AppError(`${unit.unitCode} was just taken for another patient`, 409, 'UNIT_WRONG_STATUS');
      if (request.status === BloodRequestStatus.PENDING) await tx.bloodRequest.update({ where: { id: requestId }, data: { status: BloodRequestStatus.CROSSMATCHED } });
    }
  });
  await audit(req, 'CROSSMATCH_RECORDED', 'BloodRequest', requestId, { unit: unit.unitCode, compatible: body.compatible });
  return getRequest(requestId);
}

export async function issueUnit(requestId: string, body: { unitId: string }, req: Request) {
  await expireUnits();
  const request = await loadOpenRequest(requestId);
  const unit = await prisma.bloodUnit.findUnique({ where: { id: body.unitId } });
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  if (unit.status === BloodUnitStatus.RESERVED && unit.reservedForRequestId !== requestId) throw new AppError(`${unit.unitCode} is reserved for another patient`, 409, 'RESERVED_ELSEWHERE');
  assertUsable(unit, request, BloodUnitStatus.RESERVED);
  await prisma.$transaction(async (tx) => {
    const moved = await tx.bloodUnit.updateMany({ where: { id: unit.id, status: BloodUnitStatus.RESERVED, reservedForRequestId: requestId }, data: { status: BloodUnitStatus.ISSUED, reservedForRequestId: null } });
    if (moved.count !== 1) throw new AppError(`${unit.unitCode} was just changed; refresh`, 409, 'UNIT_WRONG_STATUS');
    await tx.transfusion.create({ data: { requestId, unitId: unit.id, issuedById: req.user?.id ?? null } });
    await tx.bloodRequest.update({ where: { id: requestId }, data: { status: BloodRequestStatus.ISSUED } });
  });
  await audit(req, 'UNIT_ISSUED', 'BloodRequest', requestId, { unit: unit.unitCode });
  return getRequest(requestId);
}

/** Uncrossmatched O-negative red cells for a life-threatening emergency. */
export async function emergencyIssue(requestId: string, body: { unitId: string; reason: string }, req: Request) {
  await expireUnits();
  const request = await loadOpenRequest(requestId);
  if (request.urgency !== BloodRequestUrgency.EMERGENCY) throw new AppError('Emergency release is only for requests marked as emergencies', 409, 'NOT_AN_EMERGENCY');
  const unit = await prisma.bloodUnit.findUnique({ where: { id: body.unitId } });
  if (!unit) throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  if (!isEmergencyReleasable(unit.component, unit.bloodGroup as BloodGroup)) throw new AppError('Only O-negative red cells can be released without a crossmatch', 409, 'NOT_EMERGENCY_RELEASABLE');
  if (unit.expiresAt <= new Date()) throw new AppError(`${unit.unitCode} has expired and must not be used`, 409, 'UNIT_EXPIRED');
  if (unit.status !== BloodUnitStatus.AVAILABLE) throw new AppError(`${unit.unitCode} is ${unit.status.toLowerCase()}`, 409, 'UNIT_WRONG_STATUS');
  if (request.component !== 'WHOLE_BLOOD' && request.component !== 'PACKED_RED_CELLS') throw new AppError('Emergency release covers red cell requests only', 409, 'WRONG_COMPONENT');
  await prisma.$transaction(async (tx) => {
    const moved = await tx.bloodUnit.updateMany({ where: { id: unit.id, status: BloodUnitStatus.AVAILABLE }, data: { status: BloodUnitStatus.ISSUED } });
    if (moved.count !== 1) throw new AppError(`${unit.unitCode} was just taken`, 409, 'UNIT_WRONG_STATUS');
    await tx.transfusion.create({ data: { requestId, unitId: unit.id, issuedById: req.user?.id ?? null, emergencyRelease: true, emergencyReason: body.reason } });
    await tx.bloodRequest.update({ where: { id: requestId }, data: { status: BloodRequestStatus.ISSUED } });
  });
  await audit(req, 'UNIT_EMERGENCY_RELEASED', 'BloodRequest', requestId, { unit: unit.unitCode, reason: body.reason });
  return getRequest(requestId);
}

/** The ward records the transfusion; a severe reaction needs a description. */
export async function recordTransfusion(transfusionId: string, body: { startedAt?: Date; endedAt?: Date; reaction?: TransfusionReaction; reactionNotes?: string }, req: Request) {
  const transfusion = await prisma.transfusion.findUnique({ where: { id: transfusionId }, include: { request: { include: { transfusions: true } } } });
  if (!transfusion) throw new AppError('Transfusion not found', 404, 'TRANSFUSION_NOT_FOUND');
  if (transfusion.endedAt) throw new AppError('This transfusion has already been completed', 409, 'TRANSFUSION_DONE');
  if (body.reaction && body.reaction !== TransfusionReaction.NONE && !body.reactionNotes) throw new AppError('Describe the reaction and what was done', 400, 'REACTION_NOTES_REQUIRED');
  const startedAt = body.startedAt ?? transfusion.startedAt;
  if (body.endedAt && !startedAt) throw new AppError('Record when the transfusion started', 400, 'START_REQUIRED');
  if (body.endedAt && startedAt && body.endedAt < startedAt) throw new AppError('The end time is before the start time', 400, 'END_BEFORE_START');

  await prisma.$transaction(async (tx) => {
    await tx.transfusion.update({
      where: { id: transfusionId },
      data: { startedAt: startedAt ?? null, endedAt: body.endedAt ?? null, reaction: body.reaction ?? transfusion.reaction, reactionNotes: body.reactionNotes ?? transfusion.reactionNotes, givenById: req.user?.id ?? null }
    });
    if (body.endedAt) {
      await tx.bloodUnit.update({ where: { id: transfusion.unitId }, data: { status: BloodUnitStatus.TRANSFUSED } });
      const others = transfusion.request.transfusions.filter((t) => t.id !== transfusionId);
      if (others.every((t) => t.endedAt) && others.length + 1 >= transfusion.request.unitsRequested) {
        await tx.bloodRequest.update({ where: { id: transfusion.requestId }, data: { status: BloodRequestStatus.COMPLETED } });
      }
    }
  });
  await audit(req, body.reaction === TransfusionReaction.SEVERE ? 'TRANSFUSION_SEVERE_REACTION' : 'TRANSFUSION_RECORDED', 'Transfusion', transfusionId, { reaction: body.reaction });
  return getRequest(transfusion.requestId);
}

export async function cancelRequest(id: string, body: { reason: string }, req: Request) {
  const request = await loadOpenRequest(id);
  if (request.transfusions.length) throw new AppError('Units have already been issued; record the transfusions instead', 409, 'UNITS_ISSUED');
  await prisma.$transaction([
    prisma.bloodUnit.updateMany({ where: { reservedForRequestId: id, status: BloodUnitStatus.RESERVED }, data: { status: BloodUnitStatus.AVAILABLE, reservedForRequestId: null } }),
    prisma.bloodRequest.update({ where: { id }, data: { status: BloodRequestStatus.CANCELLED, cancelReason: body.reason } })
  ]);
  await audit(req, 'BLOOD_REQUEST_CANCELLED', 'BloodRequest', id, body);
  return getRequest(id);
}

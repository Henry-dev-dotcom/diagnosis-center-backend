import type { Request } from 'express';
import { DeltaCheckStatus, LabResultStatus, NotificationType, Prisma } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { currentFacilityId, runAsSystem, runWithFacility } from './tenantContext.js';
import { AppError } from '../utils/appError.js';

/*
  Delta check across facilities.

  A laboratory can ask another facility for a patient's earlier results of named
  tests, to see whether today's value has moved further than it should. Results
  never leave a facility without a person there agreeing to it:

  - Only facilities that have opted in (and only ones that have themselves
    opted in can ask) take part.
  - The request carries the patient's national ID, age and sex - never a name
    or local record number - and says what is wanted and why.
  - The other laboratory approves or declines. On approval a snapshot of signed-off
    values for the named tests (value, unit, flag, range, date) is taken - not
    the clinician, order or record number - and is visible to the requester for
    30 days. A request left unanswered lapses after 7.
  - Both sides audit-log everything, and each is told when the other acts.

  The request table has no facilityId on purpose: it belongs to two facilities.
  Every query here states which side it is, and reaching into the other facility's
  records happens only inside runWithFacility for that one facility.
*/

const PENDING_DAYS = 7;
const VIEW_DAYS = 30;
/** A change at or beyond this share of the earlier value is flagged for a second look. */
const SIGNIFICANT_CHANGE_PERCENT = 20;
const DAY = 86_400_000;

type SharedValue = { parameter: string; value: string | null; numericValue: number | null; unit: string | null; flag: string; referenceRange: string | null; date: string };

function me() {
  const id = currentFacilityId();
  if (!id) throw new AppError('A facility is required', 400, 'FACILITY_REQUIRED');
  return id;
}

const normaliseId = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

function ageSexLabel(dateOfBirth: Date | null, gender: string | null) {
  const age = dateOfBirth ? Math.max(0, Math.floor((Date.now() - dateOfBirth.getTime()) / (365.25 * DAY))) : null;
  return [age !== null ? `${age}-year-old` : null, gender ? gender.toLowerCase() : null].filter(Boolean).join(' ') || 'patient';
}

async function audit(req: Request | null, action: string, entityId: string, details: unknown) {
  await createAuditLog({ ...(req ? getRequestAuditContext(req) : {}), action, module: 'Laboratory', entityType: 'DeltaCheckRequest', entityId, details });
}

/** Tell a laboratory something happened to a request, without it being anyone's personal message. */
async function notify(facilityId: string, title: string, body: string) {
  await runWithFacility(facilityId, () => prisma.notification.create({ data: { type: NotificationType.DELTA_CHECK, title, body } }));
}

function effectiveStatus(request: { status: DeltaCheckStatus; expiresAt: Date }) {
  return request.status === DeltaCheckStatus.PENDING && request.expiresAt < new Date() ? 'EXPIRED' : request.status;
}

/** Facilities that take part, other than this one. */
export async function listPartnerFacilities() {
  const self = me();
  const own = await runAsSystem('delta.optin', () => prisma.facility.findUnique({ where: { id: self }, select: { deltaCheckOptIn: true } }));
  const partners = await runAsSystem('delta.partners', () =>
    prisma.facility.findMany({ where: { deltaCheckOptIn: true, id: { not: self }, status: 'ACTIVE' }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
  );
  return { optedIn: Boolean(own?.deltaCheckOptIn), partners };
}

export async function createRequest(
  body: { ownerFacilityId: string; patientId: string; parameters: string[]; lookbackDays: number; reason: string },
  req: Request
) {
  const self = me();
  if (body.ownerFacilityId === self) throw new AppError('Choose another facility', 400, 'DELTA_SELF');
  const { optedIn, partners } = await listPartnerFacilities();
  if (!optedIn) throw new AppError('Your facility has not joined delta check sharing. An administrator can switch it on in Facility Setup.', 403, 'DELTA_OPT_IN_REQUIRED');
  const owner = partners.find((p) => p.id === body.ownerFacilityId);
  if (!owner) throw new AppError('That facility does not take part in delta check sharing', 404, 'DELTA_PARTNER_NOT_FOUND');

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true, nationalId: true, dateOfBirth: true, gender: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  if (!patient.nationalId?.trim()) throw new AppError('Record the patient’s national ID first: it is how the other facility finds their earlier results', 409, 'PATIENT_ID_REQUIRED');

  const matchNationalId = normaliseId(patient.nationalId);
  const open = await prisma.deltaCheckRequest.findFirst({
    where: { requesterFacilityId: self, ownerFacilityId: owner.id, patientLocalId: patient.id, status: DeltaCheckStatus.PENDING, expiresAt: { gt: new Date() } }
  });
  if (open) throw new AppError('A request for this patient is already waiting at that facility', 409, 'DELTA_REQUEST_OPEN');

  const requester = await runAsSystem('delta.requester', () => prisma.facility.findUniqueOrThrow({ where: { id: self }, select: { name: true } }));
  const created = await prisma.deltaCheckRequest.create({
    data: {
      requesterFacilityId: self,
      ownerFacilityId: owner.id,
      requesterName: req.user?.name ?? 'Laboratory',
      patientLocalId: patient.id,
      patientSummary: ageSexLabel(patient.dateOfBirth, patient.gender),
      matchNationalId,
      patientDob: patient.dateOfBirth,
      parameters: body.parameters.map((p) => p.trim()).filter(Boolean),
      lookbackDays: body.lookbackDays,
      reason: body.reason,
      expiresAt: new Date(Date.now() + PENDING_DAYS * DAY)
    }
  });
  await audit(req, 'DELTA_REQUEST_SENT', created.id, { to: owner.code, parameters: created.parameters, lookbackDays: created.lookbackDays });
  await notify(owner.id, 'Delta check request', `${requester.name} asks to compare earlier results for a ${created.patientSummary}. Open Delta Check to answer.`);
  return presentOutgoing(created, owner.name);
}

type RequestRow = Prisma.DeltaCheckRequestGetPayload<{ include: { ownerFacility: { select: { name: true } } } }>;

function presentOutgoing(request: Omit<RequestRow, 'ownerFacility'>, ownerName: string) {
  const status = effectiveStatus(request);
  const viewable = request.status === DeltaCheckStatus.APPROVED && request.expiresAt > new Date();
  return {
    id: request.id,
    status,
    ownerName,
    patientLocalId: request.patientLocalId,
    patientSummary: request.patientSummary,
    parameters: request.parameters,
    lookbackDays: request.lookbackDays,
    reason: request.reason,
    responseNote: request.responseNote,
    responderName: request.responderName,
    respondedAt: request.respondedAt,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    sharedCount: Array.isArray(request.sharedData) ? request.sharedData.length : 0,
    viewExpired: request.status === DeltaCheckStatus.APPROVED && !viewable
  };
}

export async function listOutgoing() {
  const self = me();
  const rows = await prisma.deltaCheckRequest.findMany({ where: { requesterFacilityId: self }, include: { ownerFacility: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { items: rows.map((row) => presentOutgoing(row, row.ownerFacility.name)) };
}

export async function listIncoming() {
  const self = me();
  const rows = await prisma.deltaCheckRequest.findMany({ where: { ownerFacilityId: self }, include: { requesterFacility: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  return {
    items: rows.map((row) => ({
      id: row.id,
      status: effectiveStatus(row),
      requesterName: row.requesterFacility.name,
      requestedBy: row.requesterName,
      patientSummary: row.patientSummary,
      maskedId: `••••${row.matchNationalId.slice(-3)}`,
      parameters: row.parameters,
      lookbackDays: row.lookbackDays,
      reason: row.reason,
      responseNote: row.responseNote,
      respondedAt: row.respondedAt,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      sharedCount: Array.isArray(row.sharedData) ? row.sharedData.length : 0
    }))
  };
}

/** The owner's answer. Approving takes a snapshot of matching signed-off values from this facility's own records. */
export async function respond(id: string, body: { decision: 'APPROVE' | 'DECLINE'; note?: string }, req: Request) {
  const self = me();
  const request = await prisma.deltaCheckRequest.findFirst({ where: { id, ownerFacilityId: self }, include: { requesterFacility: { select: { name: true } } } });
  if (!request) throw new AppError('Request not found', 404, 'DELTA_REQUEST_NOT_FOUND');
  if (effectiveStatus(request) !== DeltaCheckStatus.PENDING) throw new AppError('This request has already been answered or has lapsed', 409, 'DELTA_REQUEST_CLOSED');

  const base = { responderName: req.user?.name ?? 'Laboratory', responseNote: body.note?.trim() || null, respondedAt: new Date() };
  const owner = await runAsSystem('delta.owner', () => prisma.facility.findUniqueOrThrow({ where: { id: self }, select: { name: true } }));

  if (body.decision === 'DECLINE') {
    await prisma.deltaCheckRequest.update({ where: { id }, data: { ...base, status: DeltaCheckStatus.DECLINED } });
    await audit(req, 'DELTA_REQUEST_DECLINED', id, { note: base.responseNote });
    await notify(request.requesterFacilityId, 'Delta check declined', `${owner.name} declined your request${base.responseNote ? `: ${base.responseNote}` : '.'}`);
    return listIncoming();
  }

  const patient = await prisma.patient.findFirst({
    where: { nationalId: { equals: request.matchNationalId, mode: 'insensitive' } },
    select: { id: true, dateOfBirth: true }
  });
  // A national ID that matches but a different date of birth is somebody else, or a typing error: share nothing.
  const matched = patient && (!request.patientDob || !patient.dateOfBirth || sameDay(patient.dateOfBirth, request.patientDob)) ? patient : null;
  if (!matched) {
    await prisma.deltaCheckRequest.update({ where: { id }, data: { ...base, status: DeltaCheckStatus.NO_MATCH, sharedData: [] as Prisma.InputJsonValue } });
    await audit(req, 'DELTA_REQUEST_NO_MATCH', id, {});
    await notify(request.requesterFacilityId, 'Delta check: no matching patient', `${owner.name} approved your request but has no matching patient record.`);
    return listIncoming();
  }

  const since = new Date(Date.now() - request.lookbackDays * DAY);
  const wanted = request.parameters;
  const rows = await prisma.labResultParameter.findMany({
    where: {
      labResult: { patientId: matched.id, status: LabResultStatus.SIGNED_OFF, signedOffAt: { gte: since } },
      ...(wanted.length ? { OR: wanted.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) } : {})
    },
    include: { labResult: { select: { signedOffAt: true } } },
    orderBy: { labResult: { signedOffAt: 'desc' } },
    take: 200
  });
  const shared: SharedValue[] = rows.map((row) => ({
    parameter: row.name,
    value: row.value,
    numericValue: row.numericValue === null ? null : Number(row.numericValue),
    unit: row.unit,
    flag: row.flag,
    referenceRange: row.referenceRange,
    date: (row.labResult.signedOffAt ?? new Date()).toISOString().slice(0, 10)
  }));
  await prisma.deltaCheckRequest.update({
    where: { id },
    data: { ...base, status: DeltaCheckStatus.APPROVED, sharedData: shared as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + VIEW_DAYS * DAY) }
  });
  await audit(req, 'DELTA_REQUEST_APPROVED', id, { valuesShared: shared.length, to: request.requesterFacility.name });
  await notify(request.requesterFacilityId, 'Delta check approved', `${owner.name} shared ${shared.length} earlier value${shared.length === 1 ? '' : 's'}. Open Delta Check to compare.`);
  return listIncoming();
}

export async function cancelRequest(id: string, req: Request) {
  const self = me();
  const request = await prisma.deltaCheckRequest.findFirst({ where: { id, requesterFacilityId: self } });
  if (!request) throw new AppError('Request not found', 404, 'DELTA_REQUEST_NOT_FOUND');
  if (request.status !== DeltaCheckStatus.PENDING) throw new AppError('Only a request still waiting can be withdrawn', 409, 'DELTA_REQUEST_CLOSED');
  await prisma.deltaCheckRequest.update({ where: { id }, data: { status: DeltaCheckStatus.CANCELLED } });
  await audit(req, 'DELTA_REQUEST_CANCELLED', id, {});
  return listOutgoing();
}

/** An approved request with today's local values set beside what the other facility shared. */
export async function getComparison(id: string, req: Request) {
  const self = me();
  const request = await prisma.deltaCheckRequest.findFirst({ where: { id, requesterFacilityId: self }, include: { ownerFacility: { select: { name: true } } } });
  if (!request) throw new AppError('Request not found', 404, 'DELTA_REQUEST_NOT_FOUND');
  if (request.status !== DeltaCheckStatus.APPROVED) throw new AppError('Nothing has been shared for this request', 409, 'DELTA_NOT_SHARED');
  if (request.expiresAt < new Date()) throw new AppError('The sharing window for this request has ended. Send a new request.', 410, 'DELTA_VIEW_EXPIRED');

  const shared = (Array.isArray(request.sharedData) ? request.sharedData : []) as unknown as SharedValue[];
  const names = [...new Set(shared.map((s) => s.parameter.toLowerCase()))];
  const comparisons = [];
  for (const name of names) {
    const prior = shared.filter((s) => s.parameter.toLowerCase() === name);
    const local = await prisma.labResultParameter.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, labResult: { patientId: request.patientLocalId, status: LabResultStatus.SIGNED_OFF } },
      include: { labResult: { select: { signedOffAt: true } } },
      orderBy: { labResult: { signedOffAt: 'desc' } }
    });
    const current = local ? { value: local.value, numericValue: local.numericValue === null ? null : Number(local.numericValue), unit: local.unit, flag: local.flag, date: local.labResult.signedOffAt?.toISOString().slice(0, 10) ?? null } : null;
    const latest = prior[0];
    const comparable = current?.numericValue != null && latest.numericValue != null && latest.numericValue !== 0 && (!current.unit || !latest.unit || current.unit.toLowerCase() === latest.unit.toLowerCase());
    const changePercent = comparable ? Math.round(((current!.numericValue! - latest.numericValue!) / Math.abs(latest.numericValue!)) * 1000) / 10 : null;
    comparisons.push({
      parameter: prior[0].parameter,
      current,
      prior,
      changePercent,
      significant: changePercent !== null && Math.abs(changePercent) >= SIGNIFICANT_CHANGE_PERCENT,
      note: comparable || !current ? null : 'Not compared: the value is not numeric or the units differ.'
    });
  }
  await audit(req, 'DELTA_COMPARISON_VIEWED', id, {});
  return { request: presentOutgoing(request, request.ownerFacility.name), thresholdPercent: SIGNIFICANT_CHANGE_PERCENT, comparisons };
}

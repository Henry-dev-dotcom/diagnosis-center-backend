import type { Request } from 'express';
import { EncounterStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { SCHEDULE_BY_CODE } from '../config/immunizationSchedule.js';
import { doseProblem, scheduleFor } from './immunizationStatus.js';
import { AppError } from '../utils/appError.js';

/*
  Child health (Phase 4C): immunizations against the EPI schedule and the
  defaulter list. Records are voided, never deleted, and the database allows
  one live record per child per dose.
*/

const staff = { select: { id: true, name: true } } as const;
const OPEN: EncounterStatus[] = [EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];

async function audit(req: Request, action: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Child health', entityType: 'Immunization', entityId, details });
}

async function loadChild(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  if (!patient.dateOfBirth) throw new AppError('Record the child’s date of birth before immunizations', 409, 'DATE_OF_BIRTH_REQUIRED');
  return { ...patient, dateOfBirth: patient.dateOfBirth };
}

export async function getImmunizations(patientId: string) {
  const patient = await loadChild(patientId);
  const records = await prisma.immunization.findMany({
    where: { patientId },
    orderBy: { givenAt: 'asc' },
    include: { givenBy: staff, voidedBy: staff }
  });
  const live = records.filter((r) => !r.voidedAt);
  return { patient, schedule: scheduleFor(patient.dateOfBirth, live), records };
}

export async function recordImmunization(
  patientId: string,
  body: { vaccine: string; givenAt: Date; batchNumber?: string; expiryDate?: Date; site?: string; givenElsewhere: boolean; encounterId?: string; notes?: string },
  req: Request
) {
  const patient = await loadChild(patientId);
  const dose = SCHEDULE_BY_CODE.get(body.vaccine);
  if (!dose) throw new AppError('That vaccine is not on the schedule', 400, 'UNKNOWN_VACCINE');
  if (body.givenAt > new Date(Date.now() + 5 * 60_000)) throw new AppError('The date given cannot be in the future', 400, 'GIVEN_IN_FUTURE');
  if (!body.givenElsewhere && !body.batchNumber) throw new AppError('Record the batch number of the vaccine given', 400, 'BATCH_REQUIRED');
  if (body.expiryDate && body.expiryDate < new Date(Date.UTC(body.givenAt.getUTCFullYear(), body.givenAt.getUTCMonth(), body.givenAt.getUTCDate()))) {
    throw new AppError('That batch had expired on the day it was given; do not use expired vaccine', 409, 'VACCINE_EXPIRED');
  }
  if (body.encounterId) {
    const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId }, select: { patientId: true, status: true } });
    if (!encounter || encounter.patientId !== patientId) throw new AppError('That visit is not this child’s', 400, 'ENCOUNTER_MISMATCH');
    if (!OPEN.includes(encounter.status)) throw new AppError('That visit is closed', 409, 'ENCOUNTER_CLOSED');
  }

  const live = await prisma.immunization.findMany({ where: { patientId, voidedAt: null }, select: { vaccine: true, givenAt: true } });
  if (live.some((r) => r.vaccine === body.vaccine)) throw new AppError(`${dose.name} is already recorded for this child`, 409, 'DOSE_ALREADY_GIVEN');
  const problem = doseProblem(dose, patient.dateOfBirth, body.givenAt, live, { fromCard: body.givenElsewhere });
  if (problem) throw new AppError(problem, 409, 'DOSE_NOT_VALID');

  try {
    const record = await prisma.immunization.create({
      data: {
        patientId,
        vaccine: body.vaccine,
        givenAt: body.givenAt,
        batchNumber: body.batchNumber ?? null,
        expiryDate: body.expiryDate ?? null,
        site: body.site ?? (body.givenElsewhere ? null : dose.route),
        givenElsewhere: body.givenElsewhere,
        givenById: body.givenElsewhere ? null : req.user?.id ?? null,
        encounterId: body.encounterId ?? null,
        notes: body.notes ?? null
      }
    });
    await audit(req, 'IMMUNIZATION_RECORDED', record.id, { patientId, vaccine: body.vaccine, givenElsewhere: body.givenElsewhere });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(`${dose.name} is already recorded for this child`, 409, 'DOSE_ALREADY_GIVEN');
    throw error;
  }
  return getImmunizations(patientId);
}

/** For records entered in error. A later dose in the same series must be voided first. */
export async function voidImmunization(id: string, body: { reason: string }, req: Request) {
  const record = await prisma.immunization.findUnique({ where: { id } });
  if (!record) throw new AppError('Immunization record not found', 404, 'IMMUNIZATION_NOT_FOUND');
  if (record.voidedAt) throw new AppError('This record has already been voided', 409, 'ALREADY_VOIDED');
  const dose = SCHEDULE_BY_CODE.get(record.vaccine);
  if (dose) {
    const later = [...SCHEDULE_BY_CODE.values()].filter((d) => d.series === dose.series && d.dose > dose.dose).map((d) => d.code);
    const laterGiven = later.length ? await prisma.immunization.findFirst({ where: { patientId: record.patientId, vaccine: { in: later }, voidedAt: null } }) : null;
    if (laterGiven) throw new AppError(`Void ${SCHEDULE_BY_CODE.get(laterGiven.vaccine)?.name ?? laterGiven.vaccine} first; it follows this dose`, 409, 'LATER_DOSE_RECORDED');
  }
  await prisma.immunization.update({ where: { id }, data: { voidedAt: new Date(), voidedById: req.user?.id ?? null, voidReason: body.reason } });
  await audit(req, 'IMMUNIZATION_VOIDED', id, { reason: body.reason });
  return getImmunizations(record.patientId);
}

/**
 * Children under five with doses due or overdue (defaulter tracing). Only
 * children already known to the immunization or child-welfare service are
 * listed, so adults and walk-in children are not flagged.
 */
export async function dueList(query: { include: 'ALL' | 'OVERDUE'; limit: number }) {
  const fiveYearsAgo = new Date(Date.now() - 5 * 365.25 * 86_400_000);
  const children = await prisma.patient.findMany({
    where: {
      dateOfBirth: { gte: fiveYearsAgo },
      OR: [{ immunizations: { some: {} } }, { encounters: { some: { clinic: 'CHILD_WELFARE' } } }, { birthRecord: { isNot: null } }]
    },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, phone: true,
      immunizations: { where: { voidedAt: null }, select: { vaccine: true, givenAt: true } }
    },
    take: 2000
  });
  const today = new Date();
  const items = children
    .map((child) => {
      const pending = scheduleFor(child.dateOfBirth as Date, child.immunizations, today).filter((d) => d.status === 'OVERDUE' || (query.include !== 'OVERDUE' && d.status === 'DUE'));
      return { patient: { ...child, immunizations: undefined }, pending: pending.map((d) => ({ code: d.code, name: d.name, status: d.status, dueDate: d.dueDate })) };
    })
    .filter((row) => row.pending.length > 0)
    .sort((a, b) => Number(b.pending.some((d) => d.status === 'OVERDUE')) - Number(a.pending.some((d) => d.status === 'OVERDUE')) || +(a.pending[0].dueDate ?? 0) - +(b.pending[0].dueDate ?? 0))
    .slice(0, query.limit);
  return { items };
}

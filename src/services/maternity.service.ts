import type { Request } from 'express';
import {
  BirthOutcome,
  ClinicalNoteType,
  EncounterStatus,
  Prisma,
  PregnancyStatus,
  type DeliveryMode,
  type PerinealOutcome,
  type PregnancyEndReason
} from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { eddFromLmp, gestationalAge, isPostpartumHaemorrhage } from './obstetrics.js';
import { AppError } from '../utils/appError.js';

/*
  Maternity (Phase 4C). A Pregnancy is booked once per pregnancy (the database
  allows one ongoing pregnancy per woman), followed through antenatal visits
  (ClinicalForm ANC_VISIT), and ends in a Delivery or another outcome. At
  delivery each live-born baby is registered as a patient in the same
  transaction, so no baby leaves the ward without a record.
*/

const OPEN: EncounterStatus[] = [EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];
const staff = { select: { id: true, name: true } } as const;

const patientSelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  phone: true,
  allergies: { where: { active: true }, select: { id: true, substance: true, reaction: true, severity: true } }
} satisfies Prisma.PatientSelect;

const isFemale = (gender: string | null) => (gender ?? '').trim().toUpperCase() === 'FEMALE';

async function audit(req: Request, action: string, pregnancyId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Maternity', entityType: 'Pregnancy', entityId: pregnancyId, details });
}

/** Adds today's gestational age (ongoing pregnancies) to a pregnancy row. */
function withGestation<T extends { status: PregnancyStatus; lmp: Date | null; eddByLmp: Date | null; eddByScan: Date | null }>(p: T) {
  const ga = p.status === PregnancyStatus.ACTIVE ? gestationalAge(p, new Date()) : null;
  return { ...p, edd: p.eddByScan ?? p.eddByLmp, gestationToday: ga ? { weeks: ga.weeks, days: ga.extraDays, basis: ga.basis } : null };
}

export async function listPregnancies(query: { status?: PregnancyStatus; patientId?: string; limit: number }) {
  const rows = await prisma.pregnancy.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(query.patientId ? { patientId: query.patientId } : {}) },
    orderBy: [{ status: 'asc' }, { bookedAt: 'desc' }],
    take: query.limit,
    include: {
      patient: { select: patientSelect },
      delivery: { select: { deliveredAt: true, mode: true } },
      _count: { select: { forms: true } }
    }
  });
  return { items: rows.map(withGestation) };
}

export async function getPregnancy(id: string) {
  const pregnancy = await prisma.pregnancy.findUnique({
    where: { id },
    include: {
      patient: { select: patientSelect },
      bookedBy: staff,
      forms: { orderBy: { createdAt: 'asc' }, include: { author: staff, encounter: { select: { id: true, encounterCode: true, clinic: true } } } },
      delivery: {
        include: {
          attendant: staff,
          encounter: { select: { id: true, encounterCode: true, type: true } },
          babies: { orderBy: { birthOrder: 'asc' }, include: { patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } } } }
        }
      }
    }
  });
  if (!pregnancy) throw new AppError('Pregnancy not found', 404, 'PREGNANCY_NOT_FOUND');
  return withGestation(pregnancy);
}

export async function registerPregnancy(
  body: {
    patientId: string;
    lmp?: Date;
    eddByScan?: Date;
    gravida: number;
    parity: number;
    livingChildren?: number;
    bloodGroup?: string;
    riskFactors: string[];
    screening: Record<string, string>;
  },
  req: Request
) {
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true, gender: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  if (!isFemale(patient.gender)) throw new AppError('Pregnancies can only be booked for female patients; check the patient’s recorded sex', 409, 'PATIENT_NOT_FEMALE');
  const now = new Date();
  if (body.lmp && body.lmp > now) throw new AppError('The last menstrual period cannot be in the future', 400, 'LMP_IN_FUTURE');
  const eddByLmp = body.lmp ? eddFromLmp(body.lmp) : null;
  const ga = gestationalAge({ lmp: body.lmp ?? null, eddByLmp, eddByScan: body.eddByScan ?? null }, now);
  if (ga && (ga.weeks < 2 || ga.weeks > 44)) throw new AppError(`Those dates give ${ga.weeks} weeks today; check the LMP or scan date`, 400, 'IMPLAUSIBLE_GESTATION');

  const current = await prisma.pregnancy.findFirst({ where: { patientId: patient.id, status: PregnancyStatus.ACTIVE }, select: { pregnancyCode: true } });
  if (current) throw new AppError(`This patient already has an ongoing pregnancy (${current.pregnancyCode})`, 409, 'PREGNANCY_ALREADY_ACTIVE');

  try {
    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.pregnancy.create({
        data: {
          pregnancyCode: await nextCode(tx, 'PRG'),
          patientId: patient.id,
          lmp: body.lmp ?? null,
          eddByLmp,
          eddByScan: body.eddByScan ?? null,
          gravida: body.gravida,
          parity: body.parity,
          livingChildren: body.livingChildren ?? null,
          bloodGroup: body.bloodGroup ?? null,
          riskFactors: body.riskFactors,
          screening: body.screening as Prisma.InputJsonObject,
          bookedById: req.user?.id ?? null
        }
      });
      return created.id;
    });
    await audit(req, 'PREGNANCY_REGISTERED', id, { gravida: body.gravida, parity: body.parity });
    return getPregnancy(id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('This patient already has an ongoing pregnancy', 409, 'PREGNANCY_ALREADY_ACTIVE');
    }
    throw error;
  }
}

async function loadActive(id: string) {
  const pregnancy = await prisma.pregnancy.findUnique({ where: { id } });
  if (!pregnancy) throw new AppError('Pregnancy not found', 404, 'PREGNANCY_NOT_FOUND');
  if (pregnancy.status !== PregnancyStatus.ACTIVE) throw new AppError('This pregnancy has ended and can no longer be changed', 409, 'PREGNANCY_CLOSED');
  return pregnancy;
}

export async function updatePregnancy(id: string, body: { eddByScan?: Date; bloodGroup?: string; riskFactors?: string[]; screening?: Record<string, string> }, req: Request) {
  const pregnancy = await loadActive(id);
  const screening = body.screening
    ? ({ ...(pregnancy.screening as Record<string, unknown>), ...body.screening } as Prisma.InputJsonObject)
    : undefined;
  await prisma.pregnancy.update({
    where: { id },
    data: {
      ...(body.eddByScan ? { eddByScan: body.eddByScan } : {}),
      ...(body.bloodGroup ? { bloodGroup: body.bloodGroup } : {}),
      ...(body.riskFactors ? { riskFactors: body.riskFactors } : {}),
      ...(screening ? { screening } : {})
    }
  });
  await audit(req, 'PREGNANCY_UPDATED', id, body);
  return getPregnancy(id);
}

/** Ends a pregnancy without a delivery here (miscarriage, transfer out, ...). */
export async function endPregnancy(id: string, body: { reason: PregnancyEndReason; endedAt?: Date; note?: string }, req: Request) {
  await loadActive(id);
  await prisma.pregnancy.update({
    where: { id },
    data: { status: PregnancyStatus.ENDED, endReason: body.reason, endedAt: body.endedAt ?? new Date(), endNote: body.note ?? null }
  });
  await audit(req, 'PREGNANCY_ENDED', id, { reason: body.reason });
  return getPregnancy(id);
}

const SEX_LABEL = { MALE: 'Male', FEMALE: 'Female', UNDETERMINED: 'Unknown' } as const;

export async function recordDelivery(
  id: string,
  body: {
    encounterId: string;
    deliveredAt: Date;
    mode: DeliveryMode;
    gestationWeeks?: number;
    placentaComplete: boolean;
    bloodLossMl?: number;
    perineum?: PerinealOutcome;
    oxytocinGiven: boolean;
    complications?: string;
    notes?: string;
    babies: Array<{ sex: keyof typeof SEX_LABEL; outcome: BirthOutcome; birthWeightG?: number; apgar1?: number; apgar5?: number; resuscitated: boolean; notes?: string }>;
  },
  req: Request
) {
  const pregnancy = await loadActive(id);
  const mother = await prisma.patient.findUniqueOrThrow({ where: { id: pregnancy.patientId } });
  const encounter = await prisma.encounter.findUnique({ where: { id: body.encounterId }, select: { id: true, patientId: true, status: true } });
  if (!encounter || encounter.patientId !== mother.id) throw new AppError('Record the delivery on the mother’s visit or stay', 400, 'ENCOUNTER_MISMATCH');
  if (!OPEN.includes(encounter.status)) throw new AppError('That visit is closed', 409, 'ENCOUNTER_CLOSED');
  if (body.deliveredAt > new Date(Date.now() + 5 * 60_000)) throw new AppError('The delivery time cannot be in the future', 400, 'DELIVERY_IN_FUTURE');
  if (pregnancy.lmp && body.deliveredAt < pregnancy.lmp) {
    throw new AppError('The delivery time is before this pregnancy began', 400, 'DELIVERY_BEFORE_PREGNANCY');
  }
  const gestationWeeks = body.gestationWeeks ?? gestationalAge(pregnancy, body.deliveredAt)?.weeks ?? null;
  const pph = isPostpartumHaemorrhage(body.bloodLossMl, body.mode);

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.create({
      data: {
        pregnancyId: id,
        encounterId: encounter.id,
        deliveredAt: body.deliveredAt,
        mode: body.mode,
        gestationWeeks,
        placentaComplete: body.placentaComplete,
        bloodLossMl: body.bloodLossMl ?? null,
        perineum: body.perineum ?? null,
        oxytocinGiven: body.oxytocinGiven,
        complications: body.complications ?? null,
        notes: body.notes ?? null,
        attendantId: req.user?.id ?? null
      }
    });
    for (const [index, baby] of body.babies.entries()) {
      let babyPatientId: string | null = null;
      if (baby.outcome === BirthOutcome.LIVE_BIRTH) {
        const created = await tx.patient.create({
          data: {
            patientCode: await nextCode(tx, 'PAT'),
            firstName: body.babies.length > 1 ? `Baby ${index + 1} of ${mother.firstName}` : `Baby of ${mother.firstName}`,
            lastName: mother.lastName,
            dateOfBirth: body.deliveredAt,
            gender: SEX_LABEL[baby.sex],
            phone: mother.phone,
            address: mother.address,
            emergencyContact: `Mother: ${mother.firstName} ${mother.lastName} (${mother.patientCode})`,
            hospitalId: mother.hospitalId,
            createdById: req.user?.id ?? null
          }
        });
        babyPatientId = created.id;
      }
      await tx.newborn.create({
        data: {
          deliveryId: delivery.id,
          patientId: babyPatientId,
          birthOrder: index + 1,
          sex: baby.sex,
          outcome: baby.outcome,
          birthWeightG: baby.birthWeightG ?? null,
          apgar1: baby.apgar1 ?? null,
          apgar5: baby.apgar5 ?? null,
          resuscitated: baby.resuscitated,
          notes: baby.notes ?? null
        }
      });
    }
    await tx.pregnancy.update({ where: { id }, data: { status: PregnancyStatus.DELIVERED, endedAt: body.deliveredAt } });

    const births = body.babies.map((b, i) => `${body.babies.length > 1 ? `Baby ${i + 1}: ` : ''}${b.outcome.toLowerCase().replace(/_/g, ' ')}, ${SEX_LABEL[b.sex].toLowerCase()}${b.birthWeightG ? `, ${b.birthWeightG} g` : ''}${b.apgar1 !== undefined ? `, Apgar ${b.apgar1}/${b.apgar5 ?? '?'}` : ''}`);
    await tx.clinicalNote.create({
      data: {
        type: ClinicalNoteType.DELIVERY,
        encounterId: encounter.id,
        patientId: mother.id,
        authorId: req.user?.id ?? null,
        subjective: `${pregnancy.pregnancyCode}: ${body.mode.replace(/_/g, ' ').toLowerCase()} at ${gestationWeeks ?? '?'} weeks`,
        objective: births.join('. '),
        assessment: [
          body.bloodLossMl !== undefined ? `Blood loss ${body.bloodLossMl} ml${pph ? ' (postpartum haemorrhage)' : ''}` : null,
          body.placentaComplete ? 'Placenta complete' : 'Placenta INCOMPLETE',
          body.perineum ? `Perineum: ${body.perineum.toLowerCase().replace(/_/g, ' ')}` : null,
          body.complications ? `Complications: ${body.complications}` : null
        ]
          .filter(Boolean)
          .join('. '),
        plan: body.notes ?? null
      }
    });
  });
  await audit(req, 'DELIVERY_RECORDED', id, { mode: body.mode, babies: body.babies.length, pph });
  return getPregnancy(id);
}


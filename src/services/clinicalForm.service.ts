import type { Request } from 'express';
import { ClinicalFormType, EncounterStatus, Prisma } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { FORM_RULES } from '../config/clinics.js';
import { FORM_SCHEMAS } from '../validators/clinicalForm.validators.js';
import { prisma } from './prisma.service.js';
import { isModuleEnabled, permissionsInclude } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getEncounter } from './encounter.service.js';
import { AppError } from '../utils/appError.js';
import { ancAlerts, daysBetween, gestationalAge, postnatalAlerts } from './obstetrics.js';

/*
  Structured clinical forms (Phase 4C). Forms are append-only like notes: a
  correction is a new form that amends the earlier one. The server validates
  the data against the form type's schema and adds derived values (BMI, MUAC
  category) itself, so they cannot disagree with the measurements.
*/

const OPEN: EncounterStatus[] = [EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];

function ageInMonths(dateOfBirth: Date | null, at: Date) {
  if (!dateOfBirth) return null;
  return (at.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * 12 + (at.getUTCMonth() - dateOfBirth.getUTCMonth()) - (at.getUTCDate() < dateOfBirth.getUTCDate() ? 1 : 0);
}

export function bmiCategory(bmi: number) {
  if (bmi < 16) return 'Severe thinness';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/** MUAC cut-offs: WHO for children 6-59 months; the adult cut-off otherwise. */
export function muacCategory(muacCm: number, ageMonths: number | null) {
  if (ageMonths !== null && ageMonths >= 6 && ageMonths < 60) {
    if (muacCm < 11.5) return 'Severe acute malnutrition';
    if (muacCm < 12.5) return 'Moderate acute malnutrition';
    return 'Normal';
  }
  if (ageMonths !== null && ageMonths < 6) return null;
  return muacCm < 18.5 ? 'Undernourished' : muacCm < 23 ? 'At risk' : 'Normal';
}

type PregnancyForDerive = { lmp: Date | null; eddByLmp: Date | null; eddByScan: Date | null; delivery: { deliveredAt: Date } | null } | null;

type PreviousGrowth = { at: Date; weightKg: number } | null;

function derive(type: ClinicalFormType, data: Record<string, unknown>, ageMonths: number | null, pregnancy: PregnancyForDerive, previousGrowth: PreviousGrowth = null) {
  const now = new Date();
  if (type === ClinicalFormType.ANC_VISIT) {
    const ga = pregnancy ? gestationalAge(pregnancy, now) : null;
    const gestation = ga ? { weeks: ga.weeks, days: ga.extraDays, basis: ga.basis } : null;
    return { ...data, derived: { gestation, alerts: ancAlerts(data as Parameters<typeof ancAlerts>[0], ga?.weeks ?? null) } };
  }
  if (type === ClinicalFormType.POSTNATAL_CHECK) {
    const dayPostpartum = pregnancy?.delivery ? daysBetween(pregnancy.delivery.deliveredAt, now) : null;
    return { ...data, derived: { dayPostpartum, alerts: postnatalAlerts(data as Parameters<typeof postnatalAlerts>[0]) } };
  }
  if (type === ClinicalFormType.GROWTH) {
    const muac = data.muacCm as number | undefined;
    const oedema = data.oedema && data.oedema !== 'NONE';
    const derived: Record<string, unknown> = { ageMonths };
    if (muac !== undefined) derived.muacCategory = muacCategory(muac, ageMonths);
    if (oedema && ageMonths !== null && ageMonths < 60) derived.muacCategory = 'Severe acute malnutrition (oedema)';
    if (previousGrowth) {
      const days = Math.max(1, daysBetween(previousGrowth.at, now));
      const change = Math.round(((data.weightKg as number) - previousGrowth.weightKg) * 1000);
      derived.weightChange = { grams: change, days, since: previousGrowth.at.toISOString() };
      // A child under two who has not gained weight in a month is growth-faltering.
      if (ageMonths !== null && ageMonths < 24 && days >= 28 && change <= 0) derived.alerts = ['Growth faltering: no weight gain since the last visit'];
    }
    return { ...data, derived };
  }
  if (type !== ClinicalFormType.NUTRITION_ASSESSMENT) return data;
  const weight = data.weightKg as number;
  const height = data.heightCm as number | undefined;
  const muac = data.muacCm as number | undefined;
  const derived: Record<string, unknown> = { ageMonths };
  // BMI is not used for young children; weight-for-height is, which needs the WHO tables (later wave).
  if (height && (ageMonths === null || ageMonths >= 60)) {
    const bmi = Math.round((weight / (height / 100) ** 2) * 10) / 10;
    derived.bmi = bmi;
    derived.bmiCategory = bmiCategory(bmi);
  }
  if (muac !== undefined) derived.muacCategory = muacCategory(muac, ageMonths);
  // Bilateral pitting oedema is severe acute malnutrition whatever the measurements say.
  if (data.oedema && data.oedema !== 'NONE' && ageMonths !== null && ageMonths < 60) derived.muacCategory = 'Severe acute malnutrition (oedema)';
  return { ...data, derived };
}

export async function addClinicalForm(
  encounterId: string,
  body: { type: ClinicalFormType; data: Record<string, unknown>; amendsId?: string; pregnancyId?: string },
  req: Request
) {
  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId }, include: { patient: { select: { dateOfBirth: true } } } });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  if (!OPEN.includes(encounter.status)) throw new AppError('This visit is closed and can no longer be changed', 409, 'ENCOUNTER_CLOSED');

  const rule = FORM_RULES[body.type];
  if (!(await isModuleEnabled(rule.module))) {
    throw new AppError('This clinical form belongs to a department that is not enabled for your facility.', 403, 'MODULE_DISABLED', { module: rule.module });
  }
  const permissions = req.user?.permissions ?? [];
  if (rule.writers === 'clinician' && !permissionsInclude(permissions, PERMISSIONS.ENCOUNTERS_CONSULT)) {
    throw new AppError('Only clinicians can record this form', 403, 'FORBIDDEN');
  }

  const parsed = FORM_SCHEMAS[body.type].safeParse(body.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(issue?.message || 'The form is not valid', 400, 'VALIDATION_ERROR', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }

  if (body.amendsId) {
    const original = await prisma.clinicalForm.findUnique({ where: { id: body.amendsId }, select: { encounterId: true, type: true, pregnancyId: true } });
    if (!original || original.encounterId !== encounterId || original.type !== body.type || original.pregnancyId !== (body.pregnancyId ?? null)) {
      throw new AppError('The form being corrected is not a form of this type on this visit', 400, 'FORM_NOT_ON_ENCOUNTER');
    }
  }

  // Antenatal and postnatal forms belong to this woman's pregnancy, at the right stage.
  let pregnancy: PregnancyForDerive = null;
  if (rule.pregnancy) {
    if (!body.pregnancyId) throw new AppError('Choose the pregnancy this form belongs to', 400, 'PREGNANCY_REQUIRED');
    const found = await prisma.pregnancy.findUnique({ where: { id: body.pregnancyId }, include: { delivery: { select: { deliveredAt: true } } } });
    if (!found || found.patientId !== encounter.patientId) throw new AppError('That pregnancy is not this patient’s', 400, 'PREGNANCY_MISMATCH');
    if (found.status !== rule.pregnancy) {
      throw new AppError(rule.pregnancy === 'ACTIVE' ? 'Antenatal visits are recorded on an ongoing pregnancy' : 'Postnatal checks are recorded after the delivery', 409, 'PREGNANCY_WRONG_STATUS');
    }
    pregnancy = found;
  } else if (body.pregnancyId) {
    throw new AppError('Only antenatal and postnatal forms belong to a pregnancy', 400, 'PREGNANCY_NOT_EXPECTED');
  }

  let previousGrowth: PreviousGrowth = null;
  if (body.type === ClinicalFormType.GROWTH) {
    const last = await prisma.clinicalForm.findFirst({ where: { patientId: encounter.patientId, type: ClinicalFormType.GROWTH }, orderBy: { createdAt: 'desc' } });
    const weight = last && typeof last.data === 'object' && last.data && !Array.isArray(last.data) ? Number((last.data as Record<string, unknown>).weightKg) : NaN;
    if (last && Number.isFinite(weight)) previousGrowth = { at: last.createdAt, weightKg: weight };
  }
  const data = derive(body.type, parsed.data as Record<string, unknown>, ageInMonths(encounter.patient.dateOfBirth, new Date()), pregnancy, previousGrowth);
  const form = await prisma.clinicalForm.create({
    data: {
      encounterId,
      patientId: encounter.patientId,
      type: body.type,
      data: data as Prisma.InputJsonObject,
      authorId: req.user?.id ?? null,
      amendsId: body.amendsId ?? null,
      pregnancyId: body.pregnancyId ?? null
    }
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: body.amendsId ? 'CLINICAL_FORM_AMENDED' : 'CLINICAL_FORM_ADDED', module: 'Encounters', entityType: 'Encounter', entityId: encounterId, details: { formId: form.id, type: body.type } });
  return getEncounter(encounterId);
}

/** A patient's forms across visits, newest first (e.g. the previous dental chart). */
export async function listPatientForms(patientId: string, query: { type?: ClinicalFormType; limit: number }) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const items = await prisma.clinicalForm.findMany({
    where: { patientId, ...(query.type ? { type: query.type } : {}) },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    include: { author: { select: { id: true, name: true } }, encounter: { select: { id: true, encounterCode: true, clinic: true } } }
  });
  return { items };
}

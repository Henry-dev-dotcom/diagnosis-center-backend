import type { Request } from 'express';
import {
  CatalogItemType,
  ClinicalNoteType,
  DiagnosisStatus,
  EncounterStatus,
  EncounterType,
  InvoiceStatus,
  Prisma,
  type OrderUrgency,
  type TriageLevel,
  type AllergySeverity,
  type DiagnosisType
} from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { prisma } from './prisma.service.js';
import { nextCode as issueCode } from './codeSequence.service.js';
import { isModuleEnabled, permissionsInclude } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { createWalkIn } from './reception.service.js';
import { allergyConflicts } from './allergyCheck.js';
import { AppError } from '../utils/appError.js';
import type { ModuleKey } from '../config/modules.js';

// Each visit type belongs to a department module.
const MODULE_FOR_ENCOUNTER_TYPE: Record<EncounterType, ModuleKey> = {
  [EncounterType.OPD]: 'opd',
  [EncounterType.EMERGENCY]: 'emergency',
  [EncounterType.INPATIENT]: 'inpatient'
};

async function assertEncounterTypeAvailable(type: EncounterType) {
  const moduleKey = MODULE_FOR_ENCOUNTER_TYPE[type];
  if (!(await isModuleEnabled(moduleKey))) {
    throw new AppError(`${type === EncounterType.EMERGENCY ? 'Emergency' : 'Outpatient'} visits are not enabled for your facility.`, 403, 'MODULE_DISABLED', { module: moduleKey });
  }
}

/*
  Clinical encounters (Phase 3). An encounter is one patient visit; triage,
  vitals, notes, diagnoses, prescriptions, orders and charges attach to it.

  Stages: WAITING_TRIAGE -> WAITING_DOCTOR -> IN_CONSULTATION -> COMPLETED,
  with CANCELLED possible before completion. A clinician may take a patient
  straight from triage when needed. Completed and cancelled encounters are
  read-only; notes are append-only (corrections are amendments).
*/

const ACTIVE_STATUSES: EncounterStatus[] = [EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION];

const patientSummarySelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  phone: true,
  insuranceProvider: true,
  policyNumber: true
} satisfies Prisma.PatientSelect;

const staffSelect = { select: { id: true, name: true, role: true } } as const;

const encounterDetailInclude = {
  patient: {
    select: {
      ...patientSummarySelect,
      emergencyContact: true,
      allergiesAndConditions: true,
      allergies: { where: { active: true }, orderBy: { createdAt: 'desc' } },
      // The problem list: chronic diagnoses still active, from any encounter.
      diagnoses: { where: { isChronic: true, status: DiagnosisStatus.ACTIVE }, orderBy: { createdAt: 'desc' } }
    }
  },
  attending: staffSelect,
  createdBy: staffSelect,
  vitalSigns: { orderBy: { recordedAt: 'desc' }, include: { recordedBy: staffSelect } },
  notes: { orderBy: { createdAt: 'asc' }, include: { author: staffSelect } },
  diagnoses: { orderBy: { createdAt: 'asc' }, include: { recordedBy: staffSelect } },
  prescriptions: { orderBy: { createdAt: 'desc' }, include: { items: true, prescriber: staffSelect } },
  orders: {
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { catalogItem: { select: { id: true, name: true, type: true } } } } }
  },
  invoices: { orderBy: { createdAt: 'asc' }, include: { items: true } }
} satisfies Prisma.EncounterInclude;

function nextCode(tx: Prisma.TransactionClient, prefix: 'ENC' | 'RX') {
  return issueCode(tx, prefix);
}

async function audit(req: Request, action: string, encounterId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Encounters', entityType: 'Encounter', entityId: encounterId, details });
}

async function loadEncounter(id: string) {
  const encounter = await prisma.encounter.findUnique({ where: { id } });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  return encounter;
}

async function loadActiveEncounter(id: string) {
  const encounter = await loadEncounter(id);
  if (!ACTIVE_STATUSES.includes(encounter.status)) {
    throw new AppError('This visit is closed and can no longer be changed', 409, 'ENCOUNTER_CLOSED');
  }
  return encounter;
}

export async function listEncounters(query: {
  status?: EncounterStatus | 'ACTIVE';
  type?: EncounterType;
  patientId?: string;
  date?: string;
  limit: number;
}) {
  const where: Prisma.EncounterWhereInput = {};
  if (query.status === 'ACTIVE') where.status = { in: ACTIVE_STATUSES };
  else if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.patientId) where.patientId = query.patientId;
  if (query.date) {
    const start = new Date(`${query.date}T00:00:00.000Z`);
    where.startedAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
  }
  const items = await prisma.encounter.findMany({
    where,
    take: query.limit,
    // Most urgent first, then longest waiting.
    orderBy: [{ triageLevel: 'asc' }, { startedAt: 'asc' }],
    include: {
      patient: { select: patientSummarySelect },
      attending: staffSelect,
      _count: { select: { diagnoses: true, orders: true, prescriptions: true } }
    }
  });
  return { items };
}

export async function getEncounter(id: string) {
  const encounter = await prisma.encounter.findUnique({ where: { id }, include: encounterDetailInclude });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
  return encounter;
}

export async function startEncounter(
  body: { patientId: string; type: EncounterType; chiefComplaint?: string; visitId?: string; feeItemId?: string },
  req: Request
) {
  if (body.type === EncounterType.INPATIENT) {
    throw new AppError('Inpatient stays start by admitting the patient to a bed', 400, 'USE_ADMISSION');
  }
  await assertEncounterTypeAvailable(body.type);
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true, hospitalId: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');

  const open = await prisma.encounter.findFirst({ where: { patientId: patient.id, status: { in: ACTIVE_STATUSES } }, select: { encounterCode: true } });
  if (open) throw new AppError(`This patient already has an open visit (${open.encounterCode})`, 409, 'ENCOUNTER_ALREADY_OPEN');

  const feeItem = body.feeItemId ? await prisma.catalogItem.findUnique({ where: { id: body.feeItemId } }) : null;
  if (body.feeItemId && (!feeItem || !feeItem.isActive || feeItem.type !== CatalogItemType.SERVICE)) {
    throw new AppError('The consultation fee must be an active service item from the catalog', 400, 'INVALID_FEE_ITEM');
  }
  const charge = feeItem && (await isModuleEnabled('billing'));

  const encounter = await prisma.$transaction(async (tx) => {
    const created = await tx.encounter.create({
      data: {
        encounterCode: await nextCode(tx, 'ENC'),
        patientId: patient.id,
        visitId: body.visitId ?? null,
        type: body.type,
        chiefComplaint: body.chiefComplaint ?? null,
        createdById: req.user?.id ?? null
      }
    });
    if (charge && feeItem) {
      const price = feeItem.price;
      await tx.invoice.create({
        data: {
          invoiceCode: await issueCode(tx, 'INV'),
          encounterId: created.id,
          patientId: patient.id,
          hospitalId: patient.hospitalId,
          status: InvoiceStatus.UNPAID,
          subtotal: price,
          total: price,
          balance: price,
          createdById: req.user?.id ?? null,
          items: { create: [{ catalogItemId: feeItem.id, description: feeItem.name, quantity: 1, unitPrice: price, total: price }] }
        }
      });
    }
    return created;
  });

  await audit(req, 'ENCOUNTER_STARTED', encounter.id, { type: encounter.type, feeCharged: Boolean(charge) });
  return getEncounter(encounter.id);
}

export async function recordVitals(
  id: string,
  body: {
    temperatureC?: number;
    pulseBpm?: number;
    respiratoryRate?: number;
    systolicBp?: number;
    diastolicBp?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
    painScore?: number;
    bloodGlucose?: number;
    notes?: string;
    triageLevel?: TriageLevel;
    completeTriage: boolean;
  },
  req: Request
) {
  const encounter = await loadActiveEncounter(id);
  const { triageLevel, completeTriage, ...vitals } = body;
  const moveToDoctor = completeTriage && encounter.status === EncounterStatus.WAITING_TRIAGE;

  await prisma.$transaction([
    prisma.vitalSigns.create({ data: { ...vitals, encounterId: id, patientId: encounter.patientId, recordedById: req.user?.id ?? null } }),
    prisma.encounter.update({
      where: { id },
      data: {
        ...(triageLevel ? { triageLevel } : {}),
        ...(moveToDoctor ? { status: EncounterStatus.WAITING_DOCTOR, triagedAt: new Date() } : {})
      }
    })
  ]);
  await audit(req, 'ENCOUNTER_VITALS_RECORDED', id, { triageLevel, triageCompleted: moveToDoctor });
  return getEncounter(id);
}

export async function startConsultation(id: string, req: Request) {
  const encounter = await loadActiveEncounter(id);
  if (encounter.status === EncounterStatus.IN_CONSULTATION && encounter.attendingId && encounter.attendingId !== req.user?.id) {
    throw new AppError('Another clinician is already seeing this patient', 409, 'ENCOUNTER_IN_CONSULTATION');
  }
  await prisma.encounter.update({
    where: { id },
    data: {
      status: EncounterStatus.IN_CONSULTATION,
      attendingId: req.user?.id ?? null,
      consultationStartedAt: encounter.consultationStartedAt ?? new Date()
    }
  });
  await audit(req, 'ENCOUNTER_CONSULTATION_STARTED', id);
  return getEncounter(id);
}

export async function addNote(
  id: string,
  body: { subjective?: string; objective?: string; assessment?: string; plan?: string; amendsId?: string },
  req: Request
) {
  const encounter = await loadActiveEncounter(id);
  if (body.amendsId) {
    const original = await prisma.clinicalNote.findUnique({ where: { id: body.amendsId }, select: { encounterId: true } });
    if (!original || original.encounterId !== id) throw new AppError('The note being corrected is not on this visit', 400, 'NOTE_NOT_ON_ENCOUNTER');
  }
  // Clinicians write consultation notes; triage staff write triage notes.
  const clinician = permissionsInclude(req.user?.permissions ?? [], PERMISSIONS.ENCOUNTERS_CONSULT);
  const type = clinician
    ? encounter.type === EncounterType.INPATIENT ? ClinicalNoteType.PROGRESS : ClinicalNoteType.CONSULTATION
    : encounter.type === EncounterType.INPATIENT ? ClinicalNoteType.NURSING : ClinicalNoteType.TRIAGE;
  const note = await prisma.clinicalNote.create({
    data: { ...body, type, encounterId: id, patientId: encounter.patientId, authorId: req.user?.id ?? null }
  });
  await audit(req, body.amendsId ? 'ENCOUNTER_NOTE_AMENDED' : 'ENCOUNTER_NOTE_ADDED', id, { noteId: note.id, type });
  return getEncounter(id);
}

export async function addDiagnosis(
  id: string,
  body: { code?: string; description: string; type: DiagnosisType; isChronic: boolean },
  req: Request
) {
  const encounter = await loadActiveEncounter(id);
  await prisma.diagnosis.create({
    data: {
      code: body.code ? body.code.toUpperCase() : null,
      description: body.description,
      type: body.type,
      isChronic: body.isChronic,
      encounterId: id,
      patientId: encounter.patientId,
      recordedById: req.user?.id ?? null
    }
  });
  await audit(req, 'ENCOUNTER_DIAGNOSIS_ADDED', id, { code: body.code, description: body.description });
  return getEncounter(id);
}

/** Marks a diagnosis resolved (e.g. a chronic condition that has ended). Works on closed visits too. */
export async function resolveDiagnosis(id: string, diagnosisId: string, req: Request) {
  const diagnosis = await prisma.diagnosis.findUnique({ where: { id: diagnosisId } });
  if (!diagnosis || diagnosis.encounterId !== id) throw new AppError('Diagnosis not found on this visit', 404, 'DIAGNOSIS_NOT_FOUND');
  await prisma.diagnosis.update({ where: { id: diagnosisId }, data: { status: DiagnosisStatus.RESOLVED, resolvedAt: new Date() } });
  await audit(req, 'ENCOUNTER_DIAGNOSIS_RESOLVED', id, { diagnosisId });
  return getEncounter(id);
}

/** Orders tests and scans through the existing lab and imaging workflows. */
export async function orderInvestigations(
  id: string,
  body: { items: Array<{ catalogItemId: string; notes?: string }>; urgency: OrderUrgency; notes?: string },
  req: Request
) {
  const encounter = await loadActiveEncounter(id);
  await createWalkIn(
    {
      patientId: encounter.patientId,
      requestedItems: body.items,
      notes: body.notes ?? null,
      urgency: body.urgency,
      encounterId: id,
      invoiceNow: true,
      checkInNow: false
    },
    req
  );
  await audit(req, 'ENCOUNTER_INVESTIGATIONS_ORDERED', id, { items: body.items.map((item) => item.catalogItemId) });
  return getEncounter(id);
}

export async function prescribe(
  id: string,
  body: {
    notes?: string;
    allergyOverrideReason?: string;
    items: Array<{
      drugId?: string;
      drugName: string;
      strength?: string;
      dosageForm?: string;
      dose: string;
      route: string;
      frequency: string;
      durationDays?: number;
      quantity?: number;
      instructions?: string;
    }>;
  },
  req: Request
) {
  const encounter = await loadActiveEncounter(id);

  // Lines picked from the drug list must be active drugs in this facility.
  const drugIds = [...new Set(body.items.map((item) => item.drugId).filter((drugId): drugId is string => Boolean(drugId)))];
  const drugs = drugIds.length ? await prisma.drug.findMany({ where: { id: { in: drugIds }, isActive: true } }) : [];
  if (drugs.length !== drugIds.length) throw new AppError('A chosen drug is not in the active drug list', 400, 'DRUG_NOT_AVAILABLE');
  const drugById = new Map(drugs.map((drug) => [drug.id, drug]));

  // Allergy safety net: block unless the prescriber records why they are proceeding.
  const allergies = await prisma.patientAllergy.findMany({ where: { patientId: encounter.patientId, active: true }, select: { substance: true } });
  const conflicts = allergyConflicts(
    allergies,
    body.items.flatMap((item) => {
      const drug = item.drugId ? drugById.get(item.drugId) : undefined;
      return [item.drugName, drug?.genericName, drug?.brandName];
    })
  );
  if (conflicts.length && !body.allergyOverrideReason) {
    throw new AppError(`Recorded allergy: ${conflicts.join(', ')}. Choose another medicine, or give a reason to prescribe anyway.`, 409, 'ALLERGY_CONFLICT', { allergies: conflicts });
  }

  const { allergyOverrideReason, ...rest } = body;
  const prescription = await prisma.$transaction(async (tx) =>
    tx.prescription.create({
      data: {
        prescriptionCode: await nextCode(tx, 'RX'),
        encounterId: id,
        patientId: encounter.patientId,
        prescriberId: req.user?.id ?? null,
        notes: rest.notes ?? null,
        allergyOverride: conflicts.length ? `${conflicts.join(', ')}: ${allergyOverrideReason}` : null,
        items: { create: rest.items }
      }
    })
  );
  await audit(req, 'ENCOUNTER_PRESCRIPTION_ISSUED', id, {
    prescriptionId: prescription.id,
    lines: body.items.length,
    allergyOverride: conflicts.length ? allergyOverrideReason : undefined
  });
  return getEncounter(id);
}

/**
 * Registers an emergency arrival who may not be able to give details, and opens
 * their visit in one step. Unknown names are recorded as such, to be corrected
 * on the patient record once the patient is identified.
 */
export async function registerEmergencyArrival(
  body: {
    firstName?: string;
    lastName?: string;
    gender: string;
    estimatedAgeYears?: number;
    phone?: string;
    chiefComplaint: string;
    triageLevel?: TriageLevel;
    feeItemId?: string;
  },
  req: Request
) {
  await assertEncounterTypeAvailable(EncounterType.EMERGENCY);
  const estimatedBirth =
    body.estimatedAgeYears === undefined ? null : new Date(Date.UTC(new Date().getUTCFullYear() - body.estimatedAgeYears, 0, 1));
  const patient = await prisma.$transaction(async (tx) =>
    tx.patient.create({
      data: {
        patientCode: await issueCode(tx, 'PAT'),
        firstName: body.firstName || 'Unknown',
        lastName: body.lastName || (body.firstName ? '(surname unknown)' : 'Emergency patient'),
        gender: body.gender,
        dateOfBirth: estimatedBirth,
        phone: body.phone ?? null,
        allergiesAndConditions: body.firstName && body.lastName ? null : 'Registered in Emergency before identification; confirm identity.',
        createdById: req.user?.id ?? null
      }
    })
  );
  const encounter = await startEncounter(
    { patientId: patient.id, type: EncounterType.EMERGENCY, chiefComplaint: body.chiefComplaint, feeItemId: body.feeItemId },
    req
  );
  if (body.triageLevel) {
    await prisma.encounter.update({ where: { id: encounter.id }, data: { triageLevel: body.triageLevel } });
  }
  await audit(req, 'EMERGENCY_ARRIVAL_REGISTERED', encounter.id, { patientId: patient.id, identified: Boolean(body.firstName && body.lastName) });
  return getEncounter(encounter.id);
}

export async function completeEncounter(id: string, body: { outcome: string; summary?: string }, req: Request) {
  const encounter = await loadActiveEncounter(id);
  if (encounter.type === EncounterType.INPATIENT) throw new AppError('Discharge the patient to end an inpatient stay', 409, 'USE_DISCHARGE');
  if (encounter.status !== EncounterStatus.IN_CONSULTATION) {
    throw new AppError('Start the consultation before completing the visit', 409, 'ENCOUNTER_NOT_IN_CONSULTATION');
  }
  const diagnoses = await prisma.diagnosis.count({ where: { encounterId: id } });
  if (diagnoses === 0) throw new AppError('Record at least one diagnosis before completing the visit', 409, 'DIAGNOSIS_REQUIRED');

  await prisma.$transaction([
    ...(body.summary
      ? [prisma.clinicalNote.create({ data: { type: ClinicalNoteType.DISCHARGE, plan: body.summary, encounterId: id, patientId: encounter.patientId, authorId: req.user?.id ?? null } })]
      : []),
    prisma.encounter.update({ where: { id }, data: { status: EncounterStatus.COMPLETED, outcome: body.outcome, completedAt: new Date() } })
  ]);
  await audit(req, 'ENCOUNTER_COMPLETED', id, { outcome: body.outcome });
  return getEncounter(id);
}

export async function cancelEncounter(id: string, body: { reason: string }, req: Request) {
  const encounter = await loadActiveEncounter(id);
  if (encounter.type === EncounterType.INPATIENT) throw new AppError('Discharge the patient to end an inpatient stay', 409, 'USE_DISCHARGE');
  if (encounter.status === EncounterStatus.IN_CONSULTATION) {
    throw new AppError('A visit in consultation cannot be cancelled; complete it with the appropriate outcome instead', 409, 'ENCOUNTER_IN_CONSULTATION');
  }
  await prisma.encounter.update({ where: { id }, data: { status: EncounterStatus.CANCELLED, cancelReason: body.reason, completedAt: new Date() } });
  await audit(req, 'ENCOUNTER_CANCELLED', id, { reason: body.reason });
  return getEncounter(id);
}

/* --------------------------------------------------------------- patients */

async function assertPatient(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
}

export async function listAllergies(patientId: string) {
  await assertPatient(patientId);
  return prisma.patientAllergy.findMany({ where: { patientId }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] });
}

export async function addAllergy(patientId: string, body: { substance: string; reaction?: string; severity: AllergySeverity }, req: Request) {
  await assertPatient(patientId);
  const allergy = await prisma.patientAllergy.create({
    data: { ...body, reaction: body.reaction ?? null, patientId, recordedById: req.user?.id ?? null }
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'PATIENT_ALLERGY_ADDED', module: 'Patients', entityType: 'Patient', entityId: patientId, details: { substance: body.substance } });
  return allergy;
}

export async function setAllergyActive(patientId: string, allergyId: string, active: boolean, req: Request) {
  const allergy = await prisma.patientAllergy.findUnique({ where: { id: allergyId } });
  if (!allergy || allergy.patientId !== patientId) throw new AppError('Allergy not found', 404, 'ALLERGY_NOT_FOUND');
  const updated = await prisma.patientAllergy.update({ where: { id: allergyId }, data: { active } });
  await createAuditLog({ ...getRequestAuditContext(req), action: active ? 'PATIENT_ALLERGY_REACTIVATED' : 'PATIENT_ALLERGY_INACTIVATED', module: 'Patients', entityType: 'Patient', entityId: patientId, details: { allergyId } });
  return updated;
}

/** The patient's history in one list: visits, orders and bills, newest first. */
export async function patientTimeline(patientId: string) {
  await assertPatient(patientId);
  const [encounters, orders, invoices] = await Promise.all([
    prisma.encounter.findMany({ where: { patientId }, include: { diagnoses: { select: { code: true, description: true, type: true } } } }),
    prisma.order.findMany({ where: { patientId }, include: { items: { include: { catalogItem: { select: { name: true, type: true } } } } } }),
    prisma.invoice.findMany({ where: { patientId } })
  ]);
  const events = [
    ...encounters.map((e) => ({
      kind: 'ENCOUNTER' as const,
      id: e.id,
      at: e.startedAt,
      code: e.encounterCode,
      status: e.status,
      summary: [e.type, e.chiefComplaint, e.diagnoses.map((d) => d.description).join(', ')].filter(Boolean).join(' · ')
    })),
    ...orders.map((o) => ({
      kind: 'ORDER' as const,
      id: o.id,
      at: o.submittedAt,
      code: o.orderCode,
      status: o.status,
      summary: o.items.map((i) => i.catalogItem.name).join(', ')
    })),
    ...invoices.map((inv) => ({
      kind: 'INVOICE' as const,
      id: inv.id,
      at: inv.createdAt,
      code: inv.invoiceCode,
      status: inv.status,
      summary: `Total ${inv.total.toString()}, balance ${inv.balance.toString()}`
    }))
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

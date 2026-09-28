import type { Request } from 'express';
import {
  AdmissionStatus,
  BedStatus,
  ClinicalNoteType,
  EncounterStatus,
  EncounterType,
  InvoiceStatus,
  Prisma,
  PrescriptionStatus,
  WardGender,
  type AdministrationStatus,
  type WardType
} from '@prisma/client';
import { prisma } from './prisma.service.js';
import { isModuleEnabled } from './facilityAccess.service.js';
import { nextCode as issueCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Inpatient care (Phase 4B). An Admission owns an INPATIENT encounter, so the
  existing vitals, notes, diagnoses, orders and prescriptions record the stay.
  Beds move AVAILABLE -> OCCUPIED -> CLEANING -> AVAILABLE; bed claims are
  conditional updates, and the database allows one active admission per bed
  and per patient. Every bed occupied is kept in BedAssignment, which also
  drives the nightly ward charge at discharge.
*/

const DAY_MS = 86_400_000;

async function audit(req: Request, action: string, admissionId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Inpatient', entityType: 'Admission', entityId: admissionId, details });
}

const patientSelect = {
  id: true,
  patientCode: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  allergies: { where: { active: true }, select: { id: true, substance: true, reaction: true, severity: true } }
} satisfies Prisma.PatientSelect;

const staff = { select: { id: true, name: true } } as const;

/* ------------------------------------------------------------ wards & beds */

export async function listWards() {
  const wards = await prisma.ward.findMany({
    orderBy: { name: 'asc' },
    include: {
      beds: {
        where: { isActive: true },
        orderBy: { label: 'asc' },
        include: {
          admissions: {
            where: { status: AdmissionStatus.ADMITTED },
            select: { id: true, admissionCode: true, admittedAt: true, reason: true, patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, gender: true, dateOfBirth: true } } }
          }
        }
      }
    }
  });
  return {
    items: wards.map((ward) => ({
      ...ward,
      beds: ward.beds.map(({ admissions, ...bed }) => ({ ...bed, admission: admissions[0] ?? null })),
      occupancy: {
        total: ward.beds.length,
        occupied: ward.beds.filter((b) => b.status === BedStatus.OCCUPIED).length,
        available: ward.beds.filter((b) => b.status === BedStatus.AVAILABLE).length
      }
    }))
  };
}

export async function createWard(
  body: { code: string; name: string; type: WardType; gender: WardGender; dailyRate: number; beds?: string[] },
  req: Request
) {
  try {
    const ward = await prisma.ward.create({
      data: {
        code: body.code,
        name: body.name,
        type: body.type,
        gender: body.gender,
        dailyRate: body.dailyRate,
        beds: body.beds?.length ? { create: [...new Set(body.beds)].map((label) => ({ label })) } : undefined
      }
    });
    await createAuditLog({ ...getRequestAuditContext(req), action: 'WARD_CREATED', module: 'Inpatient', entityType: 'Ward', entityId: ward.id, details: { code: ward.code, beds: body.beds?.length ?? 0 } });
    return ward;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A ward with that code already exists', 409, 'WARD_CODE_TAKEN');
    throw error;
  }
}

export async function updateWard(id: string, body: Prisma.WardUncheckedUpdateInput, req: Request) {
  const ward = await prisma.ward.findUnique({ where: { id } });
  if (!ward) throw new AppError('Ward not found', 404, 'WARD_NOT_FOUND');
  const updated = await prisma.ward.update({ where: { id }, data: body });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'WARD_UPDATED', module: 'Inpatient', entityType: 'Ward', entityId: id, details: body });
  return updated;
}

export async function addBeds(wardId: string, labels: string[], req: Request) {
  const ward = await prisma.ward.findUnique({ where: { id: wardId } });
  if (!ward) throw new AppError('Ward not found', 404, 'WARD_NOT_FOUND');
  try {
    await prisma.bed.createMany({ data: [...new Set(labels)].map((label) => ({ wardId, label })) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('One of those bed labels already exists on this ward', 409, 'BED_LABEL_TAKEN');
    throw error;
  }
  await createAuditLog({ ...getRequestAuditContext(req), action: 'BEDS_ADDED', module: 'Inpatient', entityType: 'Ward', entityId: wardId, details: { labels } });
  return listWards();
}

/** Staff mark beds cleaned, or take them out of service. Occupancy itself only changes through admissions. */
export async function setBedStatus(bedId: string, status: BedStatus, req: Request) {
  if (status === BedStatus.OCCUPIED) throw new AppError('A bed becomes occupied by admitting a patient to it', 400, 'USE_ADMISSION');
  const changed = await prisma.bed.updateMany({ where: { id: bedId, status: { not: BedStatus.OCCUPIED } }, data: { status } });
  if (changed.count !== 1) {
    const bed = await prisma.bed.findUnique({ where: { id: bedId } });
    if (!bed) throw new AppError('Bed not found', 404, 'BED_NOT_FOUND');
    throw new AppError('This bed is occupied; discharge or transfer the patient first', 409, 'BED_OCCUPIED');
  }
  await createAuditLog({ ...getRequestAuditContext(req), action: 'BED_STATUS_CHANGED', module: 'Inpatient', entityType: 'Bed', entityId: bedId, details: { status } });
  return listWards();
}

/* -------------------------------------------------------------- admissions */

const admissionInclude = {
  patient: { select: patientSelect },
  ward: { select: { id: true, code: true, name: true, type: true, dailyRate: true } },
  bed: { select: { id: true, label: true } },
  admittedBy: staff,
  attending: staff,
  dischargedBy: staff,
  sourceEncounter: { select: { id: true, encounterCode: true, type: true } },
  bedAssignments: { orderBy: { startedAt: 'asc' }, include: { ward: { select: { name: true } }, bed: { select: { label: true } }, assignedBy: staff } },
  administrations: { orderBy: { administeredAt: 'desc' }, include: { administeredBy: staff } },
  encounter: {
    select: {
      id: true,
      encounterCode: true,
      status: true,
      diagnoses: { orderBy: { createdAt: 'asc' }, select: { id: true, code: true, description: true, type: true, status: true } },
      vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1 },
      prescriptions: {
        where: { status: { not: PrescriptionStatus.CANCELLED } },
        orderBy: { createdAt: 'asc' },
        include: { items: true, prescriber: staff }
      }
    }
  }
} satisfies Prisma.AdmissionInclude;

export async function listAdmissions(query: { status?: AdmissionStatus; wardId?: string }) {
  const items = await prisma.admission.findMany({
    where: { status: query.status ?? AdmissionStatus.ADMITTED, ...(query.wardId ? { wardId: query.wardId } : {}) },
    orderBy: { admittedAt: query.status === AdmissionStatus.DISCHARGED ? 'desc' : 'asc' },
    take: 100,
    include: {
      patient: { select: patientSelect },
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true } },
      attending: staff
    }
  });
  return { items };
}

export async function getAdmission(id: string) {
  const admission = await prisma.admission.findUnique({ where: { id }, include: admissionInclude });
  if (!admission) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  return admission;
}

async function loadActiveAdmission(id: string) {
  const admission = await prisma.admission.findUnique({ where: { id } });
  if (!admission) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  if (admission.status !== AdmissionStatus.ADMITTED) throw new AppError('This stay has ended and can no longer be changed', 409, 'ADMISSION_CLOSED');
  return admission;
}

/** Checks a bed can take this patient, and returns it with its ward. */
async function assertBedFor(wardId: string, bedId: string, gender: string | null) {
  const bed = await prisma.bed.findUnique({ where: { id: bedId }, include: { ward: true } });
  if (!bed || bed.wardId !== wardId || !bed.isActive) throw new AppError('That bed is not on the chosen ward', 400, 'BED_NOT_ON_WARD');
  if (!bed.ward.isActive) throw new AppError('That ward is closed', 409, 'WARD_CLOSED');
  if (bed.status !== BedStatus.AVAILABLE) throw new AppError(`Bed ${bed.label} is not available (${bed.status.toLowerCase().replace(/_/g, ' ')})`, 409, 'BED_NOT_AVAILABLE');
  const sex = (gender ?? '').toUpperCase();
  if (bed.ward.gender !== WardGender.MIXED && (sex === 'MALE' || sex === 'FEMALE') && sex !== bed.ward.gender) {
    throw new AppError(`${bed.ward.name} is a ${bed.ward.gender.toLowerCase()} ward`, 409, 'WARD_GENDER_MISMATCH');
  }
  return bed;
}

/** Claims a bed inside a transaction; fails if someone else took it first. */
async function claimBed(tx: Prisma.TransactionClient, bedId: string) {
  const claimed = await tx.bed.updateMany({ where: { id: bedId, status: BedStatus.AVAILABLE }, data: { status: BedStatus.OCCUPIED } });
  if (claimed.count !== 1) throw new AppError('That bed was just taken; choose another', 409, 'BED_NOT_AVAILABLE');
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function admit(
  body: { patientId: string; wardId: string; bedId: string; reason: string; sourceEncounterId?: string; expectedDischargeAt?: Date },
  req: Request
) {
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true, gender: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const current = await prisma.admission.findFirst({ where: { patientId: patient.id, status: AdmissionStatus.ADMITTED }, include: { ward: true, bed: true } });
  if (current) throw new AppError(`Already admitted to ${current.ward.name}, bed ${current.bed.label} (${current.admissionCode})`, 409, 'PATIENT_ALREADY_ADMITTED');
  await assertBedFor(body.wardId, body.bedId, patient.gender);

  // Admitting from a visit closes that visit as ADMITTED and carries its diagnoses over.
  let source: Prisma.EncounterGetPayload<{ include: { diagnoses: true } }> | null = null;
  if (body.sourceEncounterId) {
    source = await prisma.encounter.findUnique({ where: { id: body.sourceEncounterId }, include: { diagnoses: true } });
    if (!source || source.patientId !== patient.id) throw new AppError('That visit does not belong to this patient', 400, 'SOURCE_ENCOUNTER_MISMATCH');
    if (source.type === EncounterType.INPATIENT) throw new AppError('Admit from an outpatient or emergency visit', 400, 'SOURCE_ENCOUNTER_MISMATCH');
    if (source.status === EncounterStatus.COMPLETED || source.status === EncounterStatus.CANCELLED) throw new AppError('That visit is already closed', 409, 'ENCOUNTER_CLOSED');
    if (source.diagnoses.length === 0) throw new AppError('Record at least one diagnosis on the visit before admitting', 409, 'DIAGNOSIS_REQUIRED');
  }

  try {
    const admissionId = await prisma.$transaction(async (tx) => {
      await claimBed(tx, body.bedId);
      const encounter = await tx.encounter.create({
        data: {
          encounterCode: await issueCode(tx, 'ENC'),
          patientId: patient.id,
          type: EncounterType.INPATIENT,
          status: EncounterStatus.IN_CONSULTATION,
          chiefComplaint: body.reason,
          attendingId: req.user?.id ?? null,
          createdById: req.user?.id ?? null,
          consultationStartedAt: new Date()
        }
      });
      if (source) {
        for (const d of source.diagnoses) {
          await tx.diagnosis.create({
            data: { encounterId: encounter.id, patientId: patient.id, code: d.code, description: d.description, type: d.type, isChronic: d.isChronic, recordedById: req.user?.id ?? null }
          });
        }
        await tx.encounter.update({ where: { id: source.id }, data: { status: EncounterStatus.COMPLETED, outcome: 'ADMITTED', completedAt: new Date() } });
      }
      const admission = await tx.admission.create({
        data: {
          admissionCode: await issueCode(tx, 'ADM'),
          patientId: patient.id,
          encounterId: encounter.id,
          sourceEncounterId: source?.id ?? null,
          wardId: body.wardId,
          bedId: body.bedId,
          reason: body.reason,
          admittedById: req.user?.id ?? null,
          attendingId: req.user?.id ?? null,
          expectedDischargeAt: body.expectedDischargeAt ?? null
        }
      });
      await tx.bedAssignment.create({ data: { admissionId: admission.id, wardId: body.wardId, bedId: body.bedId, assignedById: req.user?.id ?? null, reason: 'Admitted' } });
      return admission.id;
    });
    await audit(req, 'PATIENT_ADMITTED', admissionId, { wardId: body.wardId, bedId: body.bedId, from: source?.encounterCode });
    return getAdmission(admissionId);
  } catch (error) {
    // The partial unique indexes catch the rare race the checks above cannot.
    if (isUniqueViolation(error)) throw new AppError('The patient or the bed was just admitted elsewhere; refresh and try again', 409, 'ADMISSION_CONFLICT');
    throw error;
  }
}

export async function transfer(id: string, body: { wardId: string; bedId: string; reason: string }, req: Request) {
  const admission = await loadActiveAdmission(id);
  if (admission.bedId === body.bedId) throw new AppError('The patient is already in that bed', 400, 'SAME_BED');
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: admission.patientId }, select: { gender: true } });
  await assertBedFor(body.wardId, body.bedId, patient.gender);

  try {
    await prisma.$transaction(async (tx) => {
      await claimBed(tx, body.bedId);
      await tx.bedAssignment.updateMany({ where: { admissionId: id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.bed.update({ where: { id: admission.bedId }, data: { status: BedStatus.CLEANING } });
      await tx.bedAssignment.create({ data: { admissionId: id, wardId: body.wardId, bedId: body.bedId, assignedById: req.user?.id ?? null, reason: body.reason } });
      await tx.admission.update({ where: { id }, data: { wardId: body.wardId, bedId: body.bedId } });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('That bed was just taken; choose another', 409, 'BED_NOT_AVAILABLE');
    throw error;
  }
  await audit(req, 'PATIENT_TRANSFERRED', id, { fromBed: admission.bedId, toBed: body.bedId, reason: body.reason });
  return getAdmission(id);
}

export async function administer(
  id: string,
  prescriptionItemId: string,
  body: { status: AdministrationStatus; doseGiven?: string; notes?: string },
  req: Request
) {
  const admission = await loadActiveAdmission(id);
  const item = await prisma.prescriptionItem.findUnique({ where: { id: prescriptionItemId }, include: { prescription: true } });
  if (!item || item.prescription.encounterId !== admission.encounterId) throw new AppError('That medicine is not prescribed for this stay', 400, 'ITEM_NOT_ON_ADMISSION');
  if (item.prescription.status === PrescriptionStatus.CANCELLED) throw new AppError('That prescription was cancelled', 409, 'PRESCRIPTION_CANCELLED');
  if (body.status !== 'GIVEN' && !body.notes) throw new AppError('Say why the dose was not given', 400, 'REASON_REQUIRED');
  await prisma.medicationAdministration.create({
    data: {
      admissionId: id,
      prescriptionItemId,
      status: body.status,
      doseGiven: body.doseGiven ?? (body.status === 'GIVEN' ? item.dose : null),
      notes: body.notes ?? null,
      administeredById: req.user?.id ?? null
    }
  });
  await audit(req, 'MEDICATION_ADMINISTERED', id, { prescriptionItemId, status: body.status });
  return getAdmission(id);
}

type Spell = { startedAt: Date; endedAt: Date | null; ward: { id: string; name: string; dailyRate: Prisma.Decimal } };

/**
 * Midnight census: each midnight the patient spends admitted is one night,
 * charged to the ward they were on at that midnight; a stay that crosses no
 * midnight is charged one night on the ward they left from. Moving beds during
 * the day therefore never double-charges. Facility time is UTC (Africa/Accra).
 */
export function wardCharges(spells: Spell[], admittedAt: Date, dischargedAt: Date) {
  const nightsByWard = new Map<string, { ward: Spell['ward']; nights: number }>();
  const add = (ward: Spell['ward']) => {
    const entry = nightsByWard.get(ward.id) ?? { ward, nights: 0 };
    entry.nights += 1;
    nightsByWard.set(ward.id, entry);
  };
  const firstMidnight = new Date(Date.UTC(admittedAt.getUTCFullYear(), admittedAt.getUTCMonth(), admittedAt.getUTCDate() + 1));
  for (let midnight = firstMidnight; midnight <= dischargedAt; midnight = new Date(midnight.getTime() + DAY_MS)) {
    const spell = spells.find((s) => s.startedAt <= midnight && (s.endedAt ?? dischargedAt) > midnight);
    if (spell) add(spell.ward);
  }
  if (nightsByWard.size === 0 && spells.length) add(spells[spells.length - 1].ward);
  return [...nightsByWard.values()].filter((l) => l.ward.dailyRate.gt(0));
}

export async function discharge(id: string, body: { outcome: string; summary: string }, req: Request) {
  const admission = await loadActiveAdmission(id);
  const diagnoses = await prisma.diagnosis.count({ where: { encounterId: admission.encounterId } });
  if (diagnoses === 0) throw new AppError('Record at least one diagnosis before discharge', 409, 'DIAGNOSIS_REQUIRED');
  const charge = await isModuleEnabled('billing');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.bedAssignment.updateMany({ where: { admissionId: id, endedAt: null }, data: { endedAt: now } });
    await tx.bed.update({ where: { id: admission.bedId }, data: { status: BedStatus.CLEANING } });
    await tx.admission.update({
      where: { id },
      data: { status: AdmissionStatus.DISCHARGED, dischargedAt: now, dischargedById: req.user?.id ?? null, dischargeOutcome: body.outcome, dischargeSummary: body.summary }
    });
    await tx.clinicalNote.create({
      data: { type: ClinicalNoteType.DISCHARGE, plan: body.summary, encounterId: admission.encounterId, patientId: admission.patientId, authorId: req.user?.id ?? null }
    });
    await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: EncounterStatus.COMPLETED, outcome: body.outcome, completedAt: now } });

    if (charge) {
      const assignments = await tx.bedAssignment.findMany({ where: { admissionId: id }, orderBy: { startedAt: 'asc' }, include: { ward: true } });
      const lines = wardCharges(assignments, admission.admittedAt, now).map((l) => ({
        description: `${l.ward.name}: ${l.nights} night${l.nights === 1 ? '' : 's'}`,
        quantity: l.nights,
        unitPrice: l.ward.dailyRate,
        total: l.ward.dailyRate.mul(l.nights)
      }));
      if (lines.length) {
        const total = lines.reduce((sum, l) => sum.add(l.total), new Prisma.Decimal(0));
        await tx.invoice.create({
          data: {
            invoiceCode: await issueCode(tx, 'INV'),
            encounterId: admission.encounterId,
            patientId: admission.patientId,
            status: InvoiceStatus.UNPAID,
            subtotal: total,
            total,
            balance: total,
            createdById: req.user?.id ?? null,
            items: { create: lines }
          }
        });
      }
    }
  });
  await audit(req, 'PATIENT_DISCHARGED', id, { outcome: body.outcome });
  return getAdmission(id);
}

/** For admissions made in error: only before any care has been recorded. */
export async function cancelAdmission(id: string, body: { reason: string }, req: Request) {
  const admission = await loadActiveAdmission(id);
  const [notes, prescriptions, orders, administrations, vitals] = await Promise.all([
    prisma.clinicalNote.count({ where: { encounterId: admission.encounterId } }),
    prisma.prescription.count({ where: { encounterId: admission.encounterId } }),
    prisma.order.count({ where: { encounterId: admission.encounterId } }),
    prisma.medicationAdministration.count({ where: { admissionId: id } }),
    prisma.vitalSigns.count({ where: { encounterId: admission.encounterId } })
  ]);
  if (notes + prescriptions + orders + administrations + vitals > 0) {
    throw new AppError('Care has been recorded on this stay; discharge the patient instead', 409, 'ADMISSION_HAS_CARE');
  }
  await prisma.$transaction(async (tx) => {
    await tx.bedAssignment.updateMany({ where: { admissionId: id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.bed.update({ where: { id: admission.bedId }, data: { status: BedStatus.AVAILABLE } });
    await tx.admission.update({ where: { id }, data: { status: AdmissionStatus.CANCELLED, cancelReason: body.reason } });
    await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: EncounterStatus.CANCELLED, cancelReason: body.reason, completedAt: new Date() } });
  });
  await audit(req, 'ADMISSION_CANCELLED', id, { reason: body.reason });
  return getAdmission(id);
}

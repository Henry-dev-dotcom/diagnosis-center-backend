import type { Request } from 'express';
import { DiagnosisStatus, Prisma, RecordRequestStatus, RecordRequesterType, type ChartAccessPurpose } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  Medical records (Phase 4D). The full chart gathers a patient's record from
  every department in one read, and every read is logged with its purpose so
  the facility can show who looked at a record and why. Records leave the
  care team only through a release request: consent (or a court order for
  court and police requests), and approval by someone other than the person
  who logged it.
*/

const staff = { select: { id: true, name: true } } as const;

async function audit(req: Request, action: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Medical records', entityType: 'RecordRequest', entityId, details });
}

/** The whole chart. Logs the access before returning anything. */
export async function patientChart(patientId: string, query: { purpose: ChartAccessPurpose; note?: string }, req: Request) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, phone: true, address: true,
      nationalId: true, emergencyContact: true, insuranceProvider: true, policyNumber: true, createdAt: true,
      allergies: { where: { active: true }, select: { id: true, substance: true, reaction: true, severity: true } },
      deceasedRecord: { select: { caseCode: true, dateOfDeath: true, causeOfDeath: true } },
      birthRecord: { select: { delivery: { select: { deliveredAt: true, pregnancy: { select: { patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } } } } } } } }
    }
  });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  await prisma.chartAccess.create({ data: { patientId, userId: req.user?.id ?? null, purpose: query.purpose, note: query.note ?? null } });

  const [problems, encounters, admissions, surgeries, pregnancies, immunizations, prescriptions, orders] = await Promise.all([
    prisma.diagnosis.findMany({ where: { patientId, isChronic: true, status: DiagnosisStatus.ACTIVE }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true, description: true, createdAt: true } }),
    prisma.encounter.findMany({
      where: { patientId },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true, encounterCode: true, type: true, clinic: true, status: true, startedAt: true, completedAt: true, outcome: true, chiefComplaint: true,
        attending: staff,
        diagnoses: { select: { code: true, description: true, type: true } },
        _count: { select: { notes: true, forms: true, prescriptions: true, orders: true } }
      }
    }),
    prisma.admission.findMany({ where: { patientId }, orderBy: { admittedAt: 'desc' }, select: { id: true, admissionCode: true, status: true, reason: true, admittedAt: true, dischargedAt: true, dischargeOutcome: true, ward: { select: { name: true } } } }),
    prisma.surgery.findMany({ where: { patientId }, orderBy: { scheduledStart: 'desc' }, select: { id: true, surgeryCode: true, procedureName: true, status: true, scheduledStart: true, endedAt: true, surgeon: staff } }),
    prisma.pregnancy.findMany({ where: { patientId }, orderBy: { bookedAt: 'desc' }, select: { id: true, pregnancyCode: true, status: true, bookedAt: true, eddByLmp: true, eddByScan: true, gravida: true, parity: true, endReason: true, delivery: { select: { deliveredAt: true, mode: true } } } }),
    prisma.immunization.findMany({ where: { patientId, voidedAt: null }, orderBy: { givenAt: 'asc' }, select: { id: true, vaccine: true, givenAt: true, givenElsewhere: true } }),
    prisma.prescription.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, prescriptionCode: true, status: true, createdAt: true, prescriber: staff, items: { select: { drugName: true, strength: true, dose: true, frequency: true, durationDays: true } } } }),
    prisma.order.findMany({ where: { patientId }, orderBy: { submittedAt: 'desc' }, take: 50, select: { id: true, orderCode: true, status: true, submittedAt: true, items: { select: { status: true, catalogItem: { select: { name: true, type: true } } } } } })
  ]);

  const mother = patient.birthRecord?.delivery.pregnancy.patient ?? null;
  const { birthRecord: _birth, ...demographics } = patient;
  void _birth;
  return { patient: { ...demographics, mother, bornHereAt: patient.birthRecord?.delivery.deliveredAt ?? null }, problems, encounters, admissions, surgeries, pregnancies, immunizations, prescriptions, orders };
}

/** Who opened this patient's chart, and why. */
export async function accessLog(patientId: string) {
  if (!(await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const items = await prisma.chartAccess.findMany({ where: { patientId }, orderBy: { accessedAt: 'desc' }, take: 200, include: { user: { select: { id: true, name: true, role: true } } } });
  return { items };
}

/* --------------------------------------------------- release of information */

const requestInclude = {
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
  loggedBy: staff,
  decidedBy: staff,
  releasedBy: staff
} satisfies Prisma.RecordRequestInclude;

export async function listRequests(query: { status?: RecordRequestStatus; patientId?: string }) {
  const items = await prisma.recordRequest.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(query.patientId ? { patientId: query.patientId } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: requestInclude
  });
  return { items };
}

export async function logRequest(
  body: { patientId: string; requesterName: string; requesterType: RecordRequesterType; purpose: string; scope: string; consentObtained: boolean; consentReference?: string },
  req: Request
) {
  if (!(await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true } }))) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  const id = await prisma.$transaction(async (tx) => (await tx.recordRequest.create({ data: { ...body, requestCode: await nextCode(tx, 'ROI'), loggedById: req.user?.id ?? null } })).id);
  await audit(req, 'RECORD_REQUEST_LOGGED', id, { requesterType: body.requesterType });
  return prisma.recordRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
}

export async function decideRequest(id: string, body: { decision: 'APPROVE' | 'REFUSE'; note?: string; consentReference?: string }, req: Request) {
  const request = await prisma.recordRequest.findUnique({ where: { id } });
  if (!request) throw new AppError('Request not found', 404, 'RECORD_REQUEST_NOT_FOUND');
  if (request.status !== RecordRequestStatus.PENDING) throw new AppError(`This request is already ${request.status.toLowerCase()}`, 409, 'REQUEST_DECIDED');
  if (request.loggedById && request.loggedById === req.user?.id) throw new AppError('Someone other than the person who logged the request must decide it', 403, 'RECORD_SELF_APPROVAL');
  const consentReference = body.consentReference ?? request.consentReference;
  if (body.decision === 'APPROVE') {
    if (request.requesterType === RecordRequesterType.COURT_OR_POLICE) {
      if (!consentReference) throw new AppError('Record the court order or police request reference before approving', 409, 'COURT_ORDER_REQUIRED');
    } else if (!request.consentObtained) {
      throw new AppError('The patient’s written consent is needed before records are released', 409, 'CONSENT_REQUIRED');
    }
  }
  if (body.decision === 'REFUSE' && !body.note) throw new AppError('Give the reason for refusing', 400, 'NOTE_REQUIRED');
  const changed = await prisma.recordRequest.updateMany({
    where: { id, status: RecordRequestStatus.PENDING },
    data: { status: body.decision === 'APPROVE' ? RecordRequestStatus.APPROVED : RecordRequestStatus.REFUSED, decidedById: req.user?.id ?? null, decidedAt: new Date(), decisionNote: body.note ?? null, consentReference }
  });
  if (changed.count !== 1) throw new AppError('This request was just decided by someone else', 409, 'REQUEST_DECIDED');
  await audit(req, body.decision === 'APPROVE' ? 'RECORD_REQUEST_APPROVED' : 'RECORD_REQUEST_REFUSED', id, { note: body.note });
  return prisma.recordRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
}

export async function releaseRequest(id: string, body: { method: string }, req: Request) {
  const changed = await prisma.recordRequest.updateMany({
    where: { id, status: RecordRequestStatus.APPROVED },
    data: { status: RecordRequestStatus.RELEASED, releasedById: req.user?.id ?? null, releasedAt: new Date(), releaseMethod: body.method }
  });
  if (changed.count !== 1) {
    const request = await prisma.recordRequest.findUnique({ where: { id } });
    if (!request) throw new AppError('Request not found', 404, 'RECORD_REQUEST_NOT_FOUND');
    throw new AppError(request.status === RecordRequestStatus.PENDING ? 'The request must be approved before release' : `This request is ${request.status.toLowerCase()}`, 409, 'NOT_APPROVED');
  }
  await audit(req, 'RECORDS_RELEASED', id, { method: body.method });
  return prisma.recordRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
}

/** Finding a patient to open their chart. Every chart opened from here is logged. */
export async function searchPatients(query: { search: string }) {
  const q = query.search.trim();
  const items = await prisma.patient.findMany({
    where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { patientCode: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] },
    orderBy: { lastName: 'asc' },
    take: 20,
    select: { id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, gender: true }
  });
  return { items };
}

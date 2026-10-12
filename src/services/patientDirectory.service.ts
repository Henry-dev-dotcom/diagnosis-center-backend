import type { Request } from 'express';
import { AdmissionStatus, DiagnosisStatus, EncounterStatus, OrderItemStatus, Prisma, type ChartAccessPurpose } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { getPagination, paginationMeta } from './query.service.js';
import { AppError } from '../utils/appError.js';

/*
  The patient directory (the Master Patient Index) and a patient's past visits.

  It is the way into a patient's chart: finding someone by whatever the clinician has
  - a name, a phone number, a date of birth, a Ghana Card or an NHIS number - and seeing
  at a glance who has a long-term condition, who is a child, who is in a ward.

  Finding a patient reveals very little (name, age, phone, last visit). Reading what is
  in their record is a separate step, through the chart, which asks why and logs it; this
  file only reaches into a visit's contents through getVisitRecord, which logs too.
*/

export type Cohort = 'chronic' | 'paediatric' | 'older' | 'admitted' | 'recent';

const DAY = 86_400_000;
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

/** A date typed the way people type it here: 2026-03-04, 04/03/2026, 04-03-2026 or 04.03.2026 (day first). */
export function parseDateOfBirth(text: string): Date | null {
  const t = text.trim();
  let year: number;
  let month: number;
  let day: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && year > 1880 ? date : null;
}

function searchFilter(search: string): Prisma.PatientWhereInput | undefined {
  const text = search.trim();
  if (!text) return undefined;

  const tokens = text.split(/\s+/).filter(Boolean);
  // Every word must be found somewhere, so "ama boateng" finds Ama Boateng and not every Ama.
  const byWords: Prisma.PatientWhereInput = {
    AND: tokens.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' } },
        { lastName: { contains: word, mode: 'insensitive' } },
        { patientCode: { contains: word, mode: 'insensitive' } },
        { phone: { contains: word } },
        { email: { contains: word, mode: 'insensitive' } },
        { nationalId: { contains: word, mode: 'insensitive' } },
        { policyNumber: { contains: word, mode: 'insensitive' } },
        { insuranceRecords: { some: { policyNumber: { contains: word, mode: 'insensitive' } } } }
      ]
    }))
  };

  const either: Prisma.PatientWhereInput[] = [byWords];

  const dob = parseDateOfBirth(text);
  if (dob) either.push({ dateOfBirth: { gte: dob, lt: new Date(dob.getTime() + DAY) } });

  // A phone number is typed with spaces, a leading zero or +233; the digits that matter are the last nine.
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 7 && /^[\d\s+()-]+$/.test(text)) either.push({ phone: { contains: digits.slice(-9) } });

  return either.length > 1 ? { OR: either } : byWords;
}

function cohortFilter(cohort?: Cohort): Prisma.PatientWhereInput | undefined {
  switch (cohort) {
    case 'chronic':
      return { diagnoses: { some: { isChronic: true, status: DiagnosisStatus.ACTIVE } } };
    case 'paediatric':
      return { dateOfBirth: { gt: yearsAgo(18) } };
    case 'older':
      return { dateOfBirth: { lte: yearsAgo(65) } };
    case 'admitted':
      return { admissions: { some: { status: AdmissionStatus.ADMITTED } } };
    case 'recent':
      return { encounters: { some: { startedAt: { gte: new Date(Date.now() - 30 * DAY) } } } };
    default:
      return undefined;
  }
}

export async function listDirectory(query: { search?: string; cohort?: Cohort; page?: number; limit?: number }) {
  const { page, limit, skip, take } = getPagination({ page: query.page, limit: query.limit });
  const filters = [searchFilter(query.search ?? ''), cohortFilter(query.cohort)].filter(Boolean) as Prisma.PatientWhereInput[];
  const where: Prisma.PatientWhereInput = filters.length ? { AND: filters } : {};

  const [rows, total] = await prisma.$transaction([
    prisma.patient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        createdAt: true,
        _count: { select: { allergies: { where: { active: true } } } },
        diagnoses: { where: { isChronic: true, status: DiagnosisStatus.ACTIVE }, select: { description: true }, take: 3 },
        admissions: { where: { status: AdmissionStatus.ADMITTED }, select: { ward: { select: { name: true } } }, take: 1 }
      }
    }),
    prisma.patient.count({ where })
  ]);

  // The most recent visit of each patient on this page, in one query.
  const ids = rows.map((r) => r.id);
  const latest = ids.length
    ? await prisma.encounter.groupBy({ by: ['patientId'], where: { patientId: { in: ids } }, _max: { startedAt: true } })
    : [];
  const lastVisit = new Map(latest.map((l) => [l.patientId, l._max.startedAt]));

  const items = rows.map(({ _count, diagnoses, admissions, ...patient }) => ({
    ...patient,
    lastVisitAt: lastVisit.get(patient.id) ?? null,
    allergyCount: _count.allergies,
    chronicConditions: diagnoses.map((d) => d.description),
    admittedTo: admissions[0]?.ward.name ?? null
  }));

  return { items, meta: paginationMeta(total, page, limit) };
}

/* ---------------------------------------------------------------- a visit */

const staff = { select: { id: true, name: true } } as const;
const SIGNED: OrderItemStatus[] = [OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED];

/**
 * One past visit in full: every note, the vitals, diagnoses, medicines and tests with their
 * signed-off results. Reading it is a chart access, so it is logged against the patient with
 * the purpose the clinician gave when they opened the chart.
 */
export async function getVisitRecord(patientId: string, encounterId: string, query: { purpose: ChartAccessPurpose; note?: string }, req: Request) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, patientId },
    select: {
      id: true,
      encounterCode: true,
      type: true,
      clinic: true,
      status: true,
      outcome: true,
      startedAt: true,
      completedAt: true,
      chiefComplaint: true,
      attending: staff,
      vitalSigns: { orderBy: { recordedAt: 'asc' }, select: { id: true, recordedAt: true, temperatureC: true, pulseBpm: true, respiratoryRate: true, systolicBp: true, diastolicBp: true, spo2: true, weightKg: true, bloodGlucose: true, painScore: true } },
      diagnoses: { orderBy: { createdAt: 'asc' }, select: { id: true, code: true, description: true, type: true, status: true, isChronic: true } },
      notes: { orderBy: { createdAt: 'asc' }, select: { id: true, type: true, subjective: true, objective: true, assessment: true, plan: true, createdAt: true, amendsId: true, author: staff } },
      prescriptions: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, prescriptionCode: true, createdAt: true, allergyOverride: true, prescriber: staff, items: { select: { drugName: true, strength: true, dosageForm: true, dose: true, route: true, frequency: true, durationDays: true, instructions: true } } }
      },
      orders: {
        orderBy: { createdAt: 'asc' },
        select: {
          orderCode: true,
          submittedAt: true,
          items: {
            select: {
              id: true,
              status: true,
              catalogItem: { select: { name: true, type: true } },
              labResults: { where: { status: 'SIGNED_OFF' }, orderBy: { signedOffAt: 'desc' }, take: 1, select: { signedOffAt: true, interpretation: true, parameters: { orderBy: { name: 'asc' }, select: { name: true, value: true, unit: true, referenceRange: true, flag: true } } } },
              scanResults: { where: { status: 'SIGNED_OFF' }, orderBy: { signedOffAt: 'desc' }, take: 1, select: { signedOffAt: true, findings: true, impression: true } }
            }
          }
        }
      }
    }
  });
  if (!encounter) throw new AppError('That visit is not on this patient\'s record', 404, 'ENCOUNTER_NOT_FOUND');

  await prisma.chartAccess.create({
    data: { patientId, userId: req.user?.id ?? null, purpose: query.purpose, note: [`Visit ${encounter.encounterCode}`, query.note].filter(Boolean).join(': ') }
  });

  const { orders, ...visit } = encounter;
  return {
    ...visit,
    tests: orders.flatMap((order) =>
      order.items
        .filter((item) => item.status !== OrderItemStatus.CANCELLED)
        .map((item) => {
          const signed = SIGNED.includes(item.status);
          const lab = signed ? item.labResults[0] : undefined;
          const scan = signed ? item.scanResults[0] : undefined;
          return {
            id: item.id,
            orderCode: order.orderCode,
            name: item.catalogItem.name,
            kind: item.catalogItem.type,
            status: item.status,
            orderedAt: order.submittedAt,
            resultedAt: lab?.signedOffAt ?? scan?.signedOffAt ?? null,
            lab: lab ? { interpretation: lab.interpretation, parameters: lab.parameters } : null,
            scan: scan ? { findings: scan.findings, impression: scan.impression } : null
          };
        })
    ),
    open: ([EncounterStatus.WAITING_TRIAGE, EncounterStatus.WAITING_DOCTOR, EncounterStatus.IN_CONSULTATION] as EncounterStatus[]).includes(encounter.status)
  };
}

import type { Request } from 'express';
import { AdmissionStatus, FluidDirection, PrescriptionStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { listWards } from './inpatient.service.js';
import { BLOCKS, dayKey, dosesWaiting, parseFrequency, runsOn, slotState, slotWindow, validDayKey } from './medicationSchedule.js';
import { AppError } from '../utils/appError.js';

/*
  What the ward looks at all day: the whiteboard of beds, a patient's medication chart for a
  day, and their fluid balance.

  The whiteboard's coloured dots answer "does anyone need to do something for this patient?":
    red     a scheduled dose is due or overdue, or vitals are overdue
    yellow  results have come back that a doctor has not looked at yet
  They are worked out from the chart every time the board is read, so they cannot drift from it.
*/

/** How long a patient on a ward may go without observations before the board says so. */
export const VITALS_EVERY_HOURS = 6;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** A patient admitted minutes ago has not had time to be overdue for anything. */
const SETTLING_IN_MS = HOUR_MS;

const staff = { select: { id: true, name: true } } as const;

async function audit(req: Request, action: string, admissionId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Inpatient', entityType: 'Admission', entityId: admissionId, details });
}

/* ------------------------------------------------------------------ board */

export async function getBoard() {
  const now = Date.now();
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - DAY_MS));

  const { items: wards } = await listWards();
  const admissions = await prisma.admission.findMany({
    where: { status: AdmissionStatus.ADMITTED },
    select: {
      id: true,
      encounterId: true,
      admittedAt: true,
      resultsReviewedAt: true,
      reason: true,
      attending: staff,
      encounter: {
        select: {
          diagnoses: { orderBy: { createdAt: 'asc' }, take: 3, select: { description: true, type: true } },
          vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 1, select: { recordedAt: true } },
          prescriptions: {
            where: { status: { not: PrescriptionStatus.CANCELLED } },
            select: { createdAt: true, items: { select: { id: true, frequency: true, durationDays: true } } }
          }
        }
      },
      administrations: {
        where: { scheduleDate: { in: [yesterday, today] } },
        select: { prescriptionItemId: true, scheduleDate: true, scheduleBlock: true, scheduleSlot: true }
      }
    }
  });

  // Results signed off since each stay's doctor last looked: one query for the whole ward.
  const earliest = admissions.reduce((min, a) => Math.min(min, (a.resultsReviewedAt ?? a.admittedAt).getTime()), now);
  const encounterIds = admissions.map((a) => a.encounterId);
  const [labs, scans] = admissions.length
    ? await Promise.all([
        prisma.labResult.findMany({ where: { status: 'SIGNED_OFF', signedOffAt: { gt: new Date(earliest) }, orderItem: { order: { encounterId: { in: encounterIds } } } }, select: { signedOffAt: true, orderItem: { select: { order: { select: { encounterId: true } } } } } }),
        prisma.scanResult.findMany({ where: { status: 'SIGNED_OFF', signedOffAt: { gt: new Date(earliest) }, orderItem: { order: { encounterId: { in: encounterIds } } } }, select: { signedOffAt: true, orderItem: { select: { order: { select: { encounterId: true } } } } } })
      ])
    : [[], []];
  const signed = [...labs, ...scans].map((r) => ({ at: r.signedOffAt?.getTime() ?? 0, encounterId: r.orderItem.order.encounterId }));

  const byAdmission = new Map(admissions.map((a) => {
    const items = a.encounter.prescriptions.flatMap((rx) => rx.items.map((i) => ({ id: i.id, frequency: i.frequency, prescribedAt: rx.createdAt, durationDays: i.durationDays })));
    const { due, overdue } = dosesWaiting(items, a.administrations, now);
    const lastVitals = a.encounter.vitalSigns[0]?.recordedAt.getTime() ?? null;
    const settled = now - a.admittedAt.getTime() > SETTLING_IN_MS;
    const vitalsDue = settled && (lastVitals === null || now - lastVitals > VITALS_EVERY_HOURS * HOUR_MS);
    const since = (a.resultsReviewedAt ?? a.admittedAt).getTime();
    const newResults = signed.filter((r) => r.encounterId === a.encounterId && r.at > since).length;
    const primary = a.encounter.diagnoses.find((d) => d.type === 'PRIMARY') ?? a.encounter.diagnoses[0];
    const admittedDay = new Date(`${dayKey(a.admittedAt)}T00:00:00.000Z`).getTime();
    return [a.id, {
      diagnosis: primary?.description ?? a.reason,
      dayNumber: Math.floor((new Date(`${today}T00:00:00.000Z`).getTime() - admittedDay) / DAY_MS) + 1,
      attending: a.attending,
      flags: { dosesDue: due, dosesOverdue: overdue, vitalsDue, newResults }
    }] as const;
  }));

  return {
    vitalsEveryHours: VITALS_EVERY_HOURS,
    items: wards.map((ward) => ({
      ...ward,
      beds: ward.beds.map((bed) => ({
        ...bed,
        admission: bed.admission ? { ...bed.admission, ...byAdmission.get(bed.admission.id) } : null
      }))
    }))
  };
}

/* ------------------------------------------------------- medication chart */

export async function getMedicationChart(admissionId: string, requestedDay?: string) {
  const now = Date.now();
  const day = requestedDay ?? dayKey(new Date(now));
  if (!validDayKey(day)) throw new AppError('That is not a date', 400, 'INVALID_DATE');

  const admission = await prisma.admission.findUnique({
    where: { id: admissionId },
    select: { id: true, status: true, encounterId: true, admittedAt: true, dischargedAt: true, patient: { select: { id: true, firstName: true, lastName: true, allergies: { where: { active: true }, select: { substance: true, reaction: true } } } } }
  });
  if (!admission) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');

  const items = await prisma.prescriptionItem.findMany({
    where: { prescription: { encounterId: admission.encounterId, status: { not: PrescriptionStatus.CANCELLED } } },
    orderBy: [{ prescription: { createdAt: 'asc' } }, { drugName: 'asc' }],
    include: { prescription: { select: { createdAt: true, prescriptionCode: true, prescriber: staff } } }
  });

  const dayStartMs = new Date(`${day}T00:00:00.000Z`).getTime();
  const recorded = await prisma.medicationAdministration.findMany({
    where: { admissionId, OR: [{ scheduleDate: day }, { scheduleDate: null, administeredAt: { gte: new Date(dayStartMs), lt: new Date(dayStartMs + DAY_MS) } }] },
    orderBy: { administeredAt: 'asc' },
    include: { administeredBy: staff }
  });
  const shape = (r: (typeof recorded)[number]) => ({ id: r.id, status: r.status, doseGiven: r.doseGiven, notes: r.notes, administeredAt: r.administeredAt, administeredBy: r.administeredBy });

  const rows = items
    .map((item) => {
      const prescribedAt = item.prescription.createdAt;
      const schedule = parseFrequency(item.frequency);
      const running = runsOn(day, prescribedAt, item.durationDays);
      const slots = running
        ? schedule.slots.map(({ block, slot }) => {
            const hit = recorded.find((r) => r.prescriptionItemId === item.id && r.scheduleDate === day && r.scheduleBlock === block && r.scheduleSlot === slot);
            return { block, slot, state: slotState(day, block, prescribedAt, now, Boolean(hit)), administration: hit ? shape(hit) : null };
          })
        : [];
      const extra = recorded.filter((r) => r.prescriptionItemId === item.id && r.scheduleDate === null).map(shape);
      return {
        itemId: item.id,
        prescriptionCode: item.prescription.prescriptionCode,
        prescribedAt,
        prescriber: item.prescription.prescriber,
        drugName: item.drugName,
        strength: item.strength,
        dosageForm: item.dosageForm,
        dose: item.dose,
        route: item.route,
        frequency: item.frequency,
        instructions: item.instructions,
        durationDays: item.durationDays,
        asNeeded: schedule.asNeeded,
        running,
        slots,
        extra
      };
    })
    // A medicine whose course is over does not clutter today's chart, unless it was given today.
    .filter((row) => row.running || row.extra.length > 0 || row.slots.some((s) => s.administration));

  return {
    admissionId,
    patient: admission.patient,
    open: admission.status === AdmissionStatus.ADMITTED,
    day,
    today: dayKey(new Date(now)),
    blocks: BLOCKS.map((block) => ({ block, ...slotWindow(day, block) })),
    rows
  };
}

/* ------------------------------------------------------- results reviewed */

export async function markResultsReviewed(admissionId: string, req: Request) {
  const admission = await prisma.admission.findUnique({ where: { id: admissionId }, select: { id: true, status: true } });
  if (!admission) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  if (admission.status !== AdmissionStatus.ADMITTED) throw new AppError('This stay has ended and can no longer be changed', 409, 'ADMISSION_CLOSED');
  const reviewedAt = new Date();
  await prisma.admission.update({ where: { id: admissionId }, data: { resultsReviewedAt: reviewedAt } });
  await audit(req, 'ADMISSION_RESULTS_REVIEWED', admissionId);
  return { resultsReviewedAt: reviewedAt };
}

/* ---------------------------------------------------------- fluid balance */

export async function recordFluid(
  admissionId: string,
  body: { direction: FluidDirection; kind: string; volumeMl: number; note?: string; recordedAt?: Date },
  req: Request
) {
  const admission = await prisma.admission.findUnique({ where: { id: admissionId }, select: { id: true, status: true, admittedAt: true } });
  if (!admission) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  if (admission.status !== AdmissionStatus.ADMITTED) throw new AppError('This stay has ended and can no longer be changed', 409, 'ADMISSION_CLOSED');

  const recordedAt = body.recordedAt ?? new Date();
  if (recordedAt.getTime() > Date.now() + 5 * 60_000) throw new AppError('A measurement cannot be in the future', 400, 'FUTURE_MEASUREMENT');
  if (recordedAt.getTime() < admission.admittedAt.getTime()) throw new AppError('That is from before the patient was admitted', 400, 'BEFORE_ADMISSION');

  const entry = await prisma.fluidBalanceEntry.create({
    data: { admissionId, direction: body.direction, kind: body.kind, volumeMl: body.volumeMl, note: body.note ?? null, recordedAt, recordedById: req.user?.id ?? null },
    include: { recordedBy: staff }
  });
  await audit(req, 'FLUID_BALANCE_RECORDED', admissionId, { direction: body.direction, kind: body.kind, volumeMl: body.volumeMl });
  return entry;
}

export async function listFluids(admissionId: string, days: number) {
  if (!(await prisma.admission.findUnique({ where: { id: admissionId }, select: { id: true } }))) throw new AppError('Admission not found', 404, 'ADMISSION_NOT_FOUND');
  const since = new Date(`${dayKey(new Date(Date.now() - (days - 1) * DAY_MS))}T00:00:00.000Z`);
  const items = await prisma.fluidBalanceEntry.findMany({ where: { admissionId, recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, include: { recordedBy: staff } });

  const byDay = new Map<string, { day: string; intake: number; output: number }>();
  for (let i = 0; i < days; i += 1) {
    const day = dayKey(new Date(Date.now() - i * DAY_MS));
    byDay.set(day, { day, intake: 0, output: 0 });
  }
  for (const e of items) {
    const total = byDay.get(dayKey(e.recordedAt));
    if (!total) continue;
    if (e.direction === FluidDirection.INTAKE) total.intake += e.volumeMl;
    else total.output += e.volumeMl;
  }
  return { items, totals: [...byDay.values()].map((t) => ({ ...t, balance: t.intake - t.output })) };
}


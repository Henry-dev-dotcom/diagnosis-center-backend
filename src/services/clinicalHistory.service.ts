import { OrderItemStatus, type Prisma } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { AppError } from '../utils/appError.js';

/*
  A patient's clinical history, one visit at a time.

  Feeds two places in the clinician's workspace: the quick-peek sidebar (the last few
  visits' diagnoses and results) and the Investigations tab (every result on the left,
  including the current visit's, which is how a doctor reviews what came back).

  A result's values are only included once the laboratory or imaging unit has signed it
  off. Until then the doctor sees that the test was ordered and how far it has got, but
  never a draft that could still change.
*/

const SIGNED: OrderItemStatus[] = [OrderItemStatus.SIGNED_OFF, OrderItemStatus.FINAL_RELEASED];
const staff = { select: { id: true, name: true } } as const;

export async function getClinicalHistory(patientId: string, limit: number) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');

  const encounters = await prisma.encounter.findMany({
    where: { patientId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      encounterCode: true,
      type: true,
      clinic: true,
      status: true,
      outcome: true,
      startedAt: true,
      completedAt: true,
      suspendedAt: true,
      chiefComplaint: true,
      attending: staff,
      diagnoses: { orderBy: { createdAt: 'asc' }, select: { id: true, code: true, description: true, type: true, status: true } },
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, type: true, subjective: true, objective: true, assessment: true, plan: true, createdAt: true, author: staff }
      },
      prescriptions: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, prescriptionCode: true, createdAt: true, items: { select: { drugName: true, strength: true, dose: true, route: true, frequency: true, durationDays: true } } }
      },
      orders: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          orderCode: true,
          submittedAt: true,
          items: {
            select: {
              id: true,
              status: true,
              completedAt: true,
              catalogItem: { select: { name: true, type: true } },
              labResults: {
                where: { status: 'SIGNED_OFF' },
                orderBy: { signedOffAt: 'desc' },
                take: 1,
                select: {
                  signedOffAt: true,
                  interpretation: true,
                  parameters: { orderBy: { name: 'asc' }, select: { name: true, value: true, unit: true, referenceRange: true, flag: true } }
                }
              },
              scanResults: {
                where: { status: 'SIGNED_OFF' },
                orderBy: { signedOffAt: 'desc' },
                take: 1,
                select: { signedOffAt: true, findings: true, impression: true }
              }
            }
          }
        }
      }
    } satisfies Prisma.EncounterSelect
  });

  return {
    patientId,
    encounters: encounters.map(({ orders, ...encounter }) => ({
      ...encounter,
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
      )
    }))
  };
}

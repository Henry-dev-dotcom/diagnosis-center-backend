import { AdministrationStatus, AdmissionStatus, BedStatus, WardGender, WardType } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const bedLabels = z.array(z.string().trim().min(1).max(20)).max(200);

export const createWardSchema = z.object({
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Ward name is required').max(120),
  type: z.nativeEnum(WardType).default(WardType.GENERAL),
  gender: z.nativeEnum(WardGender).default(WardGender.MIXED),
  dailyRate: z.coerce.number().min(0).max(1_000_000).default(0),
  beds: bedLabels.optional()
});

export const updateWardSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: z.nativeEnum(WardType).optional(),
    gender: z.nativeEnum(WardGender).optional(),
    dailyRate: z.coerce.number().min(0).max(1_000_000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), { message: 'Nothing to update' });

export const addBedsSchema = z.object({ labels: bedLabels.min(1, 'Add at least one bed') });

export const bedStatusSchema = z.object({ status: z.nativeEnum(BedStatus) });

export const admissionQuerySchema = z.object({
  status: z.nativeEnum(AdmissionStatus).optional(),
  wardId: z.string().min(1).optional()
});

export const admitSchema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  wardId: z.string().min(1, 'Choose a ward'),
  bedId: z.string().min(1, 'Choose a bed'),
  reason: z.string().trim().min(3, 'Give the reason for admission').max(500),
  // The OPD or emergency visit the decision to admit was made in.
  sourceEncounterId: z.string().min(1).optional(),
  expectedDischargeAt: z.coerce.date().optional()
});

export const transferSchema = z.object({
  wardId: z.string().min(1, 'Choose a ward'),
  bedId: z.string().min(1, 'Choose a bed'),
  reason: z.string().trim().min(3, 'Give a reason').max(300)
});

export const administerSchema = z.object({
  status: z.nativeEnum(AdministrationStatus),
  doseGiven: optionalText(60),
  notes: optionalText(500)
});

export const dischargeSchema = z.object({
  outcome: z.enum(['DISCHARGED_HOME', 'REFERRED', 'DISCHARGED_AGAINST_ADVICE', 'ABSCONDED', 'DECEASED']).default('DISCHARGED_HOME'),
  summary: z.string().trim().min(10, 'Write a discharge summary').max(5000)
});

export const cancelAdmissionSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const admissionItemParamSchema = z.object({ id: z.string().min(1), itemId: z.string().min(1) });

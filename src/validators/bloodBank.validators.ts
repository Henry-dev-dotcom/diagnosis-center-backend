import { BloodComponent, BloodRequestStatus, BloodRequestUrgency, BloodUnitStatus, TransfusionReaction } from '@prisma/client';
import { z } from 'zod';
import { BLOOD_GROUPS } from '../services/bloodCompatibility.js';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const group = z.enum(BLOOD_GROUPS);
const screen = z.enum(['POSITIVE', 'NEGATIVE']);

export const donorQuerySchema = z.object({ search: optionalText(80) });
export const donorSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Surname is required').max(80),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(['Male', 'Female']),
  phone: optionalText(40)
});
export const deferSchema = z.object({ until: z.coerce.date(), reason: z.string().trim().min(3, 'Give the reason').max(300) });
export const donationSchema = z
  .object({
    bloodGroup: group,
    volumeMl: z.coerce.number().int().min(300).max(550),
    haemoglobin: z.coerce.number().min(5).max(22),
    weightKg: z.coerce.number().min(30).max(250),
    // What the donation is processed into.
    components: z.array(z.nativeEnum(BloodComponent)).min(1).max(4)
  })
  .refine((v) => new Set(v.components).size === v.components.length, { message: 'Each component once', path: ['components'] })
  .refine((v) => !v.components.includes('WHOLE_BLOOD') || v.components.length === 1, { message: 'Whole blood is not split into components', path: ['components'] });
// All four markers are required: a unit is never released on a partial screen.
export const screeningSchema = z.object({ hiv: screen, hepatitisB: screen, hepatitisC: screen, syphilis: screen });

export const unitQuerySchema = z.object({ status: z.nativeEnum(BloodUnitStatus).optional(), bloodGroup: group.optional(), component: z.nativeEnum(BloodComponent).optional() });
export const discardSchema = z.object({ reason: z.string().trim().min(3, 'Give the reason').max(300) });

export const requestQuerySchema = z.object({ status: z.nativeEnum(BloodRequestStatus).optional(), patientId: z.string().min(1).optional() });
export const bloodRequestSchema = z.object({
  patientId: z.string().min(1, 'Choose the patient'),
  encounterId: z.string().min(1).optional(),
  patientGroup: group,
  component: z.nativeEnum(BloodComponent),
  unitsRequested: z.coerce.number().int().min(1).max(20),
  urgency: z.nativeEnum(BloodRequestUrgency).default(BloodRequestUrgency.ROUTINE),
  indication: z.string().trim().min(3, 'Give the indication').max(500),
  haemoglobin: z.coerce.number().min(1).max(22).optional()
});
export const crossmatchSchema = z.object({ unitId: z.string().min(1), compatible: z.boolean(), notes: optionalText(300) });
export const issueSchema = z.object({ unitId: z.string().min(1) });
export const emergencySchema = z.object({ unitId: z.string().min(1), reason: z.string().trim().min(5, 'Say why blood cannot wait for a crossmatch').max(300) });
export const transfusionSchema = z
  .object({ startedAt: z.coerce.date().optional(), endedAt: z.coerce.date().optional(), reaction: z.nativeEnum(TransfusionReaction).optional(), reactionNotes: optionalText(1000) })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to record' });
export const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

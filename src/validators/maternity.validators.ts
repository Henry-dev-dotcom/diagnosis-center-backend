import { BirthOutcome, DeliveryMode, PerinealOutcome, PregnancyEndReason, PregnancyStatus } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const day = z.coerce.date();

const RISK_FACTORS = [
  'PREVIOUS_CAESAREAN', 'PREVIOUS_STILLBIRTH', 'PREVIOUS_PPH', 'GRAND_MULTIPARA', 'TEENAGE', 'ADVANCED_AGE', 'HYPERTENSION', 'DIABETES',
  'SICKLE_CELL', 'HIV', 'MULTIPLE_PREGNANCY', 'SHORT_STATURE', 'PREVIOUS_PRETERM', 'RHESUS_NEGATIVE', 'OTHER'
] as const;
const SCREEN_RESULT = z.enum(['POSITIVE', 'NEGATIVE', 'NOT_DONE']);

export const pregnancyQuerySchema = z.object({
  status: z.nativeEnum(PregnancyStatus).optional(),
  patientId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const pregnancyFields = {
  lmp: day.optional(),
  eddByScan: day.optional(),
  gravida: z.coerce.number().int().min(1).max(25),
  parity: z.coerce.number().int().min(0).max(24),
  livingChildren: z.coerce.number().int().min(0).max(24).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  riskFactors: z.array(z.enum(RISK_FACTORS)).max(RISK_FACTORS.length).default([]),
  screening: z
    .object({ hiv: SCREEN_RESULT.optional(), syphilis: SCREEN_RESULT.optional(), hepatitisB: SCREEN_RESULT.optional(), sickling: SCREEN_RESULT.optional(), malariaRdt: SCREEN_RESULT.optional() })
    .default({})
};

export const registerPregnancySchema = z
  .object({ patientId: z.string().min(1, 'Choose the patient'), ...pregnancyFields })
  .refine((v) => v.lmp || v.eddByScan, { message: 'Give the last menstrual period or a scan due date', path: ['lmp'] })
  .refine((v) => v.parity < v.gravida, { message: 'Parity must be less than gravida (this pregnancy counts in gravida)', path: ['parity'] });

export const updatePregnancySchema = z
  .object({
    eddByScan: day.optional(),
    bloodGroup: pregnancyFields.bloodGroup,
    riskFactors: z.array(z.enum(RISK_FACTORS)).max(RISK_FACTORS.length).optional(),
    screening: pregnancyFields.screening.optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export const endPregnancySchema = z.object({
  reason: z.nativeEnum(PregnancyEndReason),
  endedAt: day.optional(),
  note: optionalText(1000)
});

export const deliverySchema = z.object({
  // The visit or labour-ward stay the delivery is recorded in.
  encounterId: z.string().min(1, 'Choose the visit or stay'),
  deliveredAt: z.coerce.date(),
  mode: z.nativeEnum(DeliveryMode),
  gestationWeeks: z.coerce.number().int().min(20).max(45).optional(),
  placentaComplete: z.boolean().default(true),
  bloodLossMl: z.coerce.number().int().min(0).max(10000).optional(),
  perineum: z.nativeEnum(PerinealOutcome).optional(),
  oxytocinGiven: z.boolean().default(false),
  complications: optionalText(2000),
  notes: optionalText(2000),
  babies: z
    .array(
      z.object({
        sex: z.enum(['MALE', 'FEMALE', 'UNDETERMINED']),
        outcome: z.nativeEnum(BirthOutcome),
        birthWeightG: z.coerce.number().int().min(300).max(7000).optional(),
        apgar1: z.coerce.number().int().min(0).max(10).optional(),
        apgar5: z.coerce.number().int().min(0).max(10).optional(),
        resuscitated: z.boolean().default(false),
        notes: optionalText(500)
      })
    )
    .min(1, 'Record at least one baby')
    .max(6)
});

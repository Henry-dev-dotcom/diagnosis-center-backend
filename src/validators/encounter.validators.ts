import { AllergySeverity, DiagnosisType, EncounterStatus, EncounterType, OrderUrgency, TriageLevel } from '@prisma/client';
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((value) => (value ? value : undefined));

export const encounterQuerySchema = z.object({
  status: z.union([z.nativeEnum(EncounterStatus), z.literal('ACTIVE')]).optional(),
  type: z.nativeEnum(EncounterType).optional(),
  patientId: z.string().min(1).optional(),
  // Encounters started on this calendar day (YYYY-MM-DD, facility time is UTC for now).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const startEncounterSchema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  type: z.nativeEnum(EncounterType).default(EncounterType.OPD),
  chiefComplaint: optionalText(500),
  visitId: z.string().min(1).optional(),
  // A SERVICE catalog item (e.g. OPD consultation) charged when the visit starts.
  feeItemId: z.string().min(1).optional()
});

// Plausible physiological ranges; they catch typing slips, not clinical abnormality.
export const vitalsSchema = z
  .object({
    temperatureC: z.coerce.number().min(25).max(45).optional(),
    pulseBpm: z.coerce.number().int().min(20).max(250).optional(),
    respiratoryRate: z.coerce.number().int().min(4).max(80).optional(),
    systolicBp: z.coerce.number().int().min(40).max(300).optional(),
    diastolicBp: z.coerce.number().int().min(20).max(200).optional(),
    spo2: z.coerce.number().int().min(40).max(100).optional(),
    weightKg: z.coerce.number().min(0.3).max(400).optional(),
    heightCm: z.coerce.number().min(20).max(260).optional(),
    painScore: z.coerce.number().int().min(0).max(10).optional(),
    bloodGlucose: z.coerce.number().min(0.5).max(60).optional(),
    notes: optionalText(1000),
    // Triage is recorded with the vitals; completing it sends the patient to the doctor queue.
    triageLevel: z.nativeEnum(TriageLevel).optional(),
    completeTriage: z.boolean().default(false)
  })
  .refine((v) => [v.temperatureC, v.pulseBpm, v.respiratoryRate, v.systolicBp, v.diastolicBp, v.spo2, v.weightKg, v.heightCm, v.painScore, v.bloodGlucose].some((x) => x !== undefined), {
    message: 'Record at least one vital sign'
  })
  .refine((v) => (v.systolicBp === undefined) === (v.diastolicBp === undefined), {
    message: 'Record both systolic and diastolic blood pressure',
    path: ['diastolicBp']
  })
  .refine((v) => !v.completeTriage || v.triageLevel !== undefined, {
    message: 'Choose a triage level to complete triage',
    path: ['triageLevel']
  });

export const noteSchema = z
  .object({
    subjective: optionalText(5000),
    objective: optionalText(5000),
    assessment: optionalText(5000),
    plan: optionalText(5000),
    // A correction of an earlier note on the same encounter.
    amendsId: z.string().min(1).optional()
  })
  .refine((v) => Boolean(v.subjective || v.objective || v.assessment || v.plan), { message: 'The note is empty' });

export const diagnosisSchema = z.object({
  code: optionalText(12),
  description: text(300).min(2, 'Diagnosis is required'),
  type: z.nativeEnum(DiagnosisType).default(DiagnosisType.PRIMARY),
  isChronic: z.boolean().default(false)
});

export const encounterOrderSchema = z.object({
  items: z.array(z.object({ catalogItemId: z.string().min(1), notes: optionalText(500) })).min(1, 'Choose at least one test or scan'),
  urgency: z.nativeEnum(OrderUrgency).default(OrderUrgency.ROUTINE),
  notes: optionalText(2000)
});

export const prescriptionSchema = z.object({
  notes: optionalText(1000),
  items: z
    .array(
      z.object({
        drugName: text(160).min(2, 'Drug name is required'),
        strength: optionalText(60),
        dosageForm: optionalText(60),
        dose: text(60).min(1, 'Dose is required'),
        route: text(40).min(1, 'Route is required'),
        frequency: text(60).min(1, 'Frequency is required'),
        durationDays: z.coerce.number().int().min(1).max(365).optional(),
        quantity: z.coerce.number().int().min(1).max(10000).optional(),
        instructions: optionalText(500)
      })
    )
    .min(1, 'Add at least one medicine')
    .max(30)
});

export const completeEncounterSchema = z.object({
  outcome: z.enum(['DISCHARGED', 'REFERRED', 'ADMITTED', 'DECEASED']).default('DISCHARGED'),
  summary: optionalText(5000)
});

export const cancelSchema = z.object({ reason: text(500).min(3, 'Give a reason') });

export const allergySchema = z.object({
  substance: text(120).min(2, 'Substance is required'),
  reaction: optionalText(240),
  severity: z.nativeEnum(AllergySeverity).default(AllergySeverity.MODERATE)
});

export const updateAllergySchema = z.object({ active: z.boolean() });

export const icd10QuerySchema = z.object({ q: z.string().trim().max(80).default('') });

export const subIdParamSchema = z.object({ id: z.string().min(1), subId: z.string().min(1) });

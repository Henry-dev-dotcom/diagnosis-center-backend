import { ClinicalFormType } from '@prisma/client';
import { z } from 'zod';

/*
  One schema per clinical form type. The form's data column is JSON, so this
  is the only thing standing between the database and malformed findings:
  every field is bounded and unknown keys are stripped.
*/

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : undefined));

// FDI two-digit tooth numbers: permanent quadrants 1-4 (teeth 1-8), primary quadrants 5-8 (teeth 1-5).
export const FDI_TEETH = [
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((t) => `${q}${t}`)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((t) => `${q}${t}`))
] as const;

const TOOTH_CONDITIONS = ['SOUND', 'CARIES', 'FILLED', 'MISSING', 'EXTRACTION_NEEDED', 'ROOT_CANAL_NEEDED', 'ROOT_CANAL_TREATED', 'CROWN', 'FRACTURED', 'MOBILE', 'IMPACTED', 'UNERUPTED'] as const;
const SURFACES = ['M', 'O', 'D', 'B', 'L', 'I'] as const;

const dentalChart = z
  .object({
    teeth: z
      .array(
        z.object({
          tooth: z.enum(FDI_TEETH as unknown as [string, ...string[]]),
          condition: z.enum(TOOTH_CONDITIONS),
          surfaces: z.array(z.enum(SURFACES)).max(6).optional(),
          note: optionalText(200)
        })
      )
      .max(52),
    oralHygiene: z.enum(['GOOD', 'FAIR', 'POOR']).optional(),
    gums: optionalText(500),
    treatmentsDone: z.array(z.object({ tooth: z.enum(FDI_TEETH as unknown as [string, ...string[]]).optional(), procedure: text(200).min(2) })).max(40).default([]),
    treatmentPlan: optionalText(2000),
    notes: optionalText(2000)
  })
  .refine((v) => new Set(v.teeth.map((t) => t.tooth)).size === v.teeth.length, { message: 'Each tooth can appear only once on a chart', path: ['teeth'] })
  .refine((v) => v.teeth.length > 0 || v.treatmentsDone.length > 0 || v.notes, { message: 'Chart at least one tooth, treatment or note' });

// Snellen (metric 6/x or imperial 20/x), or the low-vision grades.
const acuity = z.string().trim().toUpperCase().regex(/^((6|20)\/\d{1,3}|CF|HM|PL|NPL)$/, 'Use 6/6-style Snellen values, or CF, HM, PL, NPL');
const eyeSide = z.object({
  unaided: acuity.optional(),
  corrected: acuity.optional(),
  pinhole: acuity.optional(),
  iopMmHg: z.coerce.number().min(1).max(80).optional(),
  anteriorSegment: optionalText(500),
  fundus: optionalText(500),
  sphere: z.coerce.number().min(-30).max(30).multipleOf(0.25).optional(),
  cylinder: z.coerce.number().min(-10).max(10).multipleOf(0.25).optional(),
  axis: z.coerce.number().int().min(0).max(180).optional(),
  add: z.coerce.number().min(0).max(4).multipleOf(0.25).optional()
});
const eyeExam = z
  .object({
    right: eyeSide,
    left: eyeSide,
    iopMethod: z.enum(['NON_CONTACT', 'APPLANATION', 'SCHIOTZ', 'PALPATION']).optional(),
    glassesPrescribed: z.boolean().default(false),
    impression: optionalText(1000),
    plan: optionalText(2000)
  })
  .refine((v) => [v.right, v.left].some((side) => Object.values(side).some((x) => x !== undefined)), { message: 'Record findings for at least one eye' })
  .refine((v) => [v.right, v.left].every((side) => (side.cylinder === undefined) === (side.axis === undefined)), { message: 'A cylinder needs an axis (and an axis needs a cylinder)' });

const physioAssessment = z.object({
  presentingComplaint: text(1000).min(3, 'Describe the presenting complaint'),
  affectedArea: text(200).min(2, 'Name the affected area'),
  painScore: z.coerce.number().int().min(0).max(10).optional(),
  rangeOfMotion: optionalText(1000),
  muscleStrength: optionalText(1000),
  functionalLimitations: optionalText(1000),
  specialTests: optionalText(1000),
  goals: text(1000).min(3, 'Set the treatment goals'),
  plannedSessions: z.coerce.number().int().min(1).max(100).optional(),
  plan: optionalText(2000)
});

const physioSession = z.object({
  sessionNumber: z.coerce.number().int().min(1).max(200).optional(),
  treatments: z.array(text(200).min(2)).min(1, 'Record at least one treatment').max(20),
  painBefore: z.coerce.number().int().min(0).max(10).optional(),
  painAfter: z.coerce.number().int().min(0).max(10).optional(),
  response: optionalText(1000),
  homeExercises: optionalText(1000),
  nextSession: optionalText(200)
});

const nutritionAssessment = z.object({
  weightKg: z.coerce.number().min(0.3).max(400),
  heightCm: z.coerce.number().min(20).max(260).optional(),
  muacCm: z.coerce.number().min(5).max(60).optional(),
  oedema: z.enum(['NONE', 'MILD', 'MODERATE', 'SEVERE']).default('NONE'),
  dietHistory: optionalText(2000),
  nutritionDiagnosis: text(500).min(3, 'Give a nutrition diagnosis'),
  plan: text(2000).min(3, 'Write the diet plan'),
  followUpWeeks: z.coerce.number().int().min(1).max(52).optional()
});

export const FORM_SCHEMAS: Record<ClinicalFormType, z.ZodTypeAny> = {
  [ClinicalFormType.DENTAL_CHART]: dentalChart,
  [ClinicalFormType.EYE_EXAM]: eyeExam,
  [ClinicalFormType.PHYSIO_ASSESSMENT]: physioAssessment,
  [ClinicalFormType.PHYSIO_SESSION]: physioSession,
  [ClinicalFormType.NUTRITION_ASSESSMENT]: nutritionAssessment
};

// The envelope; the data itself is checked against FORM_SCHEMAS[type] in the service.
export const clinicalFormSchema = z.object({
  type: z.nativeEnum(ClinicalFormType),
  data: z.record(z.unknown()),
  amendsId: z.string().min(1).optional()
});

export const patientFormsQuerySchema = z.object({
  type: z.nativeEnum(ClinicalFormType).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

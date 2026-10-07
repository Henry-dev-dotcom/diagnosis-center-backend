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

const bothOrNeither = (a?: number, b?: number) => (a === undefined) === (b === undefined);
const URINE = z.enum(['NEGATIVE', 'TRACE', '1+', '2+', '3+', '4+']);
const DANGER_SIGNS = ['VAGINAL_BLEEDING', 'SEVERE_HEADACHE', 'BLURRED_VISION', 'CONVULSIONS', 'SEVERE_ABDOMINAL_PAIN', 'FEVER', 'REDUCED_FETAL_MOVEMENT', 'LEAKING_LIQUOR', 'SWELLING_FACE_HANDS', 'DIFFICULTY_BREATHING'] as const;

const ancVisit = z
  .object({
    weightKg: z.coerce.number().min(25).max(250).optional(),
    bpSystolic: z.coerce.number().int().min(60).max(260).optional(),
    bpDiastolic: z.coerce.number().int().min(30).max(180).optional(),
    fundalHeightCm: z.coerce.number().min(5).max(50).optional(),
    presentation: z.enum(['CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE', 'NOT_DETERMINED']).optional(),
    lie: z.enum(['LONGITUDINAL', 'TRANSVERSE', 'OBLIQUE']).optional(),
    fetalHeartRate: z.coerce.number().int().min(50).max(240).optional(),
    fetalMovements: z.enum(['PRESENT', 'REDUCED', 'ABSENT']).optional(),
    oedema: z.enum(['NONE', 'FEET', 'LEGS', 'GENERALISED']).optional(),
    urineProtein: URINE.optional(),
    urineGlucose: URINE.optional(),
    haemoglobin: z.coerce.number().min(2).max(22).optional(),
    // Intermittent preventive treatment of malaria (SP) and tetanus-diphtheria doses given today.
    iptpSpDose: z.coerce.number().int().min(1).max(5).optional(),
    tdDose: z.coerce.number().int().min(1).max(5).optional(),
    llinGiven: z.boolean().default(false),
    ironFolateGiven: z.boolean().default(false),
    dangerSigns: z.array(z.enum(DANGER_SIGNS)).max(DANGER_SIGNS.length).default([]),
    complaints: optionalText(1000),
    plan: optionalText(2000),
    nextVisit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .refine((v) => bothOrNeither(v.bpSystolic, v.bpDiastolic), { message: 'Record both systolic and diastolic blood pressure', path: ['bpDiastolic'] })
  .refine((v) => [v.weightKg, v.bpSystolic, v.fundalHeightCm, v.fetalHeartRate, v.haemoglobin, v.urineProtein, v.presentation].some((x) => x !== undefined) || v.dangerSigns.length > 0 || v.complaints, { message: 'Record at least one finding' });

const postnatalCheck = z.object({
  mother: z
    .object({
      bpSystolic: z.coerce.number().int().min(60).max(260).optional(),
      bpDiastolic: z.coerce.number().int().min(30).max(180).optional(),
      temperatureC: z.coerce.number().min(30).max(43).optional(),
      pulseBpm: z.coerce.number().int().min(30).max(220).optional(),
      uterus: z.enum(['WELL_CONTRACTED', 'BOGGY', 'TENDER', 'INVOLUTED']).optional(),
      lochia: z.enum(['NORMAL', 'HEAVY', 'OFFENSIVE', 'NONE']).optional(),
      perineum: z.enum(['HEALING', 'INFECTED', 'BREAKDOWN', 'NOT_APPLICABLE']).optional(),
      breastfeeding: z.enum(['EXCLUSIVE', 'MIXED', 'NOT_BREASTFEEDING']).optional(),
      mood: z.enum(['WELL', 'LOW', 'CONCERN']).optional()
    })
    .refine((m) => bothOrNeither(m.bpSystolic, m.bpDiastolic), { message: 'Record both systolic and diastolic blood pressure' }),
  baby: z
    .object({
      weightG: z.coerce.number().int().min(300).max(8000).optional(),
      temperatureC: z.coerce.number().min(30).max(43).optional(),
      feeding: z.enum(['GOOD', 'POOR']).optional(),
      cord: z.enum(['CLEAN', 'INFECTED', 'SEPARATED']).optional(),
      jaundice: z.enum(['NONE', 'MILD', 'SEVERE']).optional()
    })
    .optional(),
  familyPlanningCounselled: z.boolean().default(false),
  familyPlanningMethod: optionalText(120),
  plan: optionalText(2000)
});

const growth = z.object({
  weightKg: z.coerce.number().min(0.3).max(60),
  lengthCm: z.coerce.number().min(25).max(150).optional(),
  // Recumbent length under 2 years, standing height after.
  measuredLying: z.boolean().optional(),
  headCircumferenceCm: z.coerce.number().min(20).max(60).optional(),
  muacCm: z.coerce.number().min(5).max(30).optional(),
  oedema: z.enum(['NONE', 'MILD', 'MODERATE', 'SEVERE']).default('NONE'),
  feeding: z.enum(['EXCLUSIVE_BREASTFEEDING', 'MIXED', 'COMPLEMENTARY', 'FAMILY_FOOD']).optional(),
  milestones: optionalText(1000),
  counselling: optionalText(1000),
  vitaminAGiven: z.boolean().default(false),
  dewormingGiven: z.boolean().default(false)
});

export const FORM_SCHEMAS: Record<ClinicalFormType, z.ZodTypeAny> = {
  [ClinicalFormType.DENTAL_CHART]: dentalChart,
  [ClinicalFormType.EYE_EXAM]: eyeExam,
  [ClinicalFormType.PHYSIO_ASSESSMENT]: physioAssessment,
  [ClinicalFormType.PHYSIO_SESSION]: physioSession,
  [ClinicalFormType.NUTRITION_ASSESSMENT]: nutritionAssessment,
  [ClinicalFormType.ANC_VISIT]: ancVisit,
  [ClinicalFormType.POSTNATAL_CHECK]: postnatalCheck,
  [ClinicalFormType.GROWTH]: growth
};

// The envelope; the data itself is checked against FORM_SCHEMAS[type] in the service.
export const clinicalFormSchema = z.object({
  type: z.nativeEnum(ClinicalFormType),
  data: z.record(z.string(), z.unknown()),
  amendsId: z.string().min(1).optional(),
  // Required for antenatal and postnatal forms.
  pregnancyId: z.string().min(1).optional()
});

export const patientFormsQuerySchema = z.object({
  type: z.nativeEnum(ClinicalFormType).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

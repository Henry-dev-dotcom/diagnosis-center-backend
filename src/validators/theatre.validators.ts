import { AnaesthesiaType, SurgeryStatus, SurgeryUrgency } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const confirmed = (message: string) => z.literal(true, { errorMap: () => ({ message }) });

export const createTheatreSchema = z.object({
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Theatre name is required').max(120)
});

export const updateTheatreSchema = z
  .object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, { message: 'Nothing to update' });

export const surgeryQuerySchema = z.object({
  date: z.coerce.date().optional(),
  theatreId: z.string().min(1).optional(),
  status: z.nativeEnum(SurgeryStatus).optional(),
  patientId: z.string().min(1).optional()
});

export const scheduleSurgerySchema = z
  .object({
    // The open visit or inpatient stay the operation belongs to.
    encounterId: z.string().min(1, 'Choose the visit or stay'),
    theatreId: z.string().min(1, 'Choose a theatre'),
    procedureItemId: z.string().min(1).optional(),
    procedureName: optionalText(200),
    urgency: z.nativeEnum(SurgeryUrgency).default(SurgeryUrgency.ELECTIVE),
    anaesthesia: z.nativeEnum(AnaesthesiaType).optional(),
    scheduledStart: z.coerce.date(),
    durationMinutes: z.coerce.number().int().min(10).max(24 * 60),
    surgeonId: z.string().min(1).optional(),
    anaesthetistName: optionalText(120),
    assistants: optionalText(300),
    preopDiagnosis: optionalText(500)
  })
  .refine((v) => v.procedureItemId || v.procedureName, { message: 'Choose or name the procedure', path: ['procedureName'] });

export const rescheduleSurgerySchema = z
  .object({
    theatreId: z.string().min(1).optional(),
    scheduledStart: z.coerce.date().optional(),
    durationMinutes: z.coerce.number().int().min(10).max(24 * 60).optional(),
    surgeonId: z.string().min(1).optional(),
    anaesthetistName: optionalText(120),
    assistants: optionalText(300),
    anaesthesia: z.nativeEnum(AnaesthesiaType).optional()
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), { message: 'Nothing to change' });

// WHO Surgical Safety Checklist. Each confirmation must be ticked; the answers are kept on the case.
export const signInSchema = z.object({
  anaesthesia: z.nativeEnum(AnaesthesiaType),
  answers: z.object({
    identityConfirmed: confirmed('Confirm the patient identity, site, procedure and consent'),
    siteMarked: z.enum(['YES', 'NOT_APPLICABLE']),
    anaesthesiaCheckDone: confirmed('Complete the anaesthesia safety check'),
    pulseOximeterOn: confirmed('The pulse oximeter must be on the patient and working'),
    knownAllergy: z.boolean(),
    difficultAirway: z.boolean(),
    bloodLossRisk: z.boolean()
  })
});

export const timeOutSchema = z.object({
  answers: z.object({
    teamIntroduced: confirmed('All team members must introduce themselves by name and role'),
    patientProcedureSiteConfirmed: confirmed('Confirm the patient, procedure and site of incision'),
    antibioticProphylaxis: z.enum(['GIVEN', 'NOT_APPLICABLE']),
    imagingDisplayed: z.enum(['YES', 'NOT_APPLICABLE']),
    criticalEventsReviewed: confirmed('Review the anticipated critical events')
  })
});

export const completeSurgerySchema = z.object({
  answers: z.object({
    procedureRecorded: confirmed('Confirm the name of the procedure recorded'),
    countsCorrect: confirmed('Instrument, sponge and needle counts must be correct'),
    specimensLabelled: z.enum(['YES', 'NOT_APPLICABLE']),
    equipmentProblems: optionalText(300),
    recoveryConcerns: optionalText(500)
  }),
  procedurePerformed: z.string().trim().min(3, 'Name the procedure performed').max(300),
  findings: z.string().trim().min(3, 'Record the findings').max(5000),
  complications: optionalText(2000),
  bloodLossMl: z.coerce.number().int().min(0).max(20000).optional(),
  specimens: optionalText(500),
  postOpPlan: z.string().trim().min(3, 'Write the post-operative plan').max(3000)
});

export const cancelSurgerySchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

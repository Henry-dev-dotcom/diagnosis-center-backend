import { DeceasedStatus, PlaceOfDeath } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const slotSchema = z.object({ code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()) });
export const deceasedQuerySchema = z.object({ status: z.nativeEnum(DeceasedStatus).optional(), search: optionalText(80) });

export const registerSchema = z
  .object({
    // A known patient; leave out for an unidentified or unregistered person.
    patientId: z.string().min(1).optional(),
    fullName: optionalText(160),
    sex: z.enum(['Male', 'Female', 'Unknown']).optional(),
    estimatedAgeYears: z.coerce.number().int().min(0).max(130).optional(),
    dateOfDeath: z.coerce.date(),
    placeOfDeath: z.nativeEnum(PlaceOfDeath),
    encounterId: z.string().min(1).optional(),
    slotId: z.string().min(1, 'Choose a slot'),
    bodyTag: z.string().trim().min(2, 'Enter the body tag number').max(30).transform((v) => v.toUpperCase()),
    policeCase: z.boolean().default(false),
    policeReference: optionalText(80),
    notes: optionalText(1000)
  })
  .refine((v) => v.patientId || (v.fullName && v.sex), { message: 'Choose the patient, or give a name ("Unknown" if unidentified) and sex', path: ['fullName'] })
  .refine((v) => !v.policeCase || v.policeReference, { message: 'Give the police reference for a police case', path: ['policeReference'] });

export const certifySchema = z.object({
  causeOfDeath: z.string().trim().min(3, 'Give the cause of death').max(500),
  causeIcd10: z.string().trim().max(12).optional().transform((v) => (v ? v : undefined))
});
export const clearanceSchema = z.object({ clearanceRef: z.string().trim().min(2, 'Enter the police clearance reference').max(80) });
export const moveSchema = z.object({ slotId: z.string().min(1) });
export const releaseSchema = z.object({
  releasedTo: z.string().trim().min(3, 'Name the person collecting the body').max(160),
  relationship: z.string().trim().min(2, 'Give their relationship to the deceased').max(60),
  idNumber: z.string().trim().min(4, 'Record their ID (Ghana Card) number').max(40),
  notes: optionalText(1000)
});

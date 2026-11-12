import { z } from 'zod';

export const createDeltaRequestSchema = z.object({
  ownerFacilityId: z.string().min(1, 'Choose the facility to ask'),
  patientId: z.string().min(1, 'Choose the patient'),
  // Leave empty to ask for every test the other facility holds in the period.
  parameters: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  lookbackDays: z.coerce.number().int().min(7).max(1825).default(365),
  reason: z.string().trim().min(5, 'Say why the comparison is needed').max(500)
});

export const respondDeltaRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  note: z.string().trim().max(300).optional()
});

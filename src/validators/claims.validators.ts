import { ClaimStatus, SchemeType } from '@prisma/client';
import { z } from 'zod';

const reason = (message: string) => z.string().trim().min(3, message).max(1000);

export const createSchemeSchema = z.object({
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Scheme name is required').max(120),
  type: z.nativeEnum(SchemeType)
});

export const updateSchemeSchema = z
  .object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, { message: 'Nothing to update' });

export const membershipSchema = z.object({
  schemeId: z.string().min(1, 'Choose the scheme'),
  membershipNumber: z.string().trim().min(3, 'Enter the membership number').max(40),
  expiresAt: z.coerce.date().optional()
});

export const claimQuerySchema = z.object({
  status: z.nativeEnum(ClaimStatus).optional(),
  schemeId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  patientId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const candidatesQuerySchema = z.object({ schemeId: z.string().min(1, 'Choose the scheme') });
export const batchQuerySchema = z.object({ schemeId: z.string().min(1).optional() });

export const createClaimSchema = z.object({
  encounterId: z.string().min(1, 'Choose the visit'),
  schemeId: z.string().min(1, 'Choose the scheme'),
  // Leave out to claim every unpaid invoice on the visit.
  invoiceIds: z.array(z.string().min(1)).min(1).max(50).optional()
});

export const submitClaimsSchema = z.object({ claimIds: z.array(z.string().min(1)).min(1, 'Choose claims to submit').max(500) });
export const cancelClaimSchema = z.object({ reason: reason('Give a reason') });
export const queryClaimSchema = z.object({ note: reason('Write down the scheme’s query') });

export const adjudicateSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(1000).optional(),
  // Lines the scheme cut; lines not listed are approved in full.
  lines: z.array(z.object({ lineId: z.string().min(1), approvedAmount: z.coerce.number().min(0), rejectedReason: z.string().trim().max(300).optional() })).max(500).optional()
});

export const claimPaymentSchema = z.object({
  amount: z.coerce.number().positive('Enter the amount paid'),
  reference: z.string().trim().min(2, 'Enter the payment reference').max(80),
  paidAt: z.coerce.date().optional()
});

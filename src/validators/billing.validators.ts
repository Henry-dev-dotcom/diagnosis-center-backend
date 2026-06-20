import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { dateRangeQueryBaseSchema, moneySchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

export const updateInvoiceSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  insuranceProvider: z.string().trim().max(120).optional(),
  insuranceClaimNumber: z.string().trim().max(120).optional(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  adjustmentReason: z.string().trim().max(500).optional(),
  notes: optionalNotesSchema
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one invoice field must be provided'
});

export const paymentSchema = z.object({
  amount: moneySchema,
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().max(120, 'Payment reference cannot exceed 120 characters').optional(),
  paidAt: z.coerce.date().optional(),
  notes: optionalNotesSchema
});

export const refundSchema = z.object({
  amount: moneySchema,
  reason: requiredReasonSchema,
  supervisorApprovalId: z.string().min(1, 'Supervisor approval ID is required')
});


export const invoiceQuerySchema = dateRangeQueryBaseSchema.extend({
  patientId: z.string().trim().min(1).optional(),
  hospitalId: z.string().trim().min(1).optional()
});

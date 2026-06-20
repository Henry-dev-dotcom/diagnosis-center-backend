import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { dateRangeQueryBaseSchema, moneySchema, nonNegativeMoneySchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

export const startShiftSchema = z.object({
  openingFloat: nonNegativeMoneySchema.default(0),
  notes: optionalNotesSchema
});

export const closeShiftSchema = z.object({
  closingCash: z.coerce.number().nonnegative('Closing cash cannot be negative'),
  closingMobileMoney: z.coerce.number().nonnegative('Closing mobile money cannot be negative').default(0),
  closingCard: z.coerce.number().nonnegative('Closing card total cannot be negative').default(0),
  closingBankTransfer: z.coerce.number().nonnegative('Closing bank transfer total cannot be negative').default(0),
  notes: optionalNotesSchema
});

export const floatAdjustmentSchema = z.object({
  type: z.enum(['MONEY_IN', 'MONEY_OUT', 'ADJUSTMENT']),
  amount: moneySchema,
  reason: requiredReasonSchema
});

export const expenseSchema = z.object({
  vendorName: z.string().trim().min(2, 'Vendor name is required').max(160),
  category: z.string().trim().min(2, 'Expense category is required').max(120),
  description: z.string().trim().min(3, 'Expense description is required').max(500),
  amount: moneySchema,
  incurredAt: z.coerce.date().optional(),
  notes: optionalNotesSchema
});

export const updateExpenseSchema = expenseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one expense field must be provided'
});

export const expensePaymentSchema = z.object({
  amount: moneySchema,
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().max(120).optional(),
  paidAt: z.coerce.date().optional(),
  notes: optionalNotesSchema
});

export const expenseWriteOffSchema = z.object({
  reason: requiredReasonSchema,
  supervisorApprovalId: z.string().min(1, 'Supervisor approval ID is required')
});


export const shiftQuerySchema = dateRangeQueryBaseSchema.extend({
  userId: z.string().trim().min(1).optional()
});

export const floatQuerySchema = dateRangeQueryBaseSchema.extend({
  shiftId: z.string().trim().min(1).optional(),
  type: z.enum(['MONEY_IN', 'MONEY_OUT', 'PAYMENT', 'REFUND', 'ADJUSTMENT']).optional(),
  method: z.nativeEnum(PaymentMethod).optional()
});

export const expenseQuerySchema = dateRangeQueryBaseSchema.extend({
  category: z.string().trim().max(120).optional()
});

export const ledgerQuerySchema = dateRangeQueryBaseSchema.extend({
  type: z.enum(['CREDIT', 'DEBIT']).optional()
});

export const financeAnalyticsQuerySchema = dateRangeQueryBaseSchema.extend({
  hospitalId: z.string().trim().min(1).optional()
});

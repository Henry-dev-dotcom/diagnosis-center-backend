import { z } from 'zod';

export const cuidSchema = z.string().min(1, 'ID is required');

export const idParamSchema = z.object({
  id: cuidSchema
});

export const orderIdParamSchema = z.object({
  orderId: cuidSchema
});

export const patientIdParamSchema = z.object({
  patientId: cuidSchema
});

export const catalogItemIdParamSchema = z.object({
  catalogItemId: cuidSchema
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int('Page must be a whole number').positive('Page must be greater than 0').default(1),
  limit: z.coerce.number().int('Limit must be a whole number').positive('Limit must be greater than 0').max(100, 'Limit cannot exceed 100').default(20),
  search: z.string().trim().max(120, 'Search cannot exceed 120 characters').optional(),
  sortBy: z.string().trim().max(60, 'Sort field cannot exceed 60 characters').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export const dateRangeQueryBaseSchema = paginationQuerySchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.string().trim().max(60).optional()
});

export const dateRangeQuerySchema = dateRangeQueryBaseSchema.refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'From date cannot be after to date',
  path: ['from']
});

export const optionalNotesSchema = z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional();

export const requiredReasonSchema = z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason cannot exceed 500 characters');

export const moneySchema = z.coerce.number().positive('Amount must be greater than 0').finite('Amount must be a valid number');

export const nonNegativeMoneySchema = z.coerce.number().nonnegative('Amount cannot be negative').finite('Amount must be a valid number');

export const phoneSchema = z.string().trim().min(7, 'Phone number is too short').max(30, 'Phone number is too long').optional();

export const emailSchema = z.string().trim().email('Email address is invalid').max(120, 'Email cannot exceed 120 characters').optional().or(z.literal(''));

export const booleanQuerySchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

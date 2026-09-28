import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const recordImmunizationSchema = z.object({
  vaccine: z.string().trim().toUpperCase().min(2, 'Choose the vaccine'),
  givenAt: z.coerce.date(),
  batchNumber: optionalText(60),
  expiryDate: z.coerce.date().optional(),
  site: optionalText(120),
  // Copied from the child's health card rather than given here.
  givenElsewhere: z.boolean().default(false),
  encounterId: z.string().min(1).optional(),
  notes: optionalText(500)
});

export const voidImmunizationSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const dueListQuerySchema = z.object({
  include: z.enum(['ALL', 'OVERDUE']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

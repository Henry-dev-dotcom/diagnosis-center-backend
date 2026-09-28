import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const money = z.coerce.number().min(0).max(1_000_000);

export const drugQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  includeInactive: z.enum(['true', 'false']).optional()
});

export const createDrugSchema = z.object({
  drugCode: z.string().trim().min(2).max(40).transform((v) => v.toUpperCase()),
  genericName: z.string().trim().min(2, 'Generic name is required').max(160),
  brandName: optionalText(160),
  strength: optionalText(60),
  dosageForm: optionalText(60),
  unit: z.string().trim().min(1).max(30).default('unit'),
  unitPrice: money.default(0),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0)
});

export const updateDrugSchema = createDrugSchema
  .omit({ drugCode: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.values(v).some((field) => field !== undefined), { message: 'Nothing to update' });

export const receiveBatchSchema = z.object({
  batchNumber: z.string().trim().min(1, 'Batch number is required').max(60),
  expiryDate: z.coerce.date(),
  quantity: z.coerce.number().int().min(1).max(10_000_000),
  costPrice: money.optional(),
  supplier: optionalText(160)
});

export const stockAdjustmentSchema = z.object({
  batchId: z.string().min(1, 'Choose the batch'),
  // Positive adds stock (e.g. a recount found more), negative removes it.
  quantity: z.coerce.number().int().refine((v) => v !== 0, 'Quantity cannot be zero'),
  kind: z.enum(['ADJUSTMENT', 'EXPIRY_WRITE_OFF']).default('ADJUSTMENT'),
  reason: z.string().trim().min(3, 'Give a reason').max(300)
});

export const dispenseSchema = z.object({
  items: z
    .array(
      z.object({
        prescriptionItemId: z.string().min(1),
        drugId: z.string().min(1, 'Choose the drug to supply'),
        quantity: z.coerce.number().int().min(1).max(100_000)
      })
    )
    .min(1, 'Dispense at least one item'),
  notes: optionalText(500),
  // Required when a line conflicts with a recorded allergy.
  allergyOverrideReason: optionalText(300)
});

export const dispensingQueueSchema = z.object({
  status: z.enum(['PENDING', 'DISPENSED']).default('PENDING')
});

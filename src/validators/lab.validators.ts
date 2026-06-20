import { ResultFlag } from '@prisma/client';
import { z } from 'zod';
import { dateRangeQueryBaseSchema, moneySchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

const acceptSampleBaseSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required').optional(),
  orderItemIds: z.array(z.string().min(1)).min(1, 'At least one lab order item is required').optional(),
  patientId: z.string().min(1, 'Patient ID is required').optional(),
  collectedAt: z.coerce.date().optional(),
  sampleType: z.string().trim().max(80, 'Sample type cannot exceed 80 characters').optional(),
  barcode: z.string().trim().max(80, 'Barcode cannot exceed 80 characters').optional(),
  notes: optionalNotesSchema
});

export const acceptSampleSchema = acceptSampleBaseSchema.refine((value) => Boolean(value.orderId || value.orderItemIds?.length), {
  message: 'Provide orderId or orderItemIds to accept a sample',
  path: ['orderId']
});

export const acceptSampleFromOrderSchema = acceptSampleBaseSchema.partial();

export const labResultParameterSchema = z.object({
  parameterId: z.string().min(1, 'Parameter ID is required').optional(),
  name: z.string().trim().min(1, 'Parameter name is required').max(120),
  value: z.string().trim().min(1, 'Result value is required').max(160),
  unit: z.string().trim().max(40).optional(),
  flag: z.nativeEnum(ResultFlag).default(ResultFlag.PENDING),
  referenceRange: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional()
});

export const labResultSchema = z.object({
  sampleId: z.string().min(1, 'Sample ID is required').optional(),
  orderItemId: z.string().min(1, 'Order item ID is required').optional(),
  resultId: z.string().min(1, 'Result ID is required').optional(),
  overallComment: z.string().trim().max(2000, 'Overall comment cannot exceed 2000 characters').optional(),
  parameters: z.array(labResultParameterSchema).min(1, 'At least one result parameter is required')
}).refine((value) => Boolean(value.sampleId || value.orderItemId || value.resultId), {
  message: 'Provide sampleId, orderItemId, or resultId',
  path: ['sampleId']
});

export const submitLabResultReviewSchema = z.object({
  resultId: z.string().min(1, 'Result ID is required'),
  notes: optionalNotesSchema
});

export const signOffLabResultSchema = z.object({
  decision: z.enum(['SIGNED_OFF', 'REJECTED']),
  reviewerComment: z.string().trim().max(1000, 'Reviewer comment cannot exceed 1000 characters').optional()
}).refine((value) => value.decision === 'SIGNED_OFF' || Boolean(value.reviewerComment), {
  message: 'Reviewer comment is required when rejecting a result',
  path: ['reviewerComment']
});

export const rejectSampleSchema = z.object({
  reason: requiredReasonSchema,
  requestRecollection: z.boolean().default(false),
  notes: optionalNotesSchema
});

export const labWorkflowQuerySchema = dateRangeQueryBaseSchema.extend({
  patientId: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  orderItemId: z.string().trim().min(1).optional(),
  catalogItemId: z.string().trim().min(1).optional()
});

export const qualityControlSchema = z.object({
  catalogItemId: z.string().min(1, 'Catalog item ID is required').optional(),
  parameterName: z.string().trim().min(1, 'Parameter name is required').max(120),
  controlLevel: z.string().trim().max(80).optional(),
  value: z.coerce.number().finite().optional(),
  expectedMean: z.coerce.number().finite().optional(),
  standardDeviation: z.coerce.number().nonnegative().finite().optional(),
  result: z.enum(['PASS', 'FAIL', 'WARNING']).or(z.string().trim().min(1).max(80)),
  notes: optionalNotesSchema
});

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Inventory item name is required').max(160),
  category: z.string().trim().min(1, 'Inventory category is required').max(100),
  currentStock: z.coerce.number().nonnegative().finite().default(0),
  minLevel: z.coerce.number().nonnegative().finite().default(0),
  maxLevel: z.coerce.number().nonnegative().finite().optional(),
  unit: z.string().trim().max(40).optional(),
  expiryDate: z.coerce.date().optional(),
  supplier: z.string().trim().max(160).optional()
});

export const inventoryTransactionSchema = z.object({
  type: z.string().trim().min(1, 'Transaction type is required').max(80),
  quantity: moneySchema,
  reason: optionalNotesSchema
});

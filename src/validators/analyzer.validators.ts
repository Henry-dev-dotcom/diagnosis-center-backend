import { AnalyzerDeviceStatus, AnalyzerMessageStatus, AnalyzerProtocol } from '@prisma/client';
import { z } from 'zod';
import { dateRangeQueryBaseSchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

/*
  An analyzer upload can be large — a full day's run exported from the instrument —
  so the cap is generous but not unbounded. A megabyte is thousands of results.
*/
const MAX_PAYLOAD_CHARS = 1_000_000;

const deviceBaseSchema = z.object({
  name: z.string().trim().min(2, 'Give the analyzer a name staff will recognise').max(120),
  protocol: z.nativeEnum(AnalyzerProtocol),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(80).optional(),
  departmentId: z.string().min(1).nullish(),
  autoSubmitForReview: z.boolean().optional(),
  acceptUnmappedTests: z.boolean().optional(),
  notes: optionalNotesSchema
});

export const createAnalyzerDeviceSchema = deviceBaseSchema;

export const updateAnalyzerDeviceSchema = deviceBaseSchema
  .partial()
  .extend({ status: z.nativeEnum(AnalyzerDeviceStatus).optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });

export const analyzerTestMapSchema = z.object({
  // Left out, or null, means the mapping applies to every analyzer in the facility.
  deviceId: z.string().min(1).nullish(),
  analyzerCode: z.string().trim().min(1, "The analyzer's own code for the test is required").max(60),
  catalogItemId: z.string().min(1, 'Choose the test this value belongs to'),
  referenceParameterId: z.string().min(1).nullish(),
  factor: z.union([z.number(), z.string().trim()]).nullish(),
  unitOverride: z.string().trim().max(40).nullish(),
  isActive: z.boolean().optional()
});

export const analyzerUploadSchema = z.object({
  deviceId: z.string().min(1, 'Choose which analyzer this file came from'),
  content: z.string().min(1, 'The file was empty').max(MAX_PAYLOAD_CHARS, 'That file is too large to process in one go'),
  filename: z.string().trim().max(200).optional()
});

export const discardAnalyzerMessageSchema = z.object({ reason: requiredReasonSchema });

export const analyzerDeviceQuerySchema = dateRangeQueryBaseSchema.extend({
  status: z.nativeEnum(AnalyzerDeviceStatus).optional()
});

export const analyzerMessageQuerySchema = dateRangeQueryBaseSchema.extend({
  deviceId: z.string().min(1).optional(),
  status: z.nativeEnum(AnalyzerMessageStatus).optional()
});

export const analyzerTestMapQuerySchema = dateRangeQueryBaseSchema.extend({
  deviceId: z.string().min(1).optional(),
  catalogItemId: z.string().min(1).optional()
});

export const unmappedCodesQuerySchema = z.object({ deviceId: z.string().min(1).optional() });

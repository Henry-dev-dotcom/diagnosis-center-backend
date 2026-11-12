import { GenderRule } from '@prisma/client';
import { z } from 'zod';

const limit = z.coerce.number().min(-1_000_000).max(1_000_000).nullish();

export const labTestQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  includeInactive: z.enum(['true', 'false']).optional()
});

export const createLabTestSchema = z.object({
  name: z.string().trim().min(2, 'Test name is required').max(160),
  catalogCode: z.string().trim().min(2).max(40).optional(),
  sampleType: z.string().trim().min(2, 'Sample type is required').max(80),
  expectedCompletionHours: z.coerce.number().int().positive().max(720).default(24),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  // Honoured only for roles that may see prices; otherwise billing sets it.
  price: z.coerce.number().min(0).max(1_000_000).optional()
});

export const updateLabTestSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    sampleType: z.string().trim().min(2).max(80).optional(),
    expectedCompletionHours: z.coerce.number().int().positive().max(720).optional(),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const rangeSchema = z.object({
  gender: z.nativeEnum(GenderRule).default(GenderRule.ALL),
  ageMin: z.coerce.number().int().min(0).max(200).default(0),
  ageMax: z.coerce.number().int().min(0).max(200).default(200),
  low: limit,
  high: limit,
  criticalLow: limit,
  criticalHigh: limit,
  displayRange: z.string().trim().max(120).nullish()
});

export const saveTestParametersSchema = z.object({
  parameters: z.array(z.object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, 'Every parameter needs a name').max(120),
    unit: z.string().trim().max(40).nullish(),
    methodNote: z.string().trim().max(250).nullish(),
    ranges: z.array(rangeSchema).max(30).default([])
  })).max(100)
});

import { FacilityStatus } from '@prisma/client';
import { z } from 'zod';
import { MODULE_KEYS, moduleDependencyErrors, type ModuleKey } from '../config/modules.js';
import { emailSchema, phoneSchema } from './common.validators.js';

// A facility's switched-on modules; every dependency must be included.
export const moduleSelectionSchema = z
  .array(z.enum(MODULE_KEYS))
  .transform((keys) => [...new Set(keys)] as ModuleKey[])
  .superRefine((keys, ctx) => {
    for (const message of moduleDependencyErrors(keys)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

// Staff type this code on the sign-in screen, so keep it short and unambiguous.
export const facilityCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,16}$/, 'Facility code must be 3-16 letters or digits');

export const createFacilitySchema = z.object({
  code: facilityCodeSchema,
  name: z.string().trim().min(2, 'Facility name is required').max(160),
  phone: phoneSchema,
  email: emailSchema,
  address: z.string().trim().max(240).optional(),
  // Omitted: every module is switched on.
  modules: moduleSelectionSchema.optional(),
  // The facility's first administrator, who then creates the rest of the staff.
  admin: z.object({
    name: z.string().trim().min(2, 'Administrator name is required').max(120),
    username: z.string().trim().min(3, 'Username must be at least 3 characters').max(60).transform((value) => value.toLowerCase()),
    email: emailSchema,
    password: z.string().min(8, 'Password must be at least 8 characters')
  })
});

export const updateFacilitySchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    phone: phoneSchema,
    email: emailSchema,
    address: z.string().trim().max(240).optional(),
    status: z.nativeEnum(FacilityStatus).optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one facility field must be provided'
  });

export const facilityIdParamSchema = z.object({ id: z.string().min(1, 'Facility id is required') });

export const setFacilityModulesSchema = z.object({ modules: moduleSelectionSchema });

export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

import { FacilityStatus } from '@prisma/client';
import { z } from 'zod';
import { emailSchema, phoneSchema } from './common.validators.js';

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

export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

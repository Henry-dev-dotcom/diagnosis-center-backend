import { UserRole } from '@prisma/client';
import { z } from 'zod';

// Custom roles build on a staff workspace. ADMIN already has every permission,
// and PLATFORM_ADMIN is not a facility role.
export const CUSTOM_ROLE_BASES = [
  UserRole.DOCTOR,
  UserRole.RECEPTIONIST,
  UserRole.LAB_STAFF,
  UserRole.SCAN_STAFF,
  UserRole.BILLING_STAFF,
  UserRole.NURSE,
  UserRole.PHARMACIST
] as const;

const permissionListSchema = z.array(z.string().min(1)).max(300);

export const createFacilityRoleSchema = z.object({
  name: z.string().trim().min(2, 'Role name is required').max(60),
  description: z.string().trim().max(240).optional(),
  baseRole: z.enum(CUSTOM_ROLE_BASES),
  permissions: permissionListSchema
});

// baseRole is fixed once created: users on the role already carry it as their User.role.
export const updateFacilityRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(240).optional(),
    permissions: permissionListSchema.optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one role field must be provided'
  });

export type CreateFacilityRoleInput = z.infer<typeof createFacilityRoleSchema>;
export type UpdateFacilityRoleInput = z.infer<typeof updateFacilityRoleSchema>;

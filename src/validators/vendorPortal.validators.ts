import { GustavBiomedRequestType, GustavRequestStatus, UserStatus } from '@prisma/client';
import { z } from 'zod';

const normalizedEmail = z.string().trim().email('Enter a valid email address').max(254).transform((value) => value.toLowerCase());
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const vendorLoginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, 'Password is required').max(128)
});

export const vendorInviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the account holder’s name').max(120),
  email: normalizedEmail
});

export const vendorInviteActivationSchema = z.object({
  token: z.string().min(32, 'Invitation token is required').max(128),
  password
});

export const vendorPartnerIdParamSchema = z.object({ id: z.string().trim().min(1).max(100) });
export const vendorPortalUserIdParamSchema = z.object({ userId: z.string().trim().min(1).max(100) });
export const vendorRequestIdParamSchema = z.object({ id: z.string().trim().min(1).max(100) });

export const vendorRequestListQuerySchema = z.object({
  status: z.nativeEnum(GustavRequestStatus).optional(),
  type: z.nativeEnum(GustavBiomedRequestType).optional(),
  search: z.string().trim().max(100).optional(),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const vendorRequestStatusSchema = z
  .object({
    status: z.nativeEnum(GustavRequestStatus).refine(
      (value) => value !== GustavRequestStatus.PENDING && value !== GustavRequestStatus.CANCELLED,
      'This status cannot be selected by a supplier'
    ),
    statusNote: z.string().trim().min(5, 'Add at least 5 characters').max(1000).optional()
  })
  .superRefine((value, ctx) => {
    if ((value.status === GustavRequestStatus.SCHEDULED || value.status === GustavRequestStatus.DECLINED) && !value.statusNote) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['statusNote'], message: 'Add a short note for scheduling or declining this request' });
    }
  });

export const vendorPortalUserStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE])
});

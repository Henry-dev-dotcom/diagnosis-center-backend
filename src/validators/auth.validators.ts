import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required')
});

// Refresh token may arrive in the body (API clients) or via the httpOnly
// refresh cookie (browser sessions); the controller enforces that one exists.
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must include an uppercase letter')
    .regex(/[a-z]/, 'New password must include a lowercase letter')
    .regex(/[0-9]/, 'New password must include a number')
});

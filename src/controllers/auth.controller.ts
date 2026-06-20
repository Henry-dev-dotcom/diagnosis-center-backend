import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  changePassword,
  getCurrentUser,
  loginWithPassword,
  logoutByRefreshToken,
  logoutSession,
  refreshTokenPair
} from '../services/auth.service.js';
import type { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema } from '../validators/auth.validators.js';
import type { z } from 'zod';
import { AppError } from '../utils/appError.js';

function requestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof loginSchema>;
  const result = await loginWithPassword(body.username, body.password, requestContext(req));
  return sendSuccess(res, 'Login successful', result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof refreshTokenSchema>;
  const result = await refreshTokenPair(body.refreshToken, requestContext(req));
  return sendSuccess(res, 'Token refreshed successfully', result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof logoutSchema>;

  if (body.refreshToken) {
    await logoutByRefreshToken(body.refreshToken, requestContext(req));
  } else if (req.user) {
    await logoutSession(req.user.sessionId, req.user.id, requestContext(req));
  } else {
    throw new AppError('Refresh token or authenticated session is required', 400, 'LOGOUT_TARGET_REQUIRED');
  }

  return sendSuccess(res, 'Logout successful', { loggedOut: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const user = await getCurrentUser(req.user.id, req.user.sessionId);
  return sendSuccess(res, 'Current user loaded', user);
});

export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const body = req.body as z.infer<typeof changePasswordSchema>;
  await changePassword(req.user.id, body.currentPassword, body.newPassword, requestContext(req));
  return sendSuccess(res, 'Password changed successfully. Please log in again.', { passwordChanged: true });
});

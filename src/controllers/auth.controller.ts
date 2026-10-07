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
import { requestEmailVerification, verifyEmailToken } from '../services/emailVerification.service.js';
import type { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema, verifyEmailSchema } from '../validators/auth.validators.js';
import type { z } from 'zod';
import { AppError } from '../utils/appError.js';
import { clearAuthCookies, getRefreshTokenFromCookie, setAuthCookies } from '../utils/authCookies.js';

function requestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof loginSchema>;
  const result = await loginWithPassword(body.facilityCode, body.username, body.password, requestContext(req));
  setAuthCookies(res, result);
  return sendSuccess(res, 'Login successful', result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof refreshTokenSchema>;
  const refreshToken = body.refreshToken ?? getRefreshTokenFromCookie(req);
  if (!refreshToken) {
    throw new AppError('Refresh token is required', 401, 'REFRESH_TOKEN_REQUIRED');
  }
  const result = await refreshTokenPair(refreshToken, requestContext(req));
  setAuthCookies(res, result);
  return sendSuccess(res, 'Token refreshed successfully', result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof logoutSchema>;
  const refreshToken = body.refreshToken ?? getRefreshTokenFromCookie(req);

  if (refreshToken) {
    await logoutByRefreshToken(refreshToken, requestContext(req));
  } else if (req.user) {
    await logoutSession(req.user.sessionId, req.user.id, requestContext(req));
  } else {
    clearAuthCookies(res);
    throw new AppError('Refresh token or authenticated session is required', 400, 'LOGOUT_TARGET_REQUIRED');
  }

  clearAuthCookies(res);
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

export const requestEmailVerificationController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
  const result = await requestEmailVerification(req.user.id, requestContext(req));

  if (result.alreadyVerified) {
    return sendSuccess(res, 'This email address is already verified.', { emailVerified: true });
  }
  const message =
    result.delivered === 'sent'
      ? 'Verification email sent. The link expires in 24 hours.'
      : result.delivered === 'logged'
        ? 'Verification link written to the server log (development mail driver).'
        : 'Email sending is not configured on this server; ask the administrator to set MAIL_DRIVER.';
  return sendSuccess(res, message, { emailVerified: false, delivered: result.delivered });
});

/*
  Confirming an address is a POST, and only a POST.

  It used to answer GET as well, so that the emailed link could do the work
  itself. A GET that changes state is spent by anything that merely fetches the
  link - mail gateways do, to scan it - so the person who actually clicked would
  be told it had expired. The link now opens a page in the app, and that page
  makes this request when they press the button.
*/
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof verifyEmailSchema>;
  await verifyEmailToken(body.token, requestContext(req));
  return sendSuccess(res, 'Email address verified.', { emailVerified: true });
});

import type { Request, Response } from 'express';
import { authCookieConfig, env, isProduction } from '../config/env.js';
import { getRefreshExpiryDate } from './token.js';

export const VENDOR_REFRESH_COOKIE = 'vendor_refresh_token';

function cookieBase() {
  return {
    httpOnly: true,
    secure: isProduction || authCookieConfig.secure,
    sameSite: isProduction ? 'none' : authCookieConfig.sameSite,
    ...(authCookieConfig.domain ? { domain: authCookieConfig.domain } : {})
  } as const;
}

function refreshCookiePath() {
  return `${env.API_PREFIX.replace(/\/$/, '')}/vendor/auth/refresh`;
}

export function setVendorRefreshCookie(res: Response, token: string) {
  res.cookie(VENDOR_REFRESH_COOKIE, token, {
    ...cookieBase(),
    path: refreshCookiePath(),
    maxAge: Math.max(0, getRefreshExpiryDate().getTime() - Date.now())
  });
}

export function clearVendorRefreshCookie(res: Response) {
  res.clearCookie(VENDOR_REFRESH_COOKIE, { ...cookieBase(), path: refreshCookiePath() });
}

export function getVendorRefreshCookie(req: Request) {
  return (req.cookies?.[VENDOR_REFRESH_COOKIE] as string | undefined) ?? null;
}

import type { Request, Response } from 'express';
import { authCookieConfig } from '../config/env.js';
import { getRefreshExpiryDate } from './token.js';

type TokenPair = { accessToken: string; refreshToken: string };

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: authCookieConfig.secure,
    sameSite: authCookieConfig.sameSite,
    ...(authCookieConfig.domain ? { domain: authCookieConfig.domain } : {})
  } as const;
}

/**
 * Persists the token pair as httpOnly cookies so tokens are never exposed to
 * client-side JavaScript (mitigating XSS token theft). The refresh cookie is
 * scoped to the auth path so it is only sent where it is actually needed.
 */
export function setAuthCookies(res: Response, { accessToken, refreshToken }: TokenPair) {
  const maxAge = Math.max(0, getRefreshExpiryDate().getTime() - Date.now());
  res.cookie(authCookieConfig.accessTokenName, accessToken, {
    ...baseCookieOptions(),
    path: '/',
    maxAge
  });
  res.cookie(authCookieConfig.refreshTokenName, refreshToken, {
    ...baseCookieOptions(),
    path: authCookieConfig.refreshPath,
    maxAge
  });
}

export function clearAuthCookies(res: Response) {
  const options = baseCookieOptions();
  res.clearCookie(authCookieConfig.accessTokenName, { ...options, path: '/' });
  res.clearCookie(authCookieConfig.refreshTokenName, { ...options, path: authCookieConfig.refreshPath });
}

export function getAccessTokenFromCookie(req: Request): string | null {
  return req.cookies?.[authCookieConfig.accessTokenName] ?? null;
}

export function getRefreshTokenFromCookie(req: Request): string | null {
  return req.cookies?.[authCookieConfig.refreshTokenName] ?? null;
}

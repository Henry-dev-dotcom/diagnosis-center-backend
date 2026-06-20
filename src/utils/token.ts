import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '@prisma/client';

export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  sessionId: string;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  role: UserRole;
  sessionId: string;
  type: 'refresh';
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload & jwt.JwtPayload;
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function getRefreshExpiryDate() {
  const match = env.REFRESH_TOKEN_EXPIRES_IN.match(/^(\d+)d$/i);
  if (match) return addDays(Number(match[1]));

  const hours = env.REFRESH_TOKEN_EXPIRES_IN.match(/^(\d+)h$/i);
  if (hours) {
    const date = new Date();
    date.setHours(date.getHours() + Number(hours[1]));
    return date;
  }

  return addDays(7);
}

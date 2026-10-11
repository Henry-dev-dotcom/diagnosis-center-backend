import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './appError.js';

export type VendorAccessPayload = {
  sub: string;
  sessionId: string;
  type: 'vendor_access';
};

export type VendorRefreshPayload = {
  sub: string;
  sessionId: string;
  type: 'vendor_refresh';
};

export function signVendorAccessToken(payload: VendorAccessPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN, jwtid: randomUUID() } as jwt.SignOptions);
}

export function signVendorRefreshToken(payload: VendorRefreshPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN, jwtid: randomUUID() } as jwt.SignOptions);
}

export function verifyVendorAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as VendorAccessPayload & jwt.JwtPayload;
  if (payload.type !== 'vendor_access') throw new AppError('Invalid vendor access token', 401, 'INVALID_VENDOR_ACCESS_TOKEN');
  return payload;
}

export function verifyVendorRefreshToken(token: string) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as VendorRefreshPayload & jwt.JwtPayload;
  if (payload.type !== 'vendor_refresh') throw new AppError('Invalid vendor refresh token', 401, 'INVALID_VENDOR_REFRESH_TOKEN');
  return payload;
}

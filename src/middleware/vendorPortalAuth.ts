import type { NextFunction, Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import { prisma } from '../services/prisma.service.js';
import { runAsSystem } from '../services/tenantContext.js';
import { AppError } from '../utils/appError.js';
import { verifyVendorAccessToken } from '../utils/vendorPortalTokens.js';
import { createVendorPortalAudit } from '../services/vendorPortal.service.js';

function bearerToken(req: Request) {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function requireVendorAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');

    let payload: ReturnType<typeof verifyVendorAccessToken>;
    try {
      payload = verifyVendorAccessToken(token);
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppError(expired ? 'Vendor session has expired' : 'Invalid vendor access token', 401, expired ? 'VENDOR_ACCESS_EXPIRED' : 'INVALID_VENDOR_ACCESS_TOKEN');
    }

    const session = await runAsSystem('vendor portal session validation', () =>
      prisma.vendorPortalSession.findUnique({
        where: { id: payload.sessionId },
        include: { user: { include: { partner: true } } }
      })
    );

    const unavailable = !session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date();
    const user = session?.user;
    if (unavailable || !user || user.status !== UserStatus.ACTIVE || !user.partner.isActive) {
      if (user) {
        await createVendorPortalAudit({
          partnerId: user.partnerId,
          vendorUserId: user.id,
          action: 'AUTH_SESSION_REJECTED',
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      }
      throw new AppError('Vendor session is invalid or expired', 401, 'VENDOR_SESSION_INVALID');
    }

    req.vendorUser = {
      id: user.id,
      partnerId: user.partnerId,
      fullName: user.fullName,
      email: user.email,
      sessionId: session.id,
      partner: {
        id: user.partner.id,
        code: user.partner.code,
        name: user.partner.name,
        contactPhone: user.partner.contactPhone
      }
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

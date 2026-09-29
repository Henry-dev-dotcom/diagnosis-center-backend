import type { NextFunction, Request, Response } from 'express';
import { FacilityStatus, UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../services/prisma.service.js';
import { runAsPlatform, runAsSystem, runWithFacility } from '../services/tenantContext.js';
import { canViewPrices as canRoleViewPrices } from '../services/permission.service.js';
import { effectivePermissions, modulesForFacility, permissionsInclude } from '../services/facilityAccess.service.js';
import { auditAccessFailure } from './audit.js';
import { createAuditLog } from '../services/audit.service.js';
import { verifyAccessToken } from '../utils/token.js';
import { subscriptionStateFor } from '../services/subscription.service.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';
import { getAccessTokenFromCookie } from '../utils/authCookies.js';

function getBearerToken(req: Request) {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    // Prefer the Authorization header (API clients); fall back to the httpOnly
    // cookie set for browser sessions.
    const token = getBearerToken(req) || getAccessTokenFromCookie(req);
    if (!token) {
      auditAccessFailure(req, 401, 'AUTH_TOKEN_REQUIRED', 'Authentication token is required');
      throw new AppError('Authentication token is required', 401, 'AUTH_TOKEN_REQUIRED');
    }

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token);
    } catch (verifyError) {
      // Expired or malformed tokens are an auth failure (401), not a server
      // error — the client relies on 401 to trigger its refresh flow.
      const expired = verifyError instanceof Error && verifyError.name === 'TokenExpiredError';
      const code = expired ? 'ACCESS_TOKEN_EXPIRED' : 'INVALID_ACCESS_TOKEN';
      const message = expired ? 'Access token has expired' : 'Invalid access token';
      auditAccessFailure(req, 401, code, message);
      throw new AppError(message, 401, code);
    }
    if (payload.type !== 'access') {
      auditAccessFailure(req, 401, 'INVALID_ACCESS_TOKEN', 'Invalid access token');
      throw new AppError('Invalid access token', 401, 'INVALID_ACCESS_TOKEN');
    }

    // The facility is not known until the user is loaded, so this one lookup runs
    // unscoped; everything after it runs inside the user's facility context.
    const [user, session] = await runAsSystem('auth.session', () =>
      Promise.all([
        prisma.user.findUnique({ where: { id: payload.sub }, include: { facility: true, customRole: true } }),
        prisma.userSession.findUnique({ where: { id: payload.sessionId } })
      ])
    );

    if (!user || user.status !== UserStatus.ACTIVE) {
      auditAccessFailure(req, 401, 'USER_UNAVAILABLE', 'User is not active or does not exist', { userId: payload.sub });
      throw new AppError('User is not active or does not exist', 401, 'USER_UNAVAILABLE');
    }

    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== user.id) {
      auditAccessFailure(req, 401, 'SESSION_INVALID', 'Session is invalid or expired', { sessionId: payload.sessionId });
      throw new AppError('Session is invalid or expired', 401, 'SESSION_INVALID');
    }

    // Invariant: exactly the PLATFORM_ADMIN role has no facility.
    const isPlatformUser = user.role === UserRole.PLATFORM_ADMIN;
    if (isPlatformUser !== (user.facilityId === null)) {
      auditAccessFailure(req, 403, 'FACILITY_ASSIGNMENT_INVALID', 'User facility assignment is invalid', { userId: user.id });
      throw new AppError('Your account is not assigned to a facility', 403, 'FACILITY_ASSIGNMENT_INVALID');
    }

    if (user.facility && user.facility.status !== FacilityStatus.ACTIVE) {
      auditAccessFailure(req, 403, 'FACILITY_NOT_ACTIVE', 'Facility is not active', { facilityId: user.facility.id });
      throw new AppError('This facility account is not active. Contact support.', 403, 'FACILITY_NOT_ACTIVE');
    }

    const useCustomRole = user.customRole && user.customRole.baseRole === user.role;
    req.user = {
      id: user.id,
      facilityId: user.facilityId,
      facility: user.facility ? { id: user.facility.id, code: user.facility.code, name: user.facility.name } : null,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      customRole: useCustomRole && user.customRole ? { id: user.customRole.id, name: user.customRole.name } : null,
      permissions: effectivePermissions(user.role, user.customRole),
      modules: await modulesForFacility(user.facilityId),
      sessionId: session.id,
      subscription: user.facilityId ? await subscriptionStateFor(user.facilityId) : null,
      support: session.impersonatorId ? { impersonatorId: session.impersonatorId, reason: session.supportReason } : null
    };

    // A support session looks but never touches: only signing out is allowed.
    if (req.user.support && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.originalUrl.startsWith(`${env.API_PREFIX}/auth/`)) {
      auditAccessFailure(req, 403, 'SUPPORT_SESSION_READ_ONLY', 'Support sessions are read-only');
      throw new AppError('This is a read-only support session. Nothing can be changed.', 403, 'SUPPORT_SESSION_READ_ONLY');
    }

    // An unpaid (suspended) or cancelled subscription leaves the facility read-only:
    // staff can still see everything, and can reach billing to pay.
    if (req.user.subscription?.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.originalUrl.startsWith(`${env.API_PREFIX}/subscription`) && !req.originalUrl.startsWith(`${env.API_PREFIX}/auth/`)) {
      auditAccessFailure(req, 402, 'SUBSCRIPTION_READ_ONLY', 'Facility is read-only until the subscription is paid');
      throw new AppError(req.user.subscription.status === 'CANCELLED' ? 'Your subscription has ended, so records are read-only. An administrator can renew it under Subscription & billing.' : 'Your subscription is unpaid, so records are read-only. An administrator can pay under Subscription & billing.', 402, 'SUBSCRIPTION_READ_ONLY');
    }

    // Everything downstream (handlers, services, Prisma) runs in this context.
    if (user.facilityId) runWithFacility(user.facilityId, () => next());
    else runAsPlatform(() => next());
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (!roles.includes(req.user.role)) {
        auditAccessFailure(req, 403, 'FORBIDDEN_ROLE', 'Role denied access to protected resource', { requiredRoles: roles });
        await createAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCESS_DENIED_ROLE',
          module: 'Access Control',
          details: { requiredRoles: roles, attemptedPath: req.originalUrl },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        throw new AppError('You do not have access to this resource', 403, 'FORBIDDEN_ROLE');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (!permissionsInclude(req.user.permissions, permission)) {
        auditAccessFailure(req, 403, 'FORBIDDEN_PERMISSION', 'Permission denied access to protected resource', { permission });
        await createAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCESS_DENIED_PERMISSION',
          module: 'Access Control',
          details: { permission, attemptedPath: req.originalUrl },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        throw new AppError('You do not have permission to perform this action', 403, 'FORBIDDEN_PERMISSION');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}


export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (!permissions.some((permission) => permissionsInclude(req.user!.permissions, permission))) {
        auditAccessFailure(req, 403, 'FORBIDDEN_PERMISSION', 'Permission denied access to protected resource', { permissions });
        await createAuditLog({
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'ACCESS_DENIED_ANY_PERMISSION',
          module: 'Access Control',
          details: { permissions, attemptedPath: req.originalUrl },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
        throw new AppError('You do not have permission to access this resource', 403, 'FORBIDDEN_PERMISSION');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function canViewPrices(role: UserRole) {
  return canRoleViewPrices(role);
}

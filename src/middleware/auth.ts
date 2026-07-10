import type { NextFunction, Request, Response } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../services/prisma.service.js';
import { canViewPrices as canRoleViewPrices, getPermissionsForRole, hasAnyPermission, hasPermission } from '../services/permission.service.js';
import { auditAccessFailure } from './audit.js';
import { createAuditLog } from '../services/audit.service.js';
import { verifyAccessToken } from '../utils/token.js';
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

    const [user, session] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.sub } }),
      prisma.userSession.findUnique({ where: { id: payload.sessionId } })
    ]);

    if (!user || user.status !== UserStatus.ACTIVE) {
      auditAccessFailure(req, 401, 'USER_UNAVAILABLE', 'User is not active or does not exist', { userId: payload.sub });
      throw new AppError('User is not active or does not exist', 401, 'USER_UNAVAILABLE');
    }

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      auditAccessFailure(req, 401, 'SESSION_INVALID', 'Session is invalid or expired', { sessionId: payload.sessionId });
      throw new AppError('Session is invalid or expired', 401, 'SESSION_INVALID');
    }

    req.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: getPermissionsForRole(user.role),
      sessionId: session.id
    };

    next();
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
      if (!hasPermission(req.user.role, permission)) {
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
      if (!hasAnyPermission(req.user.role, permissions)) {
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

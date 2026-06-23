import type { NextFunction, Request, Response } from 'express';
import { CatalogItemType, UserRole } from '@prisma/client';
import { createAuditLog } from '../services/audit.service.js';
import { prisma } from '../services/prisma.service.js';
import { AppError } from '../utils/appError.js';

async function auditScopeDenied(req: Request, reason: string, details?: unknown) {
  if (!req.user) return;
  await createAuditLog({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'ACCESS_DENIED_SCOPE',
    module: 'Access Control',
    details: { reason, attemptedPath: req.originalUrl, details },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
}

export function requireOwnDoctorResource(paramName = 'doctorId') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (req.user.role === UserRole.ADMIN) return next();
      if (req.user.role !== UserRole.DOCTOR) {
        await auditScopeDenied(req, 'Only doctors can access own-doctor resources');
        throw new AppError('This resource is restricted to the owning doctor', 403, 'FORBIDDEN_SCOPE');
      }

      const requestedDoctorId = req.params[paramName] ?? req.query[paramName];
      if (!requestedDoctorId) return next();

      const profile = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
      if (!profile || profile.id !== requestedDoctorId) {
        await auditScopeDenied(req, 'Doctor attempted to access another doctor resource', { requestedDoctorId });
        throw new AppError('You can only access your own doctor resources', 403, 'FORBIDDEN_OWN_DOCTOR');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireOrderItemTypeAccess(expectedType: CatalogItemType) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (req.user.role === UserRole.ADMIN) return next();

      if (expectedType === CatalogItemType.LAB && req.user.role !== UserRole.LAB_STAFF) {
        await auditScopeDenied(req, 'Non-lab role attempted lab item access', { expectedType });
        throw new AppError('This endpoint is restricted to laboratory items', 403, 'FORBIDDEN_LAB_SCOPE');
      }

      if (expectedType === CatalogItemType.SCAN && req.user.role !== UserRole.SCAN_STAFF) {
        await auditScopeDenied(req, 'Non-scan role attempted scan item access', { expectedType });
        throw new AppError('This endpoint is restricted to scan/imaging items', 403, 'FORBIDDEN_SCAN_SCOPE');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireFinanceRole() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Authentication is required', 401, 'AUTH_REQUIRED');
      if (!([UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.RECEPTIONIST] as UserRole[]).includes(req.user.role)) {
        await auditScopeDenied(req, 'Non-finance role attempted finance access');
        throw new AppError('This resource is restricted to finance or reception roles', 403, 'FORBIDDEN_FINANCE_SCOPE');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

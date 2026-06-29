import type { NextFunction, Response } from 'express';
import { hasAnyRole, isSuperAdminRole, normalizeRole } from '../constants/roles';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { forbidden, unauthorized } from '../utils/httpErrors';

export function requireAnyRole(allowedRoles: Iterable<string>, options: { allowSuperAdmin?: boolean } = { allowSuperAdmin: true }) {
  return (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    const role = normalizeRole(req.user?.role);
    if (!req.user) return next(unauthorized());
    if (options.allowSuperAdmin !== false && isSuperAdminRole(role)) return next();
    if (!hasAnyRole(role, allowedRoles)) {
      return next(forbidden('Your role cannot perform this action.'));
    }
    return next();
  };
}

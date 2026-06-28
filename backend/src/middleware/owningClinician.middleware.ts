import type { NextFunction, Response } from 'express';
import { CLINICIAN_ROLES, hasAnyRole, isSuperAdminRole } from '../constants/roles';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { forbidden, unauthorized } from '../utils/httpErrors';
import { getUserId } from '../utils/facilityAccess';

export function requireOwningClinicianOrPrivileged(getClinicianId: (req: FacilityScopedRequest) => string | undefined) {
  return (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!req.user || !userId) return next(unauthorized());
    if (isSuperAdminRole(req.user.role)) return next();
    if (!hasAnyRole(req.user.role, CLINICIAN_ROLES)) return next();

    const clinicianId = getClinicianId(req);
    if (clinicianId && clinicianId !== userId) {
      return next(forbidden('Clinicians can only access requests and results assigned to them.'));
    }

    return next();
  };
}

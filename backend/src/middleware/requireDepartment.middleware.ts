import type { NextFunction, Response } from 'express';
import { FacilityScopeService } from '../services/facilityScope.service';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { badRequest, forbidden } from '../utils/httpErrors';

export function requireFacilityDepartment(departmentKey: string) {
  return async (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    try {
      if (req.isSuperAdmin && !req.facilityId) return next();
      if (!req.facilityId) return next(badRequest('Facility context is required to check department access.'));

      const enabled = await FacilityScopeService.isDepartmentEnabled(req.facilityId, departmentKey);
      if (!enabled) {
        return next(forbidden(`The ${departmentKey} department is disabled for this facility.`));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

import type { NextFunction, Response } from 'express';
import { FacilityScopeService } from '../services/facilityScope.service';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { badRequest, forbidden } from '../utils/httpErrors';

export function requireFacilityFeature(featureKey: string) {
  return async (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    try {
      if (req.isSuperAdmin && !req.facilityId) return next();
      if (!req.facilityId) return next(badRequest('Facility context is required to check feature access.'));

      const enabled = await FacilityScopeService.isFeatureEnabled(req.facilityId, featureKey);
      if (!enabled) {
        return next(forbidden(`The ${featureKey} feature is disabled for this facility.`));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

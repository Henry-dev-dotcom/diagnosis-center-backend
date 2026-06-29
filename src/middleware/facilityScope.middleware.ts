import type { NextFunction, Response } from 'express';
import { FacilityScopeService } from '../services/facilityScope.service';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { badRequest, forbidden, unauthorized } from '../utils/httpErrors';
import { getRequestedFacilityId, getUserId } from '../utils/facilityAccess';

export async function attachFacilityScope(
  req: FacilityScopedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    if (!req.user || !getUserId(req)) {
      throw unauthorized();
    }

    const isSuperAdmin = FacilityScopeService.isSuperAdmin(req.user);
    const requestedFacilityId = getRequestedFacilityId(req);
    const allowedFacilityIds = await FacilityScopeService.getAllowedFacilityIds(req.user);

    if (!isSuperAdmin && allowedFacilityIds.length === 0) {
      throw forbidden('Your account is not assigned to an active diagnostic facility.');
    }

    if (requestedFacilityId) {
      const canAccess = await FacilityScopeService.canAccessFacility(req.user, requestedFacilityId);
      if (!canAccess) {
        throw forbidden('You cannot access records for this diagnostic facility.');
      }
      req.facilityId = requestedFacilityId;
    } else if (!isSuperAdmin) {
      req.facilityId = await FacilityScopeService.getPrimaryFacilityId(req.user);
    }

    req.facilityIds = isSuperAdmin ? [] : allowedFacilityIds;
    req.isSuperAdmin = isSuperAdmin;
    req.facilityScope = {
      requestedFacilityId,
      allowedFacilityIds,
      isSuperAdmin,
      role: req.user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireFacilityId() {
  return (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    if (!req.facilityId && !req.isSuperAdmin) {
      return next(badRequest('Facility context is required for this action.'));
    }
    return next();
  };
}

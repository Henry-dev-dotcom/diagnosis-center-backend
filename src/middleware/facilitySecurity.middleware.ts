import type { NextFunction, Response } from 'express';
import type { SecureFacilityRequest } from '../types/securityValidation.types';
import { getActorId, getFacilityId } from '../utils/securityValidation.utils';
import { SecurityValidationService } from '../services/securityValidation.service';

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export function requireSecureFacilityContext() {
  return (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw httpError(401, 'Authentication is required.');
      if (!req.isSuperAdmin && !getFacilityId(req)) throw httpError(400, 'Facility context is required.');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function assertRecordBelongsToFacility(modelName: string, paramName = 'id') {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const recordId = String(req.params[paramName] || '');
      if (!recordId) throw httpError(400, `${paramName} is required.`);

      await SecurityValidationService.assertFacilityRecordAccess({
        modelName,
        recordId,
        facilityId: getFacilityId(req),
        actorId: getActorId(req),
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

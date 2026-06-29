import type { NextFunction, Response } from 'express';
import type { SecureFacilityRequest } from '../types/securityValidation.types';
import { SecurityValidationService } from '../services/securityValidation.service';
import { getActorId, getFacilityId, toArray } from '../utils/securityValidation.utils';

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export function validateLabAcceptanceSelection() {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const orderId = String(req.params.orderId || req.body.orderId || '');
      const facilityId = getFacilityId(req);
      if (!orderId) throw httpError(400, 'orderId is required.');
      if (!facilityId) throw httpError(400, 'facilityId is required.');

      const selectedTests = toArray(req.body.selectedTests || req.body.tests || req.body.items);
      await SecurityValidationService.assertSelectedTestsBelongToOrder({
        orderId,
        facilityId,
        selectedTests,
        actorId: getActorId(req),
      });
      await SecurityValidationService.assertNoExistingAcceptedSample({ orderId, facilityId, actorId: getActorId(req) });

      req.body.selectedTests = selectedTests;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAllLabTestsCompletedBeforeDelivery() {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const sampleId = String(req.params.sampleId || req.body.sampleId || '');
      const facilityId = getFacilityId(req);
      if (!sampleId) throw httpError(400, 'sampleId is required.');
      if (!facilityId) throw httpError(400, 'facilityId is required.');

      await SecurityValidationService.assertAllAcceptedLabTestsCompleted({
        sampleId,
        facilityId,
        actorId: getActorId(req),
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function preventPostDeliveryLabEdits() {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const sampleId = String(req.params.sampleId || req.body.sampleId || '');
      const facilityId = getFacilityId(req);
      if (!sampleId) throw httpError(400, 'sampleId is required.');
      if (!facilityId) throw httpError(400, 'facilityId is required.');

      await SecurityValidationService.assertResultDocumentEditable({
        parentModel: 'labAcceptedSample',
        parentId: sampleId,
        facilityId,
        actorId: getActorId(req),
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function preventPostDeliveryScanEdits() {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const scanId = String(req.params.scanId || req.body.scanId || '');
      const facilityId = getFacilityId(req);
      if (!scanId) throw httpError(400, 'scanId is required.');
      if (!facilityId) throw httpError(400, 'facilityId is required.');

      await SecurityValidationService.assertResultDocumentEditable({
        parentModel: 'scanAcceptedRequest',
        parentId: scanId,
        facilityId,
        actorId: getActorId(req),
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

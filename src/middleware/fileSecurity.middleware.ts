import type { NextFunction, Response } from 'express';
import type { SecureFacilityRequest } from '../types/securityValidation.types';
import { SECURE_WORKFLOW_EVENT_TYPES } from '../constants/securityValidation.constants';
import { SecurityValidationService } from '../services/securityValidation.service';
import { getActorId, getFacilityId, validateResultDocumentFile } from '../utils/securityValidation.utils';

function getFiles(req: SecureFacilityRequest): Express.Multer.File[] {
  const anyReq = req as any;
  if (Array.isArray(anyReq.files)) return anyReq.files;
  if (anyReq.files && typeof anyReq.files === 'object') return Object.values(anyReq.files).flat() as Express.Multer.File[];
  if (anyReq.file) return [anyReq.file];
  return [];
}

export function validateResultDocumentUpload() {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const files = getFiles(req);
      if (files.length === 0) {
        const error = new Error('At least one result document is required.');
        (error as any).statusCode = 400;
        throw error;
      }

      for (const file of files) validateResultDocumentFile(file);
      return next();
    } catch (error) {
      await SecurityValidationService.logSecurityEvent({
        facilityId: getFacilityId(req),
        actorId: getActorId(req),
        eventType: SECURE_WORKFLOW_EVENT_TYPES.UNSAFE_FILE_UPLOAD_BLOCKED,
        severity: 'HIGH',
        message: (error as Error).message,
        metadata: { files: getFiles(req).map((file) => ({ name: file.originalname, type: file.mimetype, size: file.size })) },
      });
      return next(error);
    }
  };
}

export function blockDocumentMutationAfterDelivery(parentModel: 'labAcceptedSample' | 'scanAcceptedRequest', paramName: string) {
  return async (req: SecureFacilityRequest, _res: Response, next: NextFunction) => {
    try {
      const parentId = String(req.params[paramName] || '');
      if (!parentId) {
        const error = new Error(`${paramName} is required.`);
        (error as any).statusCode = 400;
        throw error;
      }

      await SecurityValidationService.assertResultDocumentEditable({
        parentModel,
        parentId,
        facilityId: String(getFacilityId(req) || ''),
        actorId: getActorId(req),
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

import type { NextFunction, Response } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { DOCUMENT_UPLOAD } from '../constants/diagnosticWorkflow.constants';

function validationError(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function requireBodyFields(fields: string[]) {
  return (req: FacilityScopedRequest, _res: Response, next: NextFunction) => {
    for (const field of fields) {
      if (req.body?.[field] === undefined || req.body?.[field] === null || req.body?.[field] === '') {
        return next(validationError(`${field} is required.`));
      }
    }
    return next();
  };
}

export function validateAcceptLabTests(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  if (!Array.isArray(req.body?.tests) || req.body.tests.length === 0) {
    return next(validationError('At least one laboratory test must be selected before accepting the sample.'));
  }
  return next();
}

export function validateLabTestResult(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  const hasValue = typeof req.body?.resultValue === 'string' && req.body.resultValue.trim().length > 0;
  const hasParameters = Array.isArray(req.body?.parameters) && req.body.parameters.length > 0;
  if (!hasValue && !hasParameters) {
    return next(validationError('A result value or result parameter list is required.'));
  }
  return next();
}

export function validateScanResult(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  if (!String(req.body?.findings || '').trim() && !String(req.body?.impression || '').trim()) {
    return next(validationError('Scan findings or impression is required.'));
  }
  return next();
}

export function validateUploadFile(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  const file = (req as any).file;
  if (!file) return next(validationError('A document file is required.'));
  if (file.size > DOCUMENT_UPLOAD.MAX_FILE_SIZE_BYTES) {
    return next(validationError('The selected document is too large. Maximum allowed size is 20 MB.'));
  }
  if (!DOCUMENT_UPLOAD.ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return next(validationError('Unsupported document type. Upload PDF, Word, Excel, PNG, or JPG files only.'));
  }
  return next();
}

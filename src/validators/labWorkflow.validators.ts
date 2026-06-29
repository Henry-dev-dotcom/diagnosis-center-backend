import type { NextFunction, Response } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { DOCUMENT_UPLOAD } from '../constants/diagnosticWorkflow.constants';

function validationError(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function validateLabQueueSearch(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  const take = req.query?.take;
  const skip = req.query?.skip;
  if (take !== undefined && (!Number.isFinite(Number(take)) || Number(take) <= 0)) {
    return next(validationError('take must be a positive number.'));
  }
  if (skip !== undefined && (!Number.isFinite(Number(skip)) || Number(skip) < 0)) {
    return next(validationError('skip must be zero or a positive number.'));
  }
  return next();
}

export function validateAcceptSelectedLabTests(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  if (!Array.isArray(req.body?.tests) || req.body.tests.length === 0) {
    return next(validationError('Select at least one laboratory test before accepting the sample.'));
  }

  const missingName = req.body.tests.some((test: Record<string, unknown>) => !String(test?.testName || test?.name || '').trim());
  if (missingName) {
    return next(validationError('Every selected laboratory test must include a testName.'));
  }

  return next();
}

export function validateSaveLabTestResult(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  const hasResultValue = typeof req.body?.resultValue === 'string' && req.body.resultValue.trim().length > 0;
  const hasParameters = Array.isArray(req.body?.parameters) && req.body.parameters.length > 0;
  if (!hasResultValue && !hasParameters) {
    return next(validationError('Enter a result value or result parameter list before saving this test.'));
  }
  return next();
}

export function validateLabResultDocument(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  const file = (req as any).file;
  const metadata = req.body?.file || req.body?.document || req.body?.fileMetadata;

  if (!file && !metadata) return next(validationError('Attach a result document before submitting.'));

  const size = Number(file?.size || metadata?.fileSize || metadata?.size || 0);
  const mimeType = String(file?.mimetype || metadata?.mimeType || metadata?.mimetype || '');

  if (size > DOCUMENT_UPLOAD.MAX_FILE_SIZE_BYTES) {
    return next(validationError('The selected document is too large. Maximum allowed size is 20 MB.'));
  }

  if (mimeType && !DOCUMENT_UPLOAD.ALLOWED_MIME_TYPES.has(mimeType)) {
    return next(validationError('Unsupported file type. Upload PDF, Word, Excel, PNG, JPG, or JPEG files only.'));
  }

  return next();
}

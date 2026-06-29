import type { NextFunction, Response } from 'express';
import { SCAN_RESULT_DOCUMENT } from '../constants/scanWorkflow.constants';
import type { ScanWorkflowRequest } from '../types/scanWorkflow.types';
import { badRequest, parseArray, safeText, toSafeSkip, toSafeTake } from '../utils/scanWorkflow.utils';

export function validateScanQueueSearch(req: ScanWorkflowRequest, _res: Response, next: NextFunction) {
  req.query.take = String(toSafeTake(req.query.take as any));
  req.query.skip = String(toSafeSkip(req.query.skip as any));
  return next();
}

export function validateAcceptScanRequest(req: ScanWorkflowRequest, _res: Response, next: NextFunction) {
  try {
    const selectedScans = parseArray(req.body.selectedScans);
    if (req.body.selectedScans !== undefined && !selectedScans.length) {
      throw badRequest('selectedScans must be a non-empty array when provided.');
    }
    req.body.selectedScans = selectedScans.length ? selectedScans : undefined;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function validateSaveScanResult(req: ScanWorkflowRequest, _res: Response, next: NextFunction) {
  try {
    const hasResultText = ['findings', 'impression', 'conclusion', 'recommendation', 'technicianNotes', 'radiologistNotes']
      .some((key) => safeText(req.body?.[key]));
    if (!hasResultText) throw badRequest('Enter at least one result field before saving the scan result.');
    return next();
  } catch (error) {
    return next(error);
  }
}

export function validateScanResultDocument(req: ScanWorkflowRequest, _res: Response, next: NextFunction) {
  try {
    const file = req.file;
    const mimeType = file?.mimetype || req.body?.mimeType;
    const fileSize = Number(file?.size || req.body?.fileSize || 0);
    const originalName = file?.originalname || req.body?.originalName || req.body?.fileName;
    const fileUrl = req.body?.fileUrl || file?.path;

    if (!originalName) throw badRequest('Document name is required.');
    if (!mimeType || !SCAN_RESULT_DOCUMENT.ALLOWED_MIME_TYPES.has(String(mimeType))) {
      throw badRequest('Unsupported scan result document type.');
    }
    if (!fileSize || fileSize > SCAN_RESULT_DOCUMENT.MAX_FILE_SIZE_BYTES) {
      throw badRequest('Scan result document exceeds the allowed file size.');
    }
    if (!file && !fileUrl) throw badRequest('Document file or fileUrl is required.');

    return next();
  } catch (error) {
    return next(error);
  }
}

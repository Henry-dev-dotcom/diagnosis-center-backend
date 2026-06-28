import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { mapMetadataDocument, validateResultDocument } from '../utils/resultDocument.utils';

export function validateResultDocumentUpload(req: FacilityScopedRequest, _res: Response, next: NextFunction) {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const metadata = req.body?.file || req.body?.document || req.body?.fileMetadata;

    if (file) {
      validateResultDocument({
        originalName: file.originalname,
        fileName: file.filename,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      return next();
    }

    if (metadata) {
      validateResultDocument(mapMetadataDocument(metadata));
      return next();
    }

    const error = Object.assign(new Error('Attach one result document before submitting.'), { statusCode: 400 });
    return next(error);
  } catch (error) {
    return next(error);
  }
}

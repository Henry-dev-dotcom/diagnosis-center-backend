import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { ResultDocumentService } from '../services/resultDocument.service';
import { getActorId, getRequiredFacilityId } from '../utils/diagnosticWorkflow.utils';
import { checksumSha256, mapMetadataDocument, mapMulterFile } from '../utils/resultDocument.utils';

function send(res: Response, data: unknown, message = 'Success') {
  return res.json({ success: true, message, data });
}

async function mapRequestDocument(req: FacilityScopedRequest) {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (file) {
    const mapped = mapMulterFile(file);
    mapped.checksumSha256 = await checksumSha256(file.path);
    return mapped;
  }

  const metadata = req.body?.file || req.body?.document || req.body?.fileMetadata;
  if (metadata) return mapMetadataDocument(metadata);
  throw Object.assign(new Error('Attach one result document before submitting.'), { statusCode: 400 });
}

export class ResultDocumentController {
  static async attachLabTestDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const file = await mapRequestDocument(req);
      const data = await ResultDocumentService.attachLabTestDocument({
        facilityId: getRequiredFacilityId(req),
        acceptedSampleId: req.params.sampleId,
        sampleTestId: req.params.testId,
        uploadedById: getActorId(req),
        file,
        notes: req.body?.notes || null,
      });
      return send(res, data, 'Laboratory result document uploaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async listLabTestDocuments(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ResultDocumentService.listLabTestDocuments(getRequiredFacilityId(req), req.params.testId, req.query as any);
      return send(res, data, 'Laboratory result documents loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async removeLabTestDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ResultDocumentService.removeLabTestDocument({
        facilityId: getRequiredFacilityId(req),
        documentId: req.params.documentId,
        actorId: getActorId(req),
        hardDelete: req.query.hardDelete === 'true',
      });
      return send(res, data, 'Laboratory result document removed.');
    } catch (error) {
      return next(error);
    }
  }

  static async attachScanDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const file = await mapRequestDocument(req);
      const data = await ResultDocumentService.attachScanDocument({
        facilityId: getRequiredFacilityId(req),
        scanAcceptedRequestId: req.params.scanId,
        uploadedById: getActorId(req),
        file,
        notes: req.body?.notes || null,
      });
      return send(res, data, 'Scan result document uploaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async listScanDocuments(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ResultDocumentService.listScanDocuments(getRequiredFacilityId(req), req.params.scanId, req.query as any);
      return send(res, data, 'Scan result documents loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async removeScanDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ResultDocumentService.removeScanDocument({
        facilityId: getRequiredFacilityId(req),
        documentId: req.params.documentId,
        actorId: getActorId(req),
        hardDelete: req.query.hardDelete === 'true',
      });
      return send(res, data, 'Scan result document removed.');
    } catch (error) {
      return next(error);
    }
  }
}

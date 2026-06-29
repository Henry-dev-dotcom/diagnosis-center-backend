import type { NextFunction, Response } from 'express';
import { ScanWorkflowService } from '../services/scanWorkflow.service';
import type { ScanWorkflowRequest } from '../types/scanWorkflow.types';
import { getActorId, getActorName, getRequiredFacilityId } from '../utils/scanWorkflow.utils';

function send(res: Response, data: unknown, message = 'Success') {
  return res.json({ success: true, message, data });
}

function fileToDocumentPayload(file: Express.Multer.File, body: Record<string, any>) {
  return {
    originalName: file.originalname || body.originalName || body.fileName,
    fileName: file.filename || body.fileName || file.originalname,
    mimeType: file.mimetype || body.mimeType,
    fileSize: file.size || Number(body.fileSize || 0),
    fileUrl: body.fileUrl || file.path || `/uploads/${file.filename || file.originalname}`,
    checksum: body.checksum || null,
  };
}

export class ScanWorkflowController {
  static async getQueue(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getQueue(getRequiredFacilityId(req), req.query as any);
      return send(res, data, 'Scan queue loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async getQueueSummary(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getQueueSummary(getRequiredFacilityId(req));
      return send(res, data, 'Scan queue summary loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async searchQueue(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getQueue(getRequiredFacilityId(req), { ...req.query, search: req.query.search || req.query.q } as any);
      return send(res, data, 'Scan queue search completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async getQueueOrder(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getQueueOrder(getRequiredFacilityId(req), req.params.orderId);
      return send(res, data, 'Scan request loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async accept(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.acceptScanRequest({
        facilityId: getRequiredFacilityId(req),
        orderId: req.params.orderId,
        acceptedById: getActorId(req),
        actorName: getActorName(req),
        payload: req.body,
      });
      return send(res, data, 'Scan request accepted to imaging.');
    } catch (error) {
      return next(error);
    }
  }

  static async getAccepted(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getAcceptedScans(getRequiredFacilityId(req), req.query as any);
      return send(res, data, 'Accepted scan requests loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async searchAccepted(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getAcceptedScans(getRequiredFacilityId(req), { ...req.query, search: req.query.search || req.query.q } as any);
      return send(res, data, 'Accepted scan search completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async getAcceptedScan(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getAcceptedScan(getRequiredFacilityId(req), req.params.scanId);
      return send(res, data, 'Accepted scan request loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async saveResult(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.saveScanResult({
        facilityId: getRequiredFacilityId(req),
        scanId: req.params.scanId,
        actorId: getActorId(req),
        actorName: getActorName(req),
        payload: req.body,
      });
      return send(res, data, 'Scan result saved.');
    } catch (error) {
      return next(error);
    }
  }

  static async completeResult(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.completeScanResult(getRequiredFacilityId(req), req.params.scanId, getActorId(req));
      return send(res, data, 'Scan result marked completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async attachDocument(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      const document = file ? fileToDocumentPayload(file, req.body || {}) : req.body;
      const data = await ScanWorkflowService.attachDocument({
        facilityId: getRequiredFacilityId(req),
        scanId: req.params.scanId,
        actorId: getActorId(req),
        document,
      });
      return send(res, data, 'Scan result document added.');
    } catch (error) {
      return next(error);
    }
  }

  static async getDocuments(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getDocuments(getRequiredFacilityId(req), req.params.scanId);
      return send(res, data, 'Scan result documents loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async removeDocument(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.removeDocument(getRequiredFacilityId(req), req.params.documentId, getActorId(req));
      return send(res, data, 'Scan result document removed.');
    } catch (error) {
      return next(error);
    }
  }

  static async pushToClinician(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.pushToClinician(getRequiredFacilityId(req), req.params.scanId, getActorId(req));
      return send(res, data, 'Scan result pushed directly to clinician and archived.');
    } catch (error) {
      return next(error);
    }
  }

  static async getResults(req: ScanWorkflowRequest, res: Response, next: NextFunction) {
    try {
      const data = await ScanWorkflowService.getResults(getRequiredFacilityId(req), req.query as any);
      return send(res, data, 'Sent scan results loaded.');
    } catch (error) {
      return next(error);
    }
  }
}

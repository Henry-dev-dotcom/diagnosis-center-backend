import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { LabWorkflowService } from '../services/labWorkflow.service';
import { getActorId, getRequiredFacilityId } from '../utils/diagnosticWorkflow.utils';

function send(res: Response, data: unknown, message = 'Success') {
  return res.json({ success: true, message, data });
}

function mapUploadedFile(req: FacilityScopedRequest) {
  const file = (req as any).file;
  const metadata = req.body?.file || req.body?.document || req.body?.fileMetadata;
  if (file) {
    return {
      fileName: file.filename || file.key || file.originalname,
      originalName: file.originalname || file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileUrl: file.location || file.path || file.url || `/uploads/${file.filename || file.originalname}`,
    };
  }
  if (metadata) {
    return {
      fileName: metadata.fileName || metadata.filename || metadata.name,
      originalName: metadata.originalName || metadata.originalname || metadata.name || metadata.fileName,
      mimeType: metadata.mimeType || metadata.mimetype || 'application/octet-stream',
      fileSize: Number(metadata.fileSize || metadata.size || 0),
      fileUrl: metadata.fileUrl || metadata.url || metadata.path,
    };
  }
  return null;
}

export class LabWorkflowController {
  static async getQueue(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getQueue(facilityId, req.query as any);
      return send(res, data, 'Laboratory queue loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async getQueueSummary(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getQueueSummary(facilityId);
      return send(res, data, 'Laboratory queue summary loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async searchQueue(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getQueue(facilityId, { ...req.query, search: req.query.search || req.query.q } as any);
      return send(res, data, 'Laboratory queue search completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async getQueueOrder(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getQueueOrder(facilityId, req.params.orderId);
      return send(res, data, 'Laboratory request loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async acceptTests(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.acceptSelectedTests({
        facilityId,
        orderId: req.params.orderId,
        acceptedById: getActorId(req),
        payload: { tests: req.body.tests || [], notes: req.body.notes },
      });
      return send(res, data, 'Selected laboratory tests accepted and moved to Accepted Samples.');
    } catch (error) {
      return next(error);
    }
  }

  static async getAcceptedSamples(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getAcceptedSamples(facilityId, req.query as any);
      return send(res, data, 'Accepted laboratory samples loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async searchAcceptedSamples(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getAcceptedSamples(facilityId, { ...req.query, search: req.query.search || req.query.q } as any);
      return send(res, data, 'Accepted laboratory samples search completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async getAcceptedSample(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getAcceptedSample(facilityId, req.params.sampleId);
      return send(res, data, 'Accepted laboratory sample loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async saveTestResult(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.saveTestResult({
        facilityId,
        sampleId: req.params.sampleId,
        sampleTestId: req.params.testId,
        enteredById: getActorId(req),
        payload: req.body,
      });
      return send(res, data, 'Laboratory test result saved.');
    } catch (error) {
      return next(error);
    }
  }

  static async completeTest(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.completeTest({
        facilityId,
        sampleId: req.params.sampleId,
        sampleTestId: req.params.testId,
        actorId: getActorId(req),
      });
      return send(res, data, 'Laboratory test marked completed.');
    } catch (error) {
      return next(error);
    }
  }

  static async reopenTest(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.reopenTest({
        facilityId,
        sampleId: req.params.sampleId,
        sampleTestId: req.params.testId,
        actorId: getActorId(req),
      });
      return send(res, data, 'Laboratory test reopened for correction.');
    } catch (error) {
      return next(error);
    }
  }

  static async attachTestDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const file = mapUploadedFile(req);
      if (!file) throw Object.assign(new Error('Attach a result document before submitting.'), { statusCode: 400 });
      const data = await LabWorkflowService.attachTestDocument({
        facilityId,
        sampleId: req.params.sampleId,
        sampleTestId: req.params.testId,
        uploadedById: getActorId(req),
        file,
      });
      return send(res, data, 'Laboratory result document attached.');
    } catch (error) {
      return next(error);
    }
  }

  static async removeTestDocument(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.removeTestDocument({
        facilityId,
        documentId: req.params.documentId,
        actorId: getActorId(req),
      });
      return send(res, data, 'Laboratory result document removed.');
    } catch (error) {
      return next(error);
    }
  }

  static async pushToClinician(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.pushToClinician(facilityId, req.params.sampleId, getActorId(req));
      return send(res, data, 'Laboratory result pushed directly to clinician and archived.');
    } catch (error) {
      return next(error);
    }
  }

  static async getResults(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const facilityId = getRequiredFacilityId(req);
      const data = await LabWorkflowService.getResults(facilityId, req.query as any);
      return send(res, data, 'Laboratory results archive loaded.');
    } catch (error) {
      return next(error);
    }
  }
}

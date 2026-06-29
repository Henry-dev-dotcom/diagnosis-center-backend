import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { ClinicianResultDeliveryService } from '../services/clinicianResultDelivery.service';
import { getActorId, getRequiredFacilityId } from '../utils/diagnosticWorkflow.utils';

function send(res: Response, data: unknown, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function getClinicianId(req: FacilityScopedRequest) {
  return (req.params.clinicianId as string) || (req.query.clinicianId as string) || getActorId(req);
}

export class ClinicianResultDeliveryController {
  static async deliverToClinician(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.deliverToClinician({
        facilityId: getRequiredFacilityId(req),
        clinicianId: req.body.clinicianId,
        patientId: req.body.patientId,
        orderId: req.body.orderId,
        acceptedSampleId: req.body.acceptedSampleId,
        scanAcceptedRequestId: req.body.scanAcceptedRequestId,
        resultId: req.body.resultId,
        source: req.body.source,
        priority: req.body.priority,
        title: req.body.title,
        summary: req.body.summary,
        payload: req.body.payload,
        deliveredById: getActorId(req),
      });
      return send(res, data, 'Result sent directly to clinician.', 201);
    } catch (error) {
      return next(error);
    }
  }

  static async getInbox(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.getClinicianInbox(getRequiredFacilityId(req), getClinicianId(req), req.query);
      return send(res, data, 'Clinician result inbox loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async getOne(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.getClinicianResultById(getRequiredFacilityId(req), req.params.inboxId || req.params.resultId, getClinicianId(req));
      return send(res, data, 'Clinician result loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async markRead(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.markRead({
        facilityId: getRequiredFacilityId(req),
        inboxId: req.params.inboxId || req.params.resultId,
        clinicianId: getClinicianId(req),
        actorId: getActorId(req),
      });
      return send(res, data, 'Result marked as read.');
    } catch (error) {
      return next(error);
    }
  }

  static async archive(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.setArchived({
        facilityId: getRequiredFacilityId(req),
        inboxId: req.params.inboxId || req.params.resultId,
        clinicianId: getClinicianId(req),
        actorId: getActorId(req),
        archived: req.body.archived !== false,
      });
      return send(res, data, req.body.archived === false ? 'Result restored to inbox.' : 'Result archived.');
    } catch (error) {
      return next(error);
    }
  }

  static async documents(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ClinicianResultDeliveryService.getResultDocuments(getRequiredFacilityId(req), req.params.inboxId || req.params.resultId, getClinicianId(req));
      return send(res, data, 'Result documents loaded.');
    } catch (error) {
      return next(error);
    }
  }
}

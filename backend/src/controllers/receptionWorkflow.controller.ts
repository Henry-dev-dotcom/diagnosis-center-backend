import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { ReceptionWorkflowService } from '../services/receptionWorkflow.service';
import { RECEPTION_REQUEST_TYPE } from '../constants/receptionWorkflow.constants';
import { getActorId, getRequiredFacilityId } from '../utils/diagnosticWorkflow.utils';

function send(res: Response, data: unknown, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

export class ReceptionWorkflowController {
  static async listWalkInPatients(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.listWalkInPatients(getRequiredFacilityId(req), req.query);
      return send(res, data, 'Walk-in patients loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async createWalkInPatient(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.createWalkInPatient({
        facilityId: getRequiredFacilityId(req),
        createdById: getActorId(req),
        patient: req.body,
      });
      return send(res, data, 'Walk-in patient registered.', 201);
    } catch (error) {
      return next(error);
    }
  }

  static async getWalkInPatient(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.getWalkInPatient(getRequiredFacilityId(req), req.params.patientId);
      return send(res, data, 'Walk-in patient loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async requestWalkInLabs(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.createDiagnosticRequest({
        facilityId: getRequiredFacilityId(req),
        patientId: req.params.patientId,
        requestedById: getActorId(req),
        clinicianId: req.body.clinicianId || req.body.doctorId || null,
        requestType: RECEPTION_REQUEST_TYPE.LAB,
        priority: req.body.priority || req.body.urgency,
        clinicalNotes: req.body.clinicalNotes || req.body.notes,
        paymentStatus: req.body.paymentStatus,
        invoiceId: req.body.invoiceId,
        items: req.body.tests || req.body.items || [],
      });
      return send(res, data, 'Walk-in laboratory request created and routed directly to Lab Queue.', 201);
    } catch (error) {
      return next(error);
    }
  }

  static async requestWalkInScans(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.createDiagnosticRequest({
        facilityId: getRequiredFacilityId(req),
        patientId: req.params.patientId,
        requestedById: getActorId(req),
        clinicianId: req.body.clinicianId || req.body.doctorId || null,
        requestType: RECEPTION_REQUEST_TYPE.SCAN,
        priority: req.body.priority || req.body.urgency,
        clinicalNotes: req.body.clinicalNotes || req.body.notes,
        paymentStatus: req.body.paymentStatus,
        invoiceId: req.body.invoiceId,
        items: req.body.scans || req.body.items || [],
      });
      return send(res, data, 'Walk-in scan request created and routed directly to Scan Queue.', 201);
    } catch (error) {
      return next(error);
    }
  }

  static async listPatientRequests(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.listPatientRequests(getRequiredFacilityId(req), req.params.patientId, req.query);
      return send(res, data, 'Patient diagnostic requests loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async referenceResults(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ReceptionWorkflowService.listReferenceResults(getRequiredFacilityId(req), req.query);
      return send(res, data, 'Reception reference result copies loaded.');
    } catch (error) {
      return next(error);
    }
  }
}

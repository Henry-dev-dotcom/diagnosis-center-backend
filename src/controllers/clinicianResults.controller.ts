import type { Response, NextFunction } from 'express';
import type { FacilityScopedRequest } from '../types/facility-request.types';
import { DiagnosticWorkflowService } from '../services/diagnosticWorkflow.service';
import { getActorId, getRequiredFacilityId } from '../utils/diagnosticWorkflow.utils';

function send(res: Response, data: unknown, message = 'Success') {
  return res.json({ success: true, message, data });
}

export class ClinicianResultsController {
  static async getInbox(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await DiagnosticWorkflowService.getClinicianInbox(getRequiredFacilityId(req), getActorId(req), req.query as any);
      return send(res, data, 'Clinician results inbox loaded.');
    } catch (error) {
      return next(error);
    }
  }

  static async markRead(req: FacilityScopedRequest, res: Response, next: NextFunction) {
    try {
      const data = await DiagnosticWorkflowService.markClinicianInboxRead(getRequiredFacilityId(req), req.params.resultId, getActorId(req));
      return send(res, data, 'Result marked as read.');
    } catch (error) {
      return next(error);
    }
  }
}

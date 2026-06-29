import { Request, Response } from 'express';
import { WorkflowReadinessService } from '../services/workflowReadiness.service';

export class WorkflowReadinessController {
  static async overview(_req: Request, res: Response) {
    const readiness = await WorkflowReadinessService.getOverview();
    return res.status(200).json(readiness);
  }

  static async database(_req: Request, res: Response) {
    const readiness = await WorkflowReadinessService.getDatabaseReadiness();
    return res.status(200).json(readiness);
  }

  static async routes(_req: Request, res: Response) {
    const readiness = WorkflowReadinessService.getRouteManifest();
    return res.status(200).json(readiness);
  }
}

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { WorkflowTrackingService } from '../services/workflowTracking.service';

const prisma = new PrismaClient();
const workflowTrackingService = new WorkflowTrackingService(prisma);

function getFacilityId(req: Request): string | undefined {
  const requestAny = req as any;
  return String(req.query.facilityId || req.params.facilityId || requestAny.user?.facilityId || requestAny.facility?.id || '') || undefined;
}

export class WorkflowTrackingController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await workflowTrackingService.list({
        facilityId: getFacilityId(req),
        eventType: req.query.eventType as string | undefined,
        eventGroup: req.query.eventGroup as string | undefined,
        entityType: req.query.entityType as string | undefined,
        entityId: req.query.entityId as string | undefined,
        orderId: req.query.orderId as string | undefined,
        patientId: req.query.patientId as string | undefined,
        clinicianId: req.query.clinicianId as string | undefined,
        severity: req.query.severity as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }

  static async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await workflowTrackingService.summary({
        facilityId: getFacilityId(req),
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await workflowTrackingService.getById(req.params.eventId, getFacilityId(req));
      if (!event) return res.status(404).json({ message: 'Workflow event not found' });
      return res.json({ data: event });
    } catch (error) {
      return next(error);
    }
  }
}

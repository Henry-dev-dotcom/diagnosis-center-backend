import type { Response, NextFunction } from 'express';
import { facilityManagementService } from '../services/facilityManagement.service';
import type { FacilityManagementRequest } from '../types/facilityManagement.types';
import { getActor, requireSuperAdmin } from '../utils/facilityManagement.utils';

function ok(res: Response, data: any, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export class FacilityManagementController {
  listFacilities = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const facilities = await facilityManagementService.listFacilities(req.query as any);
      return ok(res, facilities);
    } catch (error) {
      return next(error);
    }
  };

  getFacility = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const facility = await facilityManagementService.getFacility(req.params.facilityId);
      return ok(res, facility);
    } catch (error) {
      return next(error);
    }
  };

  createFacility = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.createFacility(req.body, actor.actorId);
      return ok(res, facility, 'Diagnostic facility created.', 201);
    } catch (error) {
      return next(error);
    }
  };

  updateFacility = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateFacility(req.params.facilityId, req.body, actor.actorId);
      return ok(res, facility, 'Diagnostic facility updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateStatus = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.setFacilityStatus(req.params.facilityId, req.body.status, actor.actorId);
      return ok(res, facility, 'Facility status updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateFeatures = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateFeatures(req.params.facilityId, req.body.features || req.body, actor.actorId);
      return ok(res, facility, 'Facility features updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateDepartments = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateDepartments(req.params.facilityId, req.body.departments || req.body, actor.actorId);
      return ok(res, facility, 'Facility departments updated.');
    } catch (error) {
      return next(error);
    }
  };

  replaceCatalog = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.replaceCatalog(req.params.facilityId, req.body.catalog || req.body, actor.actorId);
      return ok(res, facility, 'Facility catalog updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateRoutingRules = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateRoutingRules(req.params.facilityId, req.body.routingRules || req.body, actor.actorId);
      return ok(res, facility, 'Facility routing rules updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateBranding = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateBranding(req.params.facilityId, req.body, actor.actorId);
      return ok(res, facility, 'Facility branding updated.');
    } catch (error) {
      return next(error);
    }
  };

  updateLimits = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const facility = await facilityManagementService.updateLimits(req.params.facilityId, req.body.limits || req.body, actor.actorId);
      return ok(res, facility, 'Facility limits updated.');
    } catch (error) {
      return next(error);
    }
  };

  assignUser = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const assignment = await facilityManagementService.assignUser(req.params.facilityId, req.body, actor.actorId);
      return ok(res, assignment, 'User assigned to facility.', 201);
    } catch (error) {
      return next(error);
    }
  };

  removeUser = async (req: FacilityManagementRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const actor = getActor(req);
      const assignment = await facilityManagementService.removeUser(req.params.facilityId, req.params.assignmentId, actor.actorId);
      return ok(res, assignment, 'User removed from facility.');
    } catch (error) {
      return next(error);
    }
  };
}

export const facilityManagementController = new FacilityManagementController();

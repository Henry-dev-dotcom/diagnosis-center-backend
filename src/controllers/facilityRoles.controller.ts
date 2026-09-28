import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  createFacilityRole,
  deleteFacilityRole,
  listAssignablePermissions,
  listFacilityRoles,
  updateFacilityRole
} from '../services/facilityRoles.service.js';

export const listPermissionsController = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, 'Permissions loaded successfully', listAssignablePermissions());
});

export const listRolesController = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, 'Roles loaded successfully', await listFacilityRoles());
});

export const createRoleController = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, 'Role created successfully', await createFacilityRole(req.body, req));
});

export const updateRoleController = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Role updated successfully', await updateFacilityRole(req.params.id, req.body, req));
});

export const deleteRoleController = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Role deleted successfully', await deleteFacilityRole(req.params.id, req));
});

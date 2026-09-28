import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { createFacility, getFacility, listFacilities, listModules, setFacilityModules, updateFacility } from '../services/platform.service.js';

export const listModulesController = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, 'Modules loaded successfully', listModules());
});

export const setFacilityModulesController = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Facility modules updated successfully', await setFacilityModules(req.params.id, req.body.modules, req));
});

export const listFacilitiesController = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, 'Facilities loaded successfully', await listFacilities());
});

export const getFacilityController = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Facility loaded successfully', await getFacility(req.params.id));
});

export const createFacilityController = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, 'Facility created successfully', await createFacility(req.body, req));
});

export const updateFacilityController = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Facility updated successfully', await updateFacility(req.params.id, req.body, req));
});

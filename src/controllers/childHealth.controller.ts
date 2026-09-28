import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { IMMUNIZATION_SCHEDULE } from '../config/immunizationSchedule.js';
import { dueList, getImmunizations, recordImmunization, voidImmunization } from '../services/childHealth.service.js';

export const scheduleController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Schedule loaded', { items: IMMUNIZATION_SCHEDULE }));
export const getImmunizationsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Immunizations loaded', await getImmunizations(req.params.id)));
export const recordImmunizationController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Immunization recorded', await recordImmunization(req.params.id, req.body, req)));
export const voidImmunizationController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Immunization voided', await voidImmunization(req.params.id, req.body, req)));
export const dueListController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Due list loaded', await dueList(req.query as never)));

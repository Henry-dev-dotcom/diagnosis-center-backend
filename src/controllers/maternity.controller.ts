import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { endPregnancy, getPregnancy, listPregnancies, recordDelivery, registerPregnancy, updatePregnancy } from '../services/maternity.service.js';

export const listPregnanciesController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Pregnancies loaded', await listPregnancies(req.query as never)));
export const getPregnancyController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Pregnancy loaded', await getPregnancy(req.params.id)));
export const registerPregnancyController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Pregnancy registered', await registerPregnancy(req.body, req)));
export const updatePregnancyController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Pregnancy updated', await updatePregnancy(req.params.id, req.body, req)));
export const endPregnancyController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Pregnancy closed', await endPregnancy(req.params.id, req.body, req)));
export const recordDeliveryController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Delivery recorded', await recordDelivery(req.params.id, req.body, req)));

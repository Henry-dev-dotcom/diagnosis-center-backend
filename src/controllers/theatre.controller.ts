import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  cancelSurgery,
  completeSurgery,
  createTheatre,
  getSurgery,
  listSurgeries,
  listTheatres,
  rescheduleSurgery,
  scheduleSurgery,
  signIn,
  timeOut,
  updateTheatre
} from '../services/theatre.service.js';

export const listTheatresController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Theatres loaded', await listTheatres()));
export const createTheatreController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Theatre created', await createTheatre(req.body, req)));
export const updateTheatreController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Theatre updated', await updateTheatre(req.params.id, req.body, req)));
export const listSurgeriesController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Theatre list loaded', await listSurgeries(req.query as never)));
export const getSurgeryController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Operation loaded', await getSurgery(req.params.id)));
export const scheduleSurgeryController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Operation booked', await scheduleSurgery(req.body, req)));
export const rescheduleSurgeryController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Operation rebooked', await rescheduleSurgery(req.params.id, req.body, req)));
export const signInController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Sign in recorded', await signIn(req.params.id, req.body, req)));
export const timeOutController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Time out recorded', await timeOut(req.params.id, req.body, req)));
export const completeSurgeryController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Operation recorded', await completeSurgery(req.params.id, req.body, req)));
export const cancelSurgeryController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Operation cancelled', await cancelSurgery(req.params.id, req.body, req)));

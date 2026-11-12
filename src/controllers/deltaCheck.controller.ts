import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { cancelRequest, createRequest, getComparison, listIncoming, listOutgoing, listPartnerFacilities, respond } from '../services/deltaCheck.service.js';

export const listDeltaPartnersController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Partner facilities loaded', await listPartnerFacilities()));
export const listDeltaOutgoingController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Requests loaded', await listOutgoing()));
export const listDeltaIncomingController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Requests to answer loaded', await listIncoming()));
export const createDeltaRequestController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Request sent', await createRequest(req.body, req)));
export const respondDeltaRequestController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Answer recorded', await respond(req.params.id, req.body, req)));
export const cancelDeltaRequestController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Request withdrawn', await cancelRequest(req.params.id, req)));
export const deltaComparisonController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Comparison loaded', await getComparison(req.params.id, req)));

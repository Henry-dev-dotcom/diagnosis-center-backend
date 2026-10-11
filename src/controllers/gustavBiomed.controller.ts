import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import * as requests from '../services/gustavBiomed.service.js';

export const listStoreGustavRequestsController = asyncHandler(async (_req: Request, res: Response) =>
  sendSuccess(res, 'Gustav Biomed requests loaded', await requests.listStoreGustavRequests())
);
export const createSupplyRequestController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Supply request recorded for follow-up', await requests.createSupplyRequest(req.body, req))
);
export const listLabMaintenanceRequestsController = asyncHandler(async (_req: Request, res: Response) =>
  sendSuccess(res, 'Analyzer maintenance requests loaded', await requests.listLabMaintenanceRequests())
);
export const createMaintenanceRequestController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Analyzer maintenance request recorded for follow-up', await requests.createMaintenanceRequest(req.body, req))
);
export const updateGustavRequestStatusController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Gustav Biomed request updated', await requests.updateGustavRequestStatus(req.params.id, req.body, req))
);

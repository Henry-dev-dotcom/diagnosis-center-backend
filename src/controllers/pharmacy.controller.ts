import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  adjustStock,
  createDrug,
  dispense,
  dispensingQueue,
  getPrescriptionForDispensing,
  listDrugs,
  listMovements,
  receiveBatch,
  updateDrug
} from '../services/pharmacy.service.js';

export const listDrugsController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Drugs loaded', await listDrugs(req.query as never))
);
export const createDrugController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Drug added', await createDrug(req.body, req))
);
export const updateDrugController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Drug updated', await updateDrug(req.params.id, req.body, req))
);
export const receiveBatchController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Stock received', await receiveBatch(req.params.id, req.body, req))
);
export const adjustStockController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Stock adjusted', await adjustStock(req.params.id, req.body, req))
);
export const listMovementsController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Stock movements loaded', await listMovements(req.params.id))
);
export const dispensingQueueController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Prescriptions loaded', await dispensingQueue((req.query.status as 'PENDING' | 'DISPENSED') ?? 'PENDING'))
);
export const getPrescriptionController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Prescription loaded', await getPrescriptionForDispensing(req.params.id))
);
export const dispenseController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Dispensed', await dispense(req.params.id, req.body, req))
);

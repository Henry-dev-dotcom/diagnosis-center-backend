import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { createLabTest, listLabTests, removeLabTest, saveTestParameters, updateLabTest } from '../services/labTests.service.js';

export const listLabTestsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Laboratory tests loaded', await listLabTests(req.query, req)));
export const createLabTestController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Test added', await createLabTest(req.body, req)));
export const updateLabTestController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Test updated', await updateLabTest(req.params.id, req.body, req)));
export const removeLabTestController = asyncHandler(async (req: Request, res: Response) => {
  const result = await removeLabTest(req.params.id, req);
  return sendSuccess(res, result.removed ? 'Test removed' : 'Test retired: it has history, so it was switched off instead of deleted', result);
});
export const saveTestParametersController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Parameters and reference ranges saved', await saveTestParameters(req.params.id, req.body, req)));

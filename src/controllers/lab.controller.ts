import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  acceptLabSamples,
  attachLabResultFiles,
  createInventoryItem,
  createQualityControlRun,
  getLabPatientTrends,
  getReferenceRanges,
  listAcceptedSamples,
  listInventory,
  listLabReviewQueue,
  listQualityControlRuns,
  listRejectedRetestSamples,
  recordInventoryTransaction,
  rejectLabSample,
  saveLabResultDraft,
  signOffLabResult,
  submitLabResultForReview
} from '../services/lab.service.js';

export const acceptLabSamplesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await acceptLabSamples(req.body, req);
  return sendSuccess(res, 'Lab sample accepted successfully', result, 201);
});

export const acceptLabOrderSamplesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await acceptLabSamples(req.body, req, req.params.orderId);
  return sendSuccess(res, 'Lab order samples accepted successfully', result, 201);
});

export const listAcceptedSamplesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAcceptedSamples(req.query);
  return sendSuccess(res, 'Accepted samples loaded successfully', result);
});

export const saveLabResultDraftController = asyncHandler(async (req: Request, res: Response) => {
  const result = await saveLabResultDraft(req.body, req);
  return sendSuccess(res, 'Lab result draft saved successfully', result, 201);
});

export const submitLabResultReviewController = asyncHandler(async (req: Request, res: Response) => {
  const result = await submitLabResultForReview(req.body, req);
  return sendSuccess(res, 'Lab result submitted for review successfully', result);
});

export const signOffLabResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await signOffLabResult(req.params.id, req.body, req);
  return sendSuccess(res, 'Lab result review decision saved successfully', result);
});

export const attachLabResultFilesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await attachLabResultFiles(req.params.id, req);
  return sendSuccess(res, 'Lab result file upload processed successfully', result);
});

export const rejectLabSampleController = asyncHandler(async (req: Request, res: Response) => {
  const result = await rejectLabSample(req.params.id, req.body, req);
  return sendSuccess(res, 'Lab sample rejection saved successfully', result);
});

export const listLabReviewQueueController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listLabReviewQueue(req.query);
  return sendSuccess(res, 'Lab review queue loaded successfully', result);
});

export const listRejectedRetestSamplesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listRejectedRetestSamples(req.query);
  return sendSuccess(res, 'Rejected and retest samples loaded successfully', result);
});

export const getReferenceRangesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getReferenceRanges(req.params.catalogItemId);
  return sendSuccess(res, 'Lab reference ranges loaded successfully', result);
});

export const getLabPatientTrendsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getLabPatientTrends(req.params.patientId, req.query);
  return sendSuccess(res, 'Lab patient trends loaded successfully', result);
});

export const listQualityControlRunsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listQualityControlRuns(req.query);
  return sendSuccess(res, 'Quality-control runs loaded successfully', result);
});

export const createQualityControlRunController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createQualityControlRun(req.body, req);
  return sendSuccess(res, 'Quality-control run created successfully', result, 201);
});

export const listInventoryController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listInventory(req.query);
  return sendSuccess(res, 'Lab inventory loaded successfully', result);
});

export const createInventoryItemController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createInventoryItem(req.body, req);
  return sendSuccess(res, 'Lab inventory item created successfully', result, 201);
});

export const recordInventoryTransactionController = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordInventoryTransaction(req.params.id, req.body, req);
  return sendSuccess(res, 'Lab inventory transaction recorded successfully', result, 201);
});

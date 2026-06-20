import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  acceptScans,
  attachScanResultFiles,
  createScanBooking,
  listAcceptedScans,
  listPriorScans,
  listRejectedRetakeScans,
  listScanBookings,
  listScanReviewQueue,
  requestScanRetake,
  saveScanResultDraft,
  signOffScanResult,
  submitScanResultForReview
} from '../services/scan.service.js';

export const acceptScansController = asyncHandler(async (req: Request, res: Response) => {
  const result = await acceptScans(req.body, req);
  return sendSuccess(res, 'Scan request accepted successfully', result, 201);
});

export const acceptScanOrderController = asyncHandler(async (req: Request, res: Response) => {
  const result = await acceptScans(req.body, req, req.params.orderId);
  return sendSuccess(res, 'Scan order accepted successfully', result, 201);
});

export const listAcceptedScansController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAcceptedScans(req.query);
  return sendSuccess(res, 'Accepted scans loaded successfully', result);
});

export const createScanBookingController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createScanBooking(req.body, req);
  return sendSuccess(res, 'Scan booking created successfully', result, 201);
});

export const listScanBookingsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listScanBookings(req.query);
  return sendSuccess(res, 'Scan bookings loaded successfully', result);
});

export const saveScanResultDraftController = asyncHandler(async (req: Request, res: Response) => {
  const result = await saveScanResultDraft(req.body, req);
  return sendSuccess(res, 'Scan report draft saved successfully', result, 201);
});

export const submitScanResultReviewController = asyncHandler(async (req: Request, res: Response) => {
  const result = await submitScanResultForReview(req.body, req);
  return sendSuccess(res, 'Scan report submitted for review successfully', result);
});

export const signOffScanResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await signOffScanResult(req.params.id, req.body, req);
  return sendSuccess(res, 'Scan report review decision saved successfully', result);
});

export const requestScanRetakeController = asyncHandler(async (req: Request, res: Response) => {
  const result = await requestScanRetake(req.body, req);
  return sendSuccess(res, 'Scan retake request saved successfully', result, 201);
});

export const listScanReviewQueueController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listScanReviewQueue(req.query);
  return sendSuccess(res, 'Scan review queue loaded successfully', result);
});

export const listRejectedRetakeScansController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listRejectedRetakeScans(req.query);
  return sendSuccess(res, 'Rejected and retake scans loaded successfully', result);
});

export const attachScanResultFilesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await attachScanResultFiles(req.params.id, req.body, req);
  return sendSuccess(res, 'Scan image/DICOM metadata attached successfully', result, 201);
});

export const listPriorScansController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listPriorScans(req.params.patientId, req.query);
  return sendSuccess(res, 'Prior scan comparison history loaded successfully', result);
});

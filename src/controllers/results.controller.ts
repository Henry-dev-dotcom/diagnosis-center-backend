import { DeliveryChannel } from '@prisma/client';
import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  getPdfReadyReport,
  getResultDetail,
  listDeliveryLogs,
  listResults,
  releaseResult,
  retryDeliveryLog,
  sendResultDelivery
} from '../services/results.service.js';

export const listResultsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listResults(req.query, req);
  return sendSuccess(res, 'Results loaded successfully', result);
});

export const getResultDetailController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getResultDetail(req.params.id, req);
  return sendSuccess(res, 'Result detail loaded successfully', result);
});

export const releaseResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await releaseResult(req.params.id, req.body, req);
  return sendSuccess(res, 'Result released successfully', result);
});

export const getResultReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPdfReadyReport(req.params.id, req);
  return sendSuccess(res, 'PDF-ready report payload loaded successfully', result);
});

export const emailResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendResultDelivery(req.params.id, DeliveryChannel.EMAIL, req.body, req);
  return sendSuccess(res, 'Result email delivery recorded successfully', result, 201);
});

export const smsResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendResultDelivery(req.params.id, DeliveryChannel.SMS, req.body, req);
  return sendSuccess(res, 'Privacy-safe SMS result notice recorded successfully', result, 201);
});

export const whatsappResultController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendResultDelivery(req.params.id, DeliveryChannel.WHATSAPP, req.body, req);
  return sendSuccess(res, 'Privacy-safe WhatsApp result notice recorded successfully', result, 201);
});

export const listDeliveryLogsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listDeliveryLogs(req.query);
  return sendSuccess(res, 'Result delivery logs loaded successfully', result);
});

export const retryDeliveryLogController = asyncHandler(async (req: Request, res: Response) => {
  const result = await retryDeliveryLog(req.params.id, req.body, req);
  return sendSuccess(res, 'Delivery retry recorded successfully', result);
});

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  exportAdminFullBundle,
  exportAuditReview,
  getAuditReviewDashboard,
  getExecutiveDashboard,
  getFinanceDashboard,
  getLabDashboard,
  getReceptionDashboard,
  getScanDashboard
} from '../services/analytics.service.js';

export const executiveDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getExecutiveDashboard(req.query, req);
  return sendSuccess(res, 'Executive dashboard loaded successfully', result);
});

export const financeDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getFinanceDashboard(req.query, req);
  return sendSuccess(res, 'Finance analytics dashboard loaded successfully', result);
});

export const labDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getLabDashboard(req.query, req);
  return sendSuccess(res, 'Laboratory analytics dashboard loaded successfully', result);
});

export const scanDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getScanDashboard(req.query, req);
  return sendSuccess(res, 'Scan analytics dashboard loaded successfully', result);
});

export const receptionDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getReceptionDashboard(req.query, req);
  return sendSuccess(res, 'Reception analytics dashboard loaded successfully', result);
});

export const auditReviewDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAuditReviewDashboard(req.query, req);
  return sendSuccess(res, 'Audit review dashboard loaded successfully', result);
});

export const auditReviewExportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await exportAuditReview(req.query, req);
  return sendSuccess(res, 'Audit review export generated successfully', result);
});

export const adminFullExportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await exportAdminFullBundle(req.query, req);
  return sendSuccess(res, 'Admin full export bundle generated successfully', result);
});

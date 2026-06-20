import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  exportReport,
  getAbnormalResultsReport,
  getOrderVolumeReport,
  getOutstandingReport,
  getReportsOverview,
  getResultsDeliveryReport,
  getRevenueReport,
  getStaffProductivityReport,
  getTurnaroundTimeReport
} from '../services/reports.service.js';

export const reportsOverviewController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getReportsOverview(req.query);
  return sendSuccess(res, 'Reports overview loaded successfully', result);
});

export const turnaroundTimeReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getTurnaroundTimeReport(req.query);
  return sendSuccess(res, 'Turnaround time report loaded successfully', result);
});

export const orderVolumeReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getOrderVolumeReport(req.query);
  return sendSuccess(res, 'Order volume report loaded successfully', result);
});

export const revenueReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getRevenueReport(req.query);
  return sendSuccess(res, 'Revenue report loaded successfully', result);
});

export const outstandingReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getOutstandingReport(req.query);
  return sendSuccess(res, 'Outstanding invoice report loaded successfully', result);
});

export const abnormalResultsReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAbnormalResultsReport(req.query);
  return sendSuccess(res, 'Abnormal results report loaded successfully', result);
});

export const staffProductivityReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getStaffProductivityReport(req.query);
  return sendSuccess(res, 'Staff productivity report loaded successfully', result);
});

export const resultsDeliveryReportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getResultsDeliveryReport(req.query);
  return sendSuccess(res, 'Results delivery report loaded successfully', result);
});

export const reportExportController = asyncHandler(async (req: Request, res: Response) => {
  const result = await exportReport(req.query, req);
  return sendSuccess(res, 'Report export payload generated successfully', result);
});

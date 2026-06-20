import { Router } from 'express';
import { UserRole } from '@prisma/client';
import {
  abnormalResultsReportController,
  orderVolumeReportController,
  outstandingReportController,
  reportExportController,
  reportsOverviewController,
  resultsDeliveryReportController,
  revenueReportController,
  staffProductivityReportController,
  turnaroundTimeReportController
} from '../controllers/reports.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { dateRangeQuerySchema } from '../validators/common.validators.js';
import {
  auditReviewDashboardController,
  executiveDashboardController,
  financeDashboardController,
  labDashboardController,
  receptionDashboardController,
  scanDashboardController
} from '../controllers/analytics.controller.js';

export const reportsRoutes = Router();
reportsRoutes.use('/reports', requireAuth, requireRole(UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.LAB_STAFF, UserRole.SCAN_STAFF));
reportsRoutes.get('/reports', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_FINANCE_READ), validateRequest({ query: dateRangeQuerySchema }), reportsOverviewController);

reportsRoutes.get('/reports/dashboard', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_FINANCE_READ), validateRequest({ query: dateRangeQuerySchema }), executiveDashboardController);
reportsRoutes.get('/reports/analytics/finance', requireAnyPermission(PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ), validateRequest({ query: dateRangeQuerySchema }), financeDashboardController);
reportsRoutes.get('/reports/analytics/lab', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_REVIEW_QUEUE_READ), validateRequest({ query: dateRangeQuerySchema }), labDashboardController);
reportsRoutes.get('/reports/analytics/scan', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.SCAN_REVIEW_QUEUE_READ), validateRequest({ query: dateRangeQuerySchema }), scanDashboardController);
reportsRoutes.get('/reports/analytics/reception', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.RECEPTION_ORDERS_READ), validateRequest({ query: dateRangeQuerySchema }), receptionDashboardController);
reportsRoutes.get('/reports/analytics/audit', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: dateRangeQuerySchema }), auditReviewDashboardController);
reportsRoutes.get('/reports/tat', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_QUEUE_READ, PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ query: dateRangeQuerySchema }), turnaroundTimeReportController);
reportsRoutes.get('/reports/order-volume', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_QUEUE_READ, PERMISSIONS.SCAN_QUEUE_READ), validateRequest({ query: dateRangeQuerySchema }), orderVolumeReportController);
reportsRoutes.get('/reports/revenue', requireAnyPermission(PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ), validateRequest({ query: dateRangeQuerySchema }), revenueReportController);
reportsRoutes.get('/reports/outstanding', requireAnyPermission(PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ), validateRequest({ query: dateRangeQuerySchema }), outstandingReportController);
reportsRoutes.get('/reports/abnormal-results', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_REVIEW_QUEUE_READ), validateRequest({ query: dateRangeQuerySchema }), abnormalResultsReportController);
reportsRoutes.get('/reports/staff-productivity', requireAnyPermission(PERMISSIONS.REPORTS_READ, PERMISSIONS.ADMIN_AUDIT_READ), validateRequest({ query: dateRangeQuerySchema }), staffProductivityReportController);
reportsRoutes.get('/reports/results-delivery', requireAnyPermission(PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE), validateRequest({ query: dateRangeQuerySchema }), resultsDeliveryReportController);
reportsRoutes.get('/reports/export', requireAnyPermission(PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_READ), validateRequest({ query: dateRangeQuerySchema }), reportExportController);

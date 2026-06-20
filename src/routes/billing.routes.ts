import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import {
  getInvoiceController,
  getReceiptController,
  listInvoicesController,
  recordInvoicePaymentController,
  recordInvoiceRefundController,
  updateInvoiceController
} from '../controllers/billing.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireFinanceRole } from '../middleware/resourceScope.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { invoiceQuerySchema, paymentSchema, refundSchema, updateInvoiceSchema } from '../validators/billing.validators.js';

export const billingRoutes = Router();
billingRoutes.use('/billing', requireAuth, requireRole(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF), requireFinanceRole());
billingRoutes.get('/billing', requirePermission(PERMISSIONS.BILLING_INVOICES_READ), moduleLanding('billing'));
billingRoutes.get('/billing/invoices', requirePermission(PERMISSIONS.BILLING_INVOICES_READ), validateRequest({ query: invoiceQuerySchema }), listInvoicesController);
billingRoutes.get('/billing/invoices/:id', requirePermission(PERMISSIONS.BILLING_INVOICES_READ), validateRequest({ params: idParamSchema }), getInvoiceController);
billingRoutes.patch('/billing/invoices/:id', requirePermission(PERMISSIONS.BILLING_INVOICES_MANAGE), validateRequest({ params: idParamSchema, body: updateInvoiceSchema }), updateInvoiceController);
billingRoutes.post('/billing/invoices/:id/payments', requirePermission(PERMISSIONS.BILLING_PAYMENTS_CREATE), validateRequest({ params: idParamSchema, body: paymentSchema }), recordInvoicePaymentController);
billingRoutes.post('/billing/invoices/:id/refund', requirePermission(PERMISSIONS.BILLING_REFUNDS_MANAGE), validateRequest({ params: idParamSchema, body: refundSchema }), recordInvoiceRefundController);
billingRoutes.get('/billing/receipts/:id', requirePermission(PERMISSIONS.BILLING_INVOICES_READ), validateRequest({ params: idParamSchema }), getReceiptController);

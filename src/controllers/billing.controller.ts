import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getInvoice, getReceipt, listInvoices, recordInvoicePayment, recordInvoiceRefund, updateInvoice } from '../services/billing.service.js';

export const listInvoicesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listInvoices(req.query);
  return sendSuccess(res, 'Invoices loaded successfully', result);
});

export const getInvoiceController = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await getInvoice(req.params.id);
  return sendSuccess(res, 'Invoice loaded successfully', invoice);
});

export const updateInvoiceController = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await updateInvoice(req.params.id, req.body, req);
  return sendSuccess(res, 'Invoice updated successfully', invoice);
});

export const recordInvoicePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordInvoicePayment(req.params.id, req.body, req);
  return sendSuccess(res, 'Payment recorded successfully', result, 201);
});

export const recordInvoiceRefundController = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await recordInvoiceRefund(req.params.id, req.body, req);
  return sendSuccess(res, 'Refund recorded successfully', invoice);
});

export const getReceiptController = asyncHandler(async (req: Request, res: Response) => {
  const receipt = await getReceipt(req.params.id);
  return sendSuccess(res, 'Receipt loaded successfully', receipt);
});

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  closeShift,
  createExpense,
  createFloatAdjustment,
  getCurrentShift,
  getFinanceAnalytics,
  getReceivableAgeing,
  listExpenses,
  listFloatTransactions,
  listLedger,
  listShifts,
  recordExpensePayment,
  startShift,
  updateExpense,
  writeOffExpense
} from '../services/finance.service.js';

export const startShiftController = asyncHandler(async (req: Request, res: Response) => {
  const shift = await startShift(req.body, req);
  return sendSuccess(res, 'Cashier shift started successfully', shift, 201);
});

export const closeShiftController = asyncHandler(async (req: Request, res: Response) => {
  const shift = await closeShift(req.params.id, req.body, req);
  return sendSuccess(res, 'Cashier shift closed successfully', shift);
});

export const getCurrentShiftController = asyncHandler(async (req: Request, res: Response) => {
  const shift = await getCurrentShift(req);
  return sendSuccess(res, 'Current cashier shift loaded successfully', shift);
});

export const listShiftsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listShifts(req.query, req);
  return sendSuccess(res, 'Cashier shifts loaded successfully', result);
});

export const listFloatTransactionsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listFloatTransactions(req.query, req);
  return sendSuccess(res, 'Float transactions loaded successfully', result);
});

export const createFloatAdjustmentController = asyncHandler(async (req: Request, res: Response) => {
  const adjustment = await createFloatAdjustment(req.body, req);
  return sendSuccess(res, 'Float adjustment recorded successfully', adjustment, 201);
});

export const listExpensesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listExpenses(req.query);
  return sendSuccess(res, 'Expenses loaded successfully', result);
});

export const createExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const expense = await createExpense(req.body, req);
  return sendSuccess(res, 'Expense created successfully', expense, 201);
});

export const updateExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const expense = await updateExpense(req.params.id, req.body, req);
  return sendSuccess(res, 'Expense updated successfully', expense);
});

export const recordExpensePaymentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordExpensePayment(req.params.id, req.body, req);
  return sendSuccess(res, 'Expense payment recorded successfully', result, 201);
});

export const writeOffExpenseController = asyncHandler(async (req: Request, res: Response) => {
  const expense = await writeOffExpense(req.params.id, req.body, req);
  return sendSuccess(res, 'Expense written off successfully', expense);
});

export const listLedgerController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listLedger(req.query);
  return sendSuccess(res, 'Ledger entries loaded successfully', result);
});

export const getFinanceAnalyticsController = asyncHandler(async (req: Request, res: Response) => {
  const analytics = await getFinanceAnalytics(req.query);
  return sendSuccess(res, 'Finance analytics loaded successfully', analytics);
});

export const getReceivableAgeingController = asyncHandler(async (req: Request, res: Response) => {
  const ageing = await getReceivableAgeing(req.query);
  return sendSuccess(res, 'Receivable ageing loaded successfully', ageing);
});

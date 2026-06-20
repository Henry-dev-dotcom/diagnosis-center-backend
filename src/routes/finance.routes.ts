import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { moduleLanding } from '../controllers/protectedModule.controller.js';
import {
  closeShiftController,
  createExpenseController,
  createFloatAdjustmentController,
  getCurrentShiftController,
  getFinanceAnalyticsController,
  getReceivableAgeingController,
  listExpensesController,
  listFloatTransactionsController,
  listLedgerController,
  listShiftsController,
  recordExpensePaymentController,
  startShiftController,
  updateExpenseController,
  writeOffExpenseController
} from '../controllers/finance.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { requireFinanceRole } from '../middleware/resourceScope.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { closeShiftSchema, expensePaymentSchema, expenseQuerySchema, expenseSchema, expenseWriteOffSchema, financeAnalyticsQuerySchema, floatAdjustmentSchema, floatQuerySchema, ledgerQuerySchema, shiftQuerySchema, startShiftSchema, updateExpenseSchema } from '../validators/finance.validators.js';

export const financeRoutes = Router();
financeRoutes.use('/finance', requireAuth, requireRole(UserRole.ADMIN, UserRole.BILLING_STAFF), requireFinanceRole());
financeRoutes.get('/finance', requireAnyPermission(PERMISSIONS.FINANCE_LEDGER_READ, PERMISSIONS.FINANCE_ANALYTICS_READ), moduleLanding('finance'));
financeRoutes.post('/finance/shifts/start', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), validateRequest({ body: startShiftSchema }), startShiftController);
financeRoutes.post('/finance/shifts', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), validateRequest({ body: startShiftSchema }), startShiftController);
financeRoutes.post('/finance/shifts/:id/close', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), validateRequest({ params: idParamSchema, body: closeShiftSchema }), closeShiftController);
financeRoutes.get('/finance/shifts/current', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), getCurrentShiftController);
financeRoutes.get('/finance/shifts', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), validateRequest({ query: shiftQuerySchema }), listShiftsController);
financeRoutes.get('/finance/shifts/history', requirePermission(PERMISSIONS.FINANCE_SHIFTS_MANAGE), validateRequest({ query: shiftQuerySchema }), listShiftsController);
financeRoutes.get('/finance/float', requirePermission(PERMISSIONS.FINANCE_FLOAT_MANAGE), validateRequest({ query: floatQuerySchema }), listFloatTransactionsController);
financeRoutes.post('/finance/float/adjustments', requirePermission(PERMISSIONS.FINANCE_FLOAT_MANAGE), validateRequest({ body: floatAdjustmentSchema }), createFloatAdjustmentController);
financeRoutes.get('/finance/expenses', requirePermission(PERMISSIONS.FINANCE_EXPENSES_MANAGE), validateRequest({ query: expenseQuerySchema }), listExpensesController);
financeRoutes.post('/finance/expenses', requirePermission(PERMISSIONS.FINANCE_EXPENSES_MANAGE), validateRequest({ body: expenseSchema }), createExpenseController);
financeRoutes.patch('/finance/expenses/:id', requirePermission(PERMISSIONS.FINANCE_EXPENSES_MANAGE), validateRequest({ params: idParamSchema, body: updateExpenseSchema }), updateExpenseController);
financeRoutes.post('/finance/expenses/:id/payment', requirePermission(PERMISSIONS.FINANCE_EXPENSES_MANAGE), validateRequest({ params: idParamSchema, body: expensePaymentSchema }), recordExpensePaymentController);
financeRoutes.post('/finance/expenses/:id/write-off', requirePermission(PERMISSIONS.FINANCE_EXPENSES_MANAGE), validateRequest({ params: idParamSchema, body: expenseWriteOffSchema }), writeOffExpenseController);
financeRoutes.get('/finance/ledger', requirePermission(PERMISSIONS.FINANCE_LEDGER_READ), validateRequest({ query: ledgerQuerySchema }), listLedgerController);
financeRoutes.get('/finance/analytics', requirePermission(PERMISSIONS.FINANCE_ANALYTICS_READ), validateRequest({ query: financeAnalyticsQuerySchema }), getFinanceAnalyticsController);
financeRoutes.get('/finance/ageing', requirePermission(PERMISSIONS.FINANCE_ANALYTICS_READ), validateRequest({ query: financeAnalyticsQuerySchema }), getReceivableAgeingController);

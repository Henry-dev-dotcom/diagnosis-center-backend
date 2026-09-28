import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  createDrugSchema,
  dispenseSchema,
  dispensingQueueSchema,
  drugQuerySchema,
  receiveBatchSchema,
  stockAdjustmentSchema,
  updateDrugSchema
} from '../validators/pharmacy.validators.js';
import {
  adjustStockController,
  createDrugController,
  dispenseController,
  dispensingQueueController,
  getPrescriptionController,
  listDrugsController,
  listMovementsController,
  receiveBatchController,
  updateDrugController
} from '../controllers/pharmacy.controller.js';

const P = PERMISSIONS;

export const pharmacyRoutes = Router();
pharmacyRoutes.use('/pharmacy', requireAuth, requireModule('pharmacy'), requireRole(UserRole.ADMIN, UserRole.PHARMACIST));
pharmacyRoutes.get('/pharmacy/drugs', requirePermission(P.PHARMACY_FORMULARY_READ), validateRequest({ query: drugQuerySchema }), listDrugsController);
pharmacyRoutes.post('/pharmacy/drugs', requirePermission(P.PHARMACY_DRUGS_MANAGE), validateRequest({ body: createDrugSchema }), createDrugController);
pharmacyRoutes.patch('/pharmacy/drugs/:id', requirePermission(P.PHARMACY_DRUGS_MANAGE), validateRequest({ params: idParamSchema, body: updateDrugSchema }), updateDrugController);
pharmacyRoutes.post('/pharmacy/drugs/:id/batches', requirePermission(P.PHARMACY_STOCK_MANAGE), validateRequest({ params: idParamSchema, body: receiveBatchSchema }), receiveBatchController);
pharmacyRoutes.post('/pharmacy/drugs/:id/adjustments', requirePermission(P.PHARMACY_STOCK_MANAGE), validateRequest({ params: idParamSchema, body: stockAdjustmentSchema }), adjustStockController);
pharmacyRoutes.get('/pharmacy/drugs/:id/movements', requirePermission(P.PHARMACY_STOCK_MANAGE), validateRequest({ params: idParamSchema }), listMovementsController);
pharmacyRoutes.get('/pharmacy/prescriptions', requirePermission(P.PHARMACY_DISPENSE), validateRequest({ query: dispensingQueueSchema }), dispensingQueueController);
pharmacyRoutes.get('/pharmacy/prescriptions/:id', requirePermission(P.PHARMACY_DISPENSE), validateRequest({ params: idParamSchema }), getPrescriptionController);
pharmacyRoutes.post('/pharmacy/prescriptions/:id/dispense', requirePermission(P.PHARMACY_DISPENSE), validateRequest({ params: idParamSchema, body: dispenseSchema }), dispenseController);

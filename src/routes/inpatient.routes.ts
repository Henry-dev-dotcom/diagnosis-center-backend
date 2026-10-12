import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  addBedsSchema,
  administerSchema,
  admissionItemParamSchema,
  admissionQuerySchema,
  admitSchema,
  bedStatusSchema,
  cancelAdmissionSchema,
  createWardSchema,
  dischargeSchema,
  fluidQuerySchema,
  fluidSchema,
  marQuerySchema,
  transferSchema,
  updateWardSchema
} from '../validators/inpatient.validators.js';
import {
  addBedsController,
  administerController,
  admitController,
  bedStatusController,
  boardController,
  cancelAdmissionController,
  createWardController,
  dischargeController,
  getAdmissionController,
  listAdmissionsController,
  listFluidsController,
  listWardsController,
  medicationChartController,
  recordFluidController,
  resultsReviewedController,
  transferController,
  updateWardController
} from '../controllers/inpatient.controller.js';

const P = PERMISSIONS;

export const inpatientRoutes = Router();
inpatientRoutes.use('/inpatient', requireAuth, requireModule('inpatient'), requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE));
inpatientRoutes.get('/inpatient/wards', requirePermission(P.INPATIENT_READ), listWardsController);
inpatientRoutes.post('/inpatient/wards', requirePermission(P.INPATIENT_WARDS_MANAGE), validateRequest({ body: createWardSchema }), createWardController);
inpatientRoutes.patch('/inpatient/wards/:id', requirePermission(P.INPATIENT_WARDS_MANAGE), validateRequest({ params: idParamSchema, body: updateWardSchema }), updateWardController);
inpatientRoutes.post('/inpatient/wards/:id/beds', requirePermission(P.INPATIENT_WARDS_MANAGE), validateRequest({ params: idParamSchema, body: addBedsSchema }), addBedsController);
inpatientRoutes.patch('/inpatient/beds/:id', requirePermission(P.INPATIENT_BED_STATUS), validateRequest({ params: idParamSchema, body: bedStatusSchema }), bedStatusController);
inpatientRoutes.get('/inpatient/board', requirePermission(P.INPATIENT_READ), boardController);
inpatientRoutes.get('/inpatient/admissions', requirePermission(P.INPATIENT_READ), validateRequest({ query: admissionQuerySchema }), listAdmissionsController);
inpatientRoutes.post('/inpatient/admissions', requirePermission(P.INPATIENT_ADMIT), validateRequest({ body: admitSchema }), admitController);
inpatientRoutes.get('/inpatient/admissions/:id', requirePermission(P.INPATIENT_READ), validateRequest({ params: idParamSchema }), getAdmissionController);
inpatientRoutes.post('/inpatient/admissions/:id/transfer', requirePermission(P.INPATIENT_TRANSFER), validateRequest({ params: idParamSchema, body: transferSchema }), transferController);
inpatientRoutes.post('/inpatient/admissions/:id/medications/:itemId', requirePermission(P.INPATIENT_ADMINISTER), validateRequest({ params: admissionItemParamSchema, body: administerSchema }), administerController);
inpatientRoutes.get('/inpatient/admissions/:id/medication-chart', requirePermission(P.INPATIENT_READ), validateRequest({ params: idParamSchema, query: marQuerySchema }), medicationChartController);
inpatientRoutes.post('/inpatient/admissions/:id/results-reviewed', requirePermission(P.INPATIENT_REVIEW_RESULTS), validateRequest({ params: idParamSchema }), resultsReviewedController);
inpatientRoutes.get('/inpatient/admissions/:id/fluids', requirePermission(P.INPATIENT_READ), validateRequest({ params: idParamSchema, query: fluidQuerySchema }), listFluidsController);
inpatientRoutes.post('/inpatient/admissions/:id/fluids', requirePermission(P.INPATIENT_ADMINISTER), validateRequest({ params: idParamSchema, body: fluidSchema }), recordFluidController);
inpatientRoutes.post('/inpatient/admissions/:id/discharge', requirePermission(P.INPATIENT_DISCHARGE), validateRequest({ params: idParamSchema, body: dischargeSchema }), dischargeController);
inpatientRoutes.post('/inpatient/admissions/:id/cancel', requirePermission(P.INPATIENT_ADMIT), validateRequest({ params: idParamSchema, body: cancelAdmissionSchema }), cancelAdmissionController);

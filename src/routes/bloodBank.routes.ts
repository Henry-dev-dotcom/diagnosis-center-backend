import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAnyPermission, requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  bloodRequestSchema,
  cancelSchema,
  crossmatchSchema,
  deferSchema,
  discardSchema,
  donationSchema,
  donorQuerySchema,
  donorSchema,
  emergencySchema,
  issueSchema,
  requestQuerySchema,
  screeningSchema,
  transfusionSchema,
  unitQuerySchema
} from '../validators/bloodBank.validators.js';
import * as c from '../controllers/bloodBank.controller.js';

const P = PERMISSIONS;

// The laboratory runs the bank; doctors request blood; nurses record transfusions.
export const bloodBankRoutes = Router();
bloodBankRoutes.use('/blood-bank', requireAuth, requireModule('blood_bank'), requireRole(UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.DOCTOR, UserRole.NURSE));
bloodBankRoutes.get('/blood-bank/stock', requirePermission(P.BLOODBANK_READ), c.stockController);
bloodBankRoutes.get('/blood-bank/units', requirePermission(P.BLOODBANK_READ), validateRequest({ query: unitQuerySchema }), c.listUnitsController);
bloodBankRoutes.post('/blood-bank/units/:id/discard', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: discardSchema }), c.discardController);
bloodBankRoutes.get('/blood-bank/donors', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ query: donorQuerySchema }), c.listDonorsController);
bloodBankRoutes.post('/blood-bank/donors', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ body: donorSchema }), c.registerDonorController);
bloodBankRoutes.get('/blood-bank/donors/:id', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema }), c.getDonorController);
bloodBankRoutes.post('/blood-bank/donors/:id/defer', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: deferSchema }), c.deferDonorController);
bloodBankRoutes.post('/blood-bank/donors/:id/donations', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: donationSchema }), c.donationController);
bloodBankRoutes.post('/blood-bank/donations/:id/screening', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: screeningSchema }), c.screeningController);
bloodBankRoutes.get('/blood-bank/requests', requireAnyPermission(P.BLOODBANK_READ, P.BLOODBANK_REQUEST), validateRequest({ query: requestQuerySchema }), c.listRequestsController);
bloodBankRoutes.post('/blood-bank/requests', requirePermission(P.BLOODBANK_REQUEST), validateRequest({ body: bloodRequestSchema }), c.createRequestController);
bloodBankRoutes.get('/blood-bank/requests/:id', requireAnyPermission(P.BLOODBANK_READ, P.BLOODBANK_REQUEST), validateRequest({ params: idParamSchema }), c.getRequestController);
bloodBankRoutes.post('/blood-bank/requests/:id/crossmatch', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: crossmatchSchema }), c.crossmatchController);
bloodBankRoutes.post('/blood-bank/requests/:id/issue', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: issueSchema }), c.issueController);
bloodBankRoutes.post('/blood-bank/requests/:id/emergency-release', requirePermission(P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: emergencySchema }), c.emergencyController);
bloodBankRoutes.post('/blood-bank/requests/:id/cancel', requireAnyPermission(P.BLOODBANK_REQUEST, P.BLOODBANK_MANAGE), validateRequest({ params: idParamSchema, body: cancelSchema }), c.cancelController);
bloodBankRoutes.post('/blood-bank/transfusions/:id', requirePermission(P.BLOODBANK_TRANSFUSE), validateRequest({ params: idParamSchema, body: transfusionSchema }), c.transfusionController);

import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { deliverySchema, endPregnancySchema, pregnancyQuerySchema, registerPregnancySchema, updatePregnancySchema } from '../validators/maternity.validators.js';
import {
  endPregnancyController,
  getPregnancyController,
  listPregnanciesController,
  recordDeliveryController,
  registerPregnancyController,
  updatePregnancyController
} from '../controllers/maternity.controller.js';

const P = PERMISSIONS;

export const maternityRoutes = Router();
maternityRoutes.use('/maternity', requireAuth, requireModule('maternity'), requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE));
maternityRoutes.get('/maternity/pregnancies', requirePermission(P.MATERNITY_READ), validateRequest({ query: pregnancyQuerySchema }), listPregnanciesController);
maternityRoutes.post('/maternity/pregnancies', requirePermission(P.MATERNITY_REGISTER), validateRequest({ body: registerPregnancySchema }), registerPregnancyController);
maternityRoutes.get('/maternity/pregnancies/:id', requirePermission(P.MATERNITY_READ), validateRequest({ params: idParamSchema }), getPregnancyController);
maternityRoutes.patch('/maternity/pregnancies/:id', requirePermission(P.MATERNITY_REGISTER), validateRequest({ params: idParamSchema, body: updatePregnancySchema }), updatePregnancyController);
maternityRoutes.post('/maternity/pregnancies/:id/end', requirePermission(P.MATERNITY_REGISTER), validateRequest({ params: idParamSchema, body: endPregnancySchema }), endPregnancyController);
maternityRoutes.post('/maternity/pregnancies/:id/delivery', requirePermission(P.MATERNITY_DELIVER), validateRequest({ params: idParamSchema, body: deliverySchema }), recordDeliveryController);

import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { dueListQuerySchema, recordImmunizationSchema, voidImmunizationSchema } from '../validators/childHealth.validators.js';
import {
  dueListController,
  getImmunizationsController,
  recordImmunizationController,
  scheduleController,
  voidImmunizationController
} from '../controllers/childHealth.controller.js';

const P = PERMISSIONS;

export const childHealthRoutes = Router();
childHealthRoutes.use('/child-health', requireAuth, requireModule('child_health'), requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE));
childHealthRoutes.get('/child-health/schedule', requirePermission(P.IMMUNIZATION_READ), scheduleController);
childHealthRoutes.get('/child-health/due-list', requirePermission(P.IMMUNIZATION_READ), validateRequest({ query: dueListQuerySchema }), dueListController);
childHealthRoutes.get('/child-health/patients/:id/immunizations', requirePermission(P.IMMUNIZATION_READ), validateRequest({ params: idParamSchema }), getImmunizationsController);
childHealthRoutes.post('/child-health/patients/:id/immunizations', requirePermission(P.IMMUNIZATION_RECORD), validateRequest({ params: idParamSchema, body: recordImmunizationSchema }), recordImmunizationController);
childHealthRoutes.post('/child-health/immunizations/:id/void', requirePermission(P.IMMUNIZATION_RECORD), validateRequest({ params: idParamSchema, body: voidImmunizationSchema }), voidImmunizationController);

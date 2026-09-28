import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createFacilityController,
  getFacilityController,
  listFacilitiesController,
  listModulesController,
  setFacilityModulesController,
  updateFacilityController
} from '../controllers/platform.controller.js';
import { createFacilitySchema, facilityIdParamSchema, setFacilityModulesSchema, updateFacilitySchema } from '../validators/platform.validators.js';

// The role check keeps facility ADMINs (whose permissions are '*') out.
export const platformRoutes = Router();
platformRoutes.use('/platform', requireAuth, requireRole(UserRole.PLATFORM_ADMIN));
platformRoutes.get('/platform/facilities', requirePermission(PERMISSIONS.PLATFORM_FACILITIES_READ), listFacilitiesController);
platformRoutes.post('/platform/facilities', requirePermission(PERMISSIONS.PLATFORM_FACILITIES_MANAGE), validateRequest({ body: createFacilitySchema }), createFacilityController);
platformRoutes.get('/platform/facilities/:id', requirePermission(PERMISSIONS.PLATFORM_FACILITIES_READ), validateRequest({ params: facilityIdParamSchema }), getFacilityController);
platformRoutes.get('/platform/modules', requirePermission(PERMISSIONS.PLATFORM_FACILITIES_READ), listModulesController);
platformRoutes.put('/platform/facilities/:id/modules', requirePermission(PERMISSIONS.PLATFORM_FACILITIES_MANAGE), validateRequest({ params: facilityIdParamSchema, body: setFacilityModulesSchema }), setFacilityModulesController);
platformRoutes.patch('/platform/facilities/:id',requirePermission(PERMISSIONS.PLATFORM_FACILITIES_MANAGE), validateRequest({ params: facilityIdParamSchema, body: updateFacilitySchema }), updateFacilityController);

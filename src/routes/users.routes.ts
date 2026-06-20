import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema, paginationQuerySchema } from '../validators/common.validators.js';
import { createUserSchema, updateUserSchema } from '../validators/admin.validators.js';
import { createUserController, deactivateUserController, listUsersController, updateUserController } from '../controllers/adminBusiness.controller.js';

export const usersRoutes = Router();
usersRoutes.use('/users', requireAuth, requireRole(UserRole.ADMIN));
usersRoutes.get('/users', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ query: paginationQuerySchema }), listUsersController);
usersRoutes.post('/users', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ body: createUserSchema }), createUserController);
usersRoutes.patch('/users/:id', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ params: idParamSchema, body: updateUserSchema }), updateUserController);
usersRoutes.post('/users/:id/deactivate', requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE), validateRequest({ params: idParamSchema }), deactivateUserController);

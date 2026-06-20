import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { getMyAccess, getRoleMatrix } from '../controllers/access.controller.js';
import { getRouteContracts } from '../controllers/routeContracts.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const accessRoutes = Router();

accessRoutes.get('/access/me', requireAuth, getMyAccess);
accessRoutes.get('/access/role-matrix', requireAuth, requireRole(UserRole.ADMIN), getRoleMatrix);
accessRoutes.get('/access/route-contracts', requireAuth, getRouteContracts);

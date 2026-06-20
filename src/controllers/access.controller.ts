import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { ROUTE_ACCESS_POLICIES } from '../config/routeAccess.js';
import { getAccessMatrix, getRoleAccessSummary } from '../services/permission.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export function getMyAccess(req: Request, res: Response) {
  const role = req.user?.role as UserRole;
  return sendSuccess(res, 'Current user access summary', {
    user: req.user,
    access: getRoleAccessSummary(role)
  });
}

export function getRoleMatrix(_req: Request, res: Response) {
  return sendSuccess(res, 'Role access matrix', {
    roles: Object.values(UserRole),
    routePolicies: ROUTE_ACCESS_POLICIES,
    matrix: getAccessMatrix()
  });
}

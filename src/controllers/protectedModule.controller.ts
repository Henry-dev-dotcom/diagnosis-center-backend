import type { Request, Response } from 'express';
import { getRouteAccessPolicy } from '../config/routeAccess.js';
import { canViewPrices } from '../services/permission.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { auditSuccessfulRequest } from '../services/audit.service.js';

export function moduleLanding(moduleName: string) {
  return (req: Request, res: Response) => {
    const policy = getRouteAccessPolicy(moduleName);
    return sendSuccess(res, `${moduleName} protected route group`, {
      module: moduleName,
      status: 'protected-foundation-ready',
      policy,
      currentUser: req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            role: req.user.role,
            canViewPrices: canViewPrices(req.user.role)
          }
        : null,
      note: 'Detailed business logic will be implemented in later backend module phases.'
    });
  };
}

export function endpointPlaceholder(moduleName: string, action: string) {
  return (req: Request, res: Response) => {
    const policy = getRouteAccessPolicy(moduleName);
    auditSuccessfulRequest(req, res, {
      module: moduleName,
      action,
      details: { phase: 8, routeContractOnly: true }
    });
    return sendSuccess(res, `${moduleName}: ${action}`, {
      module: moduleName,
      action,
      status: 'endpoint-contract-ready',
      method: req.method,
      path: req.originalUrl,
      policy,
      currentUser: req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            permissions: req.user.permissions,
            canViewPrices: canViewPrices(req.user.role)
          }
        : null,
      validation: {
        status: 'validated-before-handler',
        params: req.params,
        query: req.query,
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : []
      }
    });
  };
}

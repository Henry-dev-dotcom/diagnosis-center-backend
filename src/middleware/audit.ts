import type { NextFunction, Request, Response } from 'express';
import { auditSuccessfulRequest, createApiRequestLog, createAuditLog, createSystemEvent, getRequestAuditContext } from '../services/audit.service.js';

export function apiRequestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on('finish', () => {
    void createApiRequestLog({
      userId: req.user?.id ?? null,
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null
    });
  });

  next();
}

export function auditAction(options?: { module?: string; action?: string; entityType?: string; entityIdParam?: string; details?: Record<string, unknown> }) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      auditSuccessfulRequest(req, res, {
        module: options?.module,
        action: options?.action,
        entityType: options?.entityType,
        entityId: options?.entityIdParam ? req.params[options.entityIdParam] : undefined,
        details: options?.details
      });
    });

    next();
  };
}

export function auditAccessFailure(req: Request, statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
  const context = getRequestAuditContext(req);

  void createAuditLog({
    ...context,
    action: statusCode === 401 ? 'ACCESS_UNAUTHENTICATED' : 'ACCESS_FORBIDDEN',
    module: 'Access Control',
    details: {
      code,
      message,
      method: req.method,
      path: req.originalUrl,
      ...details
    }
  });

  void createSystemEvent({
    actorId: req.user?.id ?? null,
    level: statusCode === 401 ? 'warn' : 'info',
    source: 'access-control',
    message,
    details: {
      code,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      role: req.user?.role ?? null
    }
  });
}

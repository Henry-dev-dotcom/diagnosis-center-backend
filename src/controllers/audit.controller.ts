import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service.js';
import { createAuditLog, getRequestAuditContext } from '../services/audit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import type { apiRequestLogQuerySchema, auditLogQuerySchema, systemEventQuerySchema } from '../validators/audit.validators.js';
import type { z } from 'zod';

function pagination(query: { page?: number; limit?: number }) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function dateWindow(query: { from?: Date; to?: Date }) {
  if (!query.from && !query.to) return undefined;
  return {
    gte: query.from,
    lte: query.to
  };
}

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as z.infer<typeof auditLogQuerySchema>;
  const { page, limit, skip } = pagination(query);

  const where: Prisma.AuditLogWhereInput = {
    actorId: query.actorId,
    actorRole: query.actorRole,
    module: query.module ? { contains: query.module, mode: 'insensitive' } : undefined,
    action: query.action ? { contains: query.action, mode: 'insensitive' } : undefined,
    entityType: query.entityType ? { contains: query.entityType, mode: 'insensitive' } : undefined,
    entityId: query.entityId,
    createdAt: dateWindow(query)
  };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true
          }
        }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'AUDIT_LOGS_VIEWED',
    module: 'Admin',
    entityType: 'AuditLog',
    details: { filters: query, returned: items.length, total }
  });

  return sendSuccess(res, 'Audit logs loaded', {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

export const listSystemEvents = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as z.infer<typeof systemEventQuerySchema>;
  const { page, limit, skip } = pagination(query);

  const where: Prisma.SystemEventWhereInput = {
    actorId: query.actorId,
    level: query.level,
    source: query.source ? { contains: query.source, mode: 'insensitive' } : undefined,
    createdAt: dateWindow(query)
  };

  const [items, total] = await prisma.$transaction([
    prisma.systemEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true
          }
        }
      }
    }),
    prisma.systemEvent.count({ where })
  ]);

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'SYSTEM_EVENTS_VIEWED',
    module: 'Admin',
    entityType: 'SystemEvent',
    details: { filters: query, returned: items.length, total }
  });

  return sendSuccess(res, 'System events loaded', {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

export const listApiRequestLogs = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as z.infer<typeof apiRequestLogQuerySchema>;
  const { page, limit, skip } = pagination(query);

  const where: Prisma.ApiRequestLogWhereInput = {
    userId: query.userId,
    method: query.method,
    path: query.path ? { contains: query.path, mode: 'insensitive' } : undefined,
    statusCode: query.statusCode,
    createdAt: dateWindow(query)
  };

  const [items, total] = await prisma.$transaction([
    prisma.apiRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true
          }
        }
      }
    }),
    prisma.apiRequestLog.count({ where })
  ]);

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'API_REQUEST_LOGS_VIEWED',
    module: 'Admin',
    entityType: 'ApiRequestLog',
    details: { filters: query, returned: items.length, total }
  });

  return sendSuccess(res, 'API request logs loaded', {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

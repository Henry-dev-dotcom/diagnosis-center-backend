import { z } from 'zod';
import { dateRangeQuerySchema } from './common.validators.js';

export const auditLogQuerySchema = dateRangeQuerySchema.and(z.object({
  actorId: z.string().trim().min(1).optional(),
  actorRole: z.enum(['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LAB_STAFF', 'SCAN_STAFF', 'BILLING_STAFF']).optional(),
  module: z.string().trim().max(80).optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(120).optional()
}));

export const systemEventQuerySchema = dateRangeQuerySchema.and(z.object({
  actorId: z.string().trim().min(1).optional(),
  level: z.string().trim().max(30).optional(),
  source: z.string().trim().max(80).optional()
}));

export const apiRequestLogQuerySchema = dateRangeQuerySchema.and(z.object({
  userId: z.string().trim().min(1).optional(),
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']).optional(),
  path: z.string().trim().max(250).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional()
}));

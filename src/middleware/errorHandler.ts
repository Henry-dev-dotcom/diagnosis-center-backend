import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError.js';
import { isProduction } from '../config/env.js';
import type { ApiError } from '../types/api.js';
import { auditAccessFailure } from './audit.js';

function formatPath(path: Array<string | number>) {
  return path.map((part) => String(part)).join('.');
}

function baseError(req: Request, message: string, code?: string): ApiError {
  return {
    success: false,
    message,
    code,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  };
}

function handlePrismaError(err: Prisma.PrismaClientKnownRequestError, req: Request, res: Response) {
  if (err.code === 'P2002') {
    const payload: ApiError = {
      ...baseError(req, 'A record with this value already exists', 'UNIQUE_CONSTRAINT_FAILED'),
      errors: [{ field: Array.isArray(err.meta?.target) ? err.meta.target.join('.') : undefined, message: 'Duplicate value is not allowed' }],
      details: isProduction ? undefined : err.meta
    };
    return res.status(409).json(payload);
  }

  if (err.code === 'P2025') {
    return res.status(404).json(baseError(req, 'Requested resource was not found', 'RESOURCE_NOT_FOUND'));
  }

  const payload: ApiError = {
    ...baseError(req, 'Database request failed', 'DATABASE_REQUEST_FAILED'),
    details: isProduction ? undefined : { code: err.code, meta: err.meta }
  };
  return res.status(400).json(payload);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  auditAccessFailure(req, 404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`);
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const payload: ApiError = {
      ...baseError(req, 'Validation failed', 'VALIDATION_FAILED'),
      errors: err.issues.map((issue) => ({
        field: formatPath(issue.path),
        message: issue.message,
        code: issue.code
      }))
    };
    return res.status(400).json(payload);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err, req, res);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    const prismaValidationError = err as Error;
    const payload: ApiError = {
      ...baseError(req, 'Invalid database query input', 'DATABASE_VALIDATION_FAILED'),
      details: isProduction ? undefined : prismaValidationError.message
    };
    return res.status(400).json(payload);
  }

  if (err instanceof AppError) {
    const payload: ApiError = {
      ...baseError(req, err.message, err.code),
      details: isProduction ? undefined : err.details
    };
    return res.status(err.statusCode).json(payload);
  }

  console.error('Unhandled error', err);
  const payload: ApiError = {
    ...baseError(req, 'Internal server error', 'INTERNAL_SERVER_ERROR'),
    details: isProduction ? undefined : err instanceof Error ? err.message : String(err)
  };
  return res.status(500).json(payload);
}

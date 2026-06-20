import type { Request, Response } from 'express';
import { allowedFrontendOrigins, env } from '../config/env.js';
import { checkDatabaseConnection } from '../services/prisma.service.js';
import { getDatabaseSummary } from '../services/database.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function getHealth(_req: Request, res: Response) {
  const database = await checkDatabaseConnection();

  return sendSuccess(res, 'Backend health check complete', {
    api: 'ok',
    database,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
}

export function getLiveness(_req: Request, res: Response) {
  return sendSuccess(res, 'Backend process is alive', {
    api: 'ok',
    timestamp: new Date().toISOString()
  });
}

export async function getReadiness(_req: Request, res: Response) {
  const database = await checkDatabaseConnection();
  const status = database.ok ? 200 : 503;

  return sendSuccess(
    res,
    database.ok ? 'Backend is ready' : 'Backend is not ready',
    {
      api: 'ok',
      database,
      uploadStorage: env.UPLOAD_STORAGE_DRIVER,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString()
    },
    status
  );
}

export async function getDatabaseStatus(_req: Request, res: Response) {
  const connection = await checkDatabaseConnection();
  const summary = connection.ok ? await getDatabaseSummary() : null;

  return sendSuccess(res, 'Database status', {
    connection,
    summary
  });
}

export function getVersion(_req: Request, res: Response) {
  return sendSuccess(res, 'Version information', {
    name: 'Diagnosis Center Backend API',
    version: '2.1.0',
    phase: 'Production Readiness Stage - Deployment Hardening and Runtime QA',
    apiPrefix: env.API_PREFIX,
    apiDocsEnabled: env.ENABLE_API_DOCS,
    allowedFrontendOrigins
  });
}

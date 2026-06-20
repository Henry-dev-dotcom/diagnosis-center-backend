import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { allowedFrontendOrigins, env, isProduction } from '../config/env.js';
import { requestId } from './requestId.js';

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: Request) {
  return req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown-client';
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV === 'test') {
    return next();
  }

  const now = Date.now();
  const key = getClientKey(req);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + env.RATE_LIMIT_WINDOW_MS });
    return next();
  }

  bucket.count += 1;

  if (bucket.count > env.RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again shortly.',
      errors: [{ field: 'request', message: 'Rate limit exceeded' }]
    });
  }

  return next();
}

export function applyGlobalMiddleware(app: Express) {
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: isProduction ? undefined : false
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedFrontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
    })
  );
  app.use(rateLimit);
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(morgan(env.LOG_LEVEL));
}

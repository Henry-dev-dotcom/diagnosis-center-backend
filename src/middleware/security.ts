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
let lastSweepAt = Date.now();

function getClientKey(req: Request) {
  return req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown-client';
}

// Opportunistically evict expired buckets so the Map cannot grow unbounded as
// new client IPs arrive. Runs at most once per window; no timer is used so the
// process can exit cleanly and tests stay deterministic.
function sweepExpiredBuckets(now: number) {
  if (now - lastSweepAt < env.RATE_LIMIT_WINDOW_MS) return;
  lastSweepAt = now;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}

function createRateLimiter({ windowMs, max, keyPrefix, message }: RateLimitOptions) {
  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    if (env.NODE_ENV === 'test') {
      return next();
    }

    const now = Date.now();
    sweepExpiredBuckets(now);

    const key = `${keyPrefix}:${getClientKey(req)}`;
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        message: message ?? 'Too many requests. Please try again shortly.',
        errors: [{ field: 'request', message: 'Rate limit exceeded' }]
      });
    }

    return next();
  };
}

const rateLimit = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'global'
});

// Stricter, dedicated limiter for authentication endpoints to slow credential
// brute-forcing. Kept in its own key namespace so it is not diluted by the
// generous global API budget.
export const authRateLimit = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please try again later.'
});

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

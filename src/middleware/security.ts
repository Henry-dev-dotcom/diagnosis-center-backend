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

// Public website forms (sign-up, demo requests): a few per address per hour.
export const publicFormRateLimit = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 10,
  keyPrefix: 'public-form',
  message: 'Too many submissions from this network. Please try again in an hour.'
});

/*
  What may be cached.

  Only the public website's catalogue, which is the same for everybody. Everything
  behind a sign-in is no-store.

  Authenticated reads used to carry "private, max-age=10, stale-while-revalidate=20".
  That does two harmful things in a clinical system. First, the app re-reads the same
  URL straight after every write - register a patient, place an order, take a payment -
  and the browser answered from its copy, so the screen showed the world as it was up
  to thirty seconds ago: the new patient missing, the balance unchanged. Second, a
  browser's cache is keyed on the URL, not on who is signed in, and these responses
  varied on nothing but encoding. On a shared hospital workstation, the next person to
  sign in - at another facility, even - could be handed the previous person's cached
  patient list. "private" only keeps a shared proxy out of it; it does nothing for two
  people at one keyboard.

  Nothing about a patient's record is worth saving ten seconds of latency for.
*/
function applyResponseCaching(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') return next();
  res.vary('Accept-Encoding');
  if (req.path.startsWith(`${env.API_PREFIX}/public/`)) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  } else {
    res.setHeader('Cache-Control', 'no-store');
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
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-analyzer-key'],
      // Lets the app name downloaded files (data export, reports) and show request ids.
      exposedHeaders: ['Content-Disposition', 'x-request-id']
    })
  );
  app.use(rateLimit);
  app.use(compression());
  app.use(applyResponseCaching);
  app.use(cookieParser());
  app.use(
    express.json({
      limit: env.BODY_LIMIT,
      // Payment webhooks are signed over the exact bytes sent, so keep them for verification.
      verify: (req, _res, buf) => {
        if ((req as { originalUrl?: string }).originalUrl?.startsWith(`${env.API_PREFIX}/billing/webhooks/`)) (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  // An explicitly configured LOG_LEVEL always wins. Without one, production
  // logs method + path only - never the query string, because signed download
  // links and one-time tokens travel in query strings and must not be written
  // to logs. (morgan's :path token excludes the query string; :url would not.)
  const accessLogFormat = env.LOG_LEVEL ?? (isProduction ? ':remote-addr :method :path :status :res[content-length] - :response-time ms' : 'dev');
  app.use(morgan(accessLogFormat));
}

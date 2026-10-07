import dotenv from 'dotenv';
import { z } from 'zod';

// Tests that validate env parsing set SKIP_DOTENV so a developer's local .env
// cannot leak values into the process under test.
if (process.env.SKIP_DOTENV !== '1') {
  // dotenv 18 prints a banner on every load; keep it out of the logs.
  dotenv.config({ quiet: true });
}

/**
 * true/false settings. (z.coerce.boolean() would read the text 'false' as true.)
 * Accepts true/false, 1/0, yes/no, on/off; anything else is a configuration error.
 */
export const envBoolean = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'boolean') return value;
  const v = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off', ''].includes(v)) return false;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use true or false' });
  return z.NEVER;
});

const defaultAccessSecret = 'change-this-access-secret';
const defaultRefreshSecret = 'change-this-refresh-secret';

function csv(value?: string) {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    API_PREFIX: z.string().default('/api'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    FRONTEND_URLS: z.string().optional(),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z.string().min(10).default(defaultAccessSecret),
    JWT_REFRESH_SECRET: z.string().min(10).default(defaultRefreshSecret),
    ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
    AUTH_COOKIE_SECURE: envBoolean.optional(),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    // No default here on purpose: the safe value depends on NODE_ENV, so it is
    // resolved where the logger is wired up (see middleware/security.ts). In
    // production an unset LOG_LEVEL means quiet, query-string-free logging.
    LOG_LEVEL: z.string().optional(),
    TRUST_PROXY: envBoolean.default(false),
    // API docs default ON for development and OFF for production (resolved as
    // apiDocsEnabled below). Set explicitly to override either way.
    ENABLE_API_DOCS: envBoolean.optional(),
    BODY_LIMIT: z.string().default('10mb'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(240),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(5 * 60_000),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
    UPLOAD_STORAGE_DRIVER: z.enum(['local', 'metadata']).default('local'),
    UPLOAD_ROOT: z.string().default('uploads'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
    SIGNED_FILE_URL_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    // Optional comma-separated replacement for the built-in upload MIME
    // allowlist (the default set lives in services/fileStorage.service.ts).
    UPLOAD_ALLOWED_MIME_TYPES: z.string().optional(),
    DICOM_GATEWAY_MODE: z.enum(['metadata-only', 'pacs-ready']).default('metadata-only'),
    // Transactional email (email verification links). 'log' prints the message
    // to the server log (development default), 'resend' sends through Resend's
    // HTTPS API, 'disabled' (production default) sends nothing.
    MAIL_DRIVER: z.enum(['disabled', 'log', 'resend']).optional(),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().default('LHIMS <no-reply@lhims.app>'),
    // Where the web app is served from, INCLUDING any path (for GitHub Pages:
    // https://<user>.github.io/<repo>). Links sent by email point here. When
    // unset, FRONTEND_URL is used - which is only the origin, so an app served
    // under a path needs this set. Never derived from a request header: a link
    // built from the Host header can be pointed at someone else's site.
    FRONTEND_APP_URL: z.string().url().optional(),
    // Subscription payments (Phase 5). 'fake' simulates a gateway for development and tests only.
    PAYMENT_GATEWAY: z.enum(['paystack', 'fake', 'disabled']).optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
    // Where the payer returns after checkout (the facility billing page).
    PAYMENT_CALLBACK_URL: z.string().url().optional(),
    BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7),
    // Optional incoming-webhook URL (Slack, Teams, …) for operational alerts.
    ALERT_WEBHOOK_URL: z.string().url().optional(),
    // How long each facility's departments and subscription state are cached (0 = off).
    ACCESS_CACHE_TTL_MS: z.coerce.number().int().min(0).max(60_000).default(5000)
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }

    if (value.JWT_ACCESS_SECRET === defaultAccessSecret || value.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production JWT_ACCESS_SECRET must be changed and at least 32 characters long.'
      });
    }

    if (value.JWT_REFRESH_SECRET === defaultRefreshSecret || value.JWT_REFRESH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Production JWT_REFRESH_SECRET must be changed and at least 32 characters long.'
      });
    }

    if (value.PAYMENT_GATEWAY === 'fake') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PAYMENT_GATEWAY'], message: 'The fake payment gateway cannot be used in production.' });
    }
    if (value.PAYMENT_GATEWAY === 'paystack' && !value.PAYSTACK_SECRET_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PAYSTACK_SECRET_KEY'], message: 'PAYSTACK_SECRET_KEY is required when PAYMENT_GATEWAY is paystack.' });
    }

    if (value.MAIL_DRIVER === 'resend' && !value.RESEND_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required when MAIL_DRIVER is resend.' });
    }

    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Production access and refresh secrets must be different.'
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const allowedFrontendOrigins = Array.from(new Set([env.FRONTEND_URL, ...csv(env.FRONTEND_URLS)]));

// Swagger is a map of the whole API: handy in development, needless exposure in
// production. It stays on locally and switches off in production unless
// ENABLE_API_DOCS is set deliberately.
export const apiDocsEnabled = env.ENABLE_API_DOCS ?? !isProduction;

// Without a configured driver, production sends no email rather than silently
// writing verification links to logs anyone with log access could follow.
export const mailDriver: 'disabled' | 'log' | 'resend' = env.MAIL_DRIVER ?? (isProduction ? 'disabled' : 'log');

// Cross-site cookies (SameSite=None) are only sent by browsers over HTTPS, so
// force Secure on. Otherwise default Secure to on in production.
const cookieSecure = env.AUTH_COOKIE_SECURE ?? (env.AUTH_COOKIE_SAMESITE === 'none' ? true : isProduction);
export const authCookieConfig = {
  accessTokenName: 'access_token',
  refreshTokenName: 'refresh_token',
  secure: env.AUTH_COOKIE_SAMESITE === 'none' ? true : cookieSecure,
  sameSite: env.AUTH_COOKIE_SAMESITE,
  domain: env.AUTH_COOKIE_DOMAIN,
  // Refresh cookie is only ever sent to the auth endpoints, limiting exposure.
  refreshPath: `${env.API_PREFIX}/auth`
} as const;

/** The gateway in use: explicit, else Paystack when a key is set, else fake outside production and disabled in production. */
export const paymentGateway: 'paystack' | 'fake' | 'disabled' = env.PAYMENT_GATEWAY ?? (env.PAYSTACK_SECRET_KEY ? 'paystack' : isProduction ? 'disabled' : 'fake');

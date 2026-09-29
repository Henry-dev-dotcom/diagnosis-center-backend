import dotenv from 'dotenv';
import { z } from 'zod';

// Tests that validate env parsing set SKIP_DOTENV so a developer's local .env
// cannot leak values into the process under test.
if (process.env.SKIP_DOTENV !== '1') {
  dotenv.config();
}

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
    AUTH_COOKIE_SECURE: z.coerce.boolean().optional(),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    LOG_LEVEL: z.string().default('dev'),
    TRUST_PROXY: z.coerce.boolean().default(false),
    ENABLE_API_DOCS: z.coerce.boolean().default(true),
    BODY_LIMIT: z.string().default('10mb'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(240),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(5 * 60_000),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
    UPLOAD_STORAGE_DRIVER: z.enum(['local', 'metadata']).default('local'),
    UPLOAD_ROOT: z.string().default('uploads'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
    SIGNED_FILE_URL_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    DICOM_GATEWAY_MODE: z.enum(['metadata-only', 'pacs-ready']).default('metadata-only'),
    // Subscription payments (Phase 5). 'fake' simulates a gateway for development and tests only.
    PAYMENT_GATEWAY: z.enum(['paystack', 'fake', 'disabled']).optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
    // Where the payer returns after checkout (the facility billing page).
    PAYMENT_CALLBACK_URL: z.string().url().optional(),
    BILLING_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7)
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

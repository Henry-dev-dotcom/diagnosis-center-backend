import { Router, type Request, type Response } from 'express';
import { BillingInterval, CatalogItemType, DemoRequestStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import { MODULE_KEYS } from '../config/modules.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { publicFormRateLimit } from '../middleware/security.js';
import { idParamSchema } from '../validators/common.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import { setAuthCookies } from '../utils/authCookies.js';
import * as onboarding from '../services/onboarding.service.js';
import { platformMetrics, startSupportSession } from '../services/platformConsole.service.js';

const P = PERMISSIONS;
const context = (req: Request) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') ?? null });
const ok = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendSuccess(res, message, await fn(req)));
const text = (max: number) => z.string().trim().max(max);
const phone = z.string().trim().min(7, 'Enter a phone number').max(30).regex(/^[+0-9 ()-]+$/, 'Use digits, spaces, + and - only');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
// Bots fill every field; people never see this one.
const honeypot = z.string().max(0, 'Invalid submission').optional();

const signupSchema = z.object({
  facility: z.object({
    name: z.string().trim().min(3, 'Enter the facility name').max(120),
    phone,
    email,
    address: text(300).optional(),
    facilityType: text(60).optional()
  }),
  admin: z.object({
    name: z.string().trim().min(2, 'Enter your name').max(120),
    username: z.string().trim().toLowerCase().min(3, 'Username must be at least 3 characters').max(60).regex(/^[a-z0-9._-]+$/, 'Use letters, digits, dots, dashes or underscores'),
    email: email.optional(),
    password: z.string().min(10, 'Use at least 10 characters').max(200).regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a digit')
  }),
  planId: z.string().min(1, 'Choose a plan'),
  interval: z.nativeEnum(BillingInterval).default(BillingInterval.MONTHLY),
  addOns: z.array(z.enum(MODULE_KEYS)).max(MODULE_KEYS.length).default([]),
  acceptTerms: z.literal(true, { error: 'Accept the terms to continue' }),
  website: honeypot
});

const demoSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  organisation: z.string().trim().min(2, 'Enter your hospital or clinic').max(160),
  email,
  phone: phone.optional().or(z.literal('')),
  facilityType: text(60).optional(),
  message: text(2000).optional(),
  website: honeypot
});

const profileSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  phone: phone.optional().or(z.literal('')),
  email: email.optional().or(z.literal('')),
  address: text(300).optional(),
  logoDataUrl: z.string().max(onboarding.MAX_LOGO_LENGTH, 'The logo is too large (200 KB at most)').nullable().optional(),
  allowSupportAccess: z.boolean().optional(),
  receptionConfirmsOrders: z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const priceRowSchema = z.object({
  code: z.string().trim().min(2, 'Code is required').max(30).regex(/^[A-Za-z0-9._-]+$/, 'Codes use letters, digits, dots and dashes'),
  name: z.string().trim().min(2, 'Name is required').max(160),
  type: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.nativeEnum(CatalogItemType, { error: 'Type must be LAB, SCAN or SERVICE' })),
  price: z.coerce.number({ error: 'Price must be a number' }).min(0, 'Price cannot be negative').max(10_000_000),
  sampleType: text(60).optional(),
  modality: text(60).optional(),
  tariffCode: text(40).optional()
});

export const onboardingRoutes = Router();

/* --------------------------------------------------------- public website */
onboardingRoutes.post('/public/signup', publicFormRateLimit, validateRequest({ body: signupSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { acceptTerms: _t, website: _w, ...input } = req.body as z.infer<typeof signupSchema>;
  void _t; void _w;
  const result = await onboarding.signup(input, context(req));
  setAuthCookies(res, result);
  return sendCreated(res, `Welcome to LHIMS. Your sign-in code is ${result.facility.code}.`, result);
}));
onboardingRoutes.post('/public/demo-requests', publicFormRateLimit, validateRequest({ body: demoSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { website: _w, ...body } = req.body as z.infer<typeof demoSchema>;
  void _w;
  return sendCreated(res, 'Thank you. We will be in touch within one working day.', await onboarding.createDemoRequest({ ...body, phone: body.phone || undefined }, context(req)));
}));

/* ------------------------------------------------ facility setup checklist */
const admin = [requireAuth, requireRole(UserRole.ADMIN), requirePermission(P.SUBSCRIPTION_MANAGE)];
onboardingRoutes.get('/onboarding', ...admin, ok('Setup checklist loaded', () => onboarding.onboardingStatus()));
onboardingRoutes.patch('/onboarding/profile', ...admin, validateRequest({ body: profileSchema }), ok('Facility details saved', (req) => onboarding.updateProfile(req.body, req)));
onboardingRoutes.post('/onboarding/price-list', ...admin, validateRequest({ body: z.object({ rows: z.array(z.unknown()).min(1, 'The price list is empty').max(1000, 'Import at most 1000 rows at a time') }) }), ok('Price list imported', async (req) => {
  // Every row is checked first, so the administrator sees all problems at once.
  const rows: onboarding.PriceRow[] = [];
  const errors: { row: number; message: string }[] = [];
  (req.body.rows as unknown[]).forEach((raw, i) => {
    const parsed = priceRowSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
    else errors.push({ row: i + 1, message: parsed.error.issues.map((issue) => issue.message).join('; ') });
  });
  if (errors.length) throw new AppError('Some rows need fixing before the price list can be imported', 400, 'PRICE_LIST_INVALID', { errors });
  return onboarding.importPriceList(rows, req);
}));
onboardingRoutes.post('/onboarding/complete', ...admin, ok('Setup finished', (req) => onboarding.completeOnboarding(req)));

/* --------------------------------------------------------- platform console */
const platform = [requireAuth, requireRole(UserRole.PLATFORM_ADMIN)];
onboardingRoutes.get('/platform/metrics', ...platform, requirePermission(P.PLATFORM_BILLING_MANAGE), ok('Metrics loaded', () => platformMetrics()));
onboardingRoutes.get('/platform/demo-requests', ...platform, requirePermission(P.PLATFORM_FACILITIES_READ), validateRequest({ query: z.object({ status: z.nativeEnum(DemoRequestStatus).optional() }) }), ok('Requests loaded', (req) => onboarding.listDemoRequests(req.query as { status?: DemoRequestStatus })));
onboardingRoutes.patch('/platform/demo-requests/:id', ...platform, requirePermission(P.PLATFORM_FACILITIES_MANAGE), validateRequest({ params: idParamSchema, body: z.object({ status: z.nativeEnum(DemoRequestStatus).optional(), notes: text(2000).optional() }) }), ok('Request updated', (req) => onboarding.updateDemoRequest(req.params.id, req.body, req)));
// Replaces the operator's browser session with the support session; signing out ends it.
onboardingRoutes.post('/platform/facilities/:id/support-session', ...platform, requirePermission(P.PLATFORM_SUPPORT_SESSION), validateRequest({ params: idParamSchema, body: z.object({ reason: z.string().trim().min(10, 'Say why support needs to look (at least 10 characters)').max(500) }) }), asyncHandler(async (req: Request, res: Response) => {
  const result = await startSupportSession(req.params.id, req.body.reason, req);
  setAuthCookies(res, result);
  return sendCreated(res, 'Support session started', result);
}));

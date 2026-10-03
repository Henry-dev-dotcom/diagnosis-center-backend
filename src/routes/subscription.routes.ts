import { Router, type Request, type Response } from 'express';
import { BillingInterval, FacilityKind, Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import { MODULE_KEYS } from '../config/modules.js';
import { allowedFrontendOrigins, env } from '../config/env.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import { prisma } from '../services/prisma.service.js';
import { runAsSystem } from '../services/tenantContext.js';
import { FakeGateway, gateway } from '../services/paymentGateway.js';
import * as billing from '../services/subscription.service.js';

const P = PERMISSIONS;
const ok = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendSuccess(res, message, await fn(req)));
const addOns = z.array(z.enum(MODULE_KEYS)).max(MODULE_KEYS.length).default([]);
const selection = z.object({ planId: z.string().min(1, 'Choose a plan'), interval: z.nativeEnum(BillingInterval), addOns });
const planFields = {
  name: z.string().trim().min(2).max(80),
  facilityKind: z.nativeEnum(FacilityKind),
  description: z.string().trim().max(500).optional(),
  monthlyPrice: z.coerce.number().min(0).max(10_000_000),
  yearlyDiscountPercent: z.coerce.number().int().min(0).max(60),
  maxUsers: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
  // Fair use: shown and warned about, never blocking.
  maxPatientsPerMonth: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  maxStorageMb: z.coerce.number().int().min(1).max(100_000_000).nullable().optional(),
  trialDays: z.coerce.number().int().min(0).max(90),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  modules: z.array(z.enum(MODULE_KEYS)).min(1, 'A plan includes at least one department')
};
const createPlanSchema = z.object({ code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()), ...planFields, facilityKind: planFields.facilityKind.default(FacilityKind.HOSPITAL), isActive: planFields.isActive.default(true), isPublic: planFields.isPublic.default(true), sortOrder: planFields.sortOrder.default(0), yearlyDiscountPercent: planFields.yearlyDiscountPercent.default(0), trialDays: planFields.trialDays.default(14) });
const updatePlanSchema = z.object(planFields).partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const subscriptionRoutes = Router();

/* ---------------------------------------------------------- public pricing */
subscriptionRoutes.get('/public/plans', ok('Plans loaded', () => runAsSystem('public.pricing', () => billing.publicCatalogue())));
subscriptionRoutes.post('/public/quote', validateRequest({ body: selection }), ok('Price worked out', async (req) => {
  const q = await runAsSystem('public.pricing', () => billing.priceFor(req.body.planId, req.body.addOns, req.body.interval));
  return { plan: { id: q.plan.id, code: q.plan.code, name: q.plan.name }, addOns: q.addOns, interval: q.interval, lines: q.lines, total: q.total, monthlyEquivalent: q.monthlyEquivalent };
}));

/* ----------------------------------------------- the facility's subscription */
// Reachable while read-only, so an administrator can always pay.
subscriptionRoutes.use('/subscription', requireAuth, requireRole(UserRole.ADMIN), requirePermission(P.SUBSCRIPTION_MANAGE));
subscriptionRoutes.get('/subscription', ok('Subscription loaded', () => billing.mySubscription()));
subscriptionRoutes.post('/subscription/checkout', validateRequest({ body: selection.extend({ billingEmail: z.string().trim().email('Give a billing email address') }) }), ok('Checkout started', (req) => billing.startCheckout(req.body, req)));
subscriptionRoutes.post('/subscription/invoices/:id/pay', validateRequest({ params: idParamSchema }), ok('Checkout started', (req) => billing.payInvoice(req.params.id, req)));
subscriptionRoutes.post('/subscription/confirm', validateRequest({ body: z.object({ reference: z.string().trim().min(4).max(120) }) }), ok('Payment checked', async (req) => ({ ...(await billing.confirmPayment(req.body.reference, req)), subscription: await billing.mySubscription() })));
subscriptionRoutes.post('/subscription/change', validateRequest({ body: selection }), ok('Plan change recorded', (req) => billing.changePlan(req.body, req)));
subscriptionRoutes.post('/subscription/cancel', ok('Cancellation scheduled', (req) => billing.cancelSubscription(req)));
subscriptionRoutes.post('/subscription/resume', ok('Subscription resumed', (req) => billing.resumeSubscription(req)));

/* ---------------------------------------------------------- platform console */
const platform = [requireAuth, requireRole(UserRole.PLATFORM_ADMIN), requirePermission(P.PLATFORM_BILLING_MANAGE)];
subscriptionRoutes.get('/platform/plans', ...platform, ok('Plans loaded', () => billing.listPlans({ includeInactive: true })));
subscriptionRoutes.post('/platform/plans', ...platform, validateRequest({ body: createPlanSchema }), asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Plan created', await billing.createPlan(req.body, req))));
subscriptionRoutes.patch('/platform/plans/:id', ...platform, validateRequest({ params: idParamSchema, body: updatePlanSchema }), ok('Plan updated', (req) => billing.updatePlan(req.params.id, req.body, req)));
subscriptionRoutes.get('/platform/module-prices', ...platform, ok('Prices loaded', () => billing.listModulePrices()));
subscriptionRoutes.put('/platform/module-prices/:key', ...platform, validateRequest({ params: z.object({ key: z.enum(MODULE_KEYS) }), body: z.object({ monthlyPrice: z.coerce.number().min(0).max(10_000_000) }) }), ok('Price saved', (req) => billing.setModulePrice(req.params.key, req.body.monthlyPrice, req)));
subscriptionRoutes.get('/platform/subscriptions', ...platform, ok('Subscriptions loaded', () => billing.listSubscriptions()));
subscriptionRoutes.post('/platform/billing/run', ...platform, validateRequest({ body: z.object({ at: z.coerce.date().optional() }) }), ok('Billing cycle run', (req) => billing.runBillingCycle(req.body.at ?? new Date())));

/* ----------------------------------------------------------------- webhooks */
/**
 * Paystack calls this for every transaction event. The signature is checked
 * against the raw body; each event is stored once (duplicates are
 * acknowledged and ignored); the payment is then re-verified with the gateway
 * before anything changes. Always answers 200 once stored, so Paystack stops
 * retrying.
 */
subscriptionRoutes.post('/billing/webhooks/paystack', asyncHandler(async (req: Request, res: Response) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || !gateway().verifySignature(raw, req.header('x-paystack-signature'))) throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
  const event = req.body as { event?: string; data?: { id?: number | string; reference?: string } };
  const type = String(event.event ?? 'unknown');
  const reference = event.data?.reference ?? null;
  const eventKey = `${type}:${event.data?.id ?? reference ?? raw.toString('base64').slice(0, 40)}`;
  try {
    await runAsSystem('billing.webhook', () => prisma.paymentEvent.create({ data: { provider: 'paystack', eventKey, type, reference, payload: event as Prisma.InputJsonObject } }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return sendSuccess(res, 'Duplicate event ignored', { duplicate: true });
    throw error;
  }
  let outcome = 'ignored';
  if (type === 'charge.success' && reference) {
    try {
      outcome = JSON.stringify(await billing.confirmPaymentByReference(reference));
    } catch (error) {
      outcome = `error: ${error instanceof Error ? error.message : 'unknown'}`;
    }
  }
  await runAsSystem('billing.webhook', () => prisma.paymentEvent.update({ where: { eventKey }, data: { processedAt: new Date(), outcome } }));
  return sendSuccess(res, 'Event received', { outcome });
}));

/* ---------------------------------------- the fake gateway's checkout page */
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
/** Only ever returns the payer to one of this deployment's own frontends. */
function safeReturn(value: unknown) {
  try {
    const url = new URL(String(value));
    if (allowedFrontendOrigins.some((o) => new URL(o).origin === url.origin)) return url;
  } catch { /* fall through */ }
  return new URL(env.FRONTEND_URL);
}
function fakeOnly() {
  const g = gateway();
  if (!(g instanceof FakeGateway)) throw new AppError('Not found', 404, 'RESOURCE_NOT_FOUND');
  return g;
}
subscriptionRoutes.get('/billing/fake-checkout/:reference', asyncHandler(async (req: Request, res: Response) => {
  const g = fakeOnly();
  const t = g.transactions.get(req.params.reference);
  if (!t) throw new AppError('Unknown payment', 404, 'GATEWAY_REFERENCE_UNKNOWN');
  const ref = escapeHtml(req.params.reference);
  const back = safeReturn(req.query.return).toString();
  // Plain links (GET), like following Paystack's own pages: no cross-origin form post.
  const done = (outcome: string) => `${env.API_PREFIX}/billing/fake-checkout/${encodeURIComponent(req.params.reference)}/complete?outcome=${outcome}&return=${encodeURIComponent(back)}`;
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test payment</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui;max-width:420px;margin:48px auto;padding:0 16px">
<h1 style="font-size:20px">Test payment (no real money)</h1>
<p>Reference <code>${ref}</code><br>Amount <strong>GHS ${(t.amountPesewas / 100).toFixed(2)}</strong><br>${escapeHtml(t.email)}</p>
<p><a href="${escapeHtml(done('success'))}" style="display:inline-block;padding:10px 16px;margin-right:8px;background:#0f766e;color:#fff;border-radius:8px;text-decoration:none">Pay</a><a href="${escapeHtml(done('failed'))}" style="display:inline-block;padding:10px 16px;border:1px solid #999;border-radius:8px;color:#333;text-decoration:none">Decline</a></p>
<p style="color:#666;font-size:13px">This page stands in for Paystack on development servers.</p></body></html>`);
}));
subscriptionRoutes.get('/billing/fake-checkout/:reference/complete', asyncHandler(async (req: Request, res: Response) => {
  const g = fakeOnly();
  const outcome = req.query.outcome === 'success' ? 'success' : 'failed';
  g.complete(req.params.reference, outcome);
  // Like Paystack: the payment is confirmed by the gateway's own notification, not by the browser.
  if (outcome === 'success') await billing.confirmPaymentByReference(req.params.reference);
  const target = safeReturn(req.query.return);
  target.searchParams.set('reference', req.params.reference);
  res.redirect(303, target.toString());
}));

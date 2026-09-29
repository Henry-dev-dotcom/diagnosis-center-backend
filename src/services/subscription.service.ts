import type { Request } from 'express';
import { BillingInterval, Prisma, SubscriptionInvoiceKind, SubscriptionInvoiceStatus, SubscriptionStatus, UserStatus } from '@prisma/client';
import { MODULES, MODULE_KEYS, isModuleKey, moduleDependencyErrors, type ModuleKey } from '../config/modules.js';
import { env } from '../config/env.js';
import { prisma } from './prisma.service.js';
import { runAsSystem, runWithFacility, currentFacilityId } from './tenantContext.js';
import { nextCode } from './codeSequence.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { gateway, newReference, type ChargeResult } from './paymentGateway.js';
import { entitledModules, periodEnd, prorationCharge, quote } from './subscriptionPricing.js';
import { AppError } from '../utils/appError.js';

/*
  Subscriptions (Phase 5).

  State: TRIALING -> (first payment) ACTIVE -> (renewal fails) PAST_DUE ->
  (grace ends) SUSPENDED; paying any open invoice restores ACTIVE. CANCELLED
  is reached at the end of a period the facility chose not to renew.
  SUSPENDED and CANCELLED facilities are read-only (see readOnlyFor); nothing
  is deleted.

  Entitlements: the plan's departments plus paid add-ons are written to
  FacilityModule, which every route already gates on. Modules are only ever
  added after payment; downgrades and removals take effect at renewal.

  Payments: an invoice is paid through the gateway; confirmation (the payer's
  return or the gateway's webhook, whichever comes first) re-verifies the
  transaction with the gateway and applies it once: only an OPEN invoice is
  marked PAID, so a repeated confirmation changes nothing.
*/

const DAY_MS = 86_400_000;
const money = (v: Prisma.Decimal | number) => Math.round(Number(v) * 100) / 100;
const toPesewas = (amount: number) => Math.round(amount * 100);
const NOT_WRITABLE: SubscriptionStatus[] = [SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED];

type Tx = Prisma.TransactionClient;
type PlanWithModules = Prisma.PlanGetPayload<{ include: { modules: true } }>;

async function audit(req: Request | null, action: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...(req ? getRequestAuditContext(req) : {}), action, module: 'Subscription', entityType: 'Subscription', entityId, details });
}

/* --------------------------------------------------------- plans & prices */

const planView = (plan: PlanWithModules) => ({ ...plan, monthlyPrice: money(plan.monthlyPrice), modules: plan.modules.map((m) => m.moduleKey).sort() });

export async function listPlans(query: { includeInactive?: boolean } = {}) {
  const plans = await prisma.plan.findMany({ where: query.includeInactive ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }], include: { modules: true } });
  return plans.map(planView);
}

export async function listModulePrices() {
  const prices = await prisma.modulePrice.findMany();
  return MODULES.map((m) => ({ moduleKey: m.key, name: m.name, category: m.category, monthlyPrice: money(prices.find((p) => p.moduleKey === m.key)?.monthlyPrice ?? 0), priced: prices.some((p) => p.moduleKey === m.key) }));
}

/** Public catalogue for the pricing page: active public plans and add-on prices. */
export async function publicCatalogue() {
  const [plans, addOns] = await Promise.all([prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ sortOrder: 'asc' }], include: { modules: true } }), listModulePrices()]);
  return {
    currency: 'GHS',
    plans: plans.map((p) => {
      const { isPublic: _p, isActive: _a, ...rest } = planView(p);
      void _p; void _a;
      return rest;
    }),
    addOns: addOns.filter((a) => a.priced),
    departments: MODULES.map((m) => ({ key: m.key, name: m.name, category: m.category, description: m.description }))
  };
}

function assertModules(modules: string[]) {
  const unknown = modules.filter((m) => !isModuleKey(m));
  if (unknown.length) throw new AppError(`Unknown departments: ${unknown.join(', ')}`, 400, 'UNKNOWN_MODULE');
  const errors = moduleDependencyErrors(modules as ModuleKey[]);
  if (errors.length) throw new AppError(errors.join(' '), 400, 'MODULE_DEPENDENCY', { errors });
}

export async function createPlan(body: { code: string; name: string; description?: string; monthlyPrice: number; yearlyDiscountPercent: number; maxUsers?: number; trialDays: number; isPublic: boolean; sortOrder: number; modules: string[] }, req: Request) {
  assertModules(body.modules);
  const { modules, ...data } = body;
  try {
    const plan = await prisma.plan.create({ data: { ...data, modules: { create: modules.map((moduleKey) => ({ moduleKey })) } }, include: { modules: true } });
    await createAuditLog({ ...getRequestAuditContext(req), facilityId: null, action: 'PLAN_CREATED', module: 'Platform', entityType: 'Plan', entityId: plan.id, details: body });
    return planView(plan);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('A plan with that code already exists', 409, 'PLAN_CODE_TAKEN');
    throw error;
  }
}

export async function updatePlan(id: string, body: Partial<{ name: string; description: string; monthlyPrice: number; yearlyDiscountPercent: number; maxUsers: number | null; trialDays: number; isActive: boolean; isPublic: boolean; sortOrder: number; modules: string[] }>, req: Request) {
  if (!(await prisma.plan.findUnique({ where: { id } }))) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  const { modules, ...data } = body;
  if (modules) assertModules(modules);
  // Price changes apply to each subscriber from their next renewal; departments change for everyone at once.
  await prisma.$transaction(async (tx) => {
    await tx.plan.update({ where: { id }, data });
    if (modules) {
      await tx.planModule.deleteMany({ where: { planId: id } });
      await tx.planModule.createMany({ data: modules.map((moduleKey) => ({ planId: id, moduleKey })) });
    }
  });
  if (modules) {
    const subscribers = await runAsSystem('billing.plan-change', () => prisma.subscription.findMany({ where: { planId: id }, select: { facilityId: true } }));
    for (const s of subscribers) await runWithFacility(s.facilityId, () => prisma.$transaction((tx) => applyEntitlements(tx)));
  }
  await createAuditLog({ ...getRequestAuditContext(req), facilityId: null, action: 'PLAN_UPDATED', module: 'Platform', entityType: 'Plan', entityId: id, details: body });
  return planView(await prisma.plan.findUniqueOrThrow({ where: { id }, include: { modules: true } }));
}

export async function setModulePrice(moduleKey: string, monthlyPrice: number, req: Request) {
  if (!isModuleKey(moduleKey)) throw new AppError('Unknown department', 400, 'UNKNOWN_MODULE');
  await prisma.modulePrice.upsert({ where: { moduleKey }, create: { moduleKey, monthlyPrice }, update: { monthlyPrice } });
  await createAuditLog({ ...getRequestAuditContext(req), facilityId: null, action: 'MODULE_PRICE_SET', module: 'Platform', entityType: 'ModulePrice', entityId: moduleKey, details: { monthlyPrice } });
  return listModulePrices();
}

/** The price of a plan, add-ons and interval, as shown before paying. */
export async function priceFor(planId: string, addOns: string[], interval: BillingInterval) {
  const plan = await prisma.plan.findUnique({ where: { id: planId }, include: { modules: true } });
  if (!plan || !plan.isActive) throw new AppError('Choose an available plan', 400, 'PLAN_NOT_FOUND');
  assertModules(entitledModules(plan.modules.map((m) => m.moduleKey), addOns));
  const prices = await prisma.modulePrice.findMany({ where: { moduleKey: { in: addOns } } });
  const missing = addOns.filter((k) => !prices.some((p) => p.moduleKey === k) && !plan.modules.some((m) => m.moduleKey === k));
  if (missing.length) throw new AppError(`These departments are not sold as add-ons: ${missing.join(', ')}`, 400, 'ADDON_NOT_AVAILABLE');
  const result = quote({
    plan: { name: plan.name, monthlyPrice: money(plan.monthlyPrice), yearlyDiscountPercent: plan.yearlyDiscountPercent, modules: plan.modules.map((m) => m.moduleKey) },
    addOns: prices.map((p) => ({ moduleKey: p.moduleKey, name: MODULES.find((m) => m.key === p.moduleKey)?.name ?? p.moduleKey, monthlyPrice: money(p.monthlyPrice) })),
    interval
  });
  // Add-ons already in the plan are dropped, so they are never stored or charged.
  const chargeableAddOns = [...new Set(addOns)].filter((k) => !plan.modules.some((m) => m.moduleKey === k)).sort();
  return { plan, addOns: chargeableAddOns, interval, ...result };
}

/* ------------------------------------------------------------ entitlements */

/**
 * Writes the facility's modules from its subscription. Runs in the facility's
 * context. A facility without a subscription is managed by the platform
 * operator and is left alone.
 */
export async function applyEntitlements(tx: Tx) {
  const subscription = await tx.subscription.findFirst({ include: { plan: { include: { modules: true } } } });
  if (!subscription) return null;
  const entitled = entitledModules(subscription.plan.modules.map((m) => m.moduleKey), subscription.addOnModules);
  for (const moduleKey of MODULE_KEYS) {
    await tx.facilityModule.upsert({
      where: { facilityId_moduleKey: { facilityId: subscription.facilityId, moduleKey } },
      update: { enabled: entitled.includes(moduleKey) },
      create: { moduleKey, enabled: entitled.includes(moduleKey) }
    });
  }
  return entitled;
}

/** Starts a trial on a plan for the current facility (used when a facility is created). */
export async function startTrial(tx: Tx, input: { planId: string; interval: BillingInterval; addOns?: string[]; billingEmail?: string | null }) {
  const plan = await tx.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) throw new AppError('Choose an available plan', 400, 'PLAN_NOT_FOUND');
  // Add-ons chosen at sign-up are part of the trial (checked and de-duplicated like a paid order).
  const addOns = input.addOns?.length ? (await priceFor(plan.id, input.addOns, input.interval)).addOns : [];
  const now = new Date();
  await tx.subscription.create({
    data: {
      planId: plan.id,
      interval: input.interval,
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: new Date(now.getTime() + plan.trialDays * DAY_MS),
      addOnModules: addOns,
      billingEmail: input.billingEmail ?? null
    }
  });
  return applyEntitlements(tx);
}

/** Read-only state for the signed-in facility, used by requireAuth on every request. */
export async function subscriptionStateFor(facilityId: string) {
  const s = await runAsSystem('auth.subscription', () =>
    prisma.subscription.findUnique({ where: { facilityId }, select: { status: true, trialEndsAt: true, graceEndsAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } })
  );
  if (!s) return null;
  return { ...s, readOnly: NOT_WRITABLE.includes(s.status) };
}

/* -------------------------------------------------------- facility's view */

const invoiceSelect = { id: true, invoiceNumber: true, kind: true, status: true, amount: true, currency: true, lines: true, periodStart: true, periodEnd: true, paidAt: true, attempts: true, lastError: true, createdAt: true, planId: true, interval: true, addOnModules: true } as const;

export async function mySubscription() {
  const subscription = await prisma.subscription.findFirst({ include: { plan: { include: { modules: true } }, pendingPlan: { include: { modules: true } } } });
  const [plans, addOns] = await Promise.all([listPlans(), listModulePrices()]);
  const departments = MODULES.map((m) => ({ key: m.key, name: m.name, category: m.category }));
  if (!subscription) return { subscription: null, plans, addOns: addOns.filter((a) => a.priced), departments, managedByPlatform: true };
  const [invoices, users] = await Promise.all([
    prisma.subscriptionInvoice.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: invoiceSelect }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } })
  ]);
  const current = await priceFor(subscription.planId, subscription.addOnModules, subscription.interval).catch(() => null);
  const { gatewayAuthorizationCode, gatewayCustomerCode: _c, ...safe } = subscription;
  void _c;
  return {
    subscription: {
      ...safe,
      plan: planView(subscription.plan),
      pendingPlan: subscription.pendingPlan ? planView(subscription.pendingPlan) : null,
      hasSavedPaymentMethod: Boolean(gatewayAuthorizationCode),
      readOnly: NOT_WRITABLE.includes(subscription.status),
      modules: entitledModules(subscription.plan.modules.map((m) => m.moduleKey), subscription.addOnModules),
      price: current ? { lines: current.lines, total: current.total, monthlyEquivalent: current.monthlyEquivalent } : null,
      usage: { users, maxUsers: subscription.plan.maxUsers }
    },
    invoices: invoices.map((i) => ({ ...i, amount: money(i.amount) })),
    plans,
    addOns: addOns.filter((a) => a.priced),
    departments,
    managedByPlatform: false
  };
}

async function loadSubscription(tx: Tx | typeof prisma = prisma) {
  const subscription = await tx.subscription.findFirst({ include: { plan: { include: { modules: true } } } });
  if (!subscription) throw new AppError('This facility is managed by the platform operator and has no subscription', 409, 'NO_SUBSCRIPTION');
  return subscription;
}

/* --------------------------------------------------------------- payments */

async function openInvoice(tx: Tx, input: { subscriptionId: string; kind: SubscriptionInvoiceKind; planId: string; interval: BillingInterval; addOns: string[]; amount: number; lines: unknown; periodStart: Date; periodEnd: Date }) {
  // Only one open invoice of a kind: a new one replaces the old (the partial unique index enforces this).
  await tx.subscriptionInvoice.updateMany({ where: { kind: input.kind, status: SubscriptionInvoiceStatus.OPEN }, data: { status: SubscriptionInvoiceStatus.VOID } });
  return tx.subscriptionInvoice.create({
    data: {
      invoiceNumber: await nextCode(tx, 'SUB'),
      subscriptionId: input.subscriptionId,
      kind: input.kind,
      planId: input.planId,
      interval: input.interval,
      addOnModules: input.addOns,
      amount: input.amount,
      lines: input.lines as Prisma.InputJsonValue,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    }
  });
}

/** Chooses a plan and pays for the first period (from a trial, a cancelled or a suspended-after-trial account). */
export async function startCheckout(body: { planId: string; interval: BillingInterval; addOns: string[]; billingEmail: string }, req: Request) {
  const subscription = await loadSubscription();
  const allowed: SubscriptionStatus[] = [SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELLED, SubscriptionStatus.SUSPENDED];
  if (!allowed.includes(subscription.status)) throw new AppError('Your subscription is already paid; change plan instead', 409, 'ALREADY_SUBSCRIBED');
  if (subscription.status === SubscriptionStatus.SUSPENDED && (await prisma.subscriptionInvoice.count({ where: { kind: SubscriptionInvoiceKind.RENEWAL, status: SubscriptionInvoiceStatus.OPEN } }))) {
    throw new AppError('Pay the outstanding renewal invoice to restore your account', 409, 'RENEWAL_OUTSTANDING');
  }
  const price = await priceFor(body.planId, body.addOns, body.interval);
  const now = new Date();
  const invoice = await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: subscription.id }, data: { billingEmail: body.billingEmail } });
    return openInvoice(tx, { subscriptionId: subscription.id, kind: SubscriptionInvoiceKind.FIRST, planId: price.plan.id, interval: body.interval, addOns: price.addOns, amount: price.total, lines: price.lines, periodStart: now, periodEnd: periodEnd(now, body.interval) });
  });
  await audit(req, 'CHECKOUT_STARTED', subscription.id, { plan: price.plan.code, interval: body.interval, total: price.total });
  return payInvoice(invoice.id, req);
}

/** Sends the payer to the gateway to pay an open invoice. */
export async function payInvoice(invoiceId: string, req: Request) {
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { id: invoiceId }, include: { subscription: true } });
  if (!invoice) throw new AppError('Invoice not found', 404, 'SUBSCRIPTION_INVOICE_NOT_FOUND');
  if (invoice.status !== SubscriptionInvoiceStatus.OPEN) throw new AppError(`This invoice is ${invoice.status.toLowerCase()}`, 409, 'INVOICE_NOT_OPEN');
  const email = invoice.subscription.billingEmail || req.user?.email;
  if (!email) throw new AppError('Add a billing email address first', 400, 'BILLING_EMAIL_REQUIRED');
  const reference = newReference(invoice.invoiceNumber);
  await prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { gatewayReference: reference, attempts: { increment: 1 } } });
  const callbackUrl = env.PAYMENT_CALLBACK_URL ?? `${env.FRONTEND_URL}/`;
  const { authorizationUrl } = await gateway().initialize({
    email,
    amountPesewas: toPesewas(money(invoice.amount)),
    reference,
    callbackUrl,
    metadata: { facilityId: invoice.facilityId, invoiceNumber: invoice.invoiceNumber, kind: invoice.kind }
  });
  return { invoiceNumber: invoice.invoiceNumber, reference, amount: money(invoice.amount), authorizationUrl };
}

/**
 * Applies a verified successful payment to its invoice and the subscription.
 * Only an OPEN invoice changes, so applying the same payment twice is harmless.
 */
async function applyPayment(tx: Tx, invoiceId: string, result: ChargeResult) {
  const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (result.amountPesewas < toPesewas(money(invoice.amount))) throw new AppError('The amount paid is less than the invoice', 409, 'AMOUNT_MISMATCH');
  const paid = await tx.subscriptionInvoice.updateMany({ where: { id: invoiceId, status: SubscriptionInvoiceStatus.OPEN }, data: { status: SubscriptionInvoiceStatus.PAID, paidAt: result.paidAt ?? new Date(), lastError: null } });
  if (paid.count === 0) return false;

  const card = result.authorization?.reusable ? { gatewayAuthorizationCode: result.authorization.code, gatewayAuthorizationHint: result.authorization.hint } : {};
  const common = { ...card, ...(result.customerCode ? { gatewayCustomerCode: result.customerCode } : {}), status: SubscriptionStatus.ACTIVE, graceEndsAt: null };
  if (invoice.kind === SubscriptionInvoiceKind.UPGRADE) {
    await tx.subscription.update({ where: { id: invoice.subscriptionId }, data: { ...common, planId: invoice.planId, addOnModules: invoice.addOnModules } });
  } else {
    // FIRST and RENEWAL start a new period on the invoice's plan, add-ons and interval.
    await tx.subscription.update({
      where: { id: invoice.subscriptionId },
      data: {
        ...common,
        planId: invoice.planId,
        interval: invoice.interval,
        addOnModules: invoice.addOnModules,
        currentPeriodStart: invoice.periodStart,
        currentPeriodEnd: invoice.periodEnd,
        trialEndsAt: null,
        cancelledAt: null,
        cancelAtPeriodEnd: false,
        hasPendingChange: false,
        pendingPlanId: null,
        pendingInterval: null,
        pendingAddOns: []
      }
    });
  }
  await applyEntitlements(tx);
  return true;
}

/** Records a failed attempt on an invoice without changing access. */
async function recordFailure(invoiceId: string, message: string) {
  await prisma.subscriptionInvoice.update({ where: { id: invoiceId }, data: { lastError: message } });
}

/**
 * Confirms a payment by reference: re-verifies with the gateway (never trusting
 * what the browser or webhook body claims) and applies it. Must run in the
 * invoice's facility context.
 */
export async function confirmPayment(reference: string, req: Request | null) {
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { gatewayReference: reference } });
  if (!invoice) throw new AppError('No invoice has that payment reference', 404, 'SUBSCRIPTION_INVOICE_NOT_FOUND');
  const result = await gateway().verify(reference);
  if (result.status === 'success') {
    const applied = await prisma.$transaction((tx) => applyPayment(tx, invoice.id, result));
    if (applied) await audit(req, 'SUBSCRIPTION_PAYMENT_APPLIED', invoice.subscriptionId, { invoice: invoice.invoiceNumber, reference });
    return { status: 'PAID' as const, applied };
  }
  if (result.status === 'failed') await recordFailure(invoice.id, result.message ?? 'Payment declined');
  return { status: result.status === 'failed' ? ('FAILED' as const) : ('PENDING' as const), applied: false, message: result.message };
}

/** For webhooks: finds the invoice's facility, then confirms inside it. */
export async function confirmPaymentByReference(reference: string) {
  const invoice = await runAsSystem('billing.webhook', () => prisma.subscriptionInvoice.findUnique({ where: { gatewayReference: reference }, select: { facilityId: true } }));
  if (!invoice) return { status: 'IGNORED' as const, applied: false, message: 'Unknown reference' };
  return runWithFacility(invoice.facilityId, () => confirmPayment(reference, null));
}

/** Charges the saved card or wallet for an open invoice (renewals and upgrades). */
async function chargeSaved(invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { subscription: true } });
  const s = invoice.subscription;
  if (!s.gatewayAuthorizationCode || !s.billingEmail) return { status: 'NO_SAVED_METHOD' as const };
  const reference = newReference(invoice.invoiceNumber);
  await prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { gatewayReference: reference, attempts: { increment: 1 } } });
  let result: ChargeResult;
  try {
    result = await gateway().chargeAuthorization({ authorizationCode: s.gatewayAuthorizationCode, email: s.billingEmail, amountPesewas: toPesewas(money(invoice.amount)), reference, metadata: { facilityId: invoice.facilityId, invoiceNumber: invoice.invoiceNumber, kind: invoice.kind } });
  } catch (error) {
    await recordFailure(invoice.id, error instanceof Error ? error.message : 'Charge failed');
    return { status: 'FAILED' as const };
  }
  if (result.status === 'success') {
    await prisma.$transaction((tx) => applyPayment(tx, invoice.id, result));
    return { status: 'PAID' as const };
  }
  await recordFailure(invoice.id, result.message ?? 'Charge declined');
  return { status: result.status === 'pending' ? ('PENDING' as const) : ('FAILED' as const) };
}

/* ------------------------------------------------------------ plan changes */

/**
 * Changes plan, interval or add-ons. A more expensive change on the same
 * interval takes effect now, for the prorated difference; everything else
 * (cheaper plans, fewer add-ons, a different interval) waits for renewal.
 */
export async function changePlan(body: { planId: string; interval: BillingInterval; addOns: string[] }, req: Request) {
  const subscription = await loadSubscription();
  if (subscription.status !== SubscriptionStatus.ACTIVE) throw new AppError('Plan changes need an active subscription; pay any open invoice first', 409, 'SUBSCRIPTION_NOT_ACTIVE');
  const next = await priceFor(body.planId, body.addOns, body.interval);
  const current = await priceFor(subscription.planId, subscription.addOnModules, subscription.interval);
  const sameSetup = next.plan.id === subscription.planId && body.interval === subscription.interval && next.addOns.join() === subscription.addOnModules.slice().sort().join();
  if (sameSetup) throw new AppError('That is your current plan', 400, 'NO_CHANGE');

  const upgradeNow = body.interval === subscription.interval && next.total > current.total && subscription.currentPeriodStart && subscription.currentPeriodEnd;
  if (!upgradeNow) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { hasPendingChange: true, pendingPlanId: next.plan.id, pendingInterval: body.interval, pendingAddOns: next.addOns } });
    await audit(req, 'PLAN_CHANGE_SCHEDULED', subscription.id, { plan: next.plan.code, interval: body.interval, addOns: next.addOns, from: subscription.currentPeriodEnd });
    return { effective: 'AT_RENEWAL' as const, at: subscription.currentPeriodEnd, subscription: await mySubscription() };
  }

  const charge = prorationCharge(current.total, next.total, subscription.currentPeriodStart as Date, subscription.currentPeriodEnd as Date, new Date());
  const invoice = await prisma.$transaction((tx) =>
    openInvoice(tx, {
      subscriptionId: subscription.id,
      kind: SubscriptionInvoiceKind.UPGRADE,
      planId: next.plan.id,
      interval: body.interval,
      addOns: next.addOns,
      amount: charge,
      lines: [{ description: `Change to ${next.plan.name}${next.addOns.length ? ` with ${next.addOns.length} add-on(s)` : ''}, for the rest of this period`, amount: charge }],
      periodStart: new Date(),
      periodEnd: subscription.currentPeriodEnd as Date
    })
  );
  await audit(req, 'PLAN_UPGRADE_STARTED', subscription.id, { plan: next.plan.code, addOns: next.addOns, charge });
  if (charge === 0) {
    await prisma.$transaction((tx) => applyPayment(tx, invoice.id, { status: 'success', reference: `free-${invoice.id}`, amountPesewas: 0 }));
    return { effective: 'NOW' as const, charged: 0, subscription: await mySubscription() };
  }
  const saved = await chargeSaved(invoice.id);
  if (saved.status === 'PAID') return { effective: 'NOW' as const, charged: charge, subscription: await mySubscription() };
  // No saved method, or it was declined: the payer completes checkout, and the change applies when paid.
  return { effective: 'AFTER_PAYMENT' as const, charged: charge, checkout: await payInvoice(invoice.id, req) };
}

export async function cancelSubscription(req: Request) {
  const subscription = await loadSubscription();
  if (subscription.status === SubscriptionStatus.CANCELLED) throw new AppError('The subscription is already cancelled', 409, 'ALREADY_CANCELLED');
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
  await audit(req, 'SUBSCRIPTION_CANCEL_REQUESTED', subscription.id, { endsAt: subscription.currentPeriodEnd ?? subscription.trialEndsAt });
  return mySubscription();
}

export async function resumeSubscription(req: Request) {
  const subscription = await loadSubscription();
  if (!subscription.cancelAtPeriodEnd) throw new AppError('The subscription is not set to cancel', 409, 'NOT_CANCELLING');
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: false } });
  await audit(req, 'SUBSCRIPTION_RESUMED', subscription.id);
  return mySubscription();
}

/** Staff-account limit of the plan, checked when a user is created. */
export async function assertUserAllowance() {
  if (!currentFacilityId()) return;
  const subscription = await prisma.subscription.findFirst({ include: { plan: { select: { maxUsers: true, name: true } } } });
  if (!subscription?.plan.maxUsers) return;
  const users = await prisma.user.count({ where: { status: UserStatus.ACTIVE } });
  if (users >= subscription.plan.maxUsers) {
    throw new AppError(`The ${subscription.plan.name} plan allows ${subscription.plan.maxUsers} active staff accounts. Upgrade to add more.`, 409, 'USER_LIMIT_REACHED');
  }
}

/* ------------------------------------------------------------ the billing cycle */

type CycleOutcome = { facilityId: string; action: string };

async function cycleOne(subscriptionId: string, now: Date, graceDays: number): Promise<string | null> {
  const s = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

  // A trial ends: paid by then or it becomes read-only (choose a plan to continue).
  if (s.status === SubscriptionStatus.TRIALING && s.trialEndsAt && s.trialEndsAt <= now) {
    const status = s.cancelAtPeriodEnd ? SubscriptionStatus.CANCELLED : SubscriptionStatus.SUSPENDED;
    await prisma.subscription.update({ where: { id: s.id }, data: { status, cancelledAt: s.cancelAtPeriodEnd ? now : null } });
    return status === SubscriptionStatus.CANCELLED ? 'TRIAL_CANCELLED' : 'TRIAL_ENDED';
  }

  // A paid period ends: cancel if asked, else bill the next period.
  if (s.status === SubscriptionStatus.ACTIVE && s.currentPeriodEnd && s.currentPeriodEnd <= now) {
    if (s.cancelAtPeriodEnd) {
      await prisma.subscription.update({ where: { id: s.id }, data: { status: SubscriptionStatus.CANCELLED, cancelledAt: now } });
      return 'CANCELLED';
    }
    const planId = s.hasPendingChange && s.pendingPlanId ? s.pendingPlanId : s.planId;
    const interval = s.hasPendingChange && s.pendingInterval ? s.pendingInterval : s.interval;
    const addOns = s.hasPendingChange ? s.pendingAddOns : s.addOnModules;
    const price = await priceFor(planId, addOns, interval);
    const invoice = await prisma.$transaction((tx) =>
      openInvoice(tx, { subscriptionId: s.id, kind: SubscriptionInvoiceKind.RENEWAL, planId, interval, addOns: price.addOns, amount: price.total, lines: price.lines, periodStart: s.currentPeriodEnd as Date, periodEnd: periodEnd(s.currentPeriodEnd as Date, interval) })
    );
    const charged = await chargeSaved(invoice.id);
    if (charged.status === 'PAID') return 'RENEWED';
    await prisma.subscription.update({ where: { id: s.id }, data: { status: SubscriptionStatus.PAST_DUE, graceEndsAt: new Date(now.getTime() + graceDays * DAY_MS) } });
    return 'PAST_DUE';
  }

  if (s.status === SubscriptionStatus.PAST_DUE) {
    if (s.graceEndsAt && s.graceEndsAt <= now) {
      await prisma.subscription.update({ where: { id: s.id }, data: { status: SubscriptionStatus.SUSPENDED } });
      return 'SUSPENDED';
    }
    // Retry the saved method once a day during grace.
    const invoice = await prisma.subscriptionInvoice.findFirst({ where: { kind: SubscriptionInvoiceKind.RENEWAL, status: SubscriptionInvoiceStatus.OPEN } });
    if (invoice && invoice.updatedAt.getTime() <= now.getTime() - DAY_MS && invoice.attempts < 4) {
      const charged = await chargeSaved(invoice.id);
      return charged.status === 'PAID' ? 'RECOVERED' : 'RETRY_FAILED';
    }
  }
  return null;
}

/**
 * Moves every subscription forward to `now`: trial ends, renewals, grace and
 * suspension. Safe to run repeatedly (hourly in production; on demand from
 * the platform console and in tests).
 */
export async function runBillingCycle(now = new Date()) {
  const due = await runAsSystem('billing.cycle', () =>
    prisma.subscription.findMany({
      where: {
        OR: [
          { status: SubscriptionStatus.TRIALING, trialEndsAt: { lte: now } },
          { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { lte: now } },
          { status: SubscriptionStatus.PAST_DUE }
        ]
      },
      select: { id: true, facilityId: true }
    })
  );
  const outcomes: CycleOutcome[] = [];
  for (const s of due) {
    try {
      const action = await runWithFacility(s.facilityId, () => cycleOne(s.id, now, env.BILLING_GRACE_DAYS));
      if (action) {
        outcomes.push({ facilityId: s.facilityId, action });
        await runWithFacility(s.facilityId, () => audit(null, `BILLING_${action}`, s.id));
      }
    } catch (error) {
      outcomes.push({ facilityId: s.facilityId, action: `ERROR: ${error instanceof Error ? error.message : 'unknown'}` });
    }
  }
  return { checked: due.length, outcomes };
}

/** The platform operator's view of every subscription. */
export async function listSubscriptions() {
  const rows = await runAsSystem('platform.billing', () =>
    prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      include: { facility: { select: { id: true, code: true, name: true } }, plan: { select: { code: true, name: true } }, invoices: { where: { status: SubscriptionInvoiceStatus.OPEN }, select: { invoiceNumber: true, amount: true, kind: true } } }
    })
  );
  return rows.map(({ gatewayAuthorizationCode, gatewayCustomerCode: _c, invoices, ...s }) => {
    void _c;
    return { ...s, hasSavedPaymentMethod: Boolean(gatewayAuthorizationCode), openInvoices: invoices.map((i) => ({ ...i, amount: money(i.amount) })) };
  });
}

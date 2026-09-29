import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { FakeGateway, gateway } from '../../src/services/paymentGateway.js';

// Phase 5 exit gate: a facility subscribes, pays, adds a department, misses a
// renewal, goes past due, is suspended (read-only), pays and is restored, with
// department access checked at each step. The fake gateway stands in for Paystack.
const CODE = `S${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const PASSWORD = 'sierra-admin-pass-1';
const fake = gateway() as FakeGateway;

let server: Server;
let baseUrl: string;
let platformToken: string;
let adminToken: string;
let starterId: string;
let premiumId: string;

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers, redirect: 'manual' });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* html */ }
  return { status: response.status, text, json, headers: response.headers };
}
const send = (method: string, path: string, token: string | undefined, body?: unknown) =>
  api(path, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });

async function login(code: string | undefined, username: string, password: string) {
  const res = await send('POST', '/auth/login', undefined, { facilityCode: code, username, password });
  expect(res.status, res.text).toBe(200);
  return res.json.data as { accessToken: string; user: { modules: string[]; subscription: { status: string; readOnly: boolean } | null } };
}
const me = async () => (await login(CODE, 'admin', PASSWORD)).user;
const subscription = async () => {
  const res = await send('GET', '/subscription', adminToken);
  expect(res.status, res.text).toBe(200);
  return res.json.data;
};
const runCycle = async (at: Date) => {
  const res = await send('POST', '/platform/billing/run', platformToken, { at: at.toISOString() });
  expect(res.status, res.text).toBe(200);
  return res.json.data.outcomes as { facilityId: string; action: string }[];
};
let userSeq = 0;
const addUser = () => send('POST', '/admin/users', adminToken, { name: 'New Nurse', username: `nurse${++userSeq}`, role: 'NURSE', password: 'nurse-pass-123' });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  platformToken = (await login(undefined, 'platform', 'platform123')).accessToken;
  const plans = (await send('GET', '/platform/plans', platformToken)).json.data as { id: string; code: string }[];
  starterId = plans.find((p) => p.code === 'STARTER')!.id;
  premiumId = plans.find((p) => p.code === 'PREMIUM')!.id;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('public pricing', () => {
  it('lists public plans and add-ons without signing in', async () => {
    const res = await send('GET', '/public/plans', undefined);
    expect(res.status).toBe(200);
    expect(res.json.data.plans.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['STARTER', 'STANDARD', 'PREMIUM']));
    expect(res.json.data.addOns.some((a: { moduleKey: string }) => a.moduleKey === 'theatre')).toBe(true);
    expect(JSON.stringify(res.json.data)).not.toMatch(/isPublic/);
  });

  it('quotes a yearly price with the discount, and never charges an add-on already in the plan', async () => {
    const monthly = await send('POST', '/public/quote', undefined, { planId: starterId, interval: 'MONTHLY', addOns: ['theatre', 'opd'] });
    expect(monthly.status, monthly.text).toBe(200);
    expect(monthly.json.data.addOns).toEqual(['theatre']);
    expect(monthly.json.data.total).toBe(900);
    const yearly = await send('POST', '/public/quote', undefined, { planId: starterId, interval: 'YEARLY', addOns: ['theatre'] });
    expect(yearly.json.data.total).toBe(9180); // 900 x 12 less 15%
  });
});

describe('subscription lifecycle', () => {
  it('a new facility starts a trial with only its plan departments', async () => {
    const created = await send('POST', '/platform/facilities', platformToken, {
      code: CODE, name: 'Sierra Clinic', email: 'accounts@sierra.example', planId: starterId, interval: 'MONTHLY',
      admin: { name: 'Sierra Admin', username: 'admin', password: PASSWORD }
    });
    expect(created.status, created.text).toBe(201);
    const session = await login(CODE, 'admin', PASSWORD);
    adminToken = session.accessToken;
    expect(session.user.subscription).toMatchObject({ status: 'TRIALING', readOnly: false });
    expect(session.user.modules).toContain('opd');
    expect(session.user.modules).not.toContain('theatre');
    expect((await send('GET', '/theatre/theatres', adminToken)).status).toBe(403);
  });

  it('only the facility administrator reaches billing', async () => {
    expect((await send('GET', '/subscription', platformToken)).status).toBe(403);
    expect((await send('GET', '/platform/subscriptions', adminToken)).status).toBe(403);
  });

  it('pays for the first month through checkout', async () => {
    const checkout = await send('POST', '/subscription/checkout', adminToken, { planId: starterId, interval: 'MONTHLY', addOns: [], billingEmail: 'accounts@sierra.example' });
    expect(checkout.status, checkout.text).toBe(200);
    expect(checkout.json.data.amount).toBe(500);
    expect(checkout.json.data.authorizationUrl).toMatch(/fake-checkout/);
    const { reference } = checkout.json.data;

    // Not paid yet: confirming changes nothing.
    const early = await send('POST', '/subscription/confirm', adminToken, { reference });
    expect(early.json.data.status).toBe('PENDING');

    fake.complete(reference, 'success');
    const confirmed = await send('POST', '/subscription/confirm', adminToken, { reference });
    expect(confirmed.status, confirmed.text).toBe(200);
    expect(confirmed.json.data).toMatchObject({ status: 'PAID', applied: true });
    const s = (await subscription()).subscription;
    expect(s).toMatchObject({ status: 'ACTIVE', hasSavedPaymentMethod: true, interval: 'MONTHLY' });
    expect(s.gatewayAuthorizationCode).toBeUndefined();

    // A repeated confirmation, or the gateway's webhook arriving later, changes nothing.
    expect((await send('POST', '/subscription/confirm', adminToken, { reference })).json.data.applied).toBe(false);
    const body = JSON.stringify({ event: 'charge.success', data: { id: 991, reference } });
    const hook = await api('/billing/webhooks/paystack', { method: 'POST', body, headers: { 'x-paystack-signature': FakeGateway.sign(body) } });
    expect(hook.status, hook.text).toBe(200);
    expect(hook.json.data.outcome).toMatch(/"applied":false/);
    const again = await api('/billing/webhooks/paystack', { method: 'POST', body, headers: { 'x-paystack-signature': FakeGateway.sign(body) } });
    expect(again.json.data.duplicate).toBe(true);
    const forged = await api('/billing/webhooks/paystack', { method: 'POST', body, headers: { 'x-paystack-signature': 'nope' } });
    expect(forged.status).toBe(401);

    const invoices = (await subscription()).invoices;
    expect(invoices.filter((i: { status: string }) => i.status === 'PAID')).toHaveLength(1);
  });

  it('adds a department mid-period for the prorated price, charged to the saved card', async () => {
    const res = await send('POST', '/subscription/change', adminToken, { planId: starterId, interval: 'MONTHLY', addOns: ['theatre'] });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.effective).toBe('NOW');
    expect(res.json.data.charged).toBeGreaterThan(0);
    expect(res.json.data.charged).toBeLessThanOrEqual(400);
    expect((await me()).modules).toContain('theatre');
    expect((await send('GET', '/theatre/theatres', adminToken)).status).toBe(200);
  });

  it('schedules a cheaper change for renewal instead of refunding', async () => {
    const res = await send('POST', '/subscription/change', adminToken, { planId: starterId, interval: 'YEARLY', addOns: ['theatre'] });
    expect(res.json.data.effective).toBe('AT_RENEWAL');
    const s = (await subscription()).subscription;
    expect(s.hasPendingChange).toBe(true);
    expect(s.pendingInterval).toBe('YEARLY');
    expect((await me()).modules).toContain('theatre');
  });

  let periodEnd: Date;
  let graceEnd: Date;

  it('a declined renewal makes the account past due, still fully usable', async () => {
    periodEnd = new Date((await subscription()).subscription.currentPeriodEnd);
    fake.failCharges = true;
    const outcomes = await runCycle(new Date(periodEnd.getTime() + 60_000));
    const s = (await subscription()).subscription;
    expect(s.status).toBe('PAST_DUE');
    expect(outcomes.some((o) => o.facilityId === s.facilityId && o.action === 'PAST_DUE')).toBe(true);
    graceEnd = new Date(s.graceEndsAt);
    expect(graceEnd.getTime()).toBeGreaterThan(periodEnd.getTime());
    const session = await me();
    expect(session.subscription).toMatchObject({ status: 'PAST_DUE', readOnly: false });
    expect(session.modules).toContain('theatre');
    expect((await addUser()).status).toBe(201);
  });

  it('after the grace period the facility is read-only, but nothing is lost', async () => {
    await runCycle(new Date(graceEnd.getTime() + 60_000));
    const session = await me();
    expect(session.subscription).toMatchObject({ status: 'SUSPENDED', readOnly: true });
    const blocked = await addUser();
    expect(blocked.status).toBe(402);
    expect(blocked.json.code ?? blocked.json.error?.code ?? blocked.text).toMatch(/SUBSCRIPTION_READ_ONLY/);
    expect((await send('GET', '/admin/users', adminToken)).status).toBe(200);
    expect((await send('GET', '/patients', adminToken)).status).toBe(200);
    // A new checkout is refused while the renewal is outstanding.
    const checkout = await send('POST', '/subscription/checkout', adminToken, { planId: premiumId, interval: 'MONTHLY', addOns: [], billingEmail: 'accounts@sierra.example' });
    expect(checkout.status).toBe(409);
  });

  it('paying the outstanding renewal restores the account for the next period', async () => {
    fake.failCharges = false;
    const open = (await subscription()).invoices.find((i: { status: string; kind: string }) => i.status === 'OPEN' && i.kind === 'RENEWAL');
    expect(open).toBeTruthy();
    const pay = await send('POST', `/subscription/invoices/${open.id}/pay`, adminToken);
    expect(pay.status, pay.text).toBe(200);
    // Through the fake checkout page, as a payer would.
    const page = await api(`/billing/fake-checkout/${pay.json.data.reference}`);
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/Test payment/);
    const done = await fetch(`${baseUrl}/api/billing/fake-checkout/${pay.json.data.reference}/complete?outcome=success&return=${encodeURIComponent('http://localhost:5173/')}`, { redirect: 'manual' });
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toContain(`reference=${pay.json.data.reference}`);

    const s = (await subscription()).subscription;
    expect(s.status).toBe('ACTIVE');
    // The scheduled yearly change took effect with the renewal.
    expect(s.interval).toBe('YEARLY');
    expect(s.hasPendingChange).toBe(false);
    expect(new Date(s.currentPeriodStart).getTime()).toBe(periodEnd.getTime());
    const session = await me();
    expect(session.subscription).toMatchObject({ status: 'ACTIVE', readOnly: false });
    expect(session.modules).toContain('theatre');
    expect((await addUser()).status).toBe(201);
  });

  it('cancelling ends the subscription at the period end, leaving records readable', async () => {
    expect((await send('POST', '/subscription/cancel', adminToken)).status).toBe(200);
    expect((await send('POST', '/subscription/resume', adminToken)).status).toBe(200);
    expect((await send('POST', '/subscription/cancel', adminToken)).status).toBe(200);
    const end = new Date((await subscription()).subscription.currentPeriodEnd);
    await runCycle(new Date(end.getTime() + 60_000));
    const session = await me();
    expect(session.subscription).toMatchObject({ status: 'CANCELLED', readOnly: true });
    expect((await send('GET', '/patients', adminToken)).status).toBe(200);
    expect((await addUser()).status).toBe(402);
  });
});

describe('plan limits and the platform console', () => {
  it('enforces the plan staff-account limit', async () => {
    const code = `T${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    const plan = await send('POST', '/platform/plans', platformToken, { code, name: `Tiny ${code}`, monthlyPrice: 100, maxUsers: 1, modules: ['opd', 'reception'], isPublic: false });
    expect(plan.status, plan.text).toBe(201);
    const facility = `U${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const created = await send('POST', '/platform/facilities', platformToken, { code: facility, name: 'Uniform Clinic', planId: plan.json.data.id, admin: { name: 'U Admin', username: 'admin', password: PASSWORD } });
    expect(created.status, created.text).toBe(201);
    const token = (await login(facility, 'admin', PASSWORD)).accessToken;
    const res = await send('POST', '/admin/users', token, { name: 'Extra', username: 'extra', role: 'NURSE', password: 'extra-pass-123' });
    expect(res.status).toBe(409);
    expect(res.text).toMatch(/USER_LIMIT_REACHED/);
    // Private plans stay off the public page.
    expect(JSON.stringify((await send('GET', '/public/plans', undefined)).json.data)).not.toContain(code);
  });

  it('rejects a plan whose departments are missing a dependency', async () => {
    const res = await send('POST', '/platform/plans', platformToken, { code: 'BROKEN1', name: 'Broken', monthlyPrice: 100, modules: ['finance'] });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/MODULE_DEPENDENCY/);
  });

  it('lists every subscription without payment secrets', async () => {
    const res = await send('GET', '/platform/subscriptions', platformToken);
    expect(res.status).toBe(200);
    expect(res.json.data.some((s: { facility: { code: string } }) => s.facility.code === CODE)).toBe(true);
    expect(res.text).not.toMatch(/AUTH_fake/);
  });
});

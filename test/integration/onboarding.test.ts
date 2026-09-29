import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

// Phase 6 exit gate: a brand-new facility goes from the pricing page to working
// inside its own hospital with no manual help. Also: demo requests, platform
// metrics, and read-only support sessions.
const PASSWORD = 'grace-admin-2026';
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let server: Server;
let baseUrl: string;
let platformToken: string;
let starterId: string;
let adminToken: string;
let facility: { id: string; code: string; name: string };

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null, headers: response.headers };
}
const send = (method: string, path: string, token: string | undefined, body?: unknown) =>
  api(path, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });
async function login(code: string | undefined, username: string, password: string) {
  const res = await send('POST', '/auth/login', undefined, { facilityCode: code, username, password });
  expect(res.status, res.text).toBe(200);
  return res.json.data.accessToken as string;
}

const signupBody = (overrides: Record<string, unknown> = {}) => ({
  facility: { name: 'Grace Community Clinic', phone: '+233 24 000 1111', email: 'admin@grace.example', facilityType: 'Clinic' },
  admin: { name: 'Grace Mensah', username: 'grace', password: PASSWORD },
  planId: starterId,
  interval: 'MONTHLY',
  addOns: ['maternity'],
  acceptTerms: true,
  ...overrides
});

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  platformToken = await login(undefined, 'platform', 'platform123');
  const plans = (await send('GET', '/public/plans', undefined)).json.data.plans as { id: string; code: string }[];
  starterId = plans.find((p) => p.code === 'STARTER')!.id;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('self-service sign-up', () => {
  it('refuses bot submissions and incomplete forms', async () => {
    expect((await send('POST', '/public/signup', undefined, signupBody({ website: 'http://spam.example' }))).status).toBe(400);
    expect((await send('POST', '/public/signup', undefined, signupBody({ acceptTerms: false }))).status).toBe(400);
    const weak = await send('POST', '/public/signup', undefined, signupBody({ admin: { name: 'G', username: 'grace', password: 'short' } }));
    expect(weak.status).toBe(400);
  });

  it('creates the facility on a free trial and signs the administrator straight in', async () => {
    const res = await send('POST', '/public/signup', undefined, signupBody());
    expect(res.status, res.text).toBe(201);
    facility = res.json.data.facility;
    expect(facility.code).toBe('GCC');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const user = res.json.data.user;
    expect(user.role).toBe('ADMIN');
    expect(user.facility).toMatchObject({ code: 'GCC', onboardingCompletedAt: null });
    expect(user.subscription).toMatchObject({ status: 'TRIALING', readOnly: false });
    // The plan's departments plus the add-on chosen on the pricing page.
    expect(user.modules).toEqual(expect.arrayContaining(['opd', 'laboratory', 'maternity']));
    expect(user.modules).not.toContain('theatre');
    adminToken = res.json.data.accessToken;
    // The generated code signs in like any other.
    await login('GCC', 'grace', PASSWORD);
  });

  it('gives a second facility with the same name its own code', async () => {
    const res = await send('POST', '/public/signup', undefined, signupBody({ admin: { name: 'Other Grace', username: 'grace', password: PASSWORD } }));
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.facility.code).toBe('GCC2');
  });

  it('only offers public plans', async () => {
    const hidden = await send('POST', '/platform/plans', platformToken, { code: 'HIDDEN6', name: 'Hidden', monthlyPrice: 10, modules: ['opd'], isPublic: false });
    expect(hidden.status, hidden.text).toBe(201);
    const res = await send('POST', '/public/signup', undefined, signupBody({ planId: hidden.json.data.id, facility: { name: 'Hidden Clinic', phone: '0240001112', email: 'h@h.example' } }));
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('PLAN_NOT_FOUND');
  });
});

describe('setup checklist', () => {
  it('starts with the facility details step open', async () => {
    const res = await send('GET', '/onboarding', adminToken);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.completed).toBe(false);
    const steps = Object.fromEntries(res.json.data.steps.map((s: { key: string; done: boolean }) => [s.key, s.done]));
    expect(steps).toMatchObject({ profile: false, staff: false, prices: false, 'first-patient': false });
  });

  it('saves facility details and a logo, and refuses anything that is not an image', async () => {
    const bad = await send('PATCH', '/onboarding/profile', adminToken, { logoDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' });
    expect(bad.status).toBe(400);
    const res = await send('PATCH', '/onboarding/profile', adminToken, { address: '12 Ring Road, Accra', logoDataUrl: TINY_PNG });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.logoDataUrl).toBe(TINY_PNG);
    const me = await send('GET', '/auth/me', adminToken);
    expect(me.json.data.facility.logoDataUrl).toBe(TINY_PNG);
  });

  it('imports a price list, reporting every bad row at once', async () => {
    const bad = await send('POST', '/onboarding/price-list', adminToken, { rows: [{ code: 'A1', name: 'Fine', type: 'LAB', price: 10 }, { code: '', name: 'x', type: 'DRUG', price: -1 }, { code: 'B2', name: 'Also bad', type: 'SCAN', price: 'free' }] });
    expect(bad.status).toBe(400);
    expect(bad.json.code ?? bad.text).toMatch(/PRICE_LIST_INVALID/);
    expect(bad.text).toMatch(/"row":2/);
    expect(bad.text).toMatch(/"row":3/);

    const rows = [
      { code: 'cons-gen', name: 'General consultation', type: 'service', price: 80 },
      { code: 'FBC', name: 'Full blood count', type: 'LAB', price: 60, sampleType: 'Blood' },
      { code: 'XR-CHEST', name: 'Chest X-ray', type: 'SCAN', price: 150, modality: 'X-ray' }
    ];
    const first = await send('POST', '/onboarding/price-list', adminToken, { rows });
    expect(first.status, first.text).toBe(200);
    expect(first.json.data).toEqual({ created: 3, updated: 0 });
    const again = await send('POST', '/onboarding/price-list', adminToken, { rows: rows.map((r) => ({ ...r, price: r.price + 5 })) });
    expect(again.json.data).toEqual({ created: 0, updated: 3 });

    // Lab tests and scans were filed under new departments of this facility only.
    const departments = await runWithFacility(facility.id, () => prisma.department.findMany({ select: { type: true } }));
    expect(departments.map((d) => d.type).sort()).toEqual(['IMAGING', 'LABORATORY']);
  });

  it('adds staff and the checklist notices', async () => {
    const nurse = await send('POST', '/admin/users', adminToken, { name: 'Ama Nurse', username: 'ama', role: 'NURSE', password: 'ama-pass-2026' });
    expect(nurse.status, nurse.text).toBe(201);
    const steps = (await send('GET', '/onboarding', adminToken)).json.data.steps;
    expect(steps.filter((s: { done: boolean }) => s.done).map((s: { key: string }) => s.key)).toEqual(expect.arrayContaining(['profile', 'staff', 'prices']));
  });

  it('works as a hospital straight away: register a patient and open a visit with the imported fee', async () => {
    const patient = await send('POST', '/patients', adminToken, { firstName: 'Kofi', lastName: 'Owusu', gender: 'MALE', phone: '+233200000061' });
    expect(patient.status, patient.text).toBe(201);
    const fee = await runWithFacility(facility.id, () => prisma.catalogItem.findFirstOrThrow({ where: { catalogCode: 'CONS-GEN' } }));
    const visit = await send('POST', '/encounters', adminToken, { patientId: patient.json.data.id, type: 'OPD', feeItemId: fee.id });
    expect(visit.status, visit.text).toBe(201);
    // Only its own records: none of the other facilities' patients are visible.
    const list = await send('GET', '/patients', adminToken);
    const items = list.json.data.items ?? list.json.data;
    expect(items.map((p: { lastName: string }) => p.lastName)).toEqual(['Owusu']);
  });

  it('finishes setup and can go on to pay', async () => {
    const done = await send('POST', '/onboarding/complete', adminToken);
    expect(done.status).toBe(200);
    const me = await send('GET', '/auth/me', adminToken);
    expect(me.json.data.facility.onboardingCompletedAt).toBeTruthy();
    const checkout = await send('POST', '/subscription/checkout', adminToken, { planId: starterId, interval: 'MONTHLY', addOns: ['maternity'], billingEmail: 'admin@grace.example' });
    expect(checkout.status, checkout.text).toBe(200);
    expect(checkout.json.data.amount).toBe(800);
  });

  it('is only for the facility administrator', async () => {
    const nurse = await login('GCC', 'ama', 'ama-pass-2026');
    expect((await send('GET', '/onboarding', nurse)).status).toBe(403);
  });
});

describe('demo requests and platform metrics', () => {
  it('takes a demo request from the website for the platform to follow up', async () => {
    expect((await send('POST', '/public/demo-requests', undefined, { name: 'Bot', organisation: 'Bots', email: 'b@b.example', website: 'x' })).status).toBe(400);
    const res = await send('POST', '/public/demo-requests', undefined, { name: 'Dr Adjei', organisation: 'Adjei Specialist Hospital', email: 'adjei@example.com', phone: '0200000001', message: 'We have 40 beds.' });
    expect(res.status, res.text).toBe(201);
    const list = await send('GET', '/platform/demo-requests?status=NEW', platformToken);
    const row = list.json.data.find((r: { email: string }) => r.email === 'adjei@example.com');
    expect(row).toMatchObject({ organisation: 'Adjei Specialist Hospital', status: 'NEW' });
    const updated = await send('PATCH', `/platform/demo-requests/${row.id}`, platformToken, { status: 'CONTACTED', notes: 'Call booked for Monday' });
    expect(updated.json.data.status).toBe('CONTACTED');
    const adminA = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    expect((await send('GET', '/platform/demo-requests', adminA)).status).toBe(403);
  });

  it('reports recurring revenue, trials, sign-ups and failed payments', async () => {
    const res = await send('GET', '/platform/metrics', platformToken);
    expect(res.status, res.text).toBe(200);
    const m = res.json.data;
    expect(m.subscriptions.TRIALING).toBeGreaterThanOrEqual(2);
    expect(m.facilities.selfService).toBeGreaterThanOrEqual(2);
    expect(m.arr).toBe(Math.round(m.mrr * 12 * 100) / 100);
    expect(m.revenueByMonth).toHaveLength(6);
    expect(Array.isArray(m.failedPayments)).toBe(true);
    expect(m.trialsEnding).toEqual(expect.any(Array));
  });
});

describe('support sessions', () => {
  it('needs a reason', async () => {
    const res = await send('POST', `/platform/facilities/${facility.id}/support-session`, platformToken, { reason: 'help' });
    expect(res.status).toBe(400);
  });

  it('opens a read-only session as the administrator, logged in the facility', async () => {
    const res = await send('POST', `/platform/facilities/${facility.id}/support-session`, platformToken, { reason: 'Administrator reported the price list will not load' });
    expect(res.status, res.text).toBe(201);
    const token = res.json.data.accessToken as string;
    expect(res.json.data.user.support).toMatchObject({ operatorName: 'Platform Operator', reason: 'Administrator reported the price list will not load' });
    expect(new Date(res.json.data.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 5000);

    expect((await send('GET', '/patients', token)).status).toBe(200);
    expect((await send('GET', '/auth/me', token)).json.data.support.operatorName).toBe('Platform Operator');
    const write = await send('POST', '/patients', token, { firstName: 'Should', lastName: 'Fail', gender: 'MALE', phone: '+233200000062' });
    expect(write.status).toBe(403);
    expect(write.json.code).toBe('SUPPORT_SESSION_READ_ONLY');

    const logged = await runWithFacility(facility.id, () => prisma.auditLog.findMany({ where: { action: 'SUPPORT_SESSION_STARTED' } }));
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0].details)).toContain('price list will not load');

    // Signing out ends it.
    expect((await send('POST', '/auth/logout', token, { refreshToken: res.json.data.refreshToken })).status).toBe(200);
    expect((await send('GET', '/patients', token)).status).toBe(401);
  });

  it('is refused when the facility has switched support access off', async () => {
    const off = await send('PATCH', '/onboarding/profile', adminToken, { allowSupportAccess: false });
    expect(off.json.data.allowSupportAccess).toBe(false);
    const res = await send('POST', `/platform/facilities/${facility.id}/support-session`, platformToken, { reason: 'Checking a reported problem with visits' });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('SUPPORT_ACCESS_DISABLED');
  });

  it('is for platform operators only', async () => {
    const adminA = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    expect((await send('POST', `/platform/facilities/${facility.id}/support-session`, adminA, { reason: 'Trying to look at another hospital' })).status).toBe(403);
  });
});

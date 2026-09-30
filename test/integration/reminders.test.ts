import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';

// Subscription reminders reach the facility's administrators once each, and
// fair-use limits are reported without ever blocking patient registration.
const PASSWORD = 'reminder-admin-2026';
let server: Server;
let base: string;
let platform: string;
let admin: string;
let facilityId: string;

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}
async function login(code: string | undefined, username: string, password: string) {
  return (await api('POST', '/auth/login', undefined, { facilityCode: code, username, password })).json.data.accessToken as string;
}
const notifications = () => runWithFacility(facilityId, () => prisma.notification.findMany({ where: { type: 'PAYMENT_UPDATE' }, orderBy: { createdAt: 'asc' } }));

beforeAll(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  platform = await login(undefined, 'platform', 'platform123');
  // A short trial and small fair-use limits, so both kinds of reminder are due now.
  const code = `R${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const plan = await api('POST', '/platform/plans', platform, { code, name: `Reminder ${code}`, monthlyPrice: 200, trialDays: 2, maxPatientsPerMonth: 1, maxStorageMb: 50, modules: ['opd', 'reception'], isPublic: false });
  expect(plan.status, plan.text).toBe(201);
  expect(plan.json.data).toMatchObject({ maxPatientsPerMonth: 1, maxStorageMb: 50 });
  const facilityCode = `M${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
  const created = await api('POST', '/platform/facilities', platform, { code: facilityCode, name: 'Reminder Clinic', email: 'bills@reminder.example', planId: plan.json.data.id, admin: { name: 'Rem Admin', username: 'admin', password: PASSWORD } });
  expect(created.status, created.text).toBe(201);
  facilityId = created.json.data.facility.id;
  admin = await login(facilityCode, 'admin', PASSWORD);
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('subscription reminders', () => {
  it('fair-use limits never block registering patients', async () => {
    for (const name of ['One', 'Two', 'Three']) {
      const res = await api('POST', '/patients', admin, { firstName: name, lastName: 'Reminder', gender: 'FEMALE', phone: '+233200000071' });
      expect(res.status, res.text).toBe(201);
    }
    const usage = (await api('GET', '/subscription', admin)).json.data.subscription.usage;
    expect(usage).toMatchObject({ patientsThisMonth: 3, maxPatientsPerMonth: 1, maxStorageMb: 50, overFairUse: true });
  });

  it('sends the trial and fair-use reminders to the administrators, once', async () => {
    const run = await api('POST', '/platform/billing/run', platform, {});
    expect(run.status, run.text).toBe(200);
    expect(run.json.data.reminders).toBeGreaterThanOrEqual(2);
    const first = await notifications();
    expect(first.map((n) => n.title)).toEqual(expect.arrayContaining(['Your free trial ends in 3 days', 'More patients than your plan covers']));
    expect(first.every((n) => n.recipientEmail === 'bills@reminder.example')).toBe(true);

    await api('POST', '/platform/billing/run', platform, {});
    expect((await notifications()).length).toBe(first.length);
  });

  it('shows usage to the platform operator', async () => {
    const list = (await api('GET', '/platform/subscriptions', platform)).json.data;
    const row = list.find((s: { facilityId: string }) => s.facilityId === facilityId);
    expect(row.usage).toMatchObject({ patientsThisMonth: 3, overFairUse: true });
  });
});

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

/*
  What a doctor's own workspace needs to work. The clinician pages cannot use
  the admin-only /admin/doctors and /admin/hospitals lists, so they rely on
  the signed-in user carrying their profile id and on GET /doctor/profile
  carrying the hospital. Both were missing once, which left every clinician
  page empty for the doctor it belongs to.
*/

let server: Server;
let base: string;

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

async function login(username: keyof typeof DEMO_USERS) {
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode: FACILITY_A.code, username, password: DEMO_USERS[username] }) });
  expect(res.status, res.text).toBe(200);
  return res.json.data as { accessToken: string; user: { doctorProfileId: string | null } };
}

beforeAll(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("a doctor's own workspace", () => {
  it('signing in tells the clinician which doctor profile is theirs', async () => {
    const session = await login('doctor');
    expect(session.user.doctorProfileId).toBeTruthy();

    const me = await api('/auth/me', { token: session.accessToken });
    expect(me.status, me.text).toBe(200);
    expect(me.json.data.doctorProfileId).toBe(session.user.doctorProfileId);
  });

  it('staff without a doctor profile simply have none', async () => {
    const session = await login('nurse');
    expect(session.user.doctorProfileId).toBeNull();
  });

  it('a doctor reads their own profile, with the hospital their workspace needs', async () => {
    const session = await login('doctor');
    const profile = await api('/doctor/profile', { token: session.accessToken });
    expect(profile.status, profile.text).toBe(200);
    expect(profile.json.data.id).toBe(session.user.doctorProfileId);
    expect(profile.json.data.user?.name).toBeTruthy();
    expect(profile.json.data.hospital?.id).toBeTruthy();
  });

  it('the admin-only lists stay closed to them, which is why the profile route exists', async () => {
    const session = await login('doctor');
    expect((await api('/admin/doctors', { token: session.accessToken })).status).toBe(403);
    expect((await api('/admin/hospitals', { token: session.accessToken })).status).toBe(403);
  });

  it('their order list is their own orders, each naming their profile', async () => {
    const session = await login('doctor');
    const orders = await api('/orders?limit=100', { token: session.accessToken });
    expect(orders.status, orders.text).toBe(200);
    const items = (orders.json.data.items ?? orders.json.data) as { doctorId: string | null }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((order) => order.doctorId === session.user.doctorProfileId)).toBe(true);
  });
});

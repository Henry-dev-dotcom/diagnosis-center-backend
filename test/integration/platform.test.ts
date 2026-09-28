import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

let server: Server;
let baseUrl: string;

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

async function token(facilityCode: string | undefined, username: string, password: string) {
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode, username, password }) });
  expect(res.status, res.text).toBe(200);
  return res.json.data.accessToken as string;
}

let platformToken: string;
const newCode = `C${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  platformToken = await token(undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('platform facility management', () => {
  it('is closed to facility administrators', async () => {
    const adminToken = await token(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    expect((await api('/platform/facilities', { token: adminToken })).status).toBe(403);
  });

  it('lists facilities with their user counts', async () => {
    const res = await api('/platform/facilities', { token: platformToken });
    expect(res.status).toBe(200);
    const alpha = res.json.data.find((f: { code: string }) => f.code === FACILITY_A.code);
    expect(alpha._count.users).toBeGreaterThan(0);
  });

  it('creates a facility whose admin signs in to an empty workspace', async () => {
    const created = await api('/platform/facilities', {
      method: 'POST',
      token: platformToken,
      body: JSON.stringify({
        code: newCode.toLowerCase(),
        name: 'Charlie Health Centre',
        admin: { name: 'Charlie Admin', username: 'admin', password: 'charlie-pass-1' }
      })
    });
    expect(created.status, created.text).toBe(201);
    expect(created.json.data.facility.code).toBe(newCode);

    const charlieToken = await token(newCode, 'admin', 'charlie-pass-1');
    const patients = await api('/patients', { token: charlieToken });
    expect(patients.status).toBe(200);
    expect(JSON.stringify(patients.json.data)).not.toMatch(/PAT-/);
  });

  it('refuses a duplicate facility code', async () => {
    const res = await api('/platform/facilities', {
      method: 'POST',
      token: platformToken,
      body: JSON.stringify({ code: FACILITY_A.code, name: 'Dup', admin: { name: 'X Y', username: 'xyz', password: 'password-123' } })
    });
    expect(res.status).toBe(409);
  });

  it('suspending a facility locks its users out at once, and reactivating restores access', async () => {
    const list = await api('/platform/facilities', { token: platformToken });
    const charlie = list.json.data.find((f: { code: string }) => f.code === newCode);
    const charlieToken = await token(newCode, 'admin', 'charlie-pass-1');

    const suspend = await api(`/platform/facilities/${charlie.id}`, {
      method: 'PATCH',
      token: platformToken,
      body: JSON.stringify({ status: 'SUSPENDED' })
    });
    expect(suspend.status, suspend.text).toBe(200);

    expect((await api('/patients', { token: charlieToken })).status).toBe(403);
    const blockedLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ facilityCode: newCode, username: 'admin', password: 'charlie-pass-1' })
    });
    expect(blockedLogin.status).toBe(403);

    await api(`/platform/facilities/${charlie.id}`, { method: 'PATCH', token: platformToken, body: JSON.stringify({ status: 'ACTIVE' }) });
    expect((await api('/patients', { token: charlieToken })).status).toBe(200);
  });
});

describe('facility staff roles', () => {
  it('a facility admin cannot create a platform administrator', async () => {
    const adminToken = await token(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    const res = await api('/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Sneaky', username: 'sneaky', role: 'PLATFORM_ADMIN', password: 'password-123' })
    });
    expect(res.status).toBe(400);
  });
});

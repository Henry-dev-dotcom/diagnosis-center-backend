import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { apiRouter } from '../../src/routes/index.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

let server: Server;
let baseUrl: string;

type Session = { token: string };

async function api(path: string, init: RequestInit & { session?: Session } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.session) headers.set('authorization', `Bearer ${init.session.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

async function login(facilityCode: string | undefined, username: string, password: string) {
  return api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode, username, password }) });
}

async function sessionFor(facilityCode: string, username: keyof typeof DEMO_USERS): Promise<Session> {
  const res = await login(facilityCode, username, DEMO_USERS[username]);
  expect(res.status, `login ${facilityCode}/${username}: ${res.text}`).toBe(200);
  return { token: res.json.data.accessToken };
}

/** Every GET route without path parameters, read from the live router. */
function parameterlessGetRoutes(): string[] {
  const paths = new Set<string>();
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route?.methods?.get && typeof layer.route.path === 'string' && !layer.route.path.includes(':')) {
        paths.add(layer.route.path);
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((apiRouter as any).stack);
  return [...paths].sort();
}

// Every literal id in facility B's demo data starts with this prefix.
const B_MARKER = `"${FACILITY_B.idPrefix}`;

let bIds: { patient: string; order: string; invoice: string; user: string };

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  bIds = await runWithFacility(FACILITY_B.id, async () => ({
    patient: (await prisma.patient.findFirstOrThrow()).id,
    order: (await prisma.order.findFirstOrThrow()).id,
    invoice: (await prisma.invoice.findFirstOrThrow()).id,
    user: (await prisma.user.findFirstOrThrow()).id
  }));
  expect(bIds.patient.startsWith(FACILITY_B.idPrefix)).toBe(true);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('login is facility-aware', () => {
  it('the same username signs in to each facility separately', async () => {
    const a = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    const b = await login(FACILITY_B.code, 'admin', DEMO_USERS.admin);
    expect(a.json.data.user.facility.code).toBe(FACILITY_A.code);
    expect(b.json.data.user.facility.code).toBe(FACILITY_B.code);
    expect(a.json.data.user.id).not.toBe(b.json.data.user.id);
  });

  it('rejects an unknown facility code like a wrong password', async () => {
    const res = await login('NOPE', 'admin', DEMO_USERS.admin);
    expect(res.status).toBe(401);
    expect(res.json.errors?.[0]?.code ?? res.json.code).toBeDefined();
  });

  it('facility staff cannot sign in without a facility code', async () => {
    expect((await login(undefined, 'admin', DEMO_USERS.admin)).status).toBe(401);
  });

  it('the platform admin signs in without a facility code only', async () => {
    const res = await login(undefined, 'platform', 'platform123');
    expect(res.status).toBe(200);
    expect(res.json.data.user.role).toBe('PLATFORM_ADMIN');
    expect(res.json.data.user.facility).toBeNull();
    expect((await login(FACILITY_A.code, 'platform', 'platform123')).status).toBe(401);
  });
});

describe('no endpoint leaks another facility\'s data', () => {
  const routes = parameterlessGetRoutes();

  it('found the routes to sweep', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  for (const role of Object.keys(DEMO_USERS) as Array<keyof typeof DEMO_USERS>) {
    it(`${role} in ${FACILITY_A.code}: no GET response contains ${FACILITY_B.code} data or a server error`, async () => {
      const session = await sessionFor(FACILITY_A.code, role);
      const failures: string[] = [];
      let readable = 0;
      for (const path of routes) {
        const res = await api(path, { session });
        if (res.status >= 500) failures.push(`${path} -> ${res.status} ${res.text.slice(0, 160)}`);
        if (res.text.includes(B_MARKER)) failures.push(`${path} leaked ${FACILITY_B.code} data`);
        if (res.status === 200) readable += 1;
      }
      expect(failures).toEqual([]);
      expect(readable).toBeGreaterThan(5);
    });
  }

  it('the admin full export contains only the admin\'s facility', async () => {
    const res = await api('/admin/full-export', { session: await sessionFor(FACILITY_A.code, 'admin') });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(B_MARKER);
    expect(res.text).not.toContain(FACILITY_B.id);
  });
});

describe('another facility\'s records cannot be read or changed by id', () => {
  it('detail reads return 404', async () => {
    const session = await sessionFor(FACILITY_A.code, 'admin');
    for (const path of [`/patients/${bIds.patient}`, `/orders/${bIds.order}`, `/billing/invoices/${bIds.invoice}`]) {
      const res = await api(path, { session });
      expect(res.status, `${path}: ${res.text.slice(0, 160)}`).toBe(404);
    }
  });

  it('updates return 404 and leave the record unchanged', async () => {
    const session = await sessionFor(FACILITY_A.code, 'admin');
    const before = await runWithFacility(FACILITY_B.id, () => prisma.patient.findUniqueOrThrow({ where: { id: bIds.patient } }));
    const res = await api(`/patients/${bIds.patient}`, {
      method: 'PATCH',
      session,
      body: JSON.stringify({ firstName: 'Hijacked' })
    });
    expect([400, 404]).toContain(res.status);
    const after = await runWithFacility(FACILITY_B.id, () => prisma.patient.findUniqueOrThrow({ where: { id: bIds.patient } }));
    expect(after.firstName).toBe(before.firstName);
  });
});

describe('platform admin is kept out of facility data', () => {
  it('gets 403 from facility endpoints', async () => {
    const res = await login(undefined, 'platform', 'platform123');
    const session = { token: res.json.data.accessToken };
    for (const path of ['/patients', '/orders', '/admin/users', '/billing/invoices']) {
      const r = await api(path, { session });
      expect(r.status, `${path}: ${r.text.slice(0, 160)}`).toBe(403);
    }
  });
});

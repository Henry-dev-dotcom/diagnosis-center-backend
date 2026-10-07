import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { apiRouter } from '../../src/routes/index.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

/*
  Phase 7 security audit, run on every QA. It walks every route the API
  registers, so a new route that forgets its guard fails here:
  - without a session, only the routes listed below answer (all others 401);
  - staff get 403 from every platform, admin, setup and billing route;
  - the platform operator reads no facility data.
*/

// Routes that must work without signing in, and why.
const PUBLIC_ROUTES = new Set([
  'GET /health', 'GET /live', 'GET /ready', 'GET /database/status', 'GET /version', // uptime checks; no data
  'POST /auth/login', 'POST /auth/logout', // logout without a session only clears cookies
  // Confirming an address has to work from a phone that is not signed in. It is
  // protected by the token itself (single-use, hashed, 24 hours) and rate limited,
  // and is POST only so that a mail scanner fetching the link cannot spend it.
  'POST /auth/email/verify',
  'GET /public/plans', 'POST /public/quote', 'POST /public/signup', 'POST /public/demo-requests', // website
  'GET /billing/fake-checkout/:reference', 'GET /billing/fake-checkout/:reference/complete' // development gateway only (404 otherwise)
]);
// Signed-in routes the platform operator legitimately reads (its own session and route contracts).
const PLATFORM_READABLE = new Set(['/live', '/ready', '/database/status', '/version', '/health', '/auth/me', '/public/plans', '/access/me', '/access/route-contracts']);

type Route = { method: string; path: string };
let server: Server;
let base: string;
let routes: Route[];

function collectRoutes(): Route[] {
  const found: Route[] = [];
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) found.push({ method: method.toUpperCase(), path: layer.route.path });
      else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((apiRouter as any).stack);
  return found;
}

const call = (r: Route, token?: string) =>
  fetch(base + r.path.replace(/:[A-Za-z]+/g, 'x'), {
    method: r.method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: ['GET', 'HEAD'].includes(r.method) ? undefined : '{}'
  }).then((res) => res.status);

async function login(facilityCode: string | undefined, username: string, password: string) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facilityCode, username, password }) });
  return (await res.json()).data.accessToken as string;
}

beforeAll(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  routes = collectRoutes();
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('route security audit', () => {
  it('finds the whole API', () => {
    expect(routes.length).toBeGreaterThan(300);
  });

  it('answers only the public routes without a session', async () => {
    const open: string[] = [];
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      if (PUBLIC_ROUTES.has(key)) continue;
      const status = await call(r);
      if (status !== 401) open.push(`${status} ${key}`);
    }
    expect(open).toEqual([]);
  }, 120_000);

  it('keeps staff out of platform, admin, setup and billing routes', async () => {
    const lab = await login(FACILITY_A.code, 'lab', DEMO_USERS.lab);
    const leaks: string[] = [];
    for (const r of routes.filter((x) => /^\/(platform|admin|onboarding|subscription)(\/|$)/.test(x.path))) {
      const status = await call(r, lab);
      if (status !== 403) leaks.push(`${status} ${r.method} ${r.path}`);
    }
    expect(leaks).toEqual([]);
  }, 120_000);

  it('gives the platform operator no facility data', async () => {
    const platform = await login(undefined, 'platform', 'platform123');
    const leaks: string[] = [];
    for (const r of routes.filter((x) => x.method === 'GET' && !x.path.startsWith('/platform') && !PLATFORM_READABLE.has(x.path))) {
      const status = await call(r, platform);
      if (status < 400) leaks.push(`${status} GET ${r.path}`);
    }
    expect(leaks).toEqual([]);
  }, 120_000);
});

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

/*
  What a browser is allowed to keep.

  Nothing behind a sign-in. A browser's cache is keyed on the URL and not on who is
  signed in, so on a shared workstation a cached patient list can be handed to the
  next person to use it - and it also makes the app show stale data straight after
  a write, because the app re-reads the same URL it has just changed.

  The public catalogue is the same for everybody and is allowed a short life.
*/

let server: Server;
let baseUrl: string;
let token = '';

const get = (path: string, withToken = true) =>
  fetch(`${baseUrl}/api${path}`, { headers: withToken ? { authorization: `Bearer ${token}` } : {} });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode: FACILITY_A.code, username: 'reception', password: DEMO_USERS.reception })
  });
  token = (await res.json()).data.accessToken;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('responses behind a sign-in', () => {
  it.each([
    '/patients?limit=5',
    '/orders',
    '/billing/invoices',
    '/reception/daily-visits',
    '/auth/me',
    '/catalog',
    '/messages/channels'
  ])('are not cacheable: %s', async (path) => {
    const res = await get(path);
    // Whatever the answer - including a refusal, which reception gets for invoices -
    // it must not be kept. A cached "forbidden" would outlive a change of role.
    expect(res.status, path).toBeLessThan(500);
    expect(res.headers.get('cache-control'), `${path} may be kept by a browser`).toBe('no-store');
  });
});

describe('the public website', () => {
  it('may be cached briefly, because it is the same for everybody', async () => {
    const res = await get('/public/plans', false);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('public');
  });

  it('does not extend that to anything that only has "public" in its name', async () => {
    // A path merely containing the word must not inherit the public lifetime.
    const res = await get('/files/public-notes', true);
    expect(res.headers.get('cache-control') ?? 'no-store').not.toContain('public');
  });
});

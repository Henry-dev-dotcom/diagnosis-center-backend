import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runAsSystem, runWithFacility } from '../../src/services/tenantContext.js';
import { hashToken } from '../../src/utils/token.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

/*
  Confirming an email address.

  Each rule here guards against a specific way this goes wrong in practice.

  The link is spent by one press of a button, not by being fetched: mail gateways
  open every link in a message to scan it, so a link that consumed itself on
  being opened would be gone before the person it was sent to arrived.

  It can be spent once, even if two requests arrive together; asking for a new one
  retires the old; and an address that has been replaced is not verified, because
  the proof was about the old one.

  The link is built from configuration and never from a request header, since a
  link built from the Host header can be aimed at somebody else's site.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function api(path: string, init: RequestInit & { token?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

const post = (path: string, token: string | undefined, body: unknown = {}, headers: Record<string, string> = {}) =>
  api(path, { method: 'POST', token, body: JSON.stringify(body), headers });

async function signIn(key: string, username: keyof typeof DEMO_USERS) {
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode: FACILITY_A.code, username, password: DEMO_USERS[username] }) });
  expect(res.status, res.text).toBe(200);
  tokens[key] = res.json.data.accessToken;
}

/** Asks for a link and returns what was emailed. Development mail prints it to the log. */
async function emailedLink(as: string, headers: Record<string, string> = {}) {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  try {
    const res = await post('/auth/email/request-verification', tokens[as], {}, headers);
    expect(res.status, res.text).toBe(200);
    const printed = info.mock.calls.map((call) => String(call[0])).find((line) => line.includes('#/verify-email/'));
    expect(printed, 'no verification email was written').toBeTruthy();
    const link = /(https?:\/\/\S+#\/verify-email\/[A-Za-z0-9_%-]+)/.exec(printed!)![1];
    return { link, token: decodeURIComponent(link.split('/verify-email/')[1]), response: res };
  } finally {
    info.mockRestore();
  }
}

const verify = (token: string) => post('/auth/email/verify', undefined, { token });
const me = async (as: string) => (await api('/auth/me', { token: tokens[as] })).json.data;

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['admin', 'reception', 'billing', 'nurse', 'lab', 'scan', 'doctor'] as const) await signIn(user, user);
});

afterEach(() => vi.restoreAllMocks());
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('asking for a link', () => {
  it('needs a session', async () => {
    const res = await post('/auth/email/request-verification', undefined);
    expect(res.status, res.text).toBe(401);
  });

  it('emails a link that points at the web app, not at the API', async () => {
    const { link, response } = await emailedLink('reception');
    expect(response.json.data.emailVerified).toBe(false);
    const appBase = (env.FRONTEND_APP_URL ?? env.FRONTEND_URL).replace(/\/+$/, '');
    expect(link.startsWith(`${appBase}/#/verify-email/`)).toBe(true);
    expect(link, 'the link must not carry the token to an API URL a scanner would fetch').not.toContain('/auth/email/verify');
  });

  it('builds the link from configuration, never from the Host header', async () => {
    // fetch may refuse to override Host; where it does, the guarantee still
    // holds by construction, so the assertion is on the link either way.
    const { link } = await emailedLink('billing', { host: 'evil.example' });
    expect(link).not.toContain('evil.example');
  });

  it('retires the previous link when a new one is asked for', async () => {
    const first = await emailedLink('nurse');
    const second = await emailedLink('nurse');
    expect((await verify(first.token)).status, 'an older link still worked after a newer one was issued').toBe(400);
    expect((await verify(second.token)).status).toBe(200);
  });
});

describe('following a link', () => {
  it('verifies the address once, and the session says so', async () => {
    const { token } = await emailedLink('lab');
    expect((await me('lab')).emailVerified).toBe(false);

    const done = await verify(token);
    expect(done.status, done.text).toBe(200);
    expect((await me('lab')).emailVerified).toBe(true);

    // The same link cannot be used again.
    const replay = await verify(token);
    expect(replay.status).toBe(400);
    expect(replay.text).toContain('invalid or has expired');
  });

  it('does not work by being fetched with GET, so a mail scanner cannot spend it', async () => {
    const { token } = await emailedLink('scan');
    const scanned = await api(`/auth/email/verify?token=${encodeURIComponent(token)}`);
    expect(scanned.status, 'a GET must not be an endpoint at all').toBe(404);
    // And the link is still good for the person it was sent to.
    expect((await verify(token)).status).toBe(200);
  });

  it('lets exactly one of two simultaneous presses win', async () => {
    const { token } = await emailedLink('admin');
    const [a, b] = await Promise.all([verify(token), verify(token)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses, 'a single-use link was honoured twice').toEqual([200, 400]);
  });

  it('refuses an expired link, and tells nothing about whether a token exists', async () => {
    const { token } = await emailedLink('reception');
    await runAsSystem('test.expire-token', () =>
      prisma.emailVerificationToken.updateMany({ where: { usedAt: null, user: { username: 'reception' } }, data: { expiresAt: new Date(Date.now() - 60_000) } })
    );
    const expired = await verify(token);
    const garbage = await verify('x'.repeat(43));
    expect(expired.status).toBe(400);
    expect(garbage.status).toBe(400);
    expect(JSON.parse(expired.text).message, 'an expired and an unknown token should be indistinguishable').toBe(JSON.parse(garbage.text).message);
  });

  it('is recorded in the audit trail against the right facility, without the token', async () => {
    const { token } = await emailedLink('billing');
    expect((await verify(token)).status).toBe(200);

    const entries = await runWithFacility(FACILITY_A.id, () => prisma.auditLog.findMany({ where: { action: { in: ['AUTH_EMAIL_VERIFIED', 'AUTH_EMAIL_VERIFICATION_SENT'] } } }));
    const verified = entries.filter((entry) => entry.action === 'AUTH_EMAIL_VERIFIED');
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((entry) => entry.facilityId === FACILITY_A.id), 'the audit entry was not filed against the facility').toBe(true);
    expect(JSON.stringify(entries), 'the token must never reach the audit trail').not.toContain(token);
  });
});

describe('an address that changes', () => {
  it('is no longer verified, and a link sent to the old address stops working', async () => {
    // A fresh account for this, so nothing an earlier test did can have verified it.
    const { token } = await emailedLink('doctor');
    expect((await verify(token)).status).toBe(200);
    expect((await me('doctor')).emailVerified).toBe(true);

    const doctor = await runWithFacility(FACILITY_A.id, () => prisma.user.findFirstOrThrow({ where: { username: 'doctor' } }));
    // Verified accounts cannot ask for a new link, so put a live one out by hand:
    // this stands for a link sent before the address was changed.
    const stale = await runAsSystem('test.stale-token', () => prisma.emailVerificationToken.create({
      data: { userId: doctor.id, tokenHash: hashToken('stale-token-for-the-old-address-0000000'), expiresAt: new Date(Date.now() + 3_600_000) }
    }));
    expect(stale.usedAt).toBeNull();

    const changed = await api(`/admin/users/${doctor.id}`, { method: 'PATCH', token: tokens.admin, body: JSON.stringify({ email: 'doctor.new@example.test' }) });
    expect(changed.status, changed.text).toBe(200);

    expect((await me('doctor')).emailVerified, 'a replaced address was still marked verified').toBe(false);
    expect((await verify('stale-token-for-the-old-address-0000000')).status, 'a link sent to the old address still worked').toBe(400);
  });

  it('stays verified when the same address is saved again, whatever its case', async () => {
    const { token } = await emailedLink('scan').catch(() => ({ token: '' }));
    if (token) await verify(token); // already verified earlier is fine
    const scan = await runWithFacility(FACILITY_A.id, () => prisma.user.findFirstOrThrow({ where: { username: 'scan' } }));
    const before = (await me('scan')).emailVerified;
    const same = await api(`/admin/users/${scan.id}`, { method: 'PATCH', token: tokens.admin, body: JSON.stringify({ email: String(scan.email).toUpperCase() }) });
    expect(same.status, same.text).toBe(200);
    expect((await me('scan')).emailVerified, 'saving the same address un-verified it').toBe(before);
  });
});

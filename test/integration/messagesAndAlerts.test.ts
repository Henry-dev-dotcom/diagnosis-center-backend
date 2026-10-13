import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

/*
  Two things a busy day must not break.

  A thread with more messages than fit on the screen has to show the newest ones, because
  those are the ones somebody is waiting on. And every failed quality-control run has to
  raise its own alert: the second failure of the morning may be a different analyzer.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function call(method: string, path: string, as: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[as]}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['lab', 'billing', 'doctor'] as const) {
    const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facilityCode: FACILITY_A.code, username: user, password: DEMO_USERS[user] }) });
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    tokens[user] = json.data.accessToken;
  }
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('a thread longer than one screen', () => {
  it('shows the newest messages of a shared channel, oldest of them first', async () => {
    const tag = randomUUID().slice(0, 6);
    for (const n of [1, 2, 3]) {
      expect((await call('POST', '/messages', 'billing', { channel: 'ALL', body: `${tag} message ${n}` })).status).toBe(201);
      await pause(15);
    }
    const page = await call('GET', '/messages/ALL?limit=2', 'lab');
    expect(page.status, page.text).toBe(200);
    expect(page.json.data.messages.map((m: { body: string }) => m.body)).toEqual([`${tag} message 2`, `${tag} message 3`]);
  });

  it('shows the newest messages of a private department thread too', async () => {
    const tag = randomUUID().slice(0, 6);
    for (const n of [1, 2, 3]) {
      expect((await call('POST', '/messages', 'billing', { recipientDepartment: 'LABORATORY', body: `${tag} note ${n}` })).status).toBe(201);
      await pause(15);
    }
    const page = await call('GET', '/messages/departments/FINANCE?limit=2', 'lab');
    expect(page.status, page.text).toBe(200);
    expect(page.json.data.messages.map((m: { body: string }) => m.body)).toEqual([`${tag} note 2`, `${tag} note 3`]);
  });
});

describe('a failed quality-control run', () => {
  const alerts = (parameter: string) => runWithFacility(FACILITY_A.id, () => prisma.notification.findMany({ where: { title: `Analyzer QC failure: ${parameter}` }, select: { recipientUserId: true } }));

  it('alerts the laboratory every time, not once per six hours', async () => {
    const parameter = `Glucose ${randomUUID().slice(0, 6)}`;
    const first = await call('POST', '/lab/qc', 'lab', { parameterName: parameter, controlLevel: 'Level 1', value: 9.9, expectedMean: 5.5, result: 'FAIL' });
    expect(first.status, first.text).toBe(201);
    const afterOne = await alerts(parameter);
    expect(afterOne.length).toBeGreaterThan(0);

    const second = await call('POST', '/lab/qc', 'lab', { parameterName: parameter, controlLevel: 'Level 2', value: 14.1, expectedMean: 11, result: 'FAIL' });
    expect(second.status, second.text).toBe(201);
    expect((await alerts(parameter)).length, 'the second failure must alert as well').toBe(afterOne.length * 2);
  });

  it('does not alert for a run that passed', async () => {
    const parameter = `Sodium ${randomUUID().slice(0, 6)}`;
    expect((await call('POST', '/lab/qc', 'lab', { parameterName: parameter, value: 140, expectedMean: 140, result: 'PASS' })).status).toBe(201);
    expect(await alerts(parameter)).toHaveLength(0);
  });
});

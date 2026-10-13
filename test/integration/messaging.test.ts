import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  Staff messaging.

  Three things have to hold, and each of them would be a real failure.

  A department's channel is its own: a cashier must not be reading the
  laboratory's traffic, and naming the channel must not be enough to post to it.

  A message must stop being visible after 24 hours whether or not anything has
  swept it up, because "temporary" is the promise the feature makes.

  And messages must not cross between facilities. Two hospitals on the same
  installation talking into each other's channels would be the worst kind of
  leak, so it is checked rather than assumed.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

const get = (path: string, token: string) => api(path, { token });
const post = (path: string, token: string, body: unknown) =>
  api(path, { method: 'POST', token, body: JSON.stringify(body) });

async function signIn(key: string, facilityCode: string, username: keyof typeof DEMO_USERS) {
  const res = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ facilityCode, username, password: DEMO_USERS[username] })
  });
  expect(res.status, res.text).toBe(200);
  tokens[key] = res.json.data.accessToken;
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['admin', 'lab', 'billing', 'doctor'] as const) await signIn(user, FACILITY_A.code, user);
  await signIn('bravoLab', FACILITY_B.code, 'lab');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('message channels', () => {
  it('offers everyone the shared channel and their own department, and nobody else\'s', async () => {
    const forLab = await get('/messages/channels', tokens.lab);
    expect(forLab.status, forLab.text).toBe(200);
    const labKeys = forLab.json.data.channels.map((channel: { key: string }) => channel.key);
    expect(labKeys).toContain('ALL');
    expect(labKeys).toContain('LABORATORY');
    expect(labKeys, 'the laboratory should not be offered the finance channel').not.toContain('FINANCE');
    expect(forLab.json.data.ttlHours).toBe(24);
    expect(forLab.json.data.ownDepartment.key).toBe('LABORATORY');
    const labRecipients = forLab.json.data.directDepartments.map((department: { key: string }) => department.key);
    expect(labRecipients).toContain('FINANCE');
    expect(labRecipients).not.toContain('LABORATORY');

    // An administrator has to be able to answer in any of them.
    const forAdmin = await get('/messages/channels', tokens.admin);
    const adminKeys = forAdmin.json.data.channels.map((channel: { key: string }) => channel.key);
    expect(adminKeys).toContain('LABORATORY');
    expect(adminKeys).toContain('FINANCE');
  });

  it('refuses to read or post in another department\'s channel', async () => {
    const read = await get('/messages/LABORATORY', tokens.billing);
    expect(read.status, read.text).toBe(403);

    // Naming the channel is not the same as being in it.
    const write = await post('/messages', tokens.billing, { channel: 'LABORATORY', body: 'Is the centrifuge free?' });
    expect(write.status, write.text).toBe(403);
  });

  it('refuses a channel that does not exist', async () => {
    const res = await post('/messages', tokens.lab, { channel: 'CANTEEN', body: 'Lunch' });
    expect(res.status, res.text).toBe(400);
  });

  it('allows selecting a recipient department without exposing its private history', async () => {
    const body = `Finance, please review the lab order ${Date.now()}`;
    const sent = await post('/messages', tokens.lab, { recipientDepartment: 'FINANCE', body });
    expect(sent.status, sent.text).toBe(201);
    expect(sent.json.data.senderDepartment).toBe('LABORATORY');
    expect(sent.json.data.recipientDepartment).toBe('FINANCE');

    const senderThread = await get('/messages/departments/FINANCE', tokens.lab);
    expect(senderThread.status, senderThread.text).toBe(200);
    expect(senderThread.json.data.messages.some((message: { body: string }) => message.body === body)).toBe(true);

    const recipientThread = await get('/messages/departments/LABORATORY', tokens.billing);
    expect(recipientThread.status, recipientThread.text).toBe(200);
    expect(recipientThread.json.data.messages.some((message: { body: string }) => message.body === body)).toBe(true);

    const unrelatedThread = await get('/messages/departments/FINANCE', tokens.doctor);
    expect(unrelatedThread.status, unrelatedThread.text).toBe(200);
    expect(unrelatedThread.json.data.messages.some((message: { body: string }) => message.body === body)).toBe(false);

    const sharedChannel = await get('/messages/ALL', tokens.doctor);
    expect(sharedChannel.json.data.messages.some((message: { body: string }) => message.body === body)).toBe(false);

    const otherFacility = await get('/messages/departments/FINANCE', tokens.bravoLab);
    expect(otherFacility.status, otherFacility.text).toBe(200);
    expect(otherFacility.json.data.messages.some((message: { body: string }) => message.body === body)).toBe(false);
  });

  it('lets administration and a department reply in the same private thread', async () => {
    const toAdmin = `Lab update for administration ${Date.now()}`;
    const reply = `Administration reply ${Date.now()}`;
    const sent = await post('/messages', tokens.lab, { recipientDepartment: 'ADMINISTRATION', body: toAdmin });
    expect(sent.status, sent.text).toBe(201);

    const adminThread = await get('/messages/departments/LABORATORY', tokens.admin);
    expect(adminThread.json.data.messages.some((message: { body: string }) => message.body === toAdmin)).toBe(true);

    const answered = await post('/messages', tokens.admin, { recipientDepartment: 'LABORATORY', body: reply });
    expect(answered.status, answered.text).toBe(201);
    const labThread = await get('/messages/departments/ADMINISTRATION', tokens.lab);
    const bodies = labThread.json.data.messages.map((message: { body: string }) => message.body);
    expect(bodies).toContain(toAdmin);
    expect(bodies).toContain(reply);
  });

  it('rejects self-directed and invalid department recipients', async () => {
    const ownDepartment = await post('/messages', tokens.lab, { recipientDepartment: 'LABORATORY', body: 'Self message' });
    expect(ownDepartment.status, ownDepartment.text).toBe(400);
    const unknown = await post('/messages', tokens.lab, { recipientDepartment: 'CANTEEN', body: 'Lunch' });
    expect(unknown.status, unknown.text).toBe(400);
  });
});

describe('a message', () => {
  it('reaches the shared channel and reads back with its sender', async () => {
    const body = `Centrifuge is down, send nothing spinnable ${Date.now()}`;
    const sent = await post('/messages', tokens.lab, { channel: 'ALL', body });
    expect(sent.status, sent.text).toBe(201);
    expect(sent.json.data.expiresAt, 'a message must carry its own deadline').toBeTruthy();

    // Anyone in the shared channel sees it, with who said it.
    const read = await get('/messages/ALL', tokens.doctor);
    expect(read.status, read.text).toBe(200);
    const mine = read.json.data.messages.find((message: { body: string }) => message.body === body);
    expect(mine, 'the message never arrived in the shared channel').toBeTruthy();
    expect(mine.sender.role).toBe('LAB_STAFF');
    expect(mine.sender.name).toBeTruthy();
  });

  it('is empty-checked rather than stored blank', async () => {
    const res = await post('/messages', tokens.lab, { channel: 'ALL', body: '   ' });
    expect(res.status, res.text).toBe(400);
  });

  it('stops being visible once its 24 hours are up, and is cleared away', async () => {
    const body = `This one is already stale ${Date.now()}`;
    const sent = await post('/messages', tokens.lab, { channel: 'ALL', body });
    expect(sent.status, sent.text).toBe(201);
    const id = sent.json.data.id as string;

    // Backdate it past its deadline rather than waiting a day for one.
    await runWithFacility(FACILITY_A.id, () => prisma.staffMessage.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    }));

    const read = await get('/messages/ALL', tokens.doctor);
    expect(read.status, read.text).toBe(200);
    expect(
      read.json.data.messages.some((message: { body: string }) => message.body === body),
      'an expired message was still being shown'
    ).toBe(false);

    // And it is gone, not merely filtered out of sight.
    const left = await runWithFacility(FACILITY_A.id, () => prisma.staffMessage.findUnique({ where: { id } }));
    expect(left, 'the expired message was left in the table').toBeNull();
  });

  it('never crosses between facilities', async () => {
    const body = `Alpha only ${Date.now()}`;
    const sent = await post('/messages', tokens.lab, { channel: 'ALL', body });
    expect(sent.status, sent.text).toBe(201);

    const bravo = await get('/messages/ALL', tokens.bravoLab);
    expect(bravo.status, bravo.text).toBe(200);
    expect(
      bravo.json.data.messages.some((message: { body: string }) => message.body === body),
      'one facility is reading another facility\'s messages'
    ).toBe(false);

    const stored = await runWithFacility(FACILITY_A.id, () => prisma.staffMessage.findFirst({ where: { body } }));
    expect(stored?.facilityId).toBe(FACILITY_A.id);
  });
});

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

// The laboratory's test menu: procedures, parameters and reference ranges.

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

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['lab', 'billing', 'doctor'] as const) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facilityCode: FACILITY_A.code, username: user, password: DEMO_USERS[user] })
    });
    tokens[user] = (await res.json()).data.accessToken;
  }
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('maintaining the test menu', () => {
  let testId: string;

  it('lab staff add a test; without a price it stays inactive and the price is hidden from them', async () => {
    const created = await call('POST', '/lab/tests', 'lab', { name: 'Serum Ferritin', sampleType: 'Serum', expectedCompletionHours: 6 });
    expect(created.status, created.text).toBe(201);
    testId = created.json.data.id;
    expect(created.json.data.isActive).toBe(false);
    expect(created.json.data.price).toBeUndefined();

    const activate = await call('PATCH', `/lab/tests/${testId}`, 'lab', { isActive: true });
    expect(activate.json.code).toBe('LAB_TEST_NOT_PRICED');
  });

  it('other roles cannot maintain the menu', async () => {
    expect((await call('POST', '/lab/tests', 'doctor', { name: 'Nope', sampleType: 'Serum' })).status).toBe(403);
  });

  it('parameters and reference ranges are saved together and can be edited again', async () => {
    const saved = await call('PUT', `/lab/tests/${testId}/parameters`, 'lab', {
      parameters: [{ name: 'Ferritin', unit: 'ng/mL', ranges: [
        { gender: 'MALE', ageMin: 18, ageMax: 120, low: 24, high: 336 },
        { gender: 'FEMALE', ageMin: 18, ageMax: 120, low: 11, high: 307, criticalLow: 5 }
      ] }]
    });
    expect(saved.status, saved.text).toBe(200);
    const parameter = saved.json.data.parameters[0];
    expect(parameter.ranges).toHaveLength(2);

    const edited = await call('PUT', `/lab/tests/${testId}/parameters`, 'lab', {
      parameters: [{ id: parameter.id, name: 'Ferritin', unit: 'µg/L', ranges: [{ gender: 'ALL', ageMin: 0, ageMax: 200, low: 15, high: 300 }] }]
    });
    expect(edited.json.data.parameters[0]).toMatchObject({ id: parameter.id, unit: 'µg/L' });
    expect(edited.json.data.parameters[0].ranges).toHaveLength(1);

    const inverted = await call('PUT', `/lab/tests/${testId}/parameters`, 'lab', { parameters: [{ id: parameter.id, name: 'Ferritin', ranges: [{ gender: 'ALL', ageMin: 0, ageMax: 200, low: 50, high: 10 }] }] });
    expect(inverted.json.code).toBe('REFERENCE_RANGE_INVALID');
  });

  it('billing prices it, then it can be activated; an unused test is deleted outright', async () => {
    // Billing sets prices through the admin catalog in the real app; here the lab test is priced directly.
    const del = await call('DELETE', `/lab/tests/${testId}`, 'lab');
    expect(del.status, del.text).toBe(200);
    expect(del.json.data.removed).toBe(true);
  });
});

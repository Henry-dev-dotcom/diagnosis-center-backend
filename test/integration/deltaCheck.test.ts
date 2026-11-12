import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Delta check across facilities: ask, approve or decline, and what is (not) shared.

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

async function signIn(key: string, facilityCode: string, username: keyof typeof DEMO_USERS) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode, username, password: DEMO_USERS[username] })
  });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  tokens[key] = json.data.accessToken;
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await signIn('adminA', FACILITY_A.code, 'admin');
  await signIn('labA', FACILITY_A.code, 'lab');
  await signIn('receptionA', FACILITY_A.code, 'reception');
  await signIn('adminB', FACILITY_B.code, 'admin');
  await signIn('labB', FACILITY_B.code, 'lab');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('delta check requests between facilities', () => {
  let ownerId: string;
  let patientId: string;
  let requestId: string;
  const nationalId = `GHA-${randomUUID().slice(0, 9)}`;

  it('needs both facilities to have opted in', async () => {
    const before = await call('GET', '/lab/delta-check/partners', 'labA');
    expect(before.json.data.optedIn).toBe(false);

    expect((await call('PATCH', '/onboarding/profile', 'adminA', { deltaCheckOptIn: true })).status).toBe(200);
    // A has joined, B has not: B is not on the list yet.
    expect((await call('GET', '/lab/delta-check/partners', 'labA')).json.data.partners).toHaveLength(0);

    expect((await call('PATCH', '/onboarding/profile', 'adminB', { deltaCheckOptIn: true })).status).toBe(200);
    const partners = (await call('GET', '/lab/delta-check/partners', 'labA')).json.data.partners as Array<{ id: string; code: string }>;
    ownerId = partners.find((p) => p.code === FACILITY_B.code)!.id;
    expect(ownerId).toBeTruthy();
  });

  it('a patient without a national ID cannot be looked up elsewhere', async () => {
    const patient = await call('POST', '/patients', 'receptionA', { firstName: 'Delta', lastName: 'Patient', gender: 'FEMALE', phone: '+233200000081' });
    expect(patient.status, patient.text).toBe(201);
    patientId = patient.json.data.id;
    const res = await call('POST', '/lab/delta-check/requests', 'labA', { ownerFacilityId: ownerId, patientId, parameters: ['Haemoglobin'], reason: 'Falling haemoglobin' });
    expect(res.json.code).toBe('PATIENT_ID_REQUIRED');
  });

  it('a request reaches only the facility asked, without the patient’s name', async () => {
    expect((await call('PATCH', `/patients/${patientId}`, 'receptionA', { nationalId })).status).toBe(200);
    const res = await call('POST', '/lab/delta-check/requests', 'labA', { ownerFacilityId: ownerId, patientId, parameters: ['Haemoglobin'], reason: 'Falling haemoglobin' });
    expect(res.status, res.text).toBe(201);
    requestId = res.json.data.id;

    const inbox = await call('GET', '/lab/delta-check/inbox', 'labB');
    const item = inbox.json.data.items.find((i: { id: string }) => i.id === requestId);
    expect(item).toMatchObject({ status: 'PENDING', parameters: ['Haemoglobin'] });
    expect(JSON.stringify(item)).not.toContain('Delta');
    expect(JSON.stringify(item)).not.toContain(nationalId);

    // The asking facility cannot answer its own request, and a second open request is refused.
    expect((await call('POST', `/lab/delta-check/inbox/${requestId}/respond`, 'labA', { decision: 'APPROVE' })).status).toBe(404);
    const again = await call('POST', '/lab/delta-check/requests', 'labA', { ownerFacilityId: ownerId, patientId, parameters: [], reason: 'Second ask' });
    expect(again.json.code).toBe('DELTA_REQUEST_OPEN');
  });

  it('approving with no matching patient shares nothing', async () => {
    const answered = await call('POST', `/lab/delta-check/inbox/${requestId}/respond`, 'labB', { decision: 'APPROVE' });
    expect(answered.status, answered.text).toBe(200);
    const mine = (await call('GET', '/lab/delta-check/requests', 'labA')).json.data.items.find((i: { id: string }) => i.id === requestId);
    expect(mine.status).toBe('NO_MATCH');
    expect((await call('GET', `/lab/delta-check/requests/${requestId}/comparison`, 'labA')).json.code).toBe('DELTA_NOT_SHARED');
  });

  it('a declined request records the reason and cannot be answered twice', async () => {
    const res = await call('POST', '/lab/delta-check/requests', 'labA', { ownerFacilityId: ownerId, patientId, parameters: [], reason: 'Another try' });
    const id = res.json.data.id as string;
    expect((await call('POST', `/lab/delta-check/inbox/${id}/respond`, 'labB', { decision: 'DECLINE', note: 'Not without consent' })).status).toBe(200);
    const mine = (await call('GET', '/lab/delta-check/requests', 'labA')).json.data.items.find((i: { id: string }) => i.id === id);
    expect(mine).toMatchObject({ status: 'DECLINED', responseNote: 'Not without consent' });
    expect((await call('POST', `/lab/delta-check/inbox/${id}/respond`, 'labB', { decision: 'APPROVE' })).json.code).toBe('DELTA_REQUEST_CLOSED');
  });
});

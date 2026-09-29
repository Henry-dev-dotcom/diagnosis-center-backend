import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 5: staff profiles, the duty rota and leave.

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
const get = (path: string, as: string) => call('GET', path, as);
const post = (path: string, as: string, body: unknown = {}) => call('POST', path, as, body);
const del = (path: string, as: string) => call('DELETE', path, as);

async function signInAs(key: string, facilityCode: string | undefined, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode, username, password })
  });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  tokens[key] = json.data.accessToken;
}

// A Monday at least two weeks ahead, so every date in the test is in the future.
const monday = (() => {
  const d = new Date(Date.now() + 14 * 86_400_000);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
})();
const day = (offset: number) => new Date(monday.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const NURSE = 'USR-008';
const assign = (date: string, shiftTypeId: string, userId = NURSE) => post('/hr/rota', 'admin', { userId, date, shiftTypeId, unit: 'Female Medical Ward' });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['admin', 'nurse', 'doctor'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoNurse', FACILITY_B.code, 'nurse', DEMO_USERS.nurse);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('staff', () => {
  it('staff see their own profile and leave balance', async () => {
    const me = await get('/hr/me', 'nurse');
    expect(me.status, me.text).toBe(200);
    expect(me.json.data.profile).toMatchObject({ staffNumber: 'ST-0002', jobTitle: 'Senior Staff Nurse' });
    expect(me.json.data.balance).toMatchObject({ entitlement: 21, remaining: 21 });
  });

  it('HR sees registrations about to expire; others cannot see the staff list', async () => {
    const staff = await get('/hr/staff', 'admin');
    expect(staff.json.data.items.find((u: { id: string }) => u.id === NURSE).registration).toBe('EXPIRING');
    expect((await get('/hr/staff', 'nurse')).status).toBe(403);
  });

  it('profiles are saved, and staff numbers are unique', async () => {
    const saved = await call('PUT', '/hr/staff/USR-003', 'admin', { staffNumber: 'ST-0003', jobTitle: 'Biomedical Scientist', unit: 'Laboratory' });
    expect(saved.status, saved.text).toBe(200);
    expect((await call('PUT', '/hr/staff/USR-004', 'admin', { staffNumber: 'ST-0003', jobTitle: 'Radiographer' })).json.code).toBe('STAFF_NUMBER_TAKEN');
  });
});

describe('the duty rota', () => {
  it('HR puts staff on shifts; nobody is on the same shift twice', async () => {
    const res = await assign(day(0), 'SHIFT-MORN');
    expect(res.status, res.text).toBe(201);
    expect(res.json.data).toMatchObject({ unit: 'Female Medical Ward', shiftType: { code: 'M' } });
    expect((await assign(day(0), 'SHIFT-MORN')).json.code).toBe('ALREADY_ON_SHIFT');
    expect((await post('/hr/rota', 'nurse', { userId: NURSE, date: day(1), shiftTypeId: 'SHIFT-MORN', unit: 'Ward' })).status).toBe(403);
  });

  it('refuses a morning straight after a night, and too little rest between shifts', async () => {
    expect((await assign(day(2), 'SHIFT-NIGHT')).status).toBe(201);
    const next = await assign(day(3), 'SHIFT-MORN');
    expect(next.json.code).toBe('INSUFFICIENT_REST');
    expect(next.json.message).toMatch(/Efua Asante: Only 0 hours/);
    expect((await assign(day(0), 'SHIFT-AFT')).json.code).toBe('INSUFFICIENT_REST');
  });

  it('everyone can read the rota, with who is on leave', async () => {
    const rota = await get(`/hr/rota?from=${day(0)}&to=${day(6)}`, 'doctor');
    expect(rota.status, rota.text).toBe(200);
    expect(rota.json.data.entries.map((e: { shiftType: { code: string } }) => e.shiftType.code)).toEqual(['M', 'N']);
    expect((await get(`/hr/rota?from=${day(0)}&to=${day(90)}`, 'doctor')).json.code).toBe('RANGE_TOO_LONG');
  });
});

describe('leave', () => {
  let leaveId: string;

  it('annual leave counts working days and cannot overlap or exceed the entitlement', async () => {
    const res = await post('/hr/leave', 'nurse', { type: 'ANNUAL', startDate: day(7), endDate: day(13), reason: 'Family visit' });
    expect(res.status, res.text).toBe(201);
    leaveId = res.json.data.id;
    expect(res.json.data).toMatchObject({ status: 'PENDING', days: 5 });
    expect((await post('/hr/leave', 'nurse', { type: 'STUDY', startDate: day(11), endDate: day(14) })).json.code).toBe('LEAVE_OVERLAP');
    const tooMuch = await post('/hr/leave', 'nurse', { type: 'ANNUAL', startDate: day(21), endDate: day(46) });
    expect(tooMuch.json.code).toBe('NOT_ENOUGH_LEAVE');
    expect(tooMuch.json.message).toMatch(/16 of 21/);
  });

  it('leave is not approved while the person is still on the rota', async () => {
    expect((await post(`/hr/leave/${leaveId}/decision`, 'nurse', { decision: 'APPROVE' })).status).toBe(403);
    const entry = await assign(day(8), 'SHIFT-MORN');
    const blocked = await post(`/hr/leave/${leaveId}/decision`, 'admin', { decision: 'APPROVE' });
    expect(blocked.json.code).toBe('ROTA_CONFLICT');
    expect(blocked.json.message).toContain(day(8));
    await del(`/hr/rota/${entry.json.data.id}`, 'admin');
    const approved = await post(`/hr/leave/${leaveId}/decision`, 'admin', { decision: 'APPROVE', note: 'Cover arranged' });
    expect(approved.json.data).toMatchObject({ status: 'APPROVED', decisionNote: 'Cover arranged' });
  });

  it('nobody can be rostered while on approved leave', async () => {
    const res = await assign(day(9), 'SHIFT-AFT');
    expect(res.json.code).toBe('ON_LEAVE');
  });

  it('nobody approves their own leave, and a refusal needs a reason', async () => {
    const own = await post('/hr/leave', 'admin', { type: 'ANNUAL', startDate: day(28), endDate: day(29) });
    expect((await post(`/hr/leave/${own.json.data.id}/decision`, 'admin', { decision: 'APPROVE' })).json.code).toBe('LEAVE_SELF_APPROVAL');
    const other = await post('/hr/leave', 'doctor', { type: 'STUDY', startDate: day(35), endDate: day(36) });
    expect((await post(`/hr/leave/${other.json.data.id}/decision`, 'admin', { decision: 'REJECT' })).json.code).toBe('NOTE_REQUIRED');
    expect((await post(`/hr/leave/${other.json.data.id}/decision`, 'admin', { decision: 'REJECT', note: 'Clinic fully booked that week' })).json.data.status).toBe('REJECTED');
  });

  it('approved leave that has not started can be withdrawn by its owner', async () => {
    expect((await post(`/hr/leave/${leaveId}/cancel`, 'doctor')).status).toBe(404);
    const res = await post(`/hr/leave/${leaveId}/cancel`, 'nurse');
    expect(res.json.data.status).toBe('CANCELLED');
    expect((await get('/hr/me', 'nurse')).json.data.balance.remaining).toBe(21);
  });
});

describe('HR module', () => {
  it('another facility sees none of it, and the module can be off', async () => {
    const rota = await get(`/hr/rota?from=${day(0)}&to=${day(6)}`, 'bravoNurse');
    expect(rota.json.data.entries).toHaveLength(0);
    const code = `H${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without HR', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/hr/me', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

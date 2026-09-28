import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4C step 3: child welfare clinic, growth monitoring and immunizations.

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

const inA = <T>(fn: () => Promise<T>) => runWithFacility(FACILITY_A.id, fn);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const iso = (d: Date) => d.toISOString();

async function child(label: string, ageDays: number | null) {
  return inA(async () =>
    (await prisma.patient.create({
      data: { patientCode: `PAT-CH-${label}-${randomUUID().slice(0, 4)}`, firstName: label, lastName: 'Owusu', gender: 'Female', phone: '+233200000061', dateOfBirth: ageDays === null ? null : daysAgo(ageDays) }
    })).id
  );
}

const give = (patientId: string, vaccine: string, extra: Record<string, unknown> = {}) =>
  post(`/child-health/patients/${patientId}/immunizations`, 'nurse', { vaccine, givenAt: iso(new Date()), batchNumber: 'B123', expiryDate: iso(daysAgo(-200)), ...extra });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoNurse', FACILITY_B.code, 'nurse', DEMO_USERS.nurse);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('immunizations', () => {
  it('a child needs a date of birth before immunizations', async () => {
    const res = await get(`/child-health/patients/${await child('NoDob', null)}/immunizations`, 'nurse');
    expect(res.json.code).toBe('DATE_OF_BIRTH_REQUIRED');
  });

  it('a 7-week-old: birth doses and 6-week doses due; recording one moves it to given', async () => {
    const pid = await child('Seven', 49);
    const before = await get(`/child-health/patients/${pid}/immunizations`, 'nurse');
    const s = (rows: Array<{ code: string; status: string }>, code: string) => rows.find((r) => r.code === code)?.status;
    expect(s(before.json.data.schedule, 'PENTA1')).toBe('DUE');
    expect(s(before.json.data.schedule, 'OPV0')).toBe('MISSED_WINDOW');
    expect(s(before.json.data.schedule, 'BCG')).toBe('OVERDUE');

    const res = await give(pid, 'PENTA1');
    expect(res.status, res.text).toBe(201);
    expect(s(res.json.data.schedule, 'PENTA1')).toBe('GIVEN');
    expect(s(res.json.data.schedule, 'PENTA2')).toBe('UPCOMING');
    expect(res.json.data.records[0]).toMatchObject({ vaccine: 'PENTA1', batchNumber: 'B123', site: 'IM, left thigh' });
    expect((await give(pid, 'PENTA1')).json.code).toBe('DOSE_ALREADY_GIVEN');
  });

  it('refuses expired vaccine, missing batch numbers, doses out of order and unknown vaccines', async () => {
    const pid = await child('Rules', 49);
    expect((await give(pid, 'PCV1', { expiryDate: iso(daysAgo(3)) })).json.code).toBe('VACCINE_EXPIRED');
    expect((await give(pid, 'PCV1', { batchNumber: undefined })).json.code).toBe('BATCH_REQUIRED');
    const outOfOrder = await give(pid, 'PCV2');
    expect(outOfOrder.json.code).toBe('DOSE_NOT_VALID');
    expect(outOfOrder.json.message).toMatch(/Pneumococcal 1 has to be recorded first/);
    expect((await give(pid, 'COVID')).json.code).toBe('UNKNOWN_VACCINE');
  });

  it('card entries from another facility need no batch and skip the interval rules', async () => {
    const pid = await child('Card', 120);
    const bcg = await give(pid, 'BCG', { givenElsewhere: true, batchNumber: undefined, expiryDate: undefined, givenAt: iso(daysAgo(118)) });
    expect(bcg.status, bcg.text).toBe(201);
    expect(bcg.json.data.records[0]).toMatchObject({ givenElsewhere: true, givenById: null });
  });

  it('a record entered in error is voided (later doses first) and can then be recorded again', async () => {
    const pid = await child('Void', 120);
    await give(pid, 'OPV1', { givenAt: iso(daysAgo(70)) });
    const opv2 = await give(pid, 'OPV2', { givenAt: iso(daysAgo(20)) });
    expect(opv2.status, opv2.text).toBe(201);
    const opv1Id = opv2.json.data.records.find((r: { vaccine: string }) => r.vaccine === 'OPV1').id;
    const opv2Id = opv2.json.data.records.find((r: { vaccine: string }) => r.vaccine === 'OPV2').id;

    expect((await post(`/child-health/immunizations/${opv1Id}/void`, 'nurse', { reason: 'Wrong child' })).json.code).toBe('LATER_DOSE_RECORDED');
    const voided = await post(`/child-health/immunizations/${opv2Id}/void`, 'nurse', { reason: 'Entered on the wrong day' });
    expect(voided.status, voided.text).toBe(200);
    expect(voided.json.data.schedule.find((r: { code: string }) => r.code === 'OPV2').status).not.toBe('GIVEN');
    expect((await give(pid, 'OPV2', { givenAt: iso(daysAgo(19)) })).status).toBe(201);
  });

  it('the database allows one live record per dose', async () => {
    const pid = await child('Db', 60);
    await give(pid, 'ROTA1');
    await expect(inA(() => prisma.immunization.create({ data: { patientId: pid, vaccine: 'ROTA1', givenAt: new Date() } }))).rejects.toThrow(/Unique constraint/);
  });

  it('the due list shows children with overdue doses, and another facility sees none of them', async () => {
    const pid = await child('Late', 200);
    await give(pid, 'BCG', { givenElsewhere: true, batchNumber: undefined, expiryDate: undefined, givenAt: iso(daysAgo(199)) });
    const list = await get('/child-health/due-list?include=OVERDUE', 'nurse');
    expect(list.status, list.text).toBe(200);
    const row = list.json.data.items.find((r: { patient: { id: string } }) => r.patient.id === pid);
    expect(row.pending.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['PENTA1', 'OPV1', 'PCV1']));
    expect(row.pending.every((p: { status: string }) => p.status === 'OVERDUE')).toBe(true);
    expect((await get(`/child-health/patients/${pid}/immunizations`, 'bravoNurse')).status).toBe(404);
  });
});

describe('growth monitoring', () => {
  it('records growth on a child welfare visit with the MUAC category and weight change', async () => {
    const pid = await child('Grow', 300);
    const visit = await post('/encounters', 'reception', { patientId: pid, type: 'OPD', clinic: 'CHILD_WELFARE' });
    expect(visit.status, visit.text).toBe(201);
    const first = await post(`/encounters/${visit.json.data.id}/forms`, 'nurse', { type: 'GROWTH', data: { weightKg: 8.4, lengthCm: 71, muacCm: 12.1, vitaminAGiven: true } });
    expect(first.status, first.text).toBe(201);
    expect(first.json.data.forms[0].data.derived).toMatchObject({ ageMonths: 9, muacCategory: 'Moderate acute malnutrition' });

    // An older record makes the next one a month later.
    await inA(() => prisma.clinicalForm.updateMany({ where: { patientId: pid }, data: { createdAt: daysAgo(35) } }));
    const second = await post(`/encounters/${visit.json.data.id}/forms`, 'nurse', { type: 'GROWTH', data: { weightKg: 8.3 } });
    expect(second.json.data.forms.at(-1).data.derived).toMatchObject({ weightChange: { grams: -100, days: 35 }, alerts: ['Growth faltering: no weight gain since the last visit'] });
  });
});

describe('child health module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `C${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Child Health', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/child-health/due-list', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4B: wards, admissions, transfers, the medication chart and discharge.

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
const patch = (path: string, as: string, body: unknown) => call('PATCH', path, as, body);

async function signIn(key: string, facilityCode: string | undefined, username: string, password: string) {
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
const bedStatus = (id: string) => inA(async () => (await prisma.bed.findUniqueOrThrow({ where: { id } })).status);

async function newPatient(label: string, gender = 'MALE') {
  return inA(async () =>
    (await prisma.patient.create({ data: { patientCode: `PAT-IP-${label}-${randomUUID().slice(0, 4)}`, firstName: 'Ward', lastName: label, gender, phone: '+233200000021' } })).id
  );
}

/** A patient seen in OPD by the doctor, ready for a decision to admit. */
async function opdVisit(label: string, gender = 'MALE') {
  const patientId = await newPatient(label, gender);
  const visit = await post('/encounters', 'reception', { patientId, type: 'OPD' });
  expect(visit.status, visit.text).toBe(201);
  await post(`/encounters/${visit.json.data.id}/start-consultation`, 'doctor');
  return { patientId, encounterId: visit.json.data.id as string };
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse'] as const) await signIn(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signIn('bravoNurse', FACILITY_B.code, 'nurse', DEMO_USERS.nurse);
  await signIn('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('admission from an outpatient visit', () => {
  let admissionId: string;
  let inpatientEncounterId: string;
  let patientId: string;
  let sourceId: string;

  it('requires a diagnosis and respects ward sex', async () => {
    ({ patientId, encounterId: sourceId } = await opdVisit('Admit'));
    const noDx = await post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-MMW', bedId: 'BED-MMW-M1', reason: 'Severe pneumonia', sourceEncounterId: sourceId });
    expect(noDx.status).toBe(409);
    expect(noDx.json.code).toBe('DIAGNOSIS_REQUIRED');

    await post(`/encounters/${sourceId}/diagnoses`, 'doctor', { code: 'J18.9', description: 'Pneumonia, unspecified' });
    const wrongWard = await post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-FMW', bedId: 'BED-FMW-F1', reason: 'Severe pneumonia', sourceEncounterId: sourceId });
    expect(wrongWard.status).toBe(409);
    expect(wrongWard.json.code).toBe('WARD_GENDER_MISMATCH');
  });

  it('admits to a bed, closes the OPD visit as ADMITTED and carries the diagnosis over', async () => {
    const res = await post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-MMW', bedId: 'BED-MMW-M1', reason: 'Severe pneumonia, needs IV antibiotics', sourceEncounterId: sourceId });
    expect(res.status, res.text).toBe(201);
    admissionId = res.json.data.id;
    inpatientEncounterId = res.json.data.encounter.id;
    expect(res.json.data.admissionCode).toMatch(/^ADM-\d{4}-\d{4}$/);
    expect(res.json.data.bed.label).toBe('M1');
    expect(res.json.data.encounter.diagnoses.map((d: { code: string }) => d.code)).toContain('J18.9');
    expect(await bedStatus('BED-MMW-M1')).toBe('OCCUPIED');
    const source = await get(`/encounters/${sourceId}`, 'doctor');
    expect(source.json.data).toMatchObject({ status: 'COMPLETED', outcome: 'ADMITTED' });
  });

  it('refuses a second admission for the same patient and a second patient in the same bed', async () => {
    const again = await post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-MMW', bedId: 'BED-MMW-M4', reason: 'Duplicate' });
    expect(again.json.code).toBe('PATIENT_ALREADY_ADMITTED');
    const other = await newPatient('Other');
    const taken = await post('/inpatient/admissions', 'doctor', { patientId: other, wardId: 'WRD-MMW', bedId: 'BED-MMW-M1', reason: 'Needs a bed' });
    expect(taken.status).toBe(409);
    expect(taken.json.code).toBe('BED_NOT_AVAILABLE');
  });

  it('inpatient stays cannot be opened or closed through the visit endpoints', async () => {
    expect((await post('/encounters', 'reception', { patientId, type: 'INPATIENT' })).json.code).toBe('USE_ADMISSION');
    expect((await post(`/encounters/${inpatientEncounterId}/complete`, 'doctor', {})).json.code).toBe('USE_DISCHARGE');
  });

  it('nurses write nursing notes on the stay, and doctors progress notes', async () => {
    const nursing = await post(`/encounters/${inpatientEncounterId}/notes`, 'nurse', { subjective: 'Comfortable overnight, afebrile.' });
    expect(nursing.status, nursing.text).toBe(201);
    expect(nursing.json.data.notes.at(-1).type).toBe('NURSING');
    const progress = await post(`/encounters/${inpatientEncounterId}/notes`, 'doctor', { assessment: 'Improving.' });
    expect(progress.json.data.notes.at(-1).type).toBe('PROGRESS');
  });

  it('records doses on the medication chart', async () => {
    const rx = await post(`/encounters/${inpatientEncounterId}/prescriptions`, 'doctor', {
      items: [{ drugName: 'Ceftriaxone', strength: '1 g', dose: '1 g', route: 'IV', frequency: 'Once daily', durationDays: 5 }]
    });
    expect(rx.status, rx.text).toBe(201);
    const itemId = rx.json.data.prescriptions[0].items[0].id;

    const given = await post(`/inpatient/admissions/${admissionId}/medications/${itemId}`, 'nurse', { status: 'GIVEN' });
    expect(given.status, given.text).toBe(201);
    expect(given.json.data.administrations[0]).toMatchObject({ status: 'GIVEN', doseGiven: '1 g' });

    const held = await post(`/inpatient/admissions/${admissionId}/medications/${itemId}`, 'nurse', { status: 'HELD' });
    expect(held.json.code).toBe('REASON_REQUIRED');

    const { encounterId: elsewhere } = await opdVisit('Elsewhere');
    const otherRx = await post(`/encounters/${elsewhere}/prescriptions`, 'doctor', { items: [{ drugName: 'Paracetamol', dose: '1 g', route: 'Oral', frequency: 'QDS' }] });
    const wrong = await post(`/inpatient/admissions/${admissionId}/medications/${otherRx.json.data.prescriptions[0].items[0].id}`, 'nurse', { status: 'GIVEN' });
    expect(wrong.json.code).toBe('ITEM_NOT_ON_ADMISSION');
  });

  it('an occupied bed cannot be marked free by hand', async () => {
    const res = await patch('/inpatient/beds/BED-MMW-M1', 'nurse', { status: 'AVAILABLE' });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('BED_OCCUPIED');
  });

  it('transfers keep the bed history and send the old bed for cleaning', async () => {
    const res = await post(`/inpatient/admissions/${admissionId}/transfer`, 'nurse', { wardId: 'WRD-MMW', bedId: 'BED-MMW-M3', reason: 'Closer to nursing station' });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.bed.label).toBe('M3');
    expect(res.json.data.bedAssignments).toHaveLength(2);
    expect(res.json.data.bedAssignments[0].endedAt).not.toBeNull();
    expect(await bedStatus('BED-MMW-M1')).toBe('CLEANING');
    expect(await bedStatus('BED-MMW-M3')).toBe('OCCUPIED');
  });

  it('another facility cannot see the admission', async () => {
    expect((await get(`/inpatient/admissions/${admissionId}`, 'bravoNurse')).status).toBe(404);
  });

  it('discharge closes the stay, frees the bed for cleaning and bills the ward nights', async () => {
    const res = await post(`/inpatient/admissions/${admissionId}/discharge`, 'doctor', { outcome: 'DISCHARGED_HOME', summary: 'Pneumonia treated with IV ceftriaxone; oral step-down at home.' });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.status).toBe('DISCHARGED');
    expect(res.json.data.encounter.status).toBe('COMPLETED');
    expect(await bedStatus('BED-MMW-M3')).toBe('CLEANING');
    const invoice = await inA(() => prisma.invoice.findFirst({ where: { encounterId: inpatientEncounterId }, include: { items: true } }));
    expect(invoice?.items[0].description).toMatch(/Male Medical Ward: 1 night/);
    expect(Number(invoice?.total)).toBe(60);
    expect((await post(`/inpatient/admissions/${admissionId}/medications/x`, 'nurse', { status: 'GIVEN' })).json.code).toBe('ADMISSION_CLOSED');
  });

  it('a cleaned bed goes back into service', async () => {
    const res = await patch('/inpatient/beds/BED-MMW-M1', 'nurse', { status: 'AVAILABLE' });
    expect(res.status, res.text).toBe(200);
    expect(await bedStatus('BED-MMW-M1')).toBe('AVAILABLE');
  });
});

describe('bed safety', () => {
  it('two admissions racing for one bed: exactly one succeeds', async () => {
    const [a, b] = [await newPatient('RaceA'), await newPatient('RaceB')];
    const results = await Promise.all(
      [a, b].map((patientId) => post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-MMW', bedId: 'BED-MMW-M5', reason: 'Race' }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const active = await inA(() => prisma.admission.count({ where: { bedId: 'BED-MMW-M5', status: 'ADMITTED' } }));
    expect(active).toBe(1);
  });

  it('the database itself allows only one active admission per bed', async () => {
    const existing = await inA(() => prisma.admission.findFirstOrThrow({ where: { bedId: 'BED-MMW-M5', status: 'ADMITTED' } }));
    const other = await newPatient('Sneak');
    await expect(
      inA(async () => {
        const enc = await prisma.encounter.create({ data: { encounterCode: `ENC-X-${randomUUID().slice(0, 6)}`, patientId: other, type: 'INPATIENT', status: 'IN_CONSULTATION' } });
        return prisma.admission.create({ data: { admissionCode: `ADM-X-${randomUUID().slice(0, 6)}`, patientId: other, encounterId: enc.id, wardId: existing.wardId, bedId: existing.bedId, reason: 'bypass' } });
      })
    ).rejects.toThrow(/Unique constraint/);
  });

  it('an admission made in error can be cancelled until care is recorded', async () => {
    const pid = await newPatient('Mistake');
    const res = await post('/inpatient/admissions', 'doctor', { patientId: pid, wardId: 'WRD-MMW', bedId: 'BED-MMW-M6', reason: 'Wrong patient chosen' });
    const cancelled = await post(`/inpatient/admissions/${res.json.data.id}/cancel`, 'doctor', { reason: 'Wrong patient' });
    expect(cancelled.status, cancelled.text).toBe(200);
    expect(await bedStatus('BED-MMW-M6')).toBe('AVAILABLE');

    const pid2 = await newPatient('Cared');
    const res2 = await post('/inpatient/admissions', 'doctor', { patientId: pid2, wardId: 'WRD-MMW', bedId: 'BED-MMW-M6', reason: 'Observation' });
    await post(`/encounters/${res2.json.data.encounter.id}/vitals`, 'nurse', { pulseBpm: 88 });
    expect((await post(`/inpatient/admissions/${res2.json.data.id}/cancel`, 'doctor', { reason: 'Changed mind' })).json.code).toBe('ADMISSION_HAS_CARE');
  });
});

describe('wards module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `W${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Wards', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signIn('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/inpatient/wards', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });

  it('ward occupancy is reported per ward', async () => {
    const res = await get('/inpatient/wards', 'nurse');
    const male = res.json.data.items.find((w: { code: string }) => w.code === 'MMW');
    expect(male.occupancy.total).toBe(6);
    expect(male.occupancy.occupied).toBeGreaterThanOrEqual(1);
  });
});

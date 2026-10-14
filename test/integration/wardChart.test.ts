import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  The ward whiteboard, the medication chart and the fluid balance chart.

  The coloured dots on the board are the point: they must say "someone needs to do something
  for this patient" when that is true, and clear when it has been done. Time-of-day logic is
  proven in the unit tests; here the dots are driven through the real flows (a prescription,
  a nurse's tick, vitals, a lab sign-off) with assertions that hold at any hour.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function call(method: string, path: string, as: string, body?: unknown, facility = FACILITY_A.code) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[`${facility}:${as}`]}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}
const get = (path: string, as: string, facility?: string) => call('GET', path, as, undefined, facility);
const post = (path: string, as: string, body: unknown = {}, facility?: string) => call('POST', path, as, body, facility);

async function signIn(facility: string, username: keyof typeof DEMO_USERS) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facilityCode: facility, username, password: DEMO_USERS[username] }) });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  tokens[`${facility}:${username}`] = json.data.accessToken;
}

const inA = <T>(fn: () => Promise<T>) => runWithFacility(FACILITY_A.id, fn);
const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const TAG = randomUUID().slice(0, 5).toUpperCase();

let wardId: string;
const freeBeds: string[] = [];

type Stay = { admissionId: string; encounterId: string; patientId: string; bedId: string };

/** Admits a new patient to a bed on the test ward. */
async function admitPatient(label: string): Promise<Stay> {
  const patientId = await inA(async () => (await prisma.patient.create({ data: { patientCode: `PAT-WC-${label}-${randomUUID().slice(0, 4)}`, firstName: `Chart${label}`, lastName: 'Ward', gender: 'MALE', phone: '+233200000031' } })).id);
  const visit = await post('/encounters', 'reception', { patientId, type: 'OPD' });
  const sourceId = visit.json.data.id as string;
  await post(`/encounters/${sourceId}/start-consultation`, 'doctor');
  await post(`/encounters/${sourceId}/diagnoses`, 'doctor', { code: 'J18.9', description: 'Pneumonia, unspecified', type: 'PRIMARY' });
  const bedId = freeBeds.shift() as string;
  const admitted = await post('/inpatient/admissions', 'doctor', { patientId, wardId, bedId, reason: 'Pneumonia needing IV antibiotics', sourceEncounterId: sourceId });
  expect(admitted.status, admitted.text).toBe(201);
  return { admissionId: admitted.json.data.id, encounterId: admitted.json.data.encounter.id, patientId, bedId };
}

/** A prescription on the stay, written `daysAgo` days ago at 05:00 UTC so every part of today applies. */
async function prescribe(stay: Stay, item: { drugName: string; frequency: string; durationDays?: number }, daysAgo = 1) {
  const res = await post(`/encounters/${stay.encounterId}/prescriptions`, 'doctor', { items: [{ drugName: item.drugName, dose: '500 mg', route: 'Oral', frequency: item.frequency, ...(item.durationDays ? { durationDays: item.durationDays } : {}) }] });
  expect(res.status, res.text).toBe(201);
  const written = new Date(`${dayOffset(-daysAgo)}T05:00:00.000Z`);
  await inA(() => prisma.prescription.update({ where: { id: res.json.data.prescriptions[0].id }, data: { createdAt: written } }));
  const itemId = await inA(async () => (await prisma.prescriptionItem.findFirstOrThrow({ where: { prescription: { id: res.json.data.prescriptions[0].id } } })).id);
  return itemId;
}

async function boardFlags(stay: Stay) {
  const board = await get('/inpatient/board', 'nurse');
  expect(board.status, board.text).toBe(200);
  const ward = board.json.data.items.find((w: { id: string }) => w.id === wardId);
  const bed = ward.beds.find((b: { id: string }) => b.id === stay.bedId);
  return bed.admission as { diagnosis: string; dayNumber: number; flags: { dosesDue: number; dosesOverdue: number; vitalsDue: boolean; newResults: number } };
}
const waiting = (f: { dosesDue: number; dosesOverdue: number }) => f.dosesDue + f.dosesOverdue;

/** The lab takes a test on the stay's encounter to a signed-off result. */
async function labSignsOff(encounterId: string, catalogItemId: string) {
  const order = await post(`/encounters/${encounterId}/orders`, 'doctor', { items: [{ catalogItemId }] });
  expect(order.status, order.text).toBe(201);
  const orderId = order.json.data.orders.at(-1).id as string;
  const accepted = await post('/lab/samples/accept', 'lab', { orderId });
  expect(accepted.status, accepted.text).toBe(201);
  const draft = await post('/lab/results', 'lab', { sampleId: accepted.json.data.samples[0].id, parameters: [{ name: 'Haemoglobin', value: '11.9', unit: 'g/dL' }] });
  await post('/lab/results/submit-review', 'lab', { resultId: draft.json.data.id });
  const signed = await post(`/lab/results/${draft.json.data.id}/sign-off`, 'lab', { decision: 'SIGNED_OFF' });
  expect(signed.status, signed.text).toBe(200);
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse', 'lab', 'billing', 'admin'] as const) await signIn(FACILITY_A.code, user);
  await signIn(FACILITY_B.code, 'admin');

  const ward = await post('/inpatient/wards', 'admin', { code: `WC${TAG}`, name: `Chart ward ${TAG}`, type: 'GENERAL', gender: 'MIXED' });
  expect(ward.status, ward.text).toBe(201);
  wardId = ward.json.data.id;
  const beds = await post(`/inpatient/wards/${wardId}/beds`, 'admin', { labels: Array.from({ length: 16 }, (_, i) => `C${i + 1}`) });
  expect(beds.status, beds.text).toBe(201);
  const listed = await get('/inpatient/wards', 'nurse');
  const created = listed.json.data.items.find((w: { id: string }) => w.id === wardId);
  freeBeds.push(...created.beds.map((b: { id: string }) => b.id));
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('the whiteboard', () => {
  it('shows each patient on their bed with the diagnosis and the day of the stay, and no flags for a patient just admitted', async () => {
    const stay = await admitPatient('Fresh');
    const flags = await boardFlags(stay);
    expect(flags.diagnosis).toBe('Pneumonia, unspecified');
    expect(flags.dayNumber).toBe(1);
    expect(flags.flags).toEqual({ dosesDue: 0, dosesOverdue: 0, vitalsDue: false, newResults: 0 });
  });

  it('counts the days of a longer stay', async () => {
    const stay = await admitPatient('Third');
    await inA(() => prisma.admission.update({ where: { id: stay.admissionId }, data: { admittedAt: new Date(Date.now() - 2 * 86_400_000) } }));
    expect((await boardFlags(stay)).dayNumber).toBe(3);
  });

  it('flags overdue observations until vitals are taken, then clears', async () => {
    const stay = await admitPatient('Vitals');
    await inA(() => prisma.admission.update({ where: { id: stay.admissionId }, data: { admittedAt: new Date(Date.now() - 10 * 3_600_000) } }));
    expect((await boardFlags(stay)).flags.vitalsDue).toBe(true);

    const taken = await post(`/encounters/${stay.encounterId}/vitals`, 'nurse', { temperatureC: 37.2, pulseBpm: 84, systolicBp: 120, diastolicBp: 78 });
    expect(taken.status, taken.text).toBe(201);
    expect((await boardFlags(stay)).flags.vitalsDue).toBe(false);
  });

  it('flags doses that are waiting until each one is recorded, and ignores medicines that are as-needed or finished', async () => {
    const stay = await admitPatient('Doses');
    const daily = await prescribe(stay, { drugName: 'Amoxicillin', frequency: 'Once daily' }, 10);
    await prescribe(stay, { drugName: 'Paracetamol', frequency: 'PRN' }, 10);
    await prescribe(stay, { drugName: 'Old course', frequency: 'Twice daily', durationDays: 3 }, 20);

    // Yesterday's morning dose has long closed and nobody recorded it, at any hour of the day.
    expect(waiting((await boardFlags(stay)).flags), 'an unrecorded dose from yesterday must show').toBeGreaterThanOrEqual(1);

    for (const date of [dayOffset(-1), dayOffset(0)]) {
      const tick = await post(`/inpatient/admissions/${stay.admissionId}/medications/${daily}`, 'nurse', { status: 'GIVEN', scheduleDate: date, scheduleBlock: 'MORNING', scheduleSlot: 0 });
      expect(tick.status, tick.text).toBe(201);
    }
    expect(waiting((await boardFlags(stay)).flags), 'every dose recorded, so nothing is waiting').toBe(0);
  });

  it('flags results nobody has looked at, until a doctor marks them reviewed, and flags the next one again', async () => {
    const stay = await admitPatient('Results');
    await labSignsOff(stay.encounterId, 't1');
    expect((await boardFlags(stay)).flags.newResults).toBe(1);

    const nurse = await post(`/inpatient/admissions/${stay.admissionId}/results-reviewed`, 'nurse');
    expect(nurse.status, 'only a doctor reviews results').toBe(403);
    const reviewed = await post(`/inpatient/admissions/${stay.admissionId}/results-reviewed`, 'doctor');
    expect(reviewed.status, reviewed.text).toBe(200);
    expect((await boardFlags(stay)).flags.newResults).toBe(0);

    await labSignsOff(stay.encounterId, 't2');
    expect((await boardFlags(stay)).flags.newResults, 'a result that comes back after the review is new').toBe(1);
  });

  it('is for ward staff, and each hospital sees only its own wards', async () => {
    expect((await get('/inpatient/board', 'billing')).status).toBe(403);
    expect((await get('/inpatient/board', 'reception')).status).toBe(403);
    const other = await get('/inpatient/board', 'admin', FACILITY_B.code);
    expect(other.status).toBe(200);
    expect(other.json.data.items.map((w: { id: string }) => w.id)).not.toContain(wardId);
  });
});

describe('the medication chart', () => {
  it('lays a medicine out by part of the day, and keeps as-needed medicines without boxes', async () => {
    const stay = await admitPatient('Chart');
    await prescribe(stay, { drugName: 'Ceftriaxone', frequency: 'Three times daily' });
    await prescribe(stay, { drugName: 'Metronidazole', frequency: 'BD' });
    await prescribe(stay, { drugName: 'Tramadol', frequency: 'as needed' });

    const chart = await get(`/inpatient/admissions/${stay.admissionId}/medication-chart`, 'nurse');
    expect(chart.status, chart.text).toBe(200);
    const row = (name: string) => chart.json.data.rows.find((r: { drugName: string }) => r.drugName === name);
    expect(row('Ceftriaxone').slots.map((s: { block: string }) => s.block)).toEqual(['MORNING', 'AFTERNOON', 'NIGHT']);
    expect(row('Metronidazole').slots.map((s: { block: string }) => s.block)).toEqual(['MORNING', 'NIGHT']);
    expect(row('Tramadol')).toMatchObject({ asNeeded: true, slots: [] });
    expect(chart.json.data.blocks.map((b: { block: string }) => b.block)).toEqual(['MORNING', 'AFTERNOON', 'NIGHT']);
    expect(chart.json.data.patient.firstName).toBe('ChartChart');
  });

  it('records a tick against its slot, shows it given by whom, and refuses the same box twice', async () => {
    const stay = await admitPatient('Tick');
    const item = await prescribe(stay, { drugName: 'Ceftriaxone', frequency: 'TDS' });
    const url = `/inpatient/admissions/${stay.admissionId}/medications/${item}`;
    const body = { status: 'GIVEN', scheduleDate: dayOffset(0), scheduleBlock: 'AFTERNOON', scheduleSlot: 0 };

    expect((await post(url, 'nurse', body)).status).toBe(201);
    const chart = await get(`/inpatient/admissions/${stay.admissionId}/medication-chart?date=${dayOffset(0)}`, 'nurse');
    const slot = chart.json.data.rows[0].slots.find((s: { block: string }) => s.block === 'AFTERNOON');
    expect(slot.state).toBe('GIVEN');
    expect(slot.administration).toMatchObject({ status: 'GIVEN', doseGiven: '500 mg' });
    expect(slot.administration.administeredBy.name).toBeTruthy();

    const twice = await post(url, 'nurse', { ...body, status: 'REFUSED', notes: 'Second nurse, same box' });
    expect(twice.status).toBe(409);
    expect(twice.json.code).toBe('DOSE_ALREADY_RECORDED');
  });

  it('records a dose that was held or refused with its reason, and requires one', async () => {
    const stay = await admitPatient('Held');
    const item = await prescribe(stay, { drugName: 'Ceftriaxone', frequency: 'BD' });
    const url = `/inpatient/admissions/${stay.admissionId}/medications/${item}`;
    const slot = { scheduleDate: dayOffset(0), scheduleBlock: 'MORNING', scheduleSlot: 0 };
    const noReason = await post(url, 'nurse', { status: 'HELD', ...slot });
    expect(noReason.status).toBe(400);
    expect(noReason.json.code).toBe('REASON_REQUIRED');
    expect((await post(url, 'nurse', { status: 'HELD', notes: 'Patient nil by mouth for a scan', ...slot })).status).toBe(201);
    const chart = await get(`/inpatient/admissions/${stay.admissionId}/medication-chart?date=${dayOffset(0)}`, 'nurse');
    expect(chart.json.data.rows[0].slots.find((s: { block: string }) => s.block === 'MORNING').administration).toMatchObject({ status: 'HELD', notes: 'Patient nil by mouth for a scan' });
  });

  it('refuses a tick that is not on the schedule, is in the future, or is outside the course', async () => {
    const stay = await admitPatient('Bad');
    const item = await prescribe(stay, { drugName: 'Ceftriaxone', frequency: 'BD', durationDays: 3 }, 1);
    const url = `/inpatient/admissions/${stay.admissionId}/medications/${item}`;
    const tick = (over: Record<string, unknown>) => post(url, 'nurse', { status: 'GIVEN', scheduleDate: dayOffset(0), scheduleBlock: 'MORNING', scheduleSlot: 0, ...over });

    expect((await tick({ scheduleBlock: 'AFTERNOON' })).json.code, 'BD has no afternoon dose').toBe('SLOT_NOT_SCHEDULED');
    expect((await tick({ scheduleSlot: 1 })).json.code).toBe('SLOT_NOT_SCHEDULED');
    expect((await tick({ scheduleDate: dayOffset(1) })).json.code).toBe('DOSE_IN_THE_FUTURE');
    expect((await tick({ scheduleDate: dayOffset(-5) })).json.code).toBe('OUTSIDE_COURSE');
    expect((await tick({ scheduleDate: dayOffset(2) })).status).toBe(400);
    // The day, the part of the day and the dose come together or not at all.
    expect((await post(url, 'nurse', { status: 'GIVEN', scheduleDate: dayOffset(0) })).status).toBe(400);
  });

  it('still takes a dose given outside the schedule, and shows it beside the day\'s boxes', async () => {
    const stay = await admitPatient('Prn');
    const item = await prescribe(stay, { drugName: 'Tramadol', frequency: 'PRN' });
    expect((await post(`/inpatient/admissions/${stay.admissionId}/medications/${item}`, 'nurse', { status: 'GIVEN', doseGiven: '50 mg' })).status).toBe(201);
    const chart = await get(`/inpatient/admissions/${stay.admissionId}/medication-chart`, 'nurse');
    expect(chart.json.data.rows[0].extra).toHaveLength(1);
    expect(chart.json.data.rows[0].extra[0]).toMatchObject({ status: 'GIVEN', doseGiven: '50 mg' });
  });

  it('shows another day on request, rejects nonsense, and is private to the hospital', async () => {
    const stay = await admitPatient('Days');
    await prescribe(stay, { drugName: 'Ceftriaxone', frequency: 'BD' }, 3);
    const yesterday = await get(`/inpatient/admissions/${stay.admissionId}/medication-chart?date=${dayOffset(-1)}`, 'doctor');
    expect(yesterday.json.data.day).toBe(dayOffset(-1));
    expect(yesterday.json.data.rows[0].slots).toHaveLength(2);
    expect((await get(`/inpatient/admissions/${stay.admissionId}/medication-chart?date=2026-02-30`, 'doctor')).status).toBe(400);
    expect((await get(`/inpatient/admissions/${stay.admissionId}/medication-chart`, 'admin', FACILITY_B.code)).status).toBe(404);
  });
});

describe('the fluid balance chart', () => {
  it('totals what went in and what came out, per day', async () => {
    const stay = await admitPatient('Fluid');
    const base = `/inpatient/admissions/${stay.admissionId}/fluids`;
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 500 })).status).toBe(201);
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'IV fluid', volumeMl: 1000, note: 'Normal saline' })).status).toBe(201);
    expect((await post(base, 'nurse', { direction: 'OUTPUT', kind: 'Urine', volumeMl: 450 })).status).toBe(201);

    const res = await get(base, 'doctor');
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.items).toHaveLength(3);
    const today = res.json.data.totals.find((t: { day: string }) => t.day === dayOffset(0));
    expect(today).toEqual({ day: dayOffset(0), intake: 1500, output: 450, balance: 1050 });
  });

  it('is charted by nurses, not doctors, and checks what it is given', async () => {
    const stay = await admitPatient('Rules');
    const base = `/inpatient/admissions/${stay.admissionId}/fluids`;
    expect((await post(base, 'doctor', { direction: 'INTAKE', kind: 'Oral', volumeMl: 200 })).status).toBe(403);
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 0 })).status).toBe(400);
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 20_000 })).status).toBe(400);
    expect((await post(base, 'nurse', { direction: 'SIDEWAYS', kind: 'Oral', volumeMl: 100 })).status).toBe(400);
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 100, recordedAt: new Date(Date.now() + 3_600_000).toISOString() })).json.code).toBe('FUTURE_MEASUREMENT');
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 100, recordedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() })).json.code).toBe('BEFORE_ADMISSION');
  });

  it('closes with the stay and belongs to one hospital', async () => {
    const stay = await admitPatient('Closed');
    const base = `/inpatient/admissions/${stay.admissionId}/fluids`;
    expect((await get(base, 'admin', FACILITY_B.code)).status).toBe(404);
    expect((await post(base, 'admin', { direction: 'INTAKE', kind: 'Oral', volumeMl: 100 }, FACILITY_B.code)).status).toBe(404);
    const out = await post(`/inpatient/admissions/${stay.admissionId}/discharge`, 'doctor', { outcome: 'DISCHARGED_HOME', summary: 'Recovered well and went home on oral medicines.' });
    expect(out.status, out.text).toBe(200);
    expect((await post(base, 'nurse', { direction: 'INTAKE', kind: 'Oral', volumeMl: 100 })).json.code).toBe('ADMISSION_CLOSED');
  });
});

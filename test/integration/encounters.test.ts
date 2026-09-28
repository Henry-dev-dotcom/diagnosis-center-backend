import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 3 exit gate: registration -> triage -> consultation -> lab -> prescription -> bill -> discharge.

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function api(path: string, init: RequestInit & { as?: string; facility?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const key = init.as ? `${init.facility ?? FACILITY_A.code}:${init.as}` : null;
  if (key) headers.set('authorization', `Bearer ${tokens[key]}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

const post = (path: string, as: string, body: unknown = {}, facility?: string) =>
  api(path, { method: 'POST', as, facility, body: JSON.stringify(body) });
const get = (path: string, as: string, facility?: string) => api(path, { as, facility });

async function signIn(facility: string, username: keyof typeof DEMO_USERS) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode: facility, username, password: DEMO_USERS[username] })
  });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  tokens[`${facility}:${username}`] = json.data.accessToken;
}

let patientId: string;

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'nurse', 'doctor', 'lab', 'billing', 'admin'] as const) await signIn(FACILITY_A.code, user);
  await signIn(FACILITY_B.code, 'nurse');
  // A fresh patient so the journey does not collide with other suites.
  patientId = await runWithFacility(FACILITY_A.id, async () =>
    (await prisma.patient.create({ data: { patientCode: 'PAT-OPD-1', firstName: 'Kweku', lastName: 'Journey', phone: '+233200000009' } })).id
  );
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('outpatient journey', () => {
  let encounterId: string;

  it('reception starts the visit and the consultation fee is billed', async () => {
    const res = await post('/encounters', 'reception', { patientId, type: 'OPD', chiefComplaint: 'Fever and headache for 3 days', feeItemId: 'SVC-CONSULT' });
    expect(res.status, res.text).toBe(201);
    encounterId = res.json.data.id;
    expect(res.json.data.status).toBe('WAITING_TRIAGE');
    expect(res.json.data.encounterCode).toMatch(/^ENC-\d{4}-\d{4}$/);
    expect(res.json.data.invoices).toHaveLength(1);
    expect(Number(res.json.data.invoices[0].total)).toBe(50);
  });

  it('refuses a second open visit for the same patient', async () => {
    const res = await post('/encounters', 'reception', { patientId, type: 'OPD' });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ENCOUNTER_ALREADY_OPEN');
  });

  it('the nurse records an allergy, vitals and triage, sending the patient to the doctor queue', async () => {
    const allergy = await post(`/patients/${patientId}/allergies`, 'nurse', { substance: 'Penicillin', reaction: 'Rash', severity: 'SEVERE' });
    expect(allergy.status, allergy.text).toBe(201);

    const bad = await post(`/encounters/${encounterId}/vitals`, 'nurse', { temperatureC: 390 });
    expect(bad.status).toBe(400);

    const res = await post(`/encounters/${encounterId}/vitals`, 'nurse', {
      temperatureC: 38.9, pulseBpm: 104, respiratoryRate: 20, systolicBp: 118, diastolicBp: 76, spo2: 97, weightKg: 68,
      triageLevel: 'YELLOW', completeTriage: true
    });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.status).toBe('WAITING_DOCTOR');
    expect(res.json.data.triageLevel).toBe('YELLOW');
    expect(res.json.data.patient.allergies.map((a: { substance: string }) => a.substance)).toContain('Penicillin');
  });

  it('the nurse cannot diagnose or prescribe', async () => {
    expect((await post(`/encounters/${encounterId}/diagnoses`, 'nurse', { description: 'Malaria' })).status).toBe(403);
    expect((await post(`/encounters/${encounterId}/prescriptions`, 'nurse', { items: [] })).status).toBe(403);
  });

  it('the doctor consults, diagnoses and orders a lab test that reaches the lab queue', async () => {
    expect((await post(`/encounters/${encounterId}/start-consultation`, 'doctor')).json.data.status).toBe('IN_CONSULTATION');

    const early = await post(`/encounters/${encounterId}/complete`, 'doctor', {});
    expect(early.status).toBe(409);
    expect(early.json.code).toBe('DIAGNOSIS_REQUIRED');

    const note = await post(`/encounters/${encounterId}/notes`, 'doctor', {
      subjective: 'Fever, headache, body pains for 3 days.',
      objective: 'Febrile, mild pallor.',
      assessment: 'Likely uncomplicated malaria.',
      plan: 'Malaria RDT / FBC, start ACT.'
    });
    expect(note.status, note.text).toBe(201);
    expect(note.json.data.notes.at(-1).type).toBe('CONSULTATION');

    const codes = await get('/encounters/diagnosis-codes?q=malaria', 'doctor');
    expect(codes.json.data.map((c: { code: string }) => c.code)).toContain('B54');

    const dx = await post(`/encounters/${encounterId}/diagnoses`, 'doctor', { code: 'B54', description: 'Unspecified malaria', type: 'PRIMARY' });
    expect(dx.status, dx.text).toBe(201);

    const order = await post(`/encounters/${encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }], urgency: 'URGENT' });
    expect(order.status, order.text).toBe(201);
    const placed = order.json.data.orders[0];
    expect(placed.status).toBe('CONFIRMED');
    expect(placed.urgency).toBe('URGENT');

    const queue = await get('/lab/queue', 'lab');
    expect(queue.text).toContain(placed.orderCode);
  });

  it('service items cannot be ordered as investigations', async () => {
    const res = await post(`/encounters/${encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 'SVC-CONSULT' }] });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('SERVICE_NOT_ORDERABLE');
  });

  it('the doctor prescribes and completes the visit with a discharge summary', async () => {
    const rx = await post(`/encounters/${encounterId}/prescriptions`, 'doctor', {
      items: [{ drugName: 'Artemether-lumefantrine', strength: '20/120 mg', dosageForm: 'Tablet', dose: '4 tablets', route: 'Oral', frequency: 'Twice daily', durationDays: 3, quantity: 24 }]
    });
    expect(rx.status, rx.text).toBe(201);
    expect(rx.json.data.prescriptions[0].prescriptionCode).toMatch(/^RX-\d{4}-\d{4}$/);

    const done = await post(`/encounters/${encounterId}/complete`, 'doctor', { outcome: 'DISCHARGED', summary: 'Treated for malaria; review in 3 days if not better.' });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data.status).toBe('COMPLETED');
    expect(done.json.data.notes.at(-1).type).toBe('DISCHARGE');
  });

  it('a completed visit is read-only', async () => {
    const res = await post(`/encounters/${encounterId}/vitals`, 'nurse', { pulseBpm: 80 });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ENCOUNTER_CLOSED');
  });

  it('billing collects both the consultation fee and the lab bill', async () => {
    const invoices = await runWithFacility(FACILITY_A.id, () =>
      prisma.invoice.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } })
    );
    expect(invoices).toHaveLength(2);
    await post('/finance/shifts/start', 'billing', { openingFloat: 0 });
    for (const invoice of invoices) {
      const paid = await post(`/billing/invoices/${invoice.id}/payments`, 'billing', { amount: Number(invoice.balance), method: 'CASH' });
      expect(paid.status, paid.text).toBeLessThan(300);
    }
    const settled = await runWithFacility(FACILITY_A.id, () => prisma.invoice.findMany({ where: { patientId } }));
    expect(settled.every((invoice) => Number(invoice.balance) === 0)).toBe(true);
  });

  it('the patient timeline shows the visit, the order and the bills', async () => {
    const res = await get(`/patients/${patientId}/timeline`, 'doctor');
    expect(res.status, res.text).toBe(200);
    const kinds = res.json.data.map((event: { kind: string }) => event.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ENCOUNTER', 'ORDER', 'INVOICE']));
    expect(res.json.data.find((e: { kind: string }) => e.kind === 'ENCOUNTER').summary).toMatch(/malaria/i);
  });

  it('another facility cannot see the visit', async () => {
    expect((await get(`/encounters/${encounterId}`, 'nurse', FACILITY_B.code)).status).toBe(404);
    const list = await get('/encounters', 'nurse', FACILITY_B.code);
    expect(list.text).not.toContain(encounterId);
  });
});

describe('visit cancellation and problem list', () => {
  it('a waiting visit can be cancelled, one in consultation cannot', async () => {
    const pid = await runWithFacility(FACILITY_A.id, async () =>
      (await prisma.patient.create({ data: { patientCode: 'PAT-OPD-2', firstName: 'Ama', lastName: 'Cancel', phone: '+233200000010' } })).id
    );
    const first = await post('/encounters', 'reception', { patientId: pid });
    const cancelled = await post(`/encounters/${first.json.data.id}/cancel`, 'reception', { reason: 'Left before triage' });
    expect(cancelled.status, cancelled.text).toBe(200);
    expect(cancelled.json.data.status).toBe('CANCELLED');

    const second = await post('/encounters', 'reception', { patientId: pid });
    expect(second.status).toBe(201);
    await post(`/encounters/${second.json.data.id}/start-consultation`, 'doctor');
    expect((await post(`/encounters/${second.json.data.id}/cancel`, 'reception', { reason: 'Changed mind' })).status).toBe(409);

    // A chronic diagnosis joins the patient's problem list for later visits.
    await post(`/encounters/${second.json.data.id}/diagnoses`, 'doctor', { code: 'I10', description: 'Essential (primary) hypertension', isChronic: true });
    await post(`/encounters/${second.json.data.id}/complete`, 'doctor', {});
    const third = await post('/encounters', 'reception', { patientId: pid });
    expect(third.json.data.patient.diagnoses.map((d: { code: string }) => d.code)).toContain('I10');
  });
});

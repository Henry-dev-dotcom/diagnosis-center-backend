import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

// Phase 4A: pharmacy stock and dispensing, allergy safety net, emergency arrivals.

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
const onHand = (batchId: string) => inA(async () => (await prisma.drugBatch.findUniqueOrThrow({ where: { id: batchId } })).quantityOnHand);

/** A patient in consultation, ready to be prescribed for. */
async function patientInConsultation(label: string, allergy?: string) {
  const patientId = await inA(async () => {
    const p = await prisma.patient.create({ data: { patientCode: `PAT-RX-${label}-${randomUUID().slice(0, 4)}`, firstName: 'Rx', lastName: label, phone: '+233200000011' } });
    if (allergy) await prisma.patientAllergy.create({ data: { patientId: p.id, substance: allergy, severity: 'SEVERE' } });
    return p.id;
  });
  const visit = await post('/encounters', 'reception', { patientId, type: 'OPD' });
  expect(visit.status, visit.text).toBe(201);
  await post(`/encounters/${visit.json.data.id}/start-consultation`, 'doctor');
  return { patientId, encounterId: visit.json.data.id as string };
}

async function prescribe(encounterId: string, items: unknown[], extra: Record<string, unknown> = {}) {
  return post(`/encounters/${encounterId}/prescriptions`, 'doctor', { items, ...extra });
}

const line = (drugName: string, quantity: number, drugId?: string) => ({ drugId, drugName, dose: '1', route: 'Oral', frequency: 'Twice daily', quantity });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await signIn('reception', FACILITY_A.code, 'reception', DEMO_USERS.reception);
  await signIn('doctor', FACILITY_A.code, 'doctor', DEMO_USERS.doctor);
  await signIn('nurse', FACILITY_A.code, 'nurse', DEMO_USERS.nurse);
  await signIn('pharmacist', FACILITY_A.code, 'pharmacist', 'pharmacist123');
  await signIn('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('prescribing from the drug list', () => {
  it('prescribers can search the formulary with stock levels', async () => {
    const res = await get('/encounters/formulary?q=amox', 'doctor');
    expect(res.status, res.text).toBe(200);
    const amox = res.json.data.items.find((d: { drugCode: string }) => d.drugCode === 'AMOX500');
    expect(amox.onHand).toBe(560);
  });

  it('blocks a prescription that conflicts with an allergy unless a reason is given', async () => {
    const { encounterId } = await patientInConsultation('Allergic', 'Penicillin');
    const blocked = await prescribe(encounterId, [line('Amoxicillin', 15, 'DRG-AMOX500')]);
    expect(blocked.status).toBe(409);
    expect(blocked.json.code).toBe('ALLERGY_CONFLICT');

    const allowed = await prescribe(encounterId, [line('Amoxicillin', 15, 'DRG-AMOX500')], { allergyOverrideReason: 'Tolerated amoxicillin in 2024, reaction was to benzathine' });
    expect(allowed.status, allowed.text).toBe(201);
    expect(allowed.json.data.prescriptions[0].allergyOverride).toMatch(/Penicillin/);
  });
});

describe('dispensing', () => {
  let prescriptionId: string;
  let encounterId: string;
  let amoxLine: string;
  let pcmLine: string;

  beforeAll(async () => {
    ({ encounterId } = await patientInConsultation('Dispense'));
    const rx = await prescribe(encounterId, [line('Amoxicillin 500 mg', 15, 'DRG-AMOX500'), line('Paracetamol', 10)]);
    expect(rx.status, rx.text).toBe(201);
    const prescription = rx.json.data.prescriptions[0];
    prescriptionId = prescription.id;
    amoxLine = prescription.items.find((i: { drugName: string }) => i.drugName.startsWith('Amoxicillin')).id;
    pcmLine = prescription.items.find((i: { drugName: string }) => i.drugName === 'Paracetamol').id;
  });

  it('the prescription appears in the pharmacy queue', async () => {
    const queue = await get('/pharmacy/prescriptions', 'pharmacist');
    expect(queue.json.data.items.map((p: { id: string }) => p.id)).toContain(prescriptionId);
  });

  it('draws from the batch that expires first and records the movement', async () => {
    const [earlyBefore, lateBefore] = [await onHand('BAT-AMOX-1'), await onHand('BAT-AMOX-2')];
    const res = await post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, 'pharmacist', {
      items: [{ prescriptionItemId: amoxLine, drugId: 'DRG-AMOX500', quantity: 15 }]
    });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.status).toBe('PARTIALLY_DISPENSED');
    expect(await onHand('BAT-AMOX-1')).toBe(earlyBefore - 15);
    expect(await onHand('BAT-AMOX-2')).toBe(lateBefore);
    const movements = await get('/pharmacy/drugs/DRG-AMOX500/movements', 'pharmacist');
    expect(movements.json.data.items[0]).toMatchObject({ type: 'DISPENSE', quantity: -15 });
  });

  it('bills the dispensed items on the visit', async () => {
    const invoice = await inA(() => prisma.invoice.findFirst({ where: { encounterId, dispensation: { isNot: null } }, include: { items: true } }));
    expect(invoice).not.toBeNull();
    expect(Number(invoice!.total)).toBeCloseTo(15 * 1.2, 2);
  });

  it('cannot supply more than was prescribed', async () => {
    const res = await post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, 'pharmacist', {
      items: [{ prescriptionItemId: pcmLine, drugId: 'DRG-PCM500', quantity: 11 }]
    });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('QUANTITY_EXCEEDS_PRESCRIPTION');
  });

  it('matches a free-text line to a drug, completes in two parts, then closes', async () => {
    const first = await post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: pcmLine, drugId: 'DRG-PCM500', quantity: 6 }] });
    expect(first.json.data.status).toBe('PARTIALLY_DISPENSED');
    const second = await post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: pcmLine, drugId: 'DRG-PCM500', quantity: 4 }] });
    expect(second.status, second.text).toBe(201);
    expect(second.json.data.status).toBe('DISPENSED');
    const again = await post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: pcmLine, drugId: 'DRG-PCM500', quantity: 1 }] });
    expect(again.status).toBe(409);
  });

  it('refuses when stock is short and changes nothing', async () => {
    const { encounterId: eid } = await patientInConsultation('Short');
    const rx = await prescribe(eid, [line('Ibuprofen', 100, 'DRG-IBU400')]);
    const before = await onHand('BAT-IBU-1');
    const res = await post(`/pharmacy/prescriptions/${rx.json.data.prescriptions[0].id}/dispense`, 'pharmacist', {
      items: [{ prescriptionItemId: rx.json.data.prescriptions[0].items[0].id, drugId: 'DRG-IBU400', quantity: 100 }]
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('INSUFFICIENT_STOCK');
    expect(await onHand('BAT-IBU-1')).toBe(before);
  });

  it('never dispenses from an expired batch', async () => {
    const { encounterId: eid } = await patientInConsultation('Expiry');
    const rx = await prescribe(eid, [line('Co-trimoxazole', 400, 'DRG-CTX480')]);
    const itemId = rx.json.data.prescriptions[0].items[0].id;
    const expiredBefore = await onHand('BAT-CTX-1');
    const usable = await onHand('BAT-CTX-2');
    // Expired + usable would cover it; usable alone does not.
    const tooMuch = await post(`/pharmacy/prescriptions/${rx.json.data.prescriptions[0].id}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: itemId, drugId: 'DRG-CTX480', quantity: usable + 1 }] });
    expect(tooMuch.status).toBe(409);
    const ok = await post(`/pharmacy/prescriptions/${rx.json.data.prescriptions[0].id}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: itemId, drugId: 'DRG-CTX480', quantity: 20 }] });
    expect(ok.status, ok.text).toBe(201);
    expect(await onHand('BAT-CTX-1')).toBe(expiredBefore);
    expect(await onHand('BAT-CTX-2')).toBe(usable - 20);
  });

  it('pharmacists dispensing at the same moment cannot oversell a batch', async () => {
    // Eight simultaneous requests, each for a third of the stock plus one: at most two can be supplied.
    // Dispensings in one facility queue on the dispensing-number lock (codeSequence.service), so each
    // sees the stock the previous one left; the conditional batch update and the database's
    // non-negative check remain as backstops (the latter is tested below).
    const stock = await onHand('BAT-ORS-1');
    const each = Math.floor(stock / 3) + 1;
    const rxs = [];
    for (let i = 0; i < 8; i += 1) {
      const { encounterId: eid } = await patientInConsultation(`Race${i}`);
      const rx = await prescribe(eid, [line('ORS', each, 'DRG-ORS')]);
      rxs.push(rx.json.data.prescriptions[0]);
    }
    const results = await Promise.all(
      rxs.map((rx) => post(`/pharmacy/prescriptions/${rx.id}/dispense`, 'pharmacist', { items: [{ prescriptionItemId: rx.items[0].id, drugId: 'DRG-ORS', quantity: each }] }))
    );
    const succeeded = results.filter((r) => r.status === 201).length;
    // Every refusal is a clean 409 (never a server error), and stock adds up exactly.
    expect(results.filter((r) => r.status !== 201).every((r) => r.status === 409), results.map((r) => `${r.status} ${r.json?.code}`).join(', ')).toBe(true);
    expect(succeeded).toBeGreaterThanOrEqual(1);
    expect(succeeded).toBeLessThanOrEqual(2);
    expect(await onHand('BAT-ORS-1')).toBe(stock - succeeded * each);
  });

  it('the database itself refuses negative stock', async () => {
    await expect(
      inA(() => prisma.drugBatch.update({ where: { id: 'BAT-AML-1' }, data: { quantityOnHand: -1 } }))
    ).rejects.toThrow(/quantityOnHand_nonnegative/);
  });
});

describe('stock management', () => {
  it('refuses to receive an expired batch', async () => {
    const res = await post('/pharmacy/drugs/DRG-PCM500/batches', 'pharmacist', { batchNumber: `OLD-${randomUUID().slice(0, 4)}`, expiryDate: '2020-01-01', quantity: 10 });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('BATCH_EXPIRED');
  });

  it('receives a batch and records the receipt', async () => {
    const before = (await get('/pharmacy/drugs?q=Metformin', 'pharmacist')).json.data.items[0].onHand;
    const res = await post('/pharmacy/drugs/DRG-MET500/batches', 'pharmacist', { batchNumber: `MET-${randomUUID().slice(0, 4)}`, expiryDate: '2030-06-30', quantity: 100, supplier: 'Tobinco' });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.onHand).toBe(before + 100);
  });

  it('refuses an adjustment that would take a batch below zero', async () => {
    const stock = await onHand('BAT-AML-1');
    const res = await post('/pharmacy/drugs/DRG-AML5/adjustments', 'pharmacist', { batchId: 'BAT-AML-1', quantity: -(stock + 1), reason: 'Recount' });
    expect(res.status).toBe(409);
    expect(await onHand('BAT-AML-1')).toBe(stock);
  });

  it('keeps pharmacy stock out of reach of other roles', async () => {
    expect((await get('/pharmacy/drugs', 'nurse')).status).toBe(403);
    expect((await get('/pharmacy/prescriptions', 'doctor')).status).toBe(403);
  });
});

describe('emergency department', () => {
  it('a triage nurse registers an unidentified arrival straight onto the ED board', async () => {
    const res = await post('/encounters/emergency-arrivals', 'nurse', { gender: 'MALE', estimatedAgeYears: 30, chiefComplaint: 'Road traffic accident, unconscious', triageLevel: 'RED' });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.type).toBe('EMERGENCY');
    expect(res.json.data.triageLevel).toBe('RED');
    expect(res.json.data.patient.firstName).toBe('Unknown');

    const board = await get('/encounters?type=EMERGENCY&status=WAITING_TRIAGE', 'nurse');
    expect(board.json.data.items[0].id).toBe(res.json.data.id);
  });

  it('emergency visits need the Emergency module; outpatient visits the OPD module', async () => {
    const code = `E${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    const created = await post('/platform/facilities', 'platform', {
      code,
      name: 'OPD-only Clinic',
      modules: ['opd', 'reception'],
      admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' }
    });
    expect(created.status, created.text).toBe(201);
    await signIn('clinicAdmin', code, 'admin', 'clinic-pass-1');
    const ed = await post('/encounters/emergency-arrivals', 'clinicAdmin', { chiefComplaint: 'Chest pain' });
    expect(ed.status).toBe(403);
    expect(ed.json.code).toBe('MODULE_DISABLED');
    expect((await get('/pharmacy/drugs', 'clinicAdmin')).status).toBe(403);
  });
});

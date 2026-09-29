import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 4: mortuary register, certification, police cases and release.

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
const tag = () => `TAG-${randomUUID().slice(0, 6)}`;
const patient = (label: string) => inA(async () => (await prisma.patient.create({ data: { patientCode: `PAT-MR-${label}-${randomUUID().slice(0, 4)}`, firstName: label, lastName: 'Asare', gender: 'Male', phone: '+233200000091' } })).id);
const register = (body: Record<string, unknown>) => post('/mortuary/deceased', 'nurse', { dateOfDeath: new Date(Date.now() - 3600_000).toISOString(), placeOfDeath: 'WARD', bodyTag: tag(), ...body });
const release = { releasedTo: 'Yaw Asare', relationship: 'Son', idNumber: 'GHA-123456789-0' };

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['nurse', 'doctor', 'reception'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoNurse', FACILITY_B.code, 'nurse', DEMO_USERS.nurse);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('a patient who died in hospital', () => {
  let id: string;
  let patientId: string;

  it('is registered into a slot with a body tag; the slot and tag cannot be reused', async () => {
    patientId = await patient('Kwaku');
    const res = await register({ patientId, slotId: 'SLOT-A1' });
    expect(res.status, res.text).toBe(201);
    id = res.json.data.id;
    expect(res.json.data).toMatchObject({ fullName: 'Kwaku Asare', status: 'IN_STORAGE', slot: { code: 'A1' } });
    expect(res.json.data.caseCode).toMatch(/^MOR-\d{4}-\d{4}$/);

    const sameSlot = await register({ fullName: 'Unknown', sex: 'Unknown', slotId: 'SLOT-A1', placeOfDeath: 'BROUGHT_IN_DEAD' });
    expect(sameSlot.json.code).toBe('SLOT_OCCUPIED');
    const sameTag = await register({ fullName: 'Unknown', sex: 'Unknown', slotId: 'SLOT-A2', placeOfDeath: 'BROUGHT_IN_DEAD', bodyTag: res.json.data.bodyTag });
    expect(sameTag.json.code).toBe('TAG_TAKEN');
    expect((await register({ patientId, slotId: 'SLOT-A2' })).json.code).toBe('ALREADY_REGISTERED');
  });

  it('a deceased patient cannot be given a new visit', async () => {
    const res = await post('/encounters', 'reception', { patientId, type: 'OPD' });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('PATIENT_DECEASED');
  });

  it('release needs a doctor’s certificate of the cause of death', async () => {
    expect((await post(`/mortuary/deceased/${id}/release`, 'nurse', release)).json.code).toBe('CERTIFICATION_REQUIRED');
    expect((await post(`/mortuary/deceased/${id}/certify`, 'nurse', { causeOfDeath: 'Septic shock' })).status).toBe(403);
    const cert = await post(`/mortuary/deceased/${id}/certify`, 'doctor', { causeOfDeath: 'Septic shock due to community-acquired pneumonia', causeIcd10: 'a41.9' });
    expect(cert.json.data).toMatchObject({ causeIcd10: 'A41.9' });
    expect(cert.json.data.certifiedBy.name).toBeTruthy();
  });

  it('can be moved between slots', async () => {
    const moved = await post(`/mortuary/deceased/${id}/move`, 'nurse', { slotId: 'SLOT-B1' });
    expect(moved.json.data.slot.code).toBe('B1');
  });

  it('is released to an identified relative, freeing the slot and billing storage days', async () => {
    expect((await post(`/mortuary/deceased/${id}/release`, 'nurse', { ...release, idNumber: '' })).status).toBe(400);
    const res = await post(`/mortuary/deceased/${id}/release`, 'nurse', release);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toMatchObject({ status: 'RELEASED', releasedTo: 'Yaw Asare', storageDays: 1, slot: null });
    expect(res.json.data.invoiceCode).toMatch(/^INV-/);
    const invoice = await inA(() => prisma.invoice.findFirstOrThrow({ where: { invoiceCode: res.json.data.invoiceCode }, include: { items: true } }));
    expect(Number(invoice.total)).toBe(80);
    expect(invoice.items[0].description).toMatch(/Mortuary storage \(per day\): 1 day/);
    expect((await post(`/mortuary/deceased/${id}/release`, 'nurse', release)).json.code).toBe('ALREADY_RELEASED');
    const slots = await get('/mortuary/slots', 'nurse');
    expect(slots.json.data.items.find((s: { code: string }) => s.code === 'B1').occupant).toBeNull();
  });
});

describe('a police case brought in dead', () => {
  it('an unidentified body needs a name placeholder and sex; release waits for police clearance', async () => {
    expect((await register({ slotId: 'SLOT-A3', placeOfDeath: 'BROUGHT_IN_DEAD' })).status).toBe(400);
    expect((await register({ fullName: 'Unknown male', sex: 'Male', slotId: 'SLOT-A3', placeOfDeath: 'BROUGHT_IN_DEAD', policeCase: true })).status).toBe(400);
    const res = await register({ fullName: 'Unknown male', sex: 'Male', estimatedAgeYears: 40, slotId: 'SLOT-A3', placeOfDeath: 'BROUGHT_IN_DEAD', policeCase: true, policeReference: 'MTTD/ACC/2026/118' });
    expect(res.status, res.text).toBe(201);
    const id = res.json.data.id;

    // Certified, but still a police case without clearance.
    await post(`/mortuary/deceased/${id}/certify`, 'doctor', { causeOfDeath: 'Multiple injuries, road traffic collision' });
    expect((await post(`/mortuary/deceased/${id}/release`, 'nurse', release)).json.code).toBe('POLICE_CLEARANCE_REQUIRED');
    await post(`/mortuary/deceased/${id}/police-clearance`, 'nurse', { clearanceRef: 'CID/REL/2026/044' });
    const released = await post(`/mortuary/deceased/${id}/release`, 'nurse', release);
    expect(released.status, released.text).toBe(200);
    // No patient record, so no invoice.
    expect(released.json.data.invoiceCode).toBeNull();
  });
});

describe('mortuary safety and scope', () => {
  it('the database holds only one stored body per slot', async () => {
    const first = await register({ fullName: 'Unknown', sex: 'Unknown', slotId: 'SLOT-B2', placeOfDeath: 'BROUGHT_IN_DEAD' });
    expect(first.status).toBe(201);
    await expect(inA(() => prisma.deceasedRecord.create({ data: { caseCode: `MOR-X-${randomUUID().slice(0, 5)}`, fullName: 'x', sex: 'Unknown', dateOfDeath: new Date(), placeOfDeath: 'BROUGHT_IN_DEAD', slotId: 'SLOT-B2', bodyTag: tag() } }))).rejects.toThrow(/Unique constraint/);
  });

  it('reception cannot use the mortuary; another facility sees nothing; the module can be off', async () => {
    expect((await get('/mortuary/deceased', 'reception')).status).toBe(403);
    expect((await get('/mortuary/deceased', 'bravoNurse')).json.data.items).toHaveLength(0);
    const code = `R${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Mortuary', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/mortuary/slots', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

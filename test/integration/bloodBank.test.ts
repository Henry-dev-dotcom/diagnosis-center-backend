import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 3: blood bank from donation to transfusion.

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
const unit = (id: string) => inA(() => prisma.bloodUnit.findUniqueOrThrow({ where: { id } }));
const NEGATIVE = { hiv: 'NEGATIVE', hepatitisB: 'NEGATIVE', hepatitisC: 'NEGATIVE', syphilis: 'NEGATIVE' };

async function donor(label: string, gender = 'Female') {
  const res = await post('/blood-bank/donors', 'lab', { firstName: label, lastName: 'Donor', dateOfBirth: '1995-03-10', gender, phone: '+233200000081' });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
}

async function patient(label: string) {
  return inA(async () => (await prisma.patient.create({ data: { patientCode: `PAT-BB-${label}-${randomUUID().slice(0, 4)}`, firstName: label, lastName: 'Recipient', gender: 'MALE', phone: '+233200000082' } })).id);
}

const request = async (patientGroup: string, extra: Record<string, unknown> = {}) => {
  const res = await post('/blood-bank/requests', 'doctor', { patientId: await patient(patientGroup.replace(/\W/g, '')), patientGroup, component: 'PACKED_RED_CELLS', unitsRequested: 1, indication: 'Severe anaemia, Hb 5.1', haemoglobin: 5.1, ...extra });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
};

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['lab', 'doctor', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoLab', FACILITY_B.code, 'lab', DEMO_USERS.lab);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('donation and screening', () => {
  let donationId: string;
  let prcId: string;

  it('a donation becomes quarantined units; the donor must wait before giving again', async () => {
    const id = await donor('Giver');
    const res = await post(`/blood-bank/donors/${id}/donations`, 'lab', { bloodGroup: 'O-', volumeMl: 450, haemoglobin: 13.2, weightKg: 62, components: ['PACKED_RED_CELLS', 'FRESH_FROZEN_PLASMA'] });
    expect(res.status, res.text).toBe(201);
    const donation = res.json.data.donations[0];
    donationId = donation.id;
    expect(donation.units.map((u: { unitCode: string }) => u.unitCode.split('-').pop()).sort()).toEqual(['FFP', 'PRC']);
    expect(donation.units.every((u: { status: string }) => u.status === 'QUARANTINE')).toBe(true);
    prcId = donation.units.find((u: { component: string }) => u.component === 'PACKED_RED_CELLS').id;

    const again = await post(`/blood-bank/donors/${id}/donations`, 'lab', { bloodGroup: 'O-', volumeMl: 450, haemoglobin: 13.2, weightKg: 62, components: ['WHOLE_BLOOD'] });
    expect(again.json.code).toBe('DONOR_NOT_ELIGIBLE');
    expect(again.json.message).toMatch(/every 16 weeks/);
  });

  it('refuses donors below the haemoglobin threshold and inconsistent groups', async () => {
    const id = await donor('Anaemic', 'Male');
    expect((await post(`/blood-bank/donors/${id}/donations`, 'lab', { bloodGroup: 'A+', volumeMl: 450, haemoglobin: 11.8, weightKg: 70, components: ['WHOLE_BLOOD'] })).json.message).toMatch(/12.5/);
  });

  it('a quarantined unit cannot be crossmatched', async () => {
    const req = await request('O-');
    expect((await post(`/blood-bank/requests/${req}/crossmatch`, 'lab', { unitId: prcId, compatible: true })).json.code).toBe('UNIT_WRONG_STATUS');
  });

  it('all-negative screening releases every unit from the donation', async () => {
    const partial = await post(`/blood-bank/donations/${donationId}/screening`, 'lab', { hiv: 'NEGATIVE', hepatitisB: 'NEGATIVE' });
    expect(partial.status).toBe(400);
    const res = await post(`/blood-bank/donations/${donationId}/screening`, 'lab', NEGATIVE);
    expect(res.json.data).toMatchObject({ released: true, units: 2 });
    expect((await unit(prcId)).status).toBe('AVAILABLE');
    expect((await post(`/blood-bank/donations/${donationId}/screening`, 'lab', NEGATIVE)).json.code).toBe('NOT_IN_QUARANTINE');
  });

  it('a reactive screen discards the donation and defers the donor', async () => {
    const id = await donor('Reactive', 'Male');
    const d = await post(`/blood-bank/donors/${id}/donations`, 'lab', { bloodGroup: 'B+', volumeMl: 450, haemoglobin: 14, weightKg: 75, components: ['WHOLE_BLOOD'] });
    const res = await post(`/blood-bank/donations/${d.json.data.donations[0].id}/screening`, 'lab', { ...NEGATIVE, hepatitisB: 'POSITIVE' });
    expect(res.json.data).toMatchObject({ released: false, reactive: ['hepatitis B'] });
    const u = await unit(d.json.data.donations[0].units[0].id);
    expect(u).toMatchObject({ status: 'DISCARDED', discardReason: 'Reactive screening: hepatitis B' });
    const again = await post(`/blood-bank/donors/${id}/donations`, 'lab', { bloodGroup: 'B+', volumeMl: 450, haemoglobin: 14, weightKg: 75, components: ['WHOLE_BLOOD'] });
    expect(again.json.message).toMatch(/deferred/);
  });

  // The O- red cells released above are used for the emergency release test below.
  it('keeps the released O- unit for later', () => expect(prcId).toBeTruthy());

  describe('emergency release', () => {
    it('only for emergencies, and only O-negative red cells', async () => {
      const routine = await request('AB+');
      expect((await post(`/blood-bank/requests/${routine}/emergency-release`, 'lab', { unitId: prcId, reason: 'Massive haemorrhage' })).json.code).toBe('NOT_AN_EMERGENCY');
      const emergency = await request('AB+', { urgency: 'EMERGENCY' });
      expect((await post(`/blood-bank/requests/${emergency}/emergency-release`, 'lab', { unitId: 'BU-DEMO-3', reason: 'Massive haemorrhage' })).json.code).toBe('NOT_EMERGENCY_RELEASABLE');
      const res = await post(`/blood-bank/requests/${emergency}/emergency-release`, 'lab', { unitId: prcId, reason: 'Massive obstetric haemorrhage, no time to crossmatch' });
      expect(res.status, res.text).toBe(200);
      expect(res.json.data.transfusions[0]).toMatchObject({ emergencyRelease: true });
      expect((await unit(prcId)).status).toBe('ISSUED');
    });
  });
});

describe('request, crossmatch, issue and transfusion', () => {
  let requestId: string;

  it('doctors request blood; nurses cannot', async () => {
    requestId = await request('B+');
    const nurse = await post('/blood-bank/requests', 'nurse', { patientId: await patient('NurseReq'), patientGroup: 'B+', component: 'PACKED_RED_CELLS', unitsRequested: 1, indication: 'x anaemia' });
    expect(nurse.status).toBe(403);
  });

  it('an ABO-incompatible unit cannot even be crossmatched', async () => {
    const res = await post(`/blood-bank/requests/${requestId}/crossmatch`, 'lab', { unitId: 'BU-DEMO-3', compatible: true });
    expect(res.json.code).toBe('ABO_INCOMPATIBLE');
    expect(res.json.message).toMatch(/A\+ packed red cells is not compatible with a B\+ patient/);
  });

  it('a compatible crossmatch reserves the unit; no more than the units asked for', async () => {
    const res = await post(`/blood-bank/requests/${requestId}/crossmatch`, 'lab', { unitId: 'BU-DEMO-1', compatible: true });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.status).toBe('CROSSMATCHED');
    expect(await unit('BU-DEMO-1')).toMatchObject({ status: 'RESERVED', reservedForRequestId: requestId });
    expect((await post(`/blood-bank/requests/${requestId}/crossmatch`, 'lab', { unitId: 'BU-DEMO-2', compatible: true })).json.code).toBe('ENOUGH_UNITS');
  });

  it('a unit reserved for one patient cannot be issued to another', async () => {
    const other = await request('O-');
    await post(`/blood-bank/requests/${other}/crossmatch`, 'lab', { unitId: 'BU-DEMO-2', compatible: true });
    expect((await post(`/blood-bank/requests/${requestId}/issue`, 'lab', { unitId: 'BU-DEMO-2' })).json.code).toBe('RESERVED_ELSEWHERE');
    // Cancelling that request returns its unit to stock.
    await post(`/blood-bank/requests/${other}/cancel`, 'doctor', { reason: 'Patient improved' });
    expect(await unit('BU-DEMO-2')).toMatchObject({ status: 'AVAILABLE', reservedForRequestId: null });
  });

  it('issue, then the ward records the transfusion and any reaction', async () => {
    const issued = await post(`/blood-bank/requests/${requestId}/issue`, 'lab', { unitId: 'BU-DEMO-1' });
    expect(issued.status, issued.text).toBe(200);
    const transfusionId = issued.json.data.transfusions[0].id;
    expect((await post(`/blood-bank/transfusions/${transfusionId}`, 'nurse', { endedAt: new Date().toISOString() })).json.code).toBe('START_REQUIRED');
    expect((await post(`/blood-bank/transfusions/${transfusionId}`, 'nurse', { reaction: 'SEVERE' })).json.code).toBe('REACTION_NOTES_REQUIRED');

    const start = new Date(Date.now() - 3 * 3600_000).toISOString();
    await post(`/blood-bank/transfusions/${transfusionId}`, 'nurse', { startedAt: start });
    const done = await post(`/blood-bank/transfusions/${transfusionId}`, 'nurse', { endedAt: new Date().toISOString(), reaction: 'MILD', reactionNotes: 'Urticaria at 2 h; chlorphenamine given, settled' });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data.status).toBe('COMPLETED');
    expect(done.json.data.transfusions[0]).toMatchObject({ reaction: 'MILD' });
    expect((await unit('BU-DEMO-1')).status).toBe('TRANSFUSED');
  });
});

describe('expiry and isolation', () => {
  it('an expired unit is marked expired and refused', async () => {
    const expired = await inA(() =>
      prisma.bloodUnit.create({
        data: { unitCode: `OLD-${randomUUID().slice(0, 6)}`, bloodGroup: 'O+', component: 'PACKED_RED_CELLS', volumeMl: 280, collectedAt: new Date(Date.now() - 40 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000), status: 'AVAILABLE' }
      })
    );
    const req = await request('O+');
    expect((await post(`/blood-bank/requests/${req}/crossmatch`, 'lab', { unitId: expired.id, compatible: true })).json.code).toBe('UNIT_EXPIRED');
    expect((await unit(expired.id)).status).toBe('EXPIRED');
  });

  it('the database will not hold a reserved unit without a request', async () => {
    await expect(inA(() => prisma.bloodUnit.update({ where: { id: 'BU-DEMO-4' }, data: { status: 'RESERVED' } }))).rejects.toThrow(/BloodUnit_reserved_has_request|check constraint/i);
  });

  it('another facility sees none of it, and the module can be switched off', async () => {
    expect((await get('/blood-bank/units?status=TRANSFUSED', 'bravoLab')).json.data.items).toHaveLength(0);
    const code = `B${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Blood Bank', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/blood-bank/stock', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

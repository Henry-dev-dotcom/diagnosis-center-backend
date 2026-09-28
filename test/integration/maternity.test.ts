import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4C step 2: pregnancy register, antenatal visits, delivery and postnatal care.

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
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function woman(label: string, gender = 'Female') {
  return inA(async () =>
    (await prisma.patient.create({ data: { patientCode: `PAT-MAT-${label}-${randomUUID().slice(0, 4)}`, firstName: label, lastName: 'Mensah', gender, phone: '+233200000051', dateOfBirth: new Date('1995-03-10') } })).id
  );
}

async function clinicVisit(patientId: string, clinic: string) {
  const res = await post('/encounters', 'reception', { patientId, type: 'OPD', clinic });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
}

const book = (patientId: string, extra: Record<string, unknown> = {}) =>
  post('/maternity/pregnancies', 'nurse', { patientId, lmp: daysAgo(200), gravida: 3, parity: 2, riskFactors: ['PREVIOUS_PPH'], screening: { hiv: 'NEGATIVE' }, ...extra });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoNurse', FACILITY_B.code, 'nurse', DEMO_USERS.nurse);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('pregnancy booking', () => {
  it('only female patients, with plausible dates and parity below gravida', async () => {
    expect((await book(await woman('Kofi', 'Male'))).json.code).toBe('PATIENT_NOT_FEMALE');
    const pid = await woman('Dates');
    expect((await book(pid, { lmp: daysAgo(400) })).json.code).toBe('IMPLAUSIBLE_GESTATION');
    expect((await book(pid, { gravida: 2, parity: 2 })).status).toBe(400);
    expect((await book(pid, { lmp: undefined })).status).toBe(400);
  });

  it('receptionists cannot book pregnancies', async () => {
    expect((await post('/maternity/pregnancies', 'reception', { patientId: await woman('Desk'), lmp: daysAgo(100), gravida: 1, parity: 0 })).status).toBe(403);
  });

  it('a booked pregnancy shows today’s gestation; a second ongoing one is refused', async () => {
    const pid = await woman('Twice');
    const res = await book(pid);
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.pregnancyCode).toMatch(/^PRG-\d{4}-\d{4}$/);
    expect(res.json.data.gestationToday).toMatchObject({ weeks: 28, days: 4, basis: 'LMP' });
    expect((await book(pid)).json.code).toBe('PREGNANCY_ALREADY_ACTIVE');
  });

  it('the database allows one ongoing pregnancy per woman', async () => {
    const pid = await woman('Db');
    await book(pid);
    await expect(inA(() => prisma.pregnancy.create({ data: { pregnancyCode: `PRG-X-${randomUUID().slice(0, 6)}`, patientId: pid, gravida: 1, parity: 0 } }))).rejects.toThrow(/Unique constraint/);
  });

  it('a pregnancy that ends another way closes, and the next can be booked', async () => {
    const pid = await woman('Loss');
    const first = await book(pid, { lmp: daysAgo(60) });
    const ended = await post(`/maternity/pregnancies/${first.json.data.id}/end`, 'doctor', { reason: 'MISCARRIAGE', note: 'Complete miscarriage confirmed on scan' });
    expect(ended.json.data).toMatchObject({ status: 'ENDED', endReason: 'MISCARRIAGE' });
    expect((await book(pid, { lmp: daysAgo(30), gravida: 4, parity: 2 })).status).toBe(201);
  });
});

describe('antenatal care to delivery to postnatal care', () => {
  let patientId: string;
  let pregnancyId: string;
  let ancVisitId: string;

  it('an antenatal visit is linked to the pregnancy and flags pre-eclampsia', async () => {
    patientId = await woman('Journey');
    pregnancyId = (await book(patientId)).json.data.id;
    ancVisitId = await clinicVisit(patientId, 'ANTENATAL');

    const noPregnancy = await post(`/encounters/${ancVisitId}/forms`, 'nurse', { type: 'ANC_VISIT', data: { bpSystolic: 120, bpDiastolic: 80 } });
    expect(noPregnancy.json.code).toBe('PREGNANCY_REQUIRED');

    const res = await post(`/encounters/${ancVisitId}/forms`, 'nurse', {
      type: 'ANC_VISIT',
      pregnancyId,
      data: { weightKg: 71, bpSystolic: 150, bpDiastolic: 96, urineProtein: '2+', fundalHeightCm: 28, fetalHeartRate: 142, presentation: 'CEPHALIC', iptpSpDose: 3, llinGiven: true }
    });
    expect(res.status, res.text).toBe(201);
    const form = res.json.data.forms.at(-1);
    expect(form.pregnancyId).toBe(pregnancyId);
    expect(form.data.derived.gestation).toMatchObject({ weeks: 28, basis: 'LMP' });
    expect(form.data.derived.alerts).toEqual(['Hypertension', 'Possible pre-eclampsia: hypertension with proteinuria']);
  });

  it('forms cannot be tied to another woman’s pregnancy, and postnatal checks wait for the delivery', async () => {
    const other = await woman('Other');
    const otherVisit = await clinicVisit(other, 'ANTENATAL');
    expect((await post(`/encounters/${otherVisit}/forms`, 'nurse', { type: 'ANC_VISIT', pregnancyId, data: { bpSystolic: 110, bpDiastolic: 70 } })).json.code).toBe('PREGNANCY_MISMATCH');
    expect((await post(`/encounters/${ancVisitId}/forms`, 'nurse', { type: 'POSTNATAL_CHECK', pregnancyId, data: { mother: {} } })).json.code).toBe('PREGNANCY_WRONG_STATUS');
    expect((await post(`/encounters/${ancVisitId}/forms`, 'nurse', { type: 'NUTRITION_ASSESSMENT', pregnancyId, data: { weightKg: 70, nutritionDiagnosis: 'Normal', plan: 'None' } })).json.code).toBe('PREGNANCY_NOT_EXPECTED');
  });

  it('a delivery must be recorded on the mother’s own open visit', async () => {
    const stranger = await clinicVisit(await woman('Stranger'), 'ANTENATAL');
    const res = await post(`/maternity/pregnancies/${pregnancyId}/delivery`, 'nurse', { encounterId: stranger, deliveredAt: new Date().toISOString(), mode: 'SVD', babies: [{ sex: 'FEMALE', outcome: 'LIVE_BIRTH' }] });
    expect(res.json.code).toBe('ENCOUNTER_MISMATCH');
  });

  it('delivery of twins registers the live-born baby as a patient and closes the pregnancy', async () => {
    const res = await post(`/maternity/pregnancies/${pregnancyId}/delivery`, 'nurse', {
      encounterId: ancVisitId,
      deliveredAt: new Date().toISOString(),
      mode: 'SVD',
      bloodLossMl: 650,
      perineum: 'SECOND_DEGREE',
      oxytocinGiven: true,
      babies: [
        { sex: 'FEMALE', outcome: 'LIVE_BIRTH', birthWeightG: 2400, apgar1: 7, apgar5: 9 },
        { sex: 'MALE', outcome: 'FRESH_STILLBIRTH', birthWeightG: 1900 }
      ]
    });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.status).toBe('DELIVERED');
    const [first, second] = res.json.data.delivery.babies;
    expect(first.patient.firstName).toBe('Baby 1 of Journey');
    expect(first.patient.patientCode).toMatch(/^PAT-\d{4}$/);
    expect(second.patient).toBeNull();
    expect(res.json.data.delivery.gestationWeeks).toBe(28);

    const baby = await inA(() => prisma.patient.findUniqueOrThrow({ where: { id: first.patient.id } }));
    expect(baby).toMatchObject({ gender: 'Female', lastName: 'Mensah' });
    expect(baby.dateOfBirth).not.toBeNull();

    const visit = await get(`/encounters/${ancVisitId}`, 'nurse');
    const note = visit.json.data.notes.find((n: { type: string }) => n.type === 'DELIVERY');
    expect(note.assessment).toMatch(/Blood loss 650 ml \(postpartum haemorrhage\)/);

    expect((await post(`/maternity/pregnancies/${pregnancyId}/delivery`, 'nurse', { encounterId: ancVisitId, deliveredAt: new Date().toISOString(), mode: 'SVD', babies: [{ sex: 'FEMALE', outcome: 'LIVE_BIRTH' }] })).json.code).toBe('PREGNANCY_CLOSED');
  });

  it('after delivery: no more antenatal visits, and postnatal checks record the day and alerts', async () => {
    expect((await post(`/encounters/${ancVisitId}/forms`, 'nurse', { type: 'ANC_VISIT', pregnancyId, data: { bpSystolic: 110, bpDiastolic: 70 } })).json.code).toBe('PREGNANCY_WRONG_STATUS');
    // The delivery visit is closed before she comes back to the postnatal clinic.
    await post(`/encounters/${ancVisitId}/start-consultation`, 'doctor');
    await post(`/encounters/${ancVisitId}/diagnoses`, 'doctor', { code: 'O84.0', description: 'Multiple delivery, all spontaneous' });
    expect((await post(`/encounters/${ancVisitId}/complete`, 'doctor', { outcome: 'DISCHARGED' })).status).toBe(200);
    const pnc = await clinicVisit(patientId, 'POSTNATAL');
    const res = await post(`/encounters/${pnc}/forms`, 'nurse', {
      type: 'POSTNATAL_CHECK',
      pregnancyId,
      data: { mother: { temperatureC: 38.2, lochia: 'NORMAL', uterus: 'WELL_CONTRACTED', breastfeeding: 'EXCLUSIVE' }, baby: { temperatureC: 36.8, cord: 'CLEAN', feeding: 'GOOD' }, familyPlanningCounselled: true }
    });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.forms[0].data.derived).toMatchObject({ dayPostpartum: 0, alerts: ['Mother: fever (38.2 °C), consider sepsis'] });

    const record = await get(`/maternity/pregnancies/${pregnancyId}`, 'doctor');
    expect(record.json.data.forms.map((f: { type: string }) => f.type)).toEqual(['ANC_VISIT', 'POSTNATAL_CHECK']);
  });

  it('the register lists ongoing pregnancies, and another facility sees none of it', async () => {
    const list = await get('/maternity/pregnancies?status=ACTIVE', 'nurse');
    expect(list.json.data.items.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
    expect(list.json.data.items.length).toBeGreaterThanOrEqual(2);
    expect((await get(`/maternity/pregnancies/${pregnancyId}`, 'bravoNurse')).status).toBe(404);
  });
});

describe('maternity module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `M${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Maternity', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/maternity/pregnancies', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

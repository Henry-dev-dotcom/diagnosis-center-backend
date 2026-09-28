import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4C step 1: specialty clinics and structured clinical forms.

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

async function patient(label: string, dateOfBirth?: string) {
  return inA(async () =>
    (await prisma.patient.create({
      data: { patientCode: `PAT-CL-${label}-${randomUUID().slice(0, 4)}`, firstName: 'Clinic', lastName: label, gender: 'MALE', phone: '+233200000041', dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
    })).id
  );
}

async function clinicVisit(clinic: string, label: string, dateOfBirth?: string) {
  const patientId = await patient(label, dateOfBirth);
  const res = await post('/encounters', 'reception', { patientId, type: 'OPD', clinic, feeItemId: clinic === 'DENTAL' ? 'SVC-CONSULT-DENTAL' : undefined });
  expect(res.status, res.text).toBe(201);
  await post(`/encounters/${res.json.data.id}/start-consultation`, 'doctor');
  return { patientId, encounterId: res.json.data.id as string, visit: res.json.data };
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoDoctor', FACILITY_B.code, 'doctor', DEMO_USERS.doctor);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('clinic visits', () => {
  it('a visit is held in a clinic, charges that clinic’s fee, and the queue filters by clinic', async () => {
    const { encounterId, visit } = await clinicVisit('DENTAL', 'Fee');
    expect(visit.clinic).toBe('DENTAL');
    expect(visit.invoices[0].items[0].description).toBe('Dental consultation');
    const queue = await get('/encounters?status=ACTIVE&clinic=DENTAL', 'doctor');
    expect(queue.json.data.items.every((e: { clinic: string }) => e.clinic === 'DENTAL')).toBe(true);
    expect(queue.json.data.items.map((e: { id: string }) => e.id)).toContain(encounterId);
    const eye = await get('/encounters?status=ACTIVE&clinic=EYE', 'doctor');
    expect(eye.json.data.items.map((e: { id: string }) => e.id)).not.toContain(encounterId);
  });

  it('specialty clinics hold outpatient visits only', async () => {
    const res = await post('/encounters', 'reception', { patientId: await patient('Ed'), type: 'EMERGENCY', clinic: 'EYE' });
    expect(res.json.code).toBe('CLINIC_NEEDS_OPD');
  });
});

describe('dental chart', () => {
  let encounterId: string;
  let patientId: string;

  it('records teeth by FDI number and rejects impossible teeth or duplicates', async () => {
    ({ encounterId, patientId } = await clinicVisit('DENTAL', 'Teeth'));
    const bad = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'DENTAL_CHART', data: { teeth: [{ tooth: '19', condition: 'CARIES' }] } });
    expect(bad.status).toBe(400);
    const dup = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'DENTAL_CHART', data: { teeth: [{ tooth: '36', condition: 'CARIES' }, { tooth: '36', condition: 'FILLED' }] } });
    expect(dup.json.message).toMatch(/only once/);

    const res = await post(`/encounters/${encounterId}/forms`, 'doctor', {
      type: 'DENTAL_CHART',
      data: { teeth: [{ tooth: '36', condition: 'CARIES', surfaces: ['O', 'D'] }, { tooth: '48', condition: 'IMPACTED' }], oralHygiene: 'FAIR', treatmentsDone: [{ tooth: '36', procedure: 'Temporary filling' }], treatmentPlan: 'Review 48 with OPG', unexpected: 'dropped' }
    });
    expect(res.status, res.text).toBe(201);
    const form = res.json.data.forms.at(-1);
    expect(form.type).toBe('DENTAL_CHART');
    expect(form.data.teeth).toHaveLength(2);
    expect(form.data.unexpected).toBeUndefined();
    expect(form.author.name).toBeTruthy();
  });

  it('nurses cannot chart teeth', async () => {
    const res = await post(`/encounters/${encounterId}/forms`, 'nurse', { type: 'DENTAL_CHART', data: { teeth: [{ tooth: '11', condition: 'SOUND' }] } });
    expect(res.status).toBe(403);
  });

  it('corrections amend a form of the same type on the same visit', async () => {
    const original = (await get(`/encounters/${encounterId}`, 'doctor')).json.data.forms[0];
    const wrongType = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'EYE_EXAM', amendsId: original.id, data: { right: { unaided: '6/6' }, left: {} } });
    expect(wrongType.json.code).toBe('FORM_NOT_ON_ENCOUNTER');
    const fixed = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'DENTAL_CHART', amendsId: original.id, data: { teeth: [{ tooth: '37', condition: 'CARIES' }] } });
    expect(fixed.status, fixed.text).toBe(201);
    expect(fixed.json.data.forms).toHaveLength(2);
  });

  it('the patient’s charts are available on later visits, and not to another facility', async () => {
    const history = await get(`/patients/${patientId}/forms?type=DENTAL_CHART`, 'doctor');
    expect(history.status, history.text).toBe(200);
    expect(history.json.data.items).toHaveLength(2);
    expect(history.json.data.items[0].encounter.clinic).toBe('DENTAL');
    expect((await get(`/patients/${patientId}/forms`, 'bravoDoctor')).status).toBe(404);
  });
});

describe('eye, physiotherapy and nutrition forms', () => {
  it('eye exam accepts Snellen values and checks refraction', async () => {
    const { encounterId } = await clinicVisit('EYE', 'Eyes');
    const badAcuity = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'EYE_EXAM', data: { right: { unaided: 'good' }, left: {} } });
    expect(badAcuity.status).toBe(400);
    const noAxis = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'EYE_EXAM', data: { right: { unaided: '6/18', cylinder: -1.25 }, left: {} } });
    expect(noAxis.json.message).toMatch(/axis/);
    const ok = await post(`/encounters/${encounterId}/forms`, 'doctor', {
      type: 'EYE_EXAM',
      data: { right: { unaided: '6/18', pinhole: '6/9', iopMmHg: 16, sphere: -1.5, cylinder: -0.5, axis: 90 }, left: { unaided: 'cf', iopMmHg: 32 }, iopMethod: 'NON_CONTACT', impression: 'Myopia OD; raised IOP OS, ?glaucoma' }
    });
    expect(ok.status, ok.text).toBe(201);
    expect(ok.json.data.forms[0].data.left.unaided).toBe('CF');
  });

  it('physiotherapy assessment needs goals; a session needs a treatment', async () => {
    const { encounterId } = await clinicVisit('PHYSIOTHERAPY', 'Physio');
    expect((await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'PHYSIO_ASSESSMENT', data: { presentingComplaint: 'Low back pain', affectedArea: 'Lumbar' } })).status).toBe(400);
    expect((await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'PHYSIO_ASSESSMENT', data: { presentingComplaint: 'Low back pain 3 weeks', affectedArea: 'Lumbar spine', painScore: 7, goals: 'Pain below 3; return to work', plannedSessions: 6 } })).status).toBe(201);
    expect((await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'PHYSIO_SESSION', data: { treatments: [] } })).status).toBe(400);
    const session = await post(`/encounters/${encounterId}/forms`, 'doctor', { type: 'PHYSIO_SESSION', data: { sessionNumber: 1, treatments: ['TENS 15 min', 'McKenzie extensions'], painBefore: 7, painAfter: 5 } });
    expect(session.status, session.text).toBe(201);
  });

  it('nutrition assessment derives BMI for adults and the MUAC category for young children', async () => {
    const adult = await clinicVisit('DIETETICS', 'Adult', '1980-05-01');
    const a = await post(`/encounters/${adult.encounterId}/forms`, 'nurse', { type: 'NUTRITION_ASSESSMENT', data: { weightKg: 95, heightCm: 170, nutritionDiagnosis: 'Obesity', plan: 'Reduce sugary drinks; 30 min walking daily', followUpWeeks: 4 } });
    expect(a.status, a.text).toBe(201);
    expect(a.json.data.forms[0].data.derived).toMatchObject({ bmi: 32.9, bmiCategory: 'Obese' });

    const childDob = new Date(Date.now() - 20 * 30.5 * 86_400_000).toISOString().slice(0, 10);
    const child = await clinicVisit('DIETETICS', 'Child', childDob);
    const c = await post(`/encounters/${child.encounterId}/forms`, 'doctor', { type: 'NUTRITION_ASSESSMENT', data: { weightKg: 8.1, heightCm: 78, muacCm: 11.2, nutritionDiagnosis: 'Severe wasting', plan: 'RUTF and weekly review' } });
    expect(c.status, c.text).toBe(201);
    expect(c.json.data.forms[0].data.derived.muacCategory).toBe('Severe acute malnutrition');
    expect(c.json.data.forms[0].data.derived.bmi).toBeUndefined();
  });

  it('forms cannot be added to a closed visit', async () => {
    const patientId = await patient('Closed');
    const visit = await post('/encounters', 'reception', { patientId, type: 'OPD', clinic: 'DIETETICS' });
    await post(`/encounters/${visit.json.data.id}/cancel`, 'reception', { reason: 'Registered in error' });
    const res = await post(`/encounters/${visit.json.data.id}/forms`, 'doctor', { type: 'NUTRITION_ASSESSMENT', data: { weightKg: 60, nutritionDiagnosis: 'Normal', plan: 'None needed' } });
    expect(res.json.code).toBe('ENCOUNTER_CLOSED');
  });
});

describe('clinic modules', () => {
  it('a facility without the dental module can neither open dental visits nor chart teeth', async () => {
    const code = `D${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Dental', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const pid = (await post('/patients', 'clinic', { firstName: 'No', lastName: 'Dental', gender: 'FEMALE', phone: '+233200000042' })).json.data.id;
    const dental = await post('/encounters', 'clinic', { patientId: pid, type: 'OPD', clinic: 'DENTAL' });
    expect(dental.status).toBe(403);
    expect(dental.json.code).toBe('MODULE_DISABLED');
    const general = await post('/encounters', 'clinic', { patientId: pid, type: 'OPD' });
    expect(general.status, general.text).toBe(201);
    await post(`/encounters/${general.json.data.id}/start-consultation`, 'clinic');
    const chart = await post(`/encounters/${general.json.data.id}/forms`, 'clinic', { type: 'DENTAL_CHART', data: { teeth: [{ tooth: '11', condition: 'SOUND' }] } });
    expect(chart.status).toBe(403);
    expect(chart.json.code).toBe('MODULE_DISABLED');
  });
});

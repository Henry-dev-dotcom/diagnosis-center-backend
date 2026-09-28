import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4B: theatre booking, the WHO surgical safety checklist and the operation note.

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

/** A patient in an open OPD visit, seen by the doctor. */
async function openVisit(label: string, consult = true) {
  const patientId = await inA(async () =>
    (await prisma.patient.create({ data: { patientCode: `PAT-TH-${label}-${randomUUID().slice(0, 4)}`, firstName: 'Theatre', lastName: label, gender: 'FEMALE', phone: '+233200000031' } })).id
  );
  const visit = await post('/encounters', 'reception', { patientId, type: 'OPD' });
  expect(visit.status, visit.text).toBe(201);
  if (consult) await post(`/encounters/${visit.json.data.id}/start-consultation`, 'doctor');
  return { patientId, encounterId: visit.json.data.id as string };
}

const slot = (hhmm: string) => `2027-01-11T${hhmm}:00.000Z`;
const book = (as: string, encounterId: string, overrides: Record<string, unknown> = {}) =>
  post('/theatre/surgeries', as, { encounterId, theatreId: 'THR-MAIN', procedureItemId: 'SVC-PROC-APPX', scheduledStart: slot('08:00'), durationMinutes: 90, ...overrides });

const SIGN_IN = {
  anaesthesia: 'GENERAL',
  answers: { identityConfirmed: true, siteMarked: 'YES', anaesthesiaCheckDone: true, pulseOximeterOn: true, knownAllergy: false, difficultAirway: false, bloodLossRisk: false }
};
const TIME_OUT = { answers: { teamIntroduced: true, patientProcedureSiteConfirmed: true, antibioticProphylaxis: 'GIVEN', imagingDisplayed: 'NOT_APPLICABLE', criticalEventsReviewed: true } };
const SIGN_OUT = {
  answers: { procedureRecorded: true, countsCorrect: true, specimensLabelled: 'YES' },
  procedurePerformed: 'Open appendicectomy',
  findings: 'Inflamed, non-perforated appendix.',
  bloodLossMl: 50,
  specimens: 'Appendix to histology',
  postOpPlan: 'IV fluids, analgesia, oral fluids after 6 hours.'
};

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoDoctor', FACILITY_B.code, 'doctor', DEMO_USERS.doctor);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('an operation from booking to operation note', () => {
  let surgeryId: string;
  let encounterId: string;

  it('the doctor books it; they are the surgeon and the procedure comes from the catalog', async () => {
    ({ encounterId } = await openVisit('Appendix'));
    const res = await book('doctor', encounterId, { urgency: 'URGENT', preopDiagnosis: 'Acute appendicitis' });
    expect(res.status, res.text).toBe(201);
    surgeryId = res.json.data.id;
    expect(res.json.data).toMatchObject({ status: 'SCHEDULED', procedureName: 'Appendicectomy', urgency: 'URGENT', scheduledEnd: slot('09:30') });
    expect(res.json.data.surgeryCode).toMatch(/^SRG-\d{4}-\d{4}$/);
    expect(res.json.data.surgeon.name).toBeTruthy();
  });

  it('nurses cannot book operations', async () => {
    const { encounterId: other } = await openVisit('NurseBook');
    expect((await book('nurse', other, { scheduledStart: slot('13:00') })).status).toBe(403);
  });

  it('sign in needs every safety confirmation, then moves the case into theatre', async () => {
    const missing = await post(`/theatre/surgeries/${surgeryId}/sign-in`, 'nurse', { ...SIGN_IN, answers: { ...SIGN_IN.answers, pulseOximeterOn: false } });
    expect(missing.status).toBe(400);
    const res = await post(`/theatre/surgeries/${surgeryId}/sign-in`, 'nurse', SIGN_IN);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.status).toBe('IN_THEATRE');
    expect(res.json.data.checklist.signIn).toMatchObject({ identityConfirmed: true, siteMarked: 'YES' });
    expect((await post(`/theatre/surgeries/${surgeryId}/sign-in`, 'nurse', SIGN_IN)).json.code).toBe('SURGERY_WRONG_STATUS');
  });

  it('the operation note cannot be written before the time out', async () => {
    const res = await post(`/theatre/surgeries/${surgeryId}/complete`, 'doctor', SIGN_OUT);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('TIME_OUT_REQUIRED');
  });

  it('time out starts the operation, after which it cannot be cancelled', async () => {
    const res = await post(`/theatre/surgeries/${surgeryId}/time-out`, 'nurse', TIME_OUT);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.startedAt).toBeTruthy();
    expect((await post(`/theatre/surgeries/${surgeryId}/cancel`, 'doctor', { reason: 'Changed plan' })).json.code).toBe('SURGERY_STARTED');
  });

  it('only a doctor signs out; the note joins the visit record and the procedure is billed', async () => {
    expect((await post(`/theatre/surgeries/${surgeryId}/complete`, 'nurse', SIGN_OUT)).status).toBe(403);
    const res = await post(`/theatre/surgeries/${surgeryId}/complete`, 'doctor', SIGN_OUT);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toMatchObject({ status: 'COMPLETED', procedurePerformed: 'Open appendicectomy', bloodLossMl: 50 });

    const visit = await get(`/encounters/${encounterId}`, 'doctor');
    const note = visit.json.data.notes.find((n: { type: string }) => n.type === 'OPERATION');
    expect(note.subjective).toMatch(/Open appendicectomy/);
    expect(note.plan).toMatch(/IV fluids/);

    const invoice = await inA(() => prisma.invoice.findFirst({ where: { encounterId, items: { some: { catalogItemId: 'SVC-PROC-APPX' } } }, include: { items: true } }));
    expect(Number(invoice?.total)).toBe(2500);
    expect(invoice?.items[0].description).toMatch(/Appendicectomy \(SRG-/);
  });

  it('another facility cannot see the operation', async () => {
    expect((await get(`/theatre/surgeries/${surgeryId}`, 'bravoDoctor')).status).toBe(404);
  });
});

describe('theatre booking rules', () => {
  it('refuses overlapping cases in one theatre, but allows back-to-back and other theatres', async () => {
    const { encounterId } = await openVisit('Overlap');
    const first = await book('doctor', encounterId, { scheduledStart: slot('10:00'), durationMinutes: 60 });
    expect(first.status, first.text).toBe(201);

    const clash = await book('doctor', encounterId, { scheduledStart: slot('10:30'), durationMinutes: 60 });
    expect(clash.status).toBe(409);
    expect(clash.json.code).toBe('THEATRE_DOUBLE_BOOKED');

    expect((await book('doctor', encounterId, { scheduledStart: slot('10:30'), durationMinutes: 60, theatreId: 'THR-MINOR' })).status).toBe(201);
    expect((await book('doctor', encounterId, { scheduledStart: slot('11:00'), durationMinutes: 30 })).status).toBe(201);
  });

  it('two bookings racing for one slot: exactly one succeeds', async () => {
    const { encounterId } = await openVisit('Race');
    const results = await Promise.all([1, 2].map(() => book('doctor', encounterId, { scheduledStart: slot('14:00'), durationMinutes: 60 })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('rebooking checks the new slot, and cancelling frees the old one', async () => {
    const { encounterId } = await openVisit('Rebook');
    const a = await book('doctor', encounterId, { scheduledStart: slot('16:00'), durationMinutes: 60 });
    const b = await book('doctor', encounterId, { scheduledStart: slot('17:00'), durationMinutes: 60 });
    const onto = await patch(`/theatre/surgeries/${b.json.data.id}`, 'doctor', { scheduledStart: slot('16:30') });
    expect(onto.json.code).toBe('THEATRE_DOUBLE_BOOKED');

    const cancelled = await post(`/theatre/surgeries/${a.json.data.id}/cancel`, 'doctor', { reason: 'Patient not fasted' });
    expect(cancelled.json.data.status).toBe('CANCELLED');
    const moved = await patch(`/theatre/surgeries/${b.json.data.id}`, 'doctor', { scheduledStart: slot('16:00') });
    expect(moved.status, moved.text).toBe(200);
    expect(moved.json.data.scheduledEnd).toBe(slot('17:00'));
  });

  it('operations are booked on open visits only', async () => {
    const { encounterId } = await openVisit('Closed', false);
    const cancelled = await post(`/encounters/${encounterId}/cancel`, 'reception', { reason: 'Registered in error' });
    expect(cancelled.status, cancelled.text).toBe(200);
    const res = await book('doctor', encounterId, { scheduledStart: slot('19:00') });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ENCOUNTER_CLOSED');
  });

  it('admitting the patient moves a booked operation onto the inpatient stay', async () => {
    const { patientId, encounterId } = await openVisit('Admit');
    const booked = await book('doctor', encounterId, { procedureItemId: 'SVC-PROC-HERN', scheduledStart: slot('20:00'), durationMinutes: 60 });
    await post(`/encounters/${encounterId}/diagnoses`, 'doctor', { code: 'K40.9', description: 'Inguinal hernia' });
    const admitted = await post('/inpatient/admissions', 'doctor', { patientId, wardId: 'WRD-FMW', bedId: 'BED-FMW-F6', reason: 'For hernia repair', sourceEncounterId: encounterId });
    expect(admitted.status, admitted.text).toBe(201);
    const moved = await get(`/theatre/surgeries/${booked.json.data.id}`, 'doctor');
    expect(moved.json.data.encounter).toMatchObject({ id: admitted.json.data.encounter.id, type: 'INPATIENT' });
    expect(moved.json.data.encounter.admission.bed.label).toBe('F6');
  });

  it('the day list shows the cases for that day in order', async () => {
    const res = await get(`/theatre/surgeries?date=2027-01-11&theatreId=THR-MAIN`, 'nurse');
    expect(res.status, res.text).toBe(200);
    const starts = res.json.data.items.map((s: { scheduledStart: string }) => s.scheduledStart);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect([...starts].sort()).toEqual(starts);
  });

  it('the database rejects linking an operation to another facility’s theatre', async () => {
    const { patientId, encounterId } = await openVisit('Guard');
    await expect(
      inA(() =>
        prisma.surgery.create({
          data: { surgeryCode: `SRG-X-${randomUUID().slice(0, 6)}`, patientId, encounterId, theatreId: 'B-THR-MAIN', procedureName: 'x', scheduledStart: new Date(), scheduledEnd: new Date() }
        })
      )
    ).rejects.toThrow(/Cross-facility reference rejected/);
  });
});

describe('theatre module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `T${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Theatre', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/theatre/surgeries', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

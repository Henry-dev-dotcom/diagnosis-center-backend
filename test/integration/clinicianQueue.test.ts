import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  The clinician's queue and the "Send to Lab & Suspend" workflow.

  The behaviour that matters most is that a paused visit finds its own way back: it
  sits in Pending Labs while a test is outstanding, moves to Review Ready when the lab
  signs off, and moves back to Pending Labs if the lab withdraws the result - all worked
  out from the tests themselves, with nothing for the lab to remember to do.
  These tests drive the real lab flow to prove it.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function api(path: string, init: RequestInit & { as?: string; facility?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.as) headers.set('authorization', `Bearer ${tokens[`${init.facility ?? FACILITY_A.code}:${init.as}`]}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}
const post = (path: string, as: string, body: unknown = {}, facility?: string) => api(path, { method: 'POST', as, facility, body: JSON.stringify(body) });
const put = (path: string, as: string, body: unknown = {}, facility?: string) => api(path, { method: 'PUT', as, facility, body: JSON.stringify(body) });
const get = (path: string, as: string, facility?: string) => api(path, { as, facility });
const del = (path: string, as: string, facility?: string) => api(path, { method: 'DELETE', as, facility });

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

let counter = 0;
/** A patient who has been triaged and is waiting for the doctor. */
async function waitingPatient(label: string) {
  counter += 1;
  const patientId = await runWithFacility(FACILITY_A.id, async () =>
    (await prisma.patient.create({ data: { patientCode: `PAT-QUEUE-${counter}`, firstName: label, lastName: 'Queue', phone: `+23320000${String(1000 + counter)}` } })).id
  );
  const started = await post('/encounters', 'reception', { patientId, type: 'OPD', chiefComplaint: `${label} complaint` });
  expect(started.status, started.text).toBe(201);
  const encounterId = started.json.data.id as string;
  const triaged = await post(`/encounters/${encounterId}/vitals`, 'nurse', { temperatureC: 38.1, pulseBpm: 90, triageLevel: 'YELLOW', completeTriage: true });
  expect(triaged.status, triaged.text).toBe(201);
  return { patientId, encounterId };
}

/** A patient the doctor is seeing now. */
async function consultingPatient(label: string) {
  const visit = await waitingPatient(label);
  const started = await post(`/encounters/${visit.encounterId}/start-consultation`, 'doctor');
  expect(started.status, started.text).toBe(200);
  return visit;
}

const inQueue = async (bucket: 'new' | 'inConsultation' | 'pendingLabs' | 'reviewReady', encounterId: string, as = 'doctor') => {
  const res = await get('/encounters/queue', as);
  expect(res.status, res.text).toBe(200);
  return (res.json.data[bucket] as Array<{ id: string }>).some((e) => e.id === encounterId);
};
const queueState = async (encounterId: string) => (await get(`/encounters/${encounterId}`, 'doctor')).json.data.queueState as string;

/** Takes the order from the visit through the lab to a signed-off result. Returns what is needed to withdraw it. */
async function labSignsOff(encounterId: string, orderId: string) {
  const accepted = await post('/lab/samples/accept', 'lab', { orderId });
  expect(accepted.status, accepted.text).toBe(201);
  const sampleId = accepted.json.data.samples[0].id;
  const draft = await post('/lab/results', 'lab', { sampleId, parameters: [{ name: 'Haemoglobin', value: '12.5', unit: 'g/dL' }] });
  expect(draft.status, draft.text).toBe(201);
  const resultId = draft.json.data.id as string;
  await post('/lab/results/submit-review', 'lab', { resultId });
  const signed = await post(`/lab/results/${resultId}/sign-off`, 'lab', { decision: 'SIGNED_OFF' });
  expect(signed.status, signed.text).toBe(200);
  return resultId;
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'nurse', 'doctor', 'lab', 'admin'] as const) await signIn(FACILITY_A.code, user);
  await signIn(FACILITY_B.code, 'admin');
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('who is in the queue', () => {
  it('lists a triaged patient under New Patients, and not one who has not been triaged yet', async () => {
    const waiting = await waitingPatient('Ama');
    expect(await inQueue('new', waiting.encounterId)).toBe(true);

    counter += 1;
    const untriagedPatient = await runWithFacility(FACILITY_A.id, async () =>
      (await prisma.patient.create({ data: { patientCode: `PAT-QUEUE-${counter}`, firstName: 'Kofi', lastName: 'Untriaged', phone: `+23320000${1000 + counter}` } })).id
    );
    const untriaged = await post('/encounters', 'reception', { patientId: untriagedPatient, type: 'OPD' });
    expect(await inQueue('new', untriaged.json.data.id)).toBe(false);
  });

  it('reports counts that match the lists, and names the patient and complaint the doctor needs', async () => {
    const waiting = await waitingPatient('Esi');
    const res = await get('/encounters/queue', 'doctor');
    const data = res.json.data;
    expect(data.counts.new).toBe(data.new.length);
    expect(data.counts.pendingLabs).toBe(data.pendingLabs.length);
    expect(data.counts.reviewReady).toBe(data.reviewReady.length);
    const row = data.new.find((e: { id: string }) => e.id === waiting.encounterId);
    expect(row.patient.firstName).toBe('Esi');
    expect(row.chiefComplaint).toBe('Esi complaint');
    expect(row.queueState).toBe('NEW');
  });

  it('moves a patient from New Patients to In Consultation when the doctor starts', async () => {
    const waiting = await waitingPatient('Yaw');
    await post(`/encounters/${waiting.encounterId}/start-consultation`, 'doctor');
    expect(await inQueue('new', waiting.encounterId)).toBe(false);
    expect(await inQueue('inConsultation', waiting.encounterId)).toBe(true);
  });

  it('lets the admin see everyone\'s paused patients, while a doctor sees their own', async () => {
    const visit = await consultingPatient('Kojo');
    await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    expect(await inQueue('pendingLabs', visit.encounterId, 'doctor')).toBe(true);
    expect(await inQueue('pendingLabs', visit.encounterId, 'admin')).toBe(true);
  });
});

describe('Send to Lab & Suspend', () => {
  it('needs the consultation to have started', async () => {
    const waiting = await waitingPatient('Abena');
    const res = await post(`/encounters/${waiting.encounterId}/suspend`, 'doctor');
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ENCOUNTER_NOT_IN_CONSULTATION');
  });

  it('refuses to pause a visit with nothing to wait for', async () => {
    const visit = await consultingPatient('Nana');
    const res = await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('NOTHING_TO_WAIT_FOR');
    expect(await queueState(visit.encounterId)).toBe('IN_CONSULTATION');
  });

  it('is only for people who consult: the nurse and reception cannot pause a visit', async () => {
    const visit = await consultingPatient('Akua');
    await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    expect((await post(`/encounters/${visit.encounterId}/suspend`, 'nurse')).status).toBe(403);
    expect((await post(`/encounters/${visit.encounterId}/suspend`, 'reception')).status).toBe(403);
  });

  it('parks the visit under Pending Labs while a test is outstanding, and will not pause it twice', async () => {
    const visit = await consultingPatient('Mensah');
    const order = await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    expect(order.status, order.text).toBe(201);

    const paused = await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    expect(paused.status, paused.text).toBe(200);
    expect(paused.json.data.status, 'the visit stays open in consultation').toBe('IN_CONSULTATION');
    expect(paused.json.data.suspendedAt).not.toBeNull();
    expect(paused.json.data.queueState).toBe('PENDING_LABS');
    expect(paused.json.data.tests.total).toBe(1);
    expect(paused.json.data.tests.ready).toBe(0);

    expect(await inQueue('pendingLabs', visit.encounterId)).toBe(true);
    expect(await inQueue('inConsultation', visit.encounterId)).toBe(false);
    expect(await inQueue('reviewReady', visit.encounterId)).toBe(false);

    const again = await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    expect(again.status).toBe(409);
    expect(again.json.code).toBe('ENCOUNTER_ALREADY_SUSPENDED');
  });

  it('can be taken back by the doctor without waiting for the result', async () => {
    const visit = await consultingPatient('Adwoa');
    await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');

    const resumed = await post(`/encounters/${visit.encounterId}/resume`, 'doctor');
    expect(resumed.status, resumed.text).toBe(200);
    expect(resumed.json.data.suspendedAt).toBeNull();
    expect(resumed.json.data.queueState).toBe('IN_CONSULTATION');
    expect(await inQueue('inConsultation', visit.encounterId)).toBe(true);

    const notPaused = await post(`/encounters/${visit.encounterId}/resume`, 'doctor');
    expect(notPaused.status).toBe(409);
    expect(notPaused.json.code).toBe('ENCOUNTER_NOT_SUSPENDED');
  });
});

describe('the visit finds its own way back', () => {
  it('moves to Review Ready when the lab signs off, back to Pending Labs if the result is withdrawn, and Review Ready again when it is re-sent', async () => {
    const visit = await consultingPatient('Fiifi');
    const order = await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    const orderId = order.json.data.orders[0].id as string;
    await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    expect(await queueState(visit.encounterId)).toBe('PENDING_LABS');

    const resultId = await labSignsOff(visit.encounterId, orderId);
    expect(await queueState(visit.encounterId), 'signed off means the doctor can carry on').toBe('REVIEW_READY');
    expect(await inQueue('reviewReady', visit.encounterId)).toBe(true);
    expect(await inQueue('pendingLabs', visit.encounterId)).toBe(false);
    const ready = (await get(`/encounters/${visit.encounterId}`, 'doctor')).json.data;
    expect(ready.tests).toMatchObject({ total: 1, ready: 1, outstanding: [] });

    const withdrawn = await post(`/lab/results/${resultId}/reverse`, 'lab', { reason: 'Value transcribed wrongly; the sample is being re-checked' });
    expect(withdrawn.status, withdrawn.text).toBe(200);
    expect(await queueState(visit.encounterId), 'a withdrawn result must not leave the patient looking ready').toBe('PENDING_LABS');
    expect(await inQueue('pendingLabs', visit.encounterId)).toBe(true);

    const resigned = await post(`/lab/results/${resultId}/sign-off`, 'lab', { decision: 'SIGNED_OFF' });
    expect(resigned.status, resigned.text).toBe(200);
    expect(await queueState(visit.encounterId)).toBe('REVIEW_READY');
  });

  it('does not wait for a test the doctor cancelled', async () => {
    const visit = await consultingPatient('Efua');
    const order = await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    const orderId = order.json.data.orders[0].id as string;
    await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');

    await runWithFacility(FACILITY_A.id, () => prisma.orderItem.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } }));
    expect(await queueState(visit.encounterId)).toBe('REVIEW_READY');
  });

  it('closes cleanly: completing the visit takes it out of every list and clears the pause', async () => {
    const visit = await consultingPatient('Kwabena');
    const order = await post(`/encounters/${visit.encounterId}/orders`, 'doctor', { items: [{ catalogItemId: 't1' }] });
    await labSignsOff(visit.encounterId, order.json.data.orders[0].id);
    await post(`/encounters/${visit.encounterId}/suspend`, 'doctor');
    await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { note: 'half written' } });
    await post(`/encounters/${visit.encounterId}/diagnoses`, 'doctor', { code: 'B54', description: 'Unspecified malaria', type: 'PRIMARY' });

    const done = await post(`/encounters/${visit.encounterId}/complete`, 'doctor', { outcome: 'DISCHARGED' });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data.suspendedAt).toBeNull();
    for (const bucket of ['new', 'inConsultation', 'pendingLabs', 'reviewReady'] as const) expect(await inQueue(bucket, visit.encounterId)).toBe(false);

    const drafts = await runWithFacility(FACILITY_A.id, () => prisma.encounterDraft.count({ where: { encounterId: visit.encounterId } }));
    expect(drafts, 'a finished visit must not keep anyone\'s half-written notes').toBe(0);
  });
});

describe('drafts', () => {
  it('keeps a clinician\'s unsaved work, replaces it on each save, and can discard it', async () => {
    const visit = await consultingPatient('Draftee');
    const empty = await get(`/encounters/${visit.encounterId}/draft`, 'doctor');
    expect(empty.status).toBe(200);
    expect(empty.json.data).toEqual({ data: null, updatedAt: null });

    const first = await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { subjective: 'Fever for three days', tab: 'consultation' } });
    expect(first.status, first.text).toBe(200);
    const second = await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { subjective: 'Fever for three days, now vomiting' } });
    expect(second.json.data.data).toEqual({ subjective: 'Fever for three days, now vomiting' });

    const read = await get(`/encounters/${visit.encounterId}/draft`, 'doctor');
    expect(read.json.data.data.subjective).toContain('vomiting');

    const rows = await runWithFacility(FACILITY_A.id, () => prisma.encounterDraft.count({ where: { encounterId: visit.encounterId } }));
    expect(rows, 'one draft per clinician per visit').toBe(1);

    expect((await del(`/encounters/${visit.encounterId}/draft`, 'doctor')).status).toBe(200);
    expect((await get(`/encounters/${visit.encounterId}/draft`, 'doctor')).json.data.data).toBeNull();
  });

  it('is private to the clinician who wrote it', async () => {
    const visit = await consultingPatient('Private');
    await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { subjective: 'For the doctor only' } });
    const adminView = await get(`/encounters/${visit.encounterId}/draft`, 'admin');
    expect(adminView.json.data.data, 'another user must not read this clinician\'s draft').toBeNull();
  });

  it('is only for people who consult, and refuses an oversized draft', async () => {
    const visit = await consultingPatient('Limits');
    expect((await put(`/encounters/${visit.encounterId}/draft`, 'nurse', { data: { a: 'b' } })).status).toBe(403);
    expect((await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { huge: 'x'.repeat(120_000) } })).status).toBe(400);
    expect((await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: 'not an object' })).status).toBe(400);
  });

  it('cannot be saved on a closed visit, and the audit trail records the save but never the words', async () => {
    const visit = await consultingPatient('Audited');
    await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { subjective: 'CONFIDENTIAL-TEXT-12345' } });
    const entries = await runWithFacility(FACILITY_A.id, () => prisma.auditLog.findMany({ where: { entityId: visit.encounterId, action: 'ENCOUNTER_DRAFT_SAVED' } }));
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain('CONFIDENTIAL-TEXT-12345');

    await post(`/encounters/${visit.encounterId}/diagnoses`, 'doctor', { description: 'Viral illness', type: 'PRIMARY' });
    await post(`/encounters/${visit.encounterId}/complete`, 'doctor', { outcome: 'DISCHARGED' });
    const late = await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { a: 'b' } });
    expect(late.status).toBe(409);
    expect(late.json.code).toBe('ENCOUNTER_CLOSED');
  });

  it('belongs to one facility: another hospital cannot reach it', async () => {
    const visit = await consultingPatient('Tenant');
    await put(`/encounters/${visit.encounterId}/draft`, 'doctor', { data: { subjective: 'Facility A only' } });
    expect((await get(`/encounters/${visit.encounterId}/draft`, 'admin', FACILITY_B.code)).status).toBe(404);
    expect((await post(`/encounters/${visit.encounterId}/suspend`, 'admin', {}, FACILITY_B.code)).status).toBe(404);
  });
});

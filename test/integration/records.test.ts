import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 6: the patient chart, its access log, and release of information.

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

const request = (body: Record<string, unknown>) => post('/records/requests', 'reception', { patientId: 'PAT-0001', requesterName: 'Demo Insurance claims desk', requesterType: 'INSURER', purpose: 'Claim assessment', scope: 'Discharge summary, September 2026', ...body });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['admin', 'doctor', 'reception', 'billing'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoDoctor', FACILITY_B.code, 'doctor', DEMO_USERS.doctor);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('the patient chart', () => {
  it('any chart reader can find any patient, not only their own', async () => {
    const res = await get('/records/patients?search=Nana', 'doctor');
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.items.map((p: { patientCode: string }) => p.patientCode)).toContain('PAT-0003');
    expect((await get('/records/patients?search=N', 'doctor')).status).toBe(400);
  });

  it('needs a stated purpose, and gathers the record from every department', async () => {
    expect((await get('/records/patients/PAT-0003/chart', 'doctor')).status).toBe(400);
    const res = await get('/records/patients/PAT-0003/chart?purpose=TREATMENT', 'doctor');
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.patient).toMatchObject({ patientCode: 'PAT-0003' });
    // The seeded ongoing pregnancy appears alongside the rest of the record.
    expect(res.json.data.pregnancies[0]).toMatchObject({ status: 'ACTIVE' });
    for (const section of ['problems', 'encounters', 'admissions', 'surgeries', 'immunizations', 'prescriptions', 'orders']) expect(Array.isArray(res.json.data[section])).toBe(true);
  });

  it('every opening is logged, and only the administrator sees the log', async () => {
    await get('/records/patients/PAT-0003/chart?purpose=BILLING&note=Invoice%20query', 'reception');
    expect((await get('/records/patients/PAT-0003/access-log', 'doctor')).status).toBe(403);
    const log = await get('/records/patients/PAT-0003/access-log', 'admin');
    expect(log.json.data.items.slice(0, 2).map((a: { purpose: string; user: { role: string } }) => [a.purpose, a.user.role])).toEqual([['BILLING', 'RECEPTIONIST'], ['TREATMENT', 'DOCTOR']]);
  });

  it('billing staff cannot open charts, and another facility cannot see this patient', async () => {
    expect((await get('/records/patients/PAT-0003/chart?purpose=BILLING', 'billing')).status).toBe(403);
    expect((await get('/records/patients/PAT-0003/chart?purpose=TREATMENT', 'bravoDoctor')).status).toBe(404);
  });
});

describe('release of information', () => {
  it('records leave only with consent, approved by someone other than the logger', async () => {
    const noConsent = await request({});
    expect(noConsent.status, noConsent.text).toBe(201);
    expect(noConsent.json.data.requestCode).toMatch(/^ROI-\d{4}-\d{4}$/);
    expect((await post(`/records/requests/${noConsent.json.data.id}/release`, 'reception', { method: 'Email' })).json.code).toBe('NOT_APPROVED');
    expect((await post(`/records/requests/${noConsent.json.data.id}/decision`, 'admin', { decision: 'APPROVE' })).json.code).toBe('CONSENT_REQUIRED');
    expect((await post(`/records/requests/${noConsent.json.data.id}/decision`, 'admin', { decision: 'REFUSE' })).json.code).toBe('NOTE_REQUIRED');
    expect((await post(`/records/requests/${noConsent.json.data.id}/decision`, 'admin', { decision: 'REFUSE', note: 'No signed consent from the patient' })).json.data.status).toBe('REFUSED');

    const withConsent = await request({ consentObtained: true, consentReference: 'Consent form CF-2026-091' });
    const approved = await post(`/records/requests/${withConsent.json.data.id}/decision`, 'admin', { decision: 'APPROVE' });
    expect(approved.json.data).toMatchObject({ status: 'APPROVED' });
    const released = await post(`/records/requests/${withConsent.json.data.id}/release`, 'reception', { method: 'Sealed printout collected by courier' });
    expect(released.json.data).toMatchObject({ status: 'RELEASED', releaseMethod: 'Sealed printout collected by courier' });
    expect(released.json.data.releasedBy.name).toBeTruthy();
  });

  it('court and police requests need the order reference instead of consent', async () => {
    const court = await request({ requesterName: 'District Court, Accra', requesterType: 'COURT_OR_POLICE', purpose: 'Subpoena', scope: 'Emergency visit notes' });
    expect((await post(`/records/requests/${court.json.data.id}/decision`, 'admin', { decision: 'APPROVE' })).json.code).toBe('COURT_ORDER_REQUIRED');
    const ok = await post(`/records/requests/${court.json.data.id}/decision`, 'admin', { decision: 'APPROVE', consentReference: 'Court order DC/ACC/2026/551' });
    expect(ok.json.data).toMatchObject({ status: 'APPROVED', consentReference: 'Court order DC/ACC/2026/551' });
  });

  it('nobody approves a request they logged themselves', async () => {
    const own = await post('/records/requests', 'admin', { patientId: 'PAT-0001', requesterName: 'Patient', requesterType: 'PATIENT', purpose: 'Own copy', scope: 'Lab results', consentObtained: true });
    expect((await post(`/records/requests/${own.json.data.id}/decision`, 'admin', { decision: 'APPROVE' })).json.code).toBe('RECORD_SELF_APPROVAL');
  });
});

describe('medical records module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `M${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Records', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/records/requests', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

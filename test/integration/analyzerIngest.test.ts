import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  Analyzers filing their own results.

  The point of the feature is that nobody retypes numbers. The point of these
  tests is the three things that must stay true while nobody retypes them:
  a machine never releases a result, a value is never put in a field we are not
  sure of, and a payload is never lost.
*/

let server: Server;
let baseUrl: string;

async function api(path: string, init: RequestInit & { token?: string; deviceKey?: string } = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.deviceKey) headers.set('x-analyzer-key', init.deviceKey);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

async function token(facilityCode: string, username: keyof typeof DEMO_USERS) {
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode, username, password: DEMO_USERS[username] }) });
  expect(res.status, res.text).toBe(200);
  return res.json.data.accessToken as string;
}

const post = (path: string, tokenValue: string, body: unknown = {}) => api(path, { method: 'POST', token: tokenValue, body: JSON.stringify(body) });

/** Sends a payload the way an instrument's bridge would: raw text, device key. */
const send = (payload: string, deviceKey: string, contentType = 'text/plain') =>
  api('/integrations/analyzers/results', { method: 'POST', deviceKey, body: payload, headers: { 'content-type': contentType } });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Registers an analyzer and returns its id and its one-time key. */
async function registerDevice(facilityCode: string, overrides: Record<string, unknown> = {}) {
  const labToken = await token(facilityCode, 'lab');
  const created = await post('/lab/analyzers', labToken, { name: 'Bench analyzer', protocol: 'CSV', ...overrides });
  expect(created.status, created.text).toBe(201);
  return { labToken, deviceId: created.json.data.device.id as string, apiKey: created.json.data.apiKey as string };
}

/** Orders a test, confirms it and accepts the sample, returning the sample code. */
async function acceptedSample(catalogItemId: string, patientCode: string, facility = FACILITY_A) {
  const facilityCode = facility.code;
  // Both facilities hold the same demo data; only the row ids carry a prefix.
  const patientId = `${facility.idPrefix}${patientCode}`;
  const catalogId = `${facility.idPrefix}${catalogItemId}`;
  const doctorToken = await token(facilityCode, 'doctor');
  const receptionToken = await token(facilityCode, 'reception');
  const labToken = await token(facilityCode, 'lab');

  const created = await post('/doctor/orders', doctorToken, { patientId, urgency: 'ROUTINE', items: [{ catalogItemId: catalogId }] });
  expect(created.status, created.text).toBe(201);
  const orderId = created.json.data.id as string;

  const confirmed = await post(`/reception/orders/${orderId}/confirm`, receptionToken, { invoiceNow: true });
  expect(confirmed.status, confirmed.text).toBeLessThan(300);

  const accepted = await post('/lab/samples/accept', labToken, { orderId });
  expect(accepted.status, accepted.text).toBe(201);
  const sample = accepted.json.data.samples[0];
  return { orderId, sampleId: sample.id as string, sampleCode: sample.sampleCode as string, labToken };
}

const csv = (rows: string[]) => ['sample,test,value,unit,flag', ...rows].join('\n');

describe('an analyzer filing a result', () => {
  it('lands as a draft on the bench, flagged against our own ranges, attributed to no person', async () => {
    const { apiKey, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleCode, sampleId } = await acceptedSample('t1', 'PAT-0001');

    // WBC 22.1 is above the seeded critical high of 20; Hemoglobin 13.0 is normal.
    const response = await send(csv([`${sampleCode},WBC,22.1,10*9/L,H`, `${sampleCode},Hemoglobin,13.0,g/dL,N`]), apiKey);
    expect(response.status, response.text).toBe(202);
    expect(response.json.data).toMatchObject({ status: 'APPLIED', applied: 2, skipped: 0 });

    const result = await runWithFacility(FACILITY_A.id, () =>
      prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true, analyzerDevice: true } })
    );

    // Nothing a machine sends is released, and nothing is signed in a person's name.
    expect(result.status).toBe('DRAFT');
    expect(result.signedOffAt).toBeNull();
    expect(result.enteredById).toBeNull();
    expect(result.analyzerDevice?.name).toBe('Bench analyzer');
    expect(result.analyzerUsed).toBe('Bench analyzer');

    const wbc = result.parameters.find((parameter) => parameter.name === 'WBC');
    expect(wbc).toBeDefined();
    expect(wbc!.value).toBe('22.1');
    expect(wbc!.flag).toBe('CRITICAL');
    expect(wbc!.source).toBe('ANALYZER');
    expect(wbc!.analyzerCode).toBe('WBC');
    // Our reference range is copied onto the row, not the analyzer's.
    expect(wbc!.referenceRange).toBe('4.0 - 11.0');
    expect(result.parameters.find((parameter) => parameter.name === 'Hemoglobin')!.flag).toBe('NORMAL');

    // The bench can see it in the normal accepted-samples view.
    const samples = await api(`/lab/accepted-samples?search=${sampleCode}`, { token: labToken });
    expect(samples.status, samples.text).toBe(200);
    expect(samples.json.data.items[0].status).toBe('DRAFT');
  });

  it('tells the bench at once when a critical value arrives with nobody watching', async () => {
    const { apiKey, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleCode } = await acceptedSample('t1', 'PAT-0002');

    await send(csv([`${sampleCode},Platelets,18,10*9/L,LL`]), apiKey);

    const notifications = await api('/notifications?limit=50', { token: labToken });
    expect(notifications.status, notifications.text).toBe(200);
    const alert = (notifications.json.data.items as Array<{ title: string; body: string }>).find((item) => item.title.includes('Critical value'));
    expect(alert, 'the lab was not told about a critical analyzer value').toBeDefined();
    expect(alert!.body).toContain('Platelets');
  });

  it('matches a test by its own parameter names with no mapping set up at all', async () => {
    // "Glucose" is an alias of the single-parameter glucose test, which is what
    // makes a chemistry analyzer work on day one.
    const { apiKey } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode } = await acceptedSample('t6', 'PAT-0003');

    const response = await send(csv([`${sampleCode},Glucose,18.2,mmol/L,H`]), apiKey);
    expect(response.json.data).toMatchObject({ applied: 1, skipped: 0 });

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true } }));
    expect(result.parameters[0].name).toBe('Blood Glucose');
    expect(result.parameters[0].flag).toBe('CRITICAL');
  });

  it('does not nag the bench to map a code that already works on its own', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleCode } = await acceptedSample('t1', 'PAT-0003');

    // "Platelets" is one of our own field names, so it lands with no mapping row.
    const response = await send(csv([`${sampleCode},Platelets,250,10*9/L,N`]), apiKey);
    expect(response.json.data).toMatchObject({ applied: 1, skipped: 0 });

    const unmapped = await api(`/lab/analyzers/unmapped-codes?deviceId=${deviceId}`, { token: labToken });
    expect(unmapped.status, unmapped.text).toBe(200);
    const codes = (unmapped.json.data.items as Array<{ analyzerCode: string }>).map((item) => item.analyzerCode);
    expect(codes, 'a code whose values already land was listed as needing mapping').not.toContain('Platelets');
  });

  it('goes to the review queue instead of the bench when the device is set that way', async () => {
    const { apiKey } = await registerDevice(FACILITY_A.code, { name: 'Auto-submit analyzer', autoSubmitForReview: true });
    const { sampleId, sampleCode, labToken } = await acceptedSample('t6', 'PAT-0001');

    await send(csv([`${sampleCode},Glucose,5.1,mmol/L,N`]), apiKey);

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId } }));
    // Still not signed off: only the queue it waits in changed.
    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.signedOffAt).toBeNull();

    const queue = await api('/lab/review-queue?limit=50', { token: labToken });
    expect(queue.status, queue.text).toBe(200);
    expect((queue.json.data.items as Array<{ resultCode: string }>).some((item) => item.resultCode === result.resultCode)).toBe(true);
  });

  it('keeps what a technician typed that the instrument does not measure', async () => {
    const { apiKey } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode, labToken } = await acceptedSample('t1', 'PAT-0002');

    const draft = await post('/lab/results', labToken, { sampleId, parameters: [{ name: 'MCV', value: '88', unit: 'fL' }, { name: 'WBC', value: '5.0', unit: '10*9/L' }] });
    expect(draft.status, draft.text).toBe(201);

    await send(csv([`${sampleCode},WBC,9.9,10*9/L,N`]), apiKey);

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true } }));
    const byName = new Map(result.parameters.map((parameter) => [parameter.name, parameter]));
    // The analyzer replaced the field it measured, and left the manual one alone.
    expect(byName.get('WBC')!.value).toBe('9.9');
    expect(byName.get('WBC')!.source).toBe('ANALYZER');
    expect(byName.get('MCV')!.value).toBe('88');
    expect(byName.get('MCV')!.source).toBe('MANUAL');
  });
});

describe('what an analyzer is not allowed to do', () => {
  it('cannot overwrite a result that has already been signed off and sent', async () => {
    const { apiKey } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode, labToken } = await acceptedSample('t6', 'PAT-0001');

    const draft = await post('/lab/results', labToken, { sampleId, parameters: [{ name: 'Blood Glucose', value: '5.0', unit: 'mmol/L' }] });
    const resultId = draft.json.data.id as string;
    await post('/lab/results/submit-review', labToken, { resultId });
    const signed = await post(`/lab/results/${resultId}/sign-off`, labToken, { decision: 'SIGNED_OFF' });
    expect(signed.status, signed.text).toBeLessThan(300);

    const response = await send(csv([`${sampleCode},Glucose,9.9,mmol/L,H`]), apiKey);
    expect(response.status).toBe(202);
    expect(response.json.data).toMatchObject({ status: 'UNMATCHED', applied: 0, skipped: 1 });
    // The message says what to do about it, rather than failing silently.
    expect(response.json.data.notes.join(' ')).toMatch(/already been signed off/i);

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findUniqueOrThrow({ where: { id: resultId }, include: { parameters: true } }));
    expect(result.status).toBe('SIGNED_OFF');
    expect(result.parameters[0].value).toBe('5.0');
  });

  it('parks a value whose code is not mapped, and applies it once the mapping exists', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode } = await acceptedSample('t3', 'PAT-0003');

    // The instrument calls it "SGPT"; our field is "ALT (SGPT)", so nothing matches.
    const first = await send(csv([`${sampleCode},SGPT,61,U/L,H`]), apiKey);
    expect(first.json.data).toMatchObject({ status: 'UNMATCHED', applied: 0, skipped: 1 });
    expect(first.json.data.notes.join(' ')).toMatch(/not mapped/i);
    const messageId = first.json.data.messageId as string;

    const stored = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirst({ where: { sampleId } }));
    expect(stored, 'an unmapped value must not create a result').toBeNull();

    // The code shows up on the list the setup screen works from.
    const unmapped = await api(`/lab/analyzers/unmapped-codes?deviceId=${deviceId}`, { token: labToken });
    expect(unmapped.status, unmapped.text).toBe(200);
    expect((unmapped.json.data.items as Array<{ analyzerCode: string }>).some((item) => item.analyzerCode === 'SGPT')).toBe(true);

    const parameter = await runWithFacility(FACILITY_A.id, () => prisma.referenceParameter.findFirstOrThrow({ where: { catalogItemId: 't3', name: 'ALT (SGPT)' } }));
    const mapped = await post('/lab/analyzers/test-maps', labToken, { deviceId, analyzerCode: 'SGPT', catalogItemId: 't3', referenceParameterId: parameter.id });
    expect(mapped.status, mapped.text).toBe(201);

    // Nothing was lost: the stored payload is replayed as it arrived.
    const replayed = await post(`/lab/analyzers/messages/${messageId}/replay`, labToken);
    expect(replayed.status, replayed.text).toBe(200);
    expect(replayed.json.data.outcome).toMatchObject({ status: 'APPLIED', applied: 1, skipped: 0 });

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true } }));
    expect(result.parameters[0].name).toBe('ALT (SGPT)');
    expect(result.parameters[0].value).toBe('61');
    expect(result.parameters[0].flag).toBe('HIGH');
  });

  it('converts units with the factor on the mapping, and keeps the untouched reading', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode } = await acceptedSample('t6', 'PAT-0002');

    // The instrument reports glucose in mg/dL; our field is mmol/L.
    const parameter = await runWithFacility(FACILITY_A.id, () => prisma.referenceParameter.findFirstOrThrow({ where: { catalogItemId: 't6' } }));
    await post('/lab/analyzers/test-maps', labToken, { deviceId, analyzerCode: 'GLUC_MGDL', catalogItemId: 't6', referenceParameterId: parameter.id, factor: 0.0555 });

    await send(csv([`${sampleCode},GLUC_MGDL,90,mg/dL,N`]), apiKey);

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true } }));
    expect(Number(result.parameters[0].value)).toBeCloseTo(4.995, 3);
    expect(result.parameters[0].unit).toBe('mmol/L');
    // The conversion can always be checked against what the instrument said.
    expect(result.parameters[0].analyzerRawValue).toBe('90');
    expect(result.parameters[0].flag).toBe('NORMAL');
  });

  it('sets aside a specimen id that matches no sample, naming the id it was given', async () => {
    const { apiKey } = await registerDevice(FACILITY_A.code);
    const response = await send(csv(['SMP-DOES-NOT-EXIST,Glucose,5.4,mmol/L,N']), apiKey);
    expect(response.json.data).toMatchObject({ status: 'UNMATCHED', applied: 0, skipped: 1 });
    expect(response.json.data.notes.join(' ')).toContain('SMP-DOES-NOT-EXIST');
  });

  it('refuses a mapping that points at a field belonging to a different test', async () => {
    const { deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const otherTestsField = await runWithFacility(FACILITY_A.id, () => prisma.referenceParameter.findFirstOrThrow({ where: { catalogItemId: 't1', name: 'WBC' } }));
    const bad = await post('/lab/analyzers/test-maps', labToken, { deviceId, analyzerCode: 'WBC', catalogItemId: 't6', referenceParameterId: otherTestsField.id });
    expect(bad.status, bad.text).toBe(422);
    expect(bad.json.message).toMatch(/does not belong/i);
  });

  it('stores a payload it cannot parse, so a misconfigured instrument loses nothing', async () => {
    const { apiKey, labToken } = await registerDevice(FACILITY_A.code, { name: 'HL7 analyzer', protocol: 'HL7_V2' });
    const response = await send('this is not an HL7 message at all', apiKey);
    expect(response.status).toBe(202);
    expect(response.json.data.status).toBe('FAILED');

    const messages = await api(`/lab/analyzers/messages?status=FAILED`, { token: labToken });
    expect(messages.status, messages.text).toBe(200);
    const failed = (messages.json.data.items as Array<{ id: string; error: string }>).find((item) => item.id === response.json.data.messageId);
    expect(failed, 'the unparseable payload was not kept').toBeDefined();
    expect(failed!.error).toMatch(/MSH/);

    // And the payload itself is still there, exactly as it arrived.
    const detail = await api(`/lab/analyzers/messages/${response.json.data.messageId}`, { token: labToken });
    expect(detail.json.data.rawPayload).toBe('this is not an HL7 message at all');
  });
});

describe('the device key', () => {
  it('is shown once at registration and never again', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    expect(apiKey).toMatch(/^lhims_anz_/);

    const fetched = await api(`/lab/analyzers/${deviceId}`, { token: labToken });
    expect(fetched.status, fetched.text).toBe(200);
    expect(fetched.text).not.toContain(apiKey);
    expect(fetched.json.data.apiKeyHash).toBeUndefined();
    // Only the opening characters, so two keys can be told apart.
    expect(fetched.json.data.apiKeyPrefix).toBe(apiKey.split('_')[2]);
  });

  it('is required, and a wrong one is refused', async () => {
    const { sampleCode } = await acceptedSample('t6', 'PAT-0001');
    const payload = csv([`${sampleCode},Glucose,5.4,mmol/L,N`]);

    const none = await api('/integrations/analyzers/results', { method: 'POST', body: payload, headers: { 'content-type': 'text/plain' } });
    expect(none.status).toBe(401);

    expect((await send(payload, 'lhims_anz_abcdefghij_wrongsecret')).status).toBe(401);
    expect((await send(payload, 'not-even-a-key')).status).toBe(401);
  });

  it('stops working the moment it is rotated', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const rotated = await post(`/lab/analyzers/${deviceId}/rotate-key`, labToken);
    expect(rotated.status, rotated.text).toBe(200);
    const newKey = rotated.json.data.apiKey as string;
    expect(newKey).not.toBe(apiKey);

    const { sampleCode } = await acceptedSample('t6', 'PAT-0003');
    expect((await send(csv([`${sampleCode},Glucose,5.4,mmol/L,N`]), apiKey)).status).toBe(401);
    expect((await send(csv([`${sampleCode},Glucose,5.4,mmol/L,N`]), newKey)).status).toBe(202);
  });

  it('stops working when the analyzer is disabled', async () => {
    const { apiKey, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const disabled = await api(`/lab/analyzers/${deviceId}`, { method: 'PATCH', token: labToken, body: JSON.stringify({ status: 'DISABLED' }) });
    expect(disabled.status, disabled.text).toBe(200);
    expect((await send(csv(['SMP-0001,Glucose,5.4,mmol/L,N']), apiKey)).status).toBe(403);
  });

  it('reaches only its own facility, even when the sample code exists in both', async () => {
    // Both facilities are seeded identically, so a leak here would be invisible
    // without checking which facility the result landed in.
    const alpha = await registerDevice(FACILITY_A.code);
    const bravoSample = await acceptedSample('t6', 'PAT-0001', FACILITY_B);

    const response = await send(csv([`${bravoSample.sampleCode},Glucose,5.4,mmol/L,N`]), alpha.apiKey);
    expect(response.status).toBe(202);

    const inBravo = await runWithFacility(FACILITY_B.id, () => prisma.labResult.findFirst({ where: { sampleId: bravoSample.sampleId } }));
    expect(inBravo, "one facility's analyzer wrote into another facility").toBeNull();
  });
});

describe('uploading an export file instead of running a bridge', () => {
  it('applies the file and records who brought it in', async () => {
    const { apiKey: _unused, deviceId, labToken } = await registerDevice(FACILITY_A.code);
    const { sampleId, sampleCode } = await acceptedSample('t6', 'PAT-0002');

    const uploaded = await post('/lab/analyzers/upload', labToken, {
      deviceId,
      filename: 'run-2026-03-01.csv',
      content: csv([`${sampleCode},Glucose,6.2,mmol/L,H`])
    });
    expect(uploaded.status, uploaded.text).toBe(201);
    expect(uploaded.json.data.outcome).toMatchObject({ status: 'APPLIED', applied: 1 });

    const result = await runWithFacility(FACILITY_A.id, () => prisma.labResult.findFirstOrThrow({ where: { sampleId }, include: { parameters: true } }));
    expect(result.status).toBe('DRAFT');
    expect(result.parameters[0].flag).toBe('HIGH');

    const audit = await runWithFacility(FACILITY_A.id, () =>
      prisma.auditLog.findFirst({ where: { action: 'ANALYZER_FILE_UPLOADED', entityId: uploaded.json.data.outcome.messageId } })
    );
    expect(audit, 'the upload was not audited').not.toBeNull();
    expect(audit!.actorId).toBeTruthy();
  });

  it('says so when the file is for a different kind of analyzer', async () => {
    const { deviceId, labToken } = await registerDevice(FACILITY_A.code, { name: 'HL7 bench', protocol: 'HL7_V2' });
    const wrong = await post('/lab/analyzers/upload', labToken, { deviceId, content: csv(['SMP-0001,Glucose,5.4,mmol/L,N']) });
    expect(wrong.status, wrong.text).toBe(422);
    expect(wrong.json.message).toMatch(/delimited export file/i);
  });
});

describe('who may set analyzers up', () => {
  it('is closed to staff outside the laboratory', async () => {
    const receptionToken = await token(FACILITY_A.code, 'reception');
    expect((await api('/lab/analyzers', { token: receptionToken })).status).toBe(403);
    expect((await post('/lab/analyzers', receptionToken, { name: 'Sneaky', protocol: 'CSV' })).status).toBe(403);
  });
});

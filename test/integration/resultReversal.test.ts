import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  Labs and scan units can reverse (retract) a result they have already sent
  (signed off, so it was released or was ready for release) to correct a
  mistake themselves — without platform help. Doctors can reverse (cancel)
  an order they sent before another department has acted on it. This is the
  general "reverse a sent request" capability, and its result-specific form.
*/

let server: Server;
let baseUrl: string;

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
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

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Places, confirms and accepts one order item, ready for a draft result. */
async function readyOrderItem(catalogItemId: string, patientId: string) {
  const doctorToken = await token(FACILITY_A.code, 'doctor');
  const receptionToken = await token(FACILITY_A.code, 'reception');
  const created = await post('/doctor/orders', doctorToken, { patientId, urgency: 'ROUTINE', items: [{ catalogItemId }] });
  expect(created.status, created.text).toBe(201);
  const orderId = created.json.data.id;
  const orderItemId = created.json.data.items[0].id;

  const confirmed = await post(`/reception/orders/${orderId}/confirm`, receptionToken, { invoiceNow: true });
  expect(confirmed.status, confirmed.text).toBeLessThan(300);
  return { orderId, orderItemId };
}

describe('lab: reversing a sent (signed-off) result', () => {
  it('is refused while the result is still a draft', async () => {
    const labToken = await token(FACILITY_A.code, 'lab');
    const { orderId } = await readyOrderItem('t1', 'PAT-0001');
    const accepted = await post('/lab/samples/accept', labToken, { orderId });
    expect(accepted.status, accepted.text).toBe(201);
    const sampleId = accepted.json.data.samples[0].id;

    const draft = await post('/lab/results', labToken, { sampleId, parameters: [{ name: 'Haemoglobin', value: '13.0', unit: 'g/dL' }] });
    expect(draft.status, draft.text).toBe(201);
    const resultId = draft.json.data.id;

    const early = await post(`/lab/results/${resultId}/reverse`, labToken, { reason: 'Too early to reverse' });
    expect(early.status).toBe(409);
    expect(early.json.code).toBe('LAB_RESULT_NOT_SENT');
  });

  it('needs a reason, and only lab staff (not reception or another facility) may use it', async () => {
    const labToken = await token(FACILITY_A.code, 'lab');
    const receptionToken = await token(FACILITY_A.code, 'reception');
    const { orderId } = await readyOrderItem('t1', 'PAT-0002');
    const accepted = await post('/lab/samples/accept', labToken, { orderId });
    const sampleId = accepted.json.data.samples[0].id;
    const draft = await post('/lab/results', labToken, { sampleId, parameters: [{ name: 'Haemoglobin', value: '13.0', unit: 'g/dL' }] });
    const resultId = draft.json.data.id;
    await post('/lab/results/submit-review', labToken, { resultId });
    const signed = await post(`/lab/results/${resultId}/sign-off`, labToken, { decision: 'SIGNED_OFF' });
    expect(signed.status, signed.text).toBe(200);

    const noReason = await post(`/lab/results/${resultId}/reverse`, labToken, {});
    expect(noReason.status).toBe(400);

    const byReception = await post(`/lab/results/${resultId}/reverse`, receptionToken, { reason: 'Reception should not be able to do this' });
    expect(byReception.status).toBe(403);

    const bToken = await token(FACILITY_B.code, 'lab');
    const crossFacility = await post(`/lab/results/${resultId}/reverse`, bToken, { reason: 'Another facility should not reach this result' });
    expect(crossFacility.status).toBe(404);
  });

  it('un-finalises an order the lab already released, voids the report, and expires its secure link — then the corrected result can be re-sent', async () => {
    const labToken = await token(FACILITY_A.code, 'lab');
    const adminToken = await token(FACILITY_A.code, 'admin');
    const { orderId, orderItemId } = await readyOrderItem('t1', 'PAT-0003');

    const accepted = await post('/lab/samples/accept', labToken, { orderId });
    const sampleId = accepted.json.data.samples[0].id;
    const draft = await post('/lab/results', labToken, { sampleId, parameters: [{ name: 'Haemoglobin', value: '9.0', unit: 'g/dL' }] });
    const resultId = draft.json.data.id;
    await post('/lab/results/submit-review', labToken, { resultId });
    const signed = await post(`/lab/results/${resultId}/sign-off`, labToken, { decision: 'SIGNED_OFF' });
    expect(signed.status, signed.text).toBe(200);
    const reportId = signed.json.data.report.id;

    // Reception/billing side releases it to the clinician — a secure link is issued.
    const released = await post(`/results/${reportId}/release`, adminToken, {});
    expect(released.status, released.text).toBe(200);
    const secureLinkId = released.json.data.secureLink.id;

    const beforeOrder = await runWithFacility(FACILITY_A.id, () => prisma.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(beforeOrder.status).toBe('FINAL_RELEASED');
    expect(beforeOrder.releasedAt).not.toBeNull();

    const reversed = await post(`/lab/results/${resultId}/reverse`, labToken, { reason: 'Haemoglobin value was transcribed wrong; sample re-checked at 13.2 g/dL' });
    expect(reversed.status, reversed.text).toBe(200);
    expect(reversed.json.data.status).toBe('DRAFT');

    const [order, item, report, link, amendments] = await runWithFacility(FACILITY_A.id, () => Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } }),
      prisma.report.findUniqueOrThrow({ where: { id: reportId } }),
      prisma.secureResultLink.findUniqueOrThrow({ where: { id: secureLinkId } }),
      prisma.labResultAmendment.findMany({ where: { labResultId: resultId } })
    ]));
    expect(order.status).toBe('IN_PROGRESS');
    expect(order.releasedAt).toBeNull();
    expect(item.status).toBe('DRAFT');
    expect(report.status).toBe('VOIDED');
    expect(report.voidReason).toMatch(/transcribed wrong/);
    expect(link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(amendments).toHaveLength(1);
    expect(amendments[0].reason).toMatch(/transcribed wrong/);
    expect((amendments[0].beforeData as { status: string }).status).toBe('SIGNED_OFF');

    // Reception (and the ordering doctor) are told the result was withdrawn.
    const notice = await runWithFacility(FACILITY_A.id, () =>
      prisma.notification.findFirst({ where: { orderId, title: 'Laboratory result withdrawn for correction' } })
    );
    expect(notice).toBeTruthy();

    // Life goes on: the lab corrects it and sends it again through the normal cycle.
    const corrected = await post('/lab/results', labToken, { resultId, parameters: [{ name: 'Haemoglobin', value: '13.2', unit: 'g/dL' }] });
    expect(corrected.status, corrected.text).toBe(201);
    await post('/lab/results/submit-review', labToken, { resultId });
    const resigned = await post(`/lab/results/${resultId}/sign-off`, labToken, { decision: 'SIGNED_OFF' });
    expect(resigned.status, resigned.text).toBe(200);
    expect(resigned.json.data.report.id).not.toBe(reportId);
  });
});

describe('scan: reversing a sent (signed-off) report', () => {
  it('un-finalises a released order and voids the report', async () => {
    const scanToken = await token(FACILITY_A.code, 'scan');
    const adminToken = await token(FACILITY_A.code, 'admin');
    const { orderId, orderItemId } = await readyOrderItem('t17', 'PAT-0001');

    const accepted = await post('/scan/accept', scanToken, { orderId });
    expect(accepted.status, accepted.text).toBe(201);
    const acceptanceId = accepted.json.data.accepted[0].id;
    const draft = await post('/scan/results', scanToken, { scanAcceptanceId: acceptanceId, findings: 'Clear lung fields', impression: 'No acute findings' });
    expect(draft.status, draft.text).toBe(201);
    const resultId = draft.json.data.id;
    await post('/scan/results/submit-review', scanToken, { resultId });
    const signed = await post(`/scan/results/${resultId}/sign-off`, scanToken, { decision: 'SIGNED_OFF' });
    expect(signed.status, signed.text).toBe(200);
    const reportId = signed.json.data.report.id;

    const released = await post(`/results/${reportId}/release`, adminToken, {});
    expect(released.status, released.text).toBe(200);

    const early = await post(`/scan/results/${resultId}/reverse`, scanToken, {});
    expect(early.status).toBe(400);

    const reversed = await post(`/scan/results/${resultId}/reverse`, scanToken, { reason: 'Wrong patient image attached to this report' });
    expect(reversed.status, reversed.text).toBe(200);
    expect(reversed.json.data.status).toBe('DRAFT');

    const [order, item, report, amendments] = await runWithFacility(FACILITY_A.id, () => Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } }),
      prisma.report.findUniqueOrThrow({ where: { id: reportId } }),
      prisma.scanResultAmendment.findMany({ where: { scanResultId: resultId } })
    ]));
    expect(order.status).toBe('IN_PROGRESS');
    expect(item.status).toBe('DRAFT');
    expect(report.status).toBe('VOIDED');
    expect(amendments).toHaveLength(1);
    expect(amendments[0].reason).toMatch(/Wrong patient image/);
  });
});

describe('doctor: reversing (cancelling) a sent order', () => {
  it('can withdraw their own order before it is processed', async () => {
    const doctorToken = await token(FACILITY_A.code, 'doctor');
    const created = await post('/doctor/orders', doctorToken, { patientId: 'PAT-0002', urgency: 'ROUTINE', items: [{ catalogItemId: 't1' }] });
    expect(created.status, created.text).toBe(201);
    const orderId = created.json.data.id;

    const cancelled = await post(`/orders/${orderId}/cancel`, doctorToken, { reason: 'Ordered the wrong test for this patient' });
    expect(cancelled.status, cancelled.text).toBe(200);
    expect(cancelled.json.data.status).toBe('CANCELLED');

    // Already reversed: cancelling again is refused.
    const again = await post(`/orders/${orderId}/cancel`, doctorToken, { reason: 'Trying a second time' });
    expect(again.status).toBe(409);
  });

  it('is still out of reach for roles without an order-cancel permission', async () => {
    const doctorToken = await token(FACILITY_A.code, 'doctor');
    const nurseToken = await token(FACILITY_A.code, 'nurse');
    const created = await post('/doctor/orders', doctorToken, { patientId: 'PAT-0003', urgency: 'ROUTINE', items: [{ catalogItemId: 't1' }] });
    const denied = await post(`/orders/${created.json.data.id}/cancel`, nurseToken, { reason: 'Should not be reachable' });
    expect(denied.status).toBe(403);
  });
});

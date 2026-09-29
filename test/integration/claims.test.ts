import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 1: NHIS and private insurance claims.

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};
const NHIS = 'SCH-NHIS';

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
const invoiceOf = (encounterId: string) => inA(() => prisma.invoice.findFirstOrThrow({ where: { encounterId } }));

/** A member patient with a completed, diagnosed OPD visit and an unpaid consultation fee. */
async function claimableVisit(label: string, { member = true, expiresAt }: { member?: boolean; expiresAt?: string } = {}) {
  const patient = await post('/patients', 'reception', { firstName: label, lastName: 'Claimant', gender: 'MALE', phone: '+233200000071' });
  expect(patient.status, patient.text).toBe(201);
  const patientId = patient.json.data.id as string;
  if (member) {
    const m = await post(`/claims/patients/${patientId}/memberships`, 'reception', { schemeId: NHIS, membershipNumber: `NH${randomUUID().slice(0, 8)}`, expiresAt });
    expect(m.status, m.text).toBe(201);
  }
  const visit = await post('/encounters', 'reception', { patientId, type: 'OPD', feeItemId: 'SVC-CONSULT' });
  const encounterId = visit.json.data.id as string;
  await post(`/encounters/${encounterId}/start-consultation`, 'doctor');
  await post(`/encounters/${encounterId}/diagnoses`, 'doctor', { code: 'B54', description: 'Unspecified malaria' });
  const done = await post(`/encounters/${encounterId}/complete`, 'doctor', { outcome: 'DISCHARGED' });
  expect(done.status, done.text).toBe(200);
  return { patientId, encounterId };
}

const claim = (encounterId: string, as = 'billing') => post('/claims', as, { encounterId, schemeId: NHIS });

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['reception', 'doctor', 'billing'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoBilling', FACILITY_B.code, 'billing', DEMO_USERS.billing);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('preparing a claim', () => {
  it('needs a completed visit and a membership valid on the day of the visit', async () => {
    const noCard = await claimableVisit('NoCard', { member: false });
    expect((await claim(noCard.encounterId)).json.code).toBe('NO_VALID_MEMBERSHIP');
    const expired = await claimableVisit('Expired', { expiresAt: '2020-01-31' });
    expect((await claim(expired.encounterId)).json.code).toBe('NO_VALID_MEMBERSHIP');

    const patient = await post('/patients', 'reception', { firstName: 'Open', lastName: 'Visit', gender: 'MALE', phone: '+233200000072' });
    await post(`/claims/patients/${patient.json.data.id}/memberships`, 'reception', { schemeId: NHIS, membershipNumber: 'NH-OPEN-1' });
    const open = await post('/encounters', 'reception', { patientId: patient.json.data.id, type: 'OPD', feeItemId: 'SVC-CONSULT' });
    expect((await claim(open.json.data.id)).json.code).toBe('ENCOUNTER_NOT_COMPLETED');
  });

  it('receptionists record cards but cannot prepare claims', async () => {
    const { encounterId } = await claimableVisit('Desk');
    expect((await claim(encounterId, 'reception')).status).toBe(403);
  });
});

describe('a claim from visit to payment', () => {
  let encounterId: string;
  let claimId: string;

  it('the visit is listed as claimable, and the claim snapshots lines and diagnoses', async () => {
    ({ encounterId } = await claimableVisit('Journey'));
    const candidates = await get(`/claims/candidates?schemeId=${NHIS}`, 'billing');
    expect(candidates.json.data.items.map((e: { id: string }) => e.id)).toContain(encounterId);

    const res = await claim(encounterId);
    expect(res.status, res.text).toBe(201);
    claimId = res.json.data.id;
    expect(res.json.data).toMatchObject({ status: 'DRAFT', claimedAmount: '50' });
    expect(res.json.data.claimCode).toMatch(/^CLM-\d{4}-\d{4}$/);
    expect(res.json.data.diagnoses).toEqual([{ code: 'B54', description: 'Unspecified malaria', type: 'PRIMARY' }]);
    expect(res.json.data.lines).toHaveLength(1);
    expect(res.json.data.lines[0].description).toBe('OPD consultation');

    const invoice = await invoiceOf(encounterId);
    expect(invoice).toMatchObject({ status: 'INSURANCE_PENDING', insuranceClaimRef: res.json.data.claimCode });
    const after = await get(`/claims/candidates?schemeId=${NHIS}`, 'billing');
    expect(after.json.data.items.map((e: { id: string }) => e.id)).not.toContain(encounterId);
  });

  it('while claimed, the cashier cannot take payment, and the visit cannot be claimed twice', async () => {
    const invoice = await invoiceOf(encounterId);
    const pay = await post(`/billing/invoices/${invoice.id}/payments`, 'billing', { amount: 50, method: 'CASH' });
    expect(pay.json.code).toBe('INVOICE_UNDER_CLAIM');
    expect((await claim(encounterId)).json.code).toBe('NOTHING_TO_CLAIM');
    await expect(
      inA(async () => {
        const original = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
        return prisma.claim.create({ data: { claimCode: `CLM-X-${randomUUID().slice(0, 5)}`, schemeId: original.schemeId, patientId: original.patientId, encounterId, membershipNumber: 'x', attendanceDate: new Date(), diagnoses: [], claimedAmount: 1 } });
      })
    ).rejects.toThrow(/Unique constraint/);
  });

  it('submitting puts it in the scheme’s batch for the month of attendance; a query sends it back', async () => {
    const submitted = await post('/claims/submit', 'billing', { claimIds: [claimId] });
    expect(submitted.status, submitted.text).toBe(200);
    const c = await get(`/claims/${claimId}`, 'billing');
    expect(c.json.data.status).toBe('SUBMITTED');
    const now = new Date();
    expect(c.json.data.batch.period).toBe(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);

    const queried = await post(`/claims/${claimId}/query`, 'billing', { note: 'Attach the malaria RDT result' });
    expect(queried.json.data).toMatchObject({ status: 'QUERIED', queryNote: 'Attach the malaria RDT result' });
    expect((await post('/claims/submit', 'billing', { claimIds: [claimId] })).status).toBe(200);
  });

  it('a cut line needs a reason; the decision records the approved amount', async () => {
    const lineId = (await get(`/claims/${claimId}`, 'billing')).json.data.lines[0].id;
    const noReason = await post(`/claims/${claimId}/decision`, 'billing', { decision: 'APPROVE', lines: [{ lineId, approvedAmount: 40 }] });
    expect(noReason.json.code).toBe('REASON_REQUIRED');
    expect((await post(`/claims/${claimId}/decision`, 'billing', { decision: 'APPROVE', lines: [{ lineId, approvedAmount: 60, rejectedReason: 'x' }] })).json.code).toBe('INVALID_APPROVED_AMOUNT');
    const ok = await post(`/claims/${claimId}/decision`, 'billing', { decision: 'APPROVE', lines: [{ lineId, approvedAmount: 40, rejectedReason: 'NHIS tariff is 40.00' }] });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.data).toMatchObject({ status: 'APPROVED', approvedAmount: '40' });
  });

  it('the scheme’s payment is applied to the invoice; the shortfall returns to the patient', async () => {
    expect((await post(`/claims/${claimId}/payment`, 'billing', { amount: 50, reference: 'NHIA-2026-09' })).json.code).toBe('INVALID_PAYMENT_AMOUNT');
    const paid = await post(`/claims/${claimId}/payment`, 'billing', { amount: 40, reference: 'NHIA-2026-09' });
    expect(paid.status, paid.text).toBe(200);
    expect(paid.json.data).toMatchObject({ status: 'PAID', paidAmount: '40', paymentReference: 'NHIA-2026-09' });

    const invoice = await inA(() => prisma.invoice.findFirstOrThrow({ where: { encounterId }, include: { payments: true } }));
    expect(invoice).toMatchObject({ status: 'PARTIAL' });
    expect(Number(invoice.amountPaid)).toBe(40);
    expect(Number(invoice.balance)).toBe(10);
    expect(invoice.payments[0]).toMatchObject({ method: 'INSURANCE', reference: 'NHIA-2026-09' });
  });
});

describe('claims that do not get paid', () => {
  it('a rejected claim returns the invoice to the patient', async () => {
    const { encounterId } = await claimableVisit('Rejected');
    const c = await claim(encounterId);
    await post('/claims/submit', 'billing', { claimIds: [c.json.data.id] });
    expect((await post(`/claims/${c.json.data.id}/decision`, 'billing', { decision: 'REJECT' })).json.code).toBe('REASON_REQUIRED');
    const rejected = await post(`/claims/${c.json.data.id}/decision`, 'billing', { decision: 'REJECT', reason: 'Membership not active on NHIA register' });
    expect(rejected.json.data.status).toBe('REJECTED');
    expect(await invoiceOf(encounterId)).toMatchObject({ status: 'UNPAID', insuranceClaimRef: null });
  });

  it('a cancelled draft releases the invoice, and the visit can be claimed again', async () => {
    const { encounterId } = await claimableVisit('Cancel');
    const c = await claim(encounterId);
    const cancelled = await post(`/claims/${c.json.data.id}/cancel`, 'billing', { reason: 'Wrong scheme' });
    expect(cancelled.json.data.status).toBe('CANCELLED');
    expect((await invoiceOf(encounterId)).status).toBe('UNPAID');
    expect((await claim(encounterId)).status).toBe(201);
  });

  it('another facility cannot see claims or memberships', async () => {
    const { patientId, encounterId } = await claimableVisit('Private');
    const c = await claim(encounterId);
    expect((await get(`/claims/${c.json.data.id}`, 'bravoBilling')).status).toBe(404);
    expect((await get(`/claims/patients/${patientId}/memberships`, 'bravoBilling')).status).toBe(404);
  });
});

describe('monthly batches', () => {
  it('once a month’s batch is sent, later claims for that month cannot join it', async () => {
    const batches = await get(`/claims/batches?schemeId=${NHIS}`, 'billing');
    const batch = batches.json.data.items[0];
    expect(batch.claimCount).toBeGreaterThanOrEqual(2);
    expect((await post(`/claims/batches/${batch.id}/close`, 'billing')).status).toBe(200);

    const { encounterId } = await claimableVisit('Late');
    const late = await claim(encounterId);
    const res = await post('/claims/submit', 'billing', { claimIds: [late.json.data.id] });
    expect(res.json.code).toBe('BATCH_CLOSED');
  });
});

describe('claims module', () => {
  it('is off-limits when the facility has not switched it on', async () => {
    const code = `N${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Cash Only Clinic', modules: ['opd', 'billing'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/claims', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

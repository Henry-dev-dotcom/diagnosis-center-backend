import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Existing write workflows must keep working inside a facility, and every row
// they create must land in that facility.

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
  const res = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ facilityCode, username, password: DEMO_USERS[username] })
  });
  expect(res.status, res.text).toBe(200);
  return res.json.data.accessToken as string;
}

const post = (path: string, tokenValue: string, body: unknown) =>
  api(path, { method: 'POST', token: tokenValue, body: JSON.stringify(body) });

function walkIn(catalogItemId: string, lastName: string) {
  return {
    patient: { firstName: 'Walkin', lastName, phone: '+233200000000' },
    requestedItems: [{ catalogItemId }],
    invoiceNow: true,
    checkInNow: true
  };
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('reception walk-in', () => {
  it('creates patient, order, invoice and visit inside the facility, with per-facility codes', async () => {
    const [aToken, bToken] = await Promise.all([token(FACILITY_A.code, 'reception'), token(FACILITY_B.code, 'reception')]);
    const a = await post('/reception/walk-ins', aToken, walkIn('t2', 'Alpha'));
    const b = await post('/reception/walk-ins', bToken, walkIn(`${FACILITY_B.idPrefix}t2`, 'Bravo'));
    expect(a.status, a.text).toBe(201);
    expect(b.status, b.text).toBe(201);

    const inA = await runWithFacility(FACILITY_A.id, () =>
      prisma.patient.findFirstOrThrow({ where: { lastName: 'Alpha' }, include: { orders: { include: { invoice: true } }, visits: true } })
    );
    const inB = await runWithFacility(FACILITY_B.id, () =>
      prisma.patient.findFirstOrThrow({ where: { lastName: 'Bravo' }, include: { orders: { include: { invoice: true } }, visits: true } })
    );
    for (const [patient, facilityId] of [[inA, FACILITY_A.id], [inB, FACILITY_B.id]] as const) {
      expect(patient.facilityId).toBe(facilityId);
      expect(patient.orders).toHaveLength(1);
      expect(patient.orders[0].facilityId).toBe(facilityId);
      expect(patient.orders[0].invoice?.facilityId).toBe(facilityId);
      expect(patient.visits[0]?.facilityId).toBe(facilityId);
    }
    // Same demo data in both facilities, so their counters line up: the same
    // human-readable codes exist in each without colliding.
    expect(inA.patientCode).toBe(inB.patientCode);
    expect(inA.orders[0].orderCode).toBe(inB.orders[0].orderCode);
  });

  it('cannot order another facility\'s catalog item', async () => {
    const aToken = await token(FACILITY_A.code, 'reception');
    const res = await post('/reception/walk-ins', aToken, walkIn(`${FACILITY_B.idPrefix}t2`, 'Crossover'));
    expect(res.status, res.text).toBeGreaterThanOrEqual(400);
    const leaked = await runWithFacility(FACILITY_A.id, () => prisma.patient.count({ where: { lastName: 'Crossover' } }));
    expect(leaked).toBe(0);
  });
});

describe('doctor order through reception confirmation and payment', () => {
  it('runs end to end in one facility', async () => {
    const [doctorToken, receptionToken, billingToken] = await Promise.all([
      token(FACILITY_A.code, 'doctor'),
      token(FACILITY_A.code, 'reception'),
      token(FACILITY_A.code, 'billing')
    ]);

    const created = await post('/doctor/orders', doctorToken, {
      patientId: 'PAT-0002',
      urgency: 'ROUTINE',
      clinicalNotes: 'Workflow test',
      items: [{ catalogItemId: 't1' }]
    });
    expect(created.status, created.text).toBe(201);
    const orderId = created.json.data.id ?? created.json.data.order?.id;
    expect(orderId).toBeTruthy();

    const confirmed = await post(`/reception/orders/${orderId}/confirm`, receptionToken, { invoiceNow: true });
    expect(confirmed.status, confirmed.text).toBeLessThan(300);

    const invoice = await runWithFacility(FACILITY_A.id, () => prisma.invoice.findFirstOrThrow({ where: { orderId } }));
    expect(invoice.facilityId).toBe(FACILITY_A.id);

    const shift = await post('/finance/shifts/start', billingToken, { openingFloat: 0 });
    expect([200, 201, 409], shift.text).toContain(shift.status);

    const paid = await post(`/billing/invoices/${invoice.id}/payments`, billingToken, { amount: 10, method: 'CASH' });
    expect(paid.status, paid.text).toBeLessThan(300);

    const payments = await runWithFacility(FACILITY_A.id, () => prisma.payment.findMany({ where: { invoiceId: invoice.id } }));
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((p) => p.facilityId === FACILITY_A.id)).toBe(true);
  });
});

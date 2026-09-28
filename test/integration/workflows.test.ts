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
    // Each facility numbers its own records: the new code is the next after that
    // facility's highest standard code, and the same code can exist in both.
    for (const [patient, facilityId] of [[inA, FACILITY_A.id], [inB, FACILITY_B.id]] as const) {
      const others = await runWithFacility(facilityId, () => prisma.patient.findMany({ where: { id: { not: patient.id } }, select: { patientCode: true } }));
      const highest = Math.max(0, ...others.map((p) => /^PAT-(\d+)$/.exec(p.patientCode)?.[1]).filter(Boolean).map(Number));
      expect(patient.patientCode).toBe(`PAT-${String(highest + 1).padStart(4, '0')}`);
    }
    const shared = await Promise.all(
      [FACILITY_A.id, FACILITY_B.id].map((facilityId) =>
        runWithFacility(facilityId, () => prisma.patient.findFirst({ where: { patientCode: 'PAT-0001' } }))
      )
    );
    expect(shared.map((p) => p?.facilityId)).toEqual([FACILITY_A.id, FACILITY_B.id]);
  });

  it('simultaneous walk-ins all succeed with distinct codes', async () => {
    const aToken = await token(FACILITY_A.code, 'reception');
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => post('/reception/walk-ins', aToken, walkIn('t2', `Rush${i}`)))
    );
    expect(results.map((r) => r.status), results.map((r) => r.text.slice(0, 120)).join('\n')).toEqual(Array(8).fill(201));
    const patients = await runWithFacility(FACILITY_A.id, () =>
      prisma.patient.findMany({ where: { lastName: { startsWith: 'Rush' } }, include: { orders: true } })
    );
    expect(new Set(patients.map((p) => p.patientCode)).size).toBe(8);
    expect(new Set(patients.flatMap((p) => p.orders.map((o) => o.orderCode))).size).toBe(8);
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

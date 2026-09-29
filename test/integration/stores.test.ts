import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 4D step 2: general stores, procurement and requisitions.

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
const stock = (id: string) => inA(async () => (await prisma.storeItem.findUniqueOrThrow({ where: { id } })).quantityOnHand);

async function newItem(label: string, quantityOnHand: number, reorderLevel = 0) {
  const res = await post('/stores/items', 'billing', { code: `T-${label}-${randomUUID().slice(0, 4)}`, name: `Test ${label}`, unit: 'box', reorderLevel });
  expect(res.status, res.text).toBe(201);
  if (quantityOnHand) await post(`/stores/items/${res.json.data.id}/adjust`, 'billing', { quantity: quantityOnHand, reason: 'Opening count' });
  return res.json.data.id as string;
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['admin', 'billing', 'nurse'] as const) await signInAs(user, FACILITY_A.code, user, DEMO_USERS[user]);
  await signInAs('bravoBilling', FACILITY_B.code, 'billing', DEMO_USERS.billing);
  await signInAs('platform', undefined, 'platform', 'platform123');
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('purchase orders', () => {
  let poId: string;
  let lineId: string;
  let itemId: string;

  it('the stores office raises an order; only someone else with approval rights approves it', async () => {
    itemId = await newItem('Gloves', 8, 20);
    const res = await post('/stores/purchase-orders', 'billing', { supplierId: 'SUP-001', lines: [{ storeItemId: itemId, quantity: 50, unitCost: 45 }] });
    expect(res.status, res.text).toBe(201);
    poId = res.json.data.id;
    lineId = res.json.data.lines[0].id;
    expect(res.json.data).toMatchObject({ status: 'DRAFT', total: 2250 });
    expect(res.json.data.poCode).toMatch(/^PO-\d{4}-\d{4}$/);

    expect((await post(`/stores/purchase-orders/${poId}/approve`, 'billing')).status).toBe(403);
    expect((await post(`/stores/purchase-orders/${poId}/receive`, 'billing', { lines: [{ poLineId: lineId, quantity: 1 }] })).json.code).toBe('PO_WRONG_STATUS');
    const approved = await post(`/stores/purchase-orders/${poId}/approve`, 'admin');
    expect(approved.json.data).toMatchObject({ status: 'APPROVED' });
    expect(approved.json.data.approvedBy.name).toBeTruthy();
  });

  it('nobody approves their own order', async () => {
    const own = await post('/stores/purchase-orders', 'admin', { supplierId: 'SUP-001', lines: [{ storeItemId: itemId, quantity: 5, unitCost: 45 }] });
    expect((await post(`/stores/purchase-orders/${own.json.data.id}/approve`, 'admin')).json.code).toBe('PO_SELF_APPROVAL');
  });

  it('deliveries are received up to what was ordered, and stock follows', async () => {
    const part = await post(`/stores/purchase-orders/${poId}/receive`, 'billing', { deliveryNote: 'DN-4411', lines: [{ poLineId: lineId, quantity: 30, batchNumber: 'GL2026' }] });
    expect(part.status, part.text).toBe(200);
    expect(part.json.data.status).toBe('PARTIALLY_RECEIVED');
    expect(await stock(itemId)).toBe(38);

    const over = await post(`/stores/purchase-orders/${poId}/receive`, 'billing', { lines: [{ poLineId: lineId, quantity: 25 }] });
    expect(over.json.code).toBe('OVER_RECEIPT');
    expect(over.json.message).toMatch(/Only 20 box/);

    const rest = await post(`/stores/purchase-orders/${poId}/receive`, 'billing', { lines: [{ poLineId: lineId, quantity: 20 }] });
    expect(rest.json.data.status).toBe('RECEIVED');
    expect(rest.json.data.receipts).toHaveLength(2);
    expect(await stock(itemId)).toBe(58);

    const item = await get(`/stores/items/${itemId}`, 'billing');
    expect(item.json.data.movements[0]).toMatchObject({ type: 'RECEIPT', quantity: 20, balanceAfter: 58 });
    expect(item.json.data.movements[0].reference).toMatch(/^GRN-\d{4}-\d{4}$/);
    expect(item.json.data.lastUnitCost).toBe('45');
  });

  it('the database refuses receiving more than ordered even without the service', async () => {
    await expect(inA(() => prisma.purchaseOrderLine.update({ where: { id: lineId }, data: { quantityReceived: 51 } }))).rejects.toThrow(/PurchaseOrderLine_quantities_valid|check constraint/i);
  });
});

describe('requisitions from the wards', () => {
  it('a nurse asks, the store issues up to stock, and the requisition closes', async () => {
    const gauze = await newItem('Gauze', 12);
    const bleach = await newItem('Bleach', 3);
    const req = await post('/stores/requisitions', 'nurse', { requestingUnit: 'Female Medical Ward', lines: [{ storeItemId: gauze, quantity: 10 }, { storeItemId: bleach, quantity: 2 }] });
    expect(req.status, req.text).toBe(201);
    expect(req.json.data.reqCode).toMatch(/^REQ-\d{4}-\d{4}$/);
    const [gl, bl] = [req.json.data.lines.find((l: { storeItemId: string }) => l.storeItemId === gauze), req.json.data.lines.find((l: { storeItemId: string }) => l.storeItemId === bleach)];

    expect((await post(`/stores/requisitions/${req.json.data.id}/issue`, 'nurse', { lines: [{ lineId: gl.id, quantity: 10 }] })).status).toBe(403);
    expect((await post(`/stores/requisitions/${req.json.data.id}/issue`, 'billing', { lines: [{ lineId: gl.id, quantity: 11 }] })).json.code).toBe('OVER_ISSUE');

    const issued = await post(`/stores/requisitions/${req.json.data.id}/issue`, 'billing', { lines: [{ lineId: gl.id, quantity: 10 }, { lineId: bl.id, quantity: 1 }] });
    expect(issued.status, issued.text).toBe(200);
    expect(issued.json.data.status).toBe('PARTIALLY_ISSUED');
    expect(await stock(gauze)).toBe(2);
    expect(await stock(bleach)).toBe(2);
    expect((await post(`/stores/requisitions/${req.json.data.id}/issue`, 'billing', { lines: [{ lineId: bl.id, quantity: 1 }] })).json.code).toBe('REQUISITION_CLOSED');
  });

  it('nurses see only their own requisitions; the store sees all', async () => {
    const nurseList = await get('/stores/requisitions', 'nurse');
    const storeList = await get('/stores/requisitions', 'billing');
    expect(nurseList.json.data.items.every((r: { requestedBy: { name: string } }) => r.requestedBy.name === nurseList.json.data.items[0].requestedBy.name)).toBe(true);
    expect(storeList.json.data.items.length).toBeGreaterThanOrEqual(nurseList.json.data.items.length);
  });

  it('stock cannot be issued beyond what is on the shelf', async () => {
    const sheets = await newItem('Sheets', 5);
    const req = await post('/stores/requisitions', 'nurse', { requestingUnit: 'Theatre', lines: [{ storeItemId: sheets, quantity: 20 }] });
    const res = await post(`/stores/requisitions/${req.json.data.id}/issue`, 'billing', { lines: [{ lineId: req.json.data.lines[0].id, quantity: 20 }] });
    expect(res.json.code).toBe('INSUFFICIENT_STOCK');
    expect(await stock(sheets)).toBe(5);
  });

  it('two issues racing for the last stock: exactly one succeeds and stock never goes negative', async () => {
    const syringes = await newItem('Syringes', 40);
    const reqs = await Promise.all([1, 2].map(() => post('/stores/requisitions', 'nurse', { requestingUnit: 'OPD', lines: [{ storeItemId: syringes, quantity: 40 }] })));
    const results = await Promise.all(reqs.map((r) => post(`/stores/requisitions/${r.json.data.id}/issue`, 'billing', { lines: [{ lineId: r.json.data.lines[0].id, quantity: 40 }] })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stock(syringes)).toBe(0);
  });

  it('a requisition can be rejected with a reason', async () => {
    const item = await newItem('Linen', 5);
    const req = await post('/stores/requisitions', 'nurse', { requestingUnit: 'Children’s Ward', lines: [{ storeItemId: item, quantity: 2 }] });
    const rejected = await post(`/stores/requisitions/${req.json.data.id}/reject`, 'billing', { reason: 'Use the ward’s own linen store' });
    expect(rejected.json.data).toMatchObject({ status: 'REJECTED', rejectReason: 'Use the ward’s own linen store' });
  });
});

describe('stock control', () => {
  it('adjustments need a reason and cannot take stock below zero; low stock is flagged', async () => {
    const item = await newItem('Masks', 4, 10);
    expect((await post(`/stores/items/${item}/adjust`, 'billing', { quantity: -2 })).status).toBe(400);
    expect((await post(`/stores/items/${item}/adjust`, 'billing', { quantity: -9, reason: 'Count' })).json.code).toBe('INSUFFICIENT_STOCK');
    const adjusted = await post(`/stores/items/${item}/adjust`, 'billing', { quantity: -1, reason: 'Damaged box' });
    expect(adjusted.json.data).toMatchObject({ quantityOnHand: 3, lowStock: true });
    const low = await get('/stores/items?lowStock=true', 'billing');
    expect(low.json.data.items.map((i: { id: string }) => i.id)).toContain(item);
  });

  it('another facility sees none of it, and the module can be switched off', async () => {
    const item = await newItem('Private', 1);
    expect((await get(`/stores/items/${item}`, 'bravoBilling')).status).toBe(404);
    const code = `S${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    await post('/platform/facilities', 'platform', { code, name: 'Clinic Without Stores', modules: ['opd'], admin: { name: 'Clinic Admin', username: 'admin', password: 'clinic-pass-1' } });
    await signInAs('clinic', code, 'admin', 'clinic-pass-1');
    const res = await get('/stores/items', 'clinic');
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });
});

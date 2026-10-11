import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

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
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode, username, password })
  });
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(200);
  tokens[key] = json.data.accessToken;
}

let supplyRequestId = '';
let maintenanceRequestId = '';

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await signInAs('admin', FACILITY_A.code, 'admin', DEMO_USERS.admin);
  await signInAs('billing', FACILITY_A.code, 'billing', DEMO_USERS.billing);
  await signInAs('lab', FACILITY_A.code, 'lab', DEMO_USERS.lab);
  await signInAs('nurse', FACILITY_A.code, 'nurse', DEMO_USERS.nurse);
  await signInAs('bravoBilling', FACILITY_B.code, 'billing', DEMO_USERS.billing);
  await signInAs('bravoLab', FACILITY_B.code, 'lab', DEMO_USERS.lab);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('Gustav Biomed requests', () => {
  it('lets Stores record categorized supply requests and denies that action to Lab Staff', async () => {
    const supply = await post('/stores/gustav-biomed/requests', 'billing', {
      requestingUnit: 'Stores',
      supplyCategory: 'REAGENTS',
      itemDescription: 'Glucose reagent kit, compatible with the chemistry analyzer',
      quantity: 4,
      quantityUnit: 'kits',
      notes: 'Please confirm shelf life before supply.'
    });
    expect(supply.status, supply.text).toBe(201);
    expect(supply.json.data).toMatchObject({
      supplierName: 'Gustav Biomed Limited',
      type: 'SUPPLY',
      status: 'PENDING',
      supplyCategory: 'REAGENTS',
      quantity: 4,
      quantityUnit: 'kits'
    });
    expect(supply.json.data.requestCode).toMatch(/^GBR-\d{4}-\d{4}$/);
    supplyRequestId = supply.json.data.id;

    const forbidden = await post('/stores/gustav-biomed/requests', 'lab', {
      requestingUnit: 'Laboratory',
      supplyCategory: 'REAGENTS',
      itemDescription: 'Unauthorized supply request',
      quantity: 1,
      quantityUnit: 'kit'
    });
    expect(forbidden.status).toBe(403);
  });

  it('lets every Lab Staff user create and follow maintenance requests, with no patient data', async () => {
    const maintenance = await post('/lab/gustav-biomed/maintenance-requests', 'lab', {
      requestingUnit: 'Laboratory',
      analyzerName: 'Chemistry analyzer A',
      serviceDescription: 'Routine preventive maintenance and calibration check',
      preferredServiceDate: '2026-10-16',
      notes: 'Coordinate a suitable time with the laboratory.'
    });
    expect(maintenance.status, maintenance.text).toBe(201);
    expect(maintenance.json.data).toMatchObject({
      supplierName: 'Gustav Biomed Limited',
      type: 'ANALYZER_MAINTENANCE',
      status: 'PENDING',
      analyzerName: 'Chemistry analyzer A',
      requestedBy: { role: 'LAB_STAFF' }
    });
    expect(maintenance.json.data.requestCode).toMatch(/^GBR-\d{4}-\d{4}$/);
    maintenanceRequestId = maintenance.json.data.id;
    expect(maintenance.json.data).not.toHaveProperty('patientId');

    const labRows = await get('/lab/gustav-biomed/maintenance-requests', 'lab');
    expect(labRows.status, labRows.text).toBe(200);
    expect(labRows.json.data.items.some((row: { id: string }) => row.id === maintenanceRequestId)).toBe(true);
    expect(labRows.json.data.items.every((row: { type: string }) => row.type === 'ANALYZER_MAINTENANCE')).toBe(true);
    expect((await get('/lab/gustav-biomed/maintenance-requests', 'nurse')).status).toBe(403);
  });

  it('lets Stores coordinate status, blocks invalid transitions, and keeps requests facility-scoped', async () => {
    const updated = await patch(`/stores/gustav-biomed/requests/${maintenanceRequestId}/status`, 'billing', { status: 'SCHEDULED', statusNote: 'Vendor appointment arranged by Stores.' });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.json.data).toMatchObject({ status: 'SCHEDULED', statusNote: 'Vendor appointment arranged by Stores.' });

    const invalid = await patch(`/stores/gustav-biomed/requests/${maintenanceRequestId}/status`, 'billing', { status: 'PENDING' });
    expect(invalid.status).toBe(409);
    expect(invalid.json.code).toBe('INVALID_GUSTAV_REQUEST_TRANSITION');
    expect((await patch(`/stores/gustav-biomed/requests/${maintenanceRequestId}/status`, 'lab', { status: 'COMPLETED' })).status).toBe(403);

    const storesRows = await get('/stores/gustav-biomed/requests', 'billing');
    expect(storesRows.json.data.items.some((row: { id: string; status: string }) => row.id === maintenanceRequestId && row.status === 'SCHEDULED')).toBe(true);
    expect(storesRows.json.data.items.some((row: { id: string }) => row.id === supplyRequestId)).toBe(true);

    const otherFacilityStoresRows = await get('/stores/gustav-biomed/requests', 'bravoBilling');
    const otherFacilityLabRows = await get('/lab/gustav-biomed/maintenance-requests', 'bravoLab');
    expect(otherFacilityStoresRows.json.data.items.some((row: { id: string }) => row.id === supplyRequestId || row.id === maintenanceRequestId)).toBe(false);
    expect(otherFacilityLabRows.json.data.items.some((row: { id: string }) => row.id === maintenanceRequestId)).toBe(false);
  });
});

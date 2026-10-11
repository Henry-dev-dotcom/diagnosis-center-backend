import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runAsSystem } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};
const accountEmail = `vendor.head.${randomUUID()}@example.com`;
const accountPassword = 'SecureVendor7Pass';
let vendorUserId = '';
let setupToken = '';
let refreshCookie = '';
let supplyRequestId = '';
let maintenanceRequestId = '';
let otherPartnerRequestId = '';
let requestMarker = '';

async function call(method: string, path: string, options: { token?: string; body?: unknown; cookie?: string } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null, headers: response.headers };
}

async function signIn(key: string, facilityCode: string | undefined, username: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityCode, username, password })
  });
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(200);
  tokens[key] = json.data.accessToken;
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await signIn('platform', undefined, 'platform', 'platform123');
  await signIn('storesA', FACILITY_A.code, 'billing', DEMO_USERS.billing);
  await signIn('labB', FACILITY_B.code, 'lab', DEMO_USERS.lab);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('Gustav Biomed vendor portal', () => {
  it('issues a one-time setup link and activates an isolated vendor identity', async () => {
    const invite = await call('POST', '/platform/vendor-partners/gustav-biomed-limited/invitations', {
      token: tokens.platform,
      body: { fullName: 'Gustav Service Lead', email: accountEmail }
    });
    expect(invite.status, invite.text).toBe(201);
    expect(invite.json.data.setupUrl).toContain('#/vendor/activate?token=');
    expect(invite.json.data).not.toHaveProperty('password');
    setupToken = new URLSearchParams(new URL(invite.json.data.setupUrl).hash.split('?')[1] || '').get('token') || '';
    expect(setupToken.length).toBeGreaterThanOrEqual(32);

    const activated = await call('POST', '/vendor/auth/activate', { body: { token: setupToken, password: accountPassword } });
    expect(activated.status, activated.text).toBe(200);
    expect(activated.json.data.user).toMatchObject({ email: accountEmail, fullName: 'Gustav Service Lead' });
    expect(activated.headers.get('set-cookie')).toContain('vendor_refresh_token=');
    expect(activated.headers.get('set-cookie')).toContain('HttpOnly');
    vendorUserId = activated.json.data.user.id;
    tokens.vendor = activated.json.data.accessToken;
    refreshCookie = activated.headers.get('set-cookie')?.split(';')[0] || '';
    expect(refreshCookie).toContain('vendor_refresh_token=');

    const replay = await call('POST', '/vendor/auth/activate', { body: { token: setupToken, password: accountPassword } });
    expect(replay.status).toBe(400);
  });

  it('lists only Gustav-assigned requests across facilities and omits internal and patient data', async () => {
    requestMarker = `VendorPortal-${randomUUID().slice(0, 8)}`;
    const supply = await call('POST', '/stores/gustav-biomed/requests', {
      token: tokens.storesA,
      body: {
        requestingUnit: `Stores ${requestMarker}`,
        confirmNoPatientData: true,
        supplyCategory: 'REAGENTS',
        itemDescription: `Vendor-visible reagent request ${requestMarker}`,
        quantity: 2,
        quantityUnit: 'kits',
        notes: 'This internal Stores note must not be shown to the supplier.'
      }
    });
    expect(supply.status, supply.text).toBe(201);
    supplyRequestId = supply.json.data.id;
    expect(supply.json.data.supplierPartner.code).toBe('GUSTAV_BIOMED');
    await runAsSystem('vendor portal integration fixture', () => prisma.gustavBiomedRequest.update({
      where: { id: supplyRequestId },
      data: { statusNote: 'Confidential internal note must not be shared with the supplier.' }
    }));

    const maintenance = await call('POST', '/lab/gustav-biomed/maintenance-requests', {
      token: tokens.labB,
      body: {
        requestingUnit: `Laboratory ${requestMarker}`,
        confirmNoPatientData: true,
        analyzerName: `Analyzer ${requestMarker}`,
        serviceDescription: `Routine maintenance ${requestMarker}`,
        notes: 'Internal department note.'
      }
    });
    expect(maintenance.status, maintenance.text).toBe(201);
    maintenanceRequestId = maintenance.json.data.id;

    const otherId = `other-vendor-${randomUUID()}`;
    const otherCode = `OTHER_${randomUUID().slice(0, 8)}`;
    await runAsSystem('vendor portal integration fixture', () => prisma.vendorPartner.create({
      data: { id: otherId, code: otherCode, name: 'Other Supplier', isActive: true }
    }));
    const otherRequest = await call('POST', '/stores/gustav-biomed/requests', {
      token: tokens.storesA,
      body: {
        requestingUnit: `Stores ${requestMarker}`,
        confirmNoPatientData: true,
        supplyCategory: 'MEDICAL_EQUIPMENT',
        itemDescription: `Other partner request ${requestMarker}`,
        quantity: 1,
        quantityUnit: 'unit'
      }
    });
    expect(otherRequest.status, otherRequest.text).toBe(201);
    otherPartnerRequestId = otherRequest.json.data.id;
    await runAsSystem('vendor portal integration fixture', () => prisma.gustavBiomedRequest.update({
      where: { id: otherPartnerRequestId },
      data: { supplierPartnerId: otherId }
    }));

    const listed = await call('GET', `/vendor/requests?search=${encodeURIComponent(requestMarker)}&limit=100`, { token: tokens.vendor });
    expect(listed.status, listed.text).toBe(200);
    const items = listed.json.data.items as Array<Record<string, any>>;
    expect(items.some((item) => item.id === supplyRequestId)).toBe(true);
    expect(items.some((item) => item.id === maintenanceRequestId)).toBe(true);
    expect(items.some((item) => item.id === otherPartnerRequestId)).toBe(false);
    expect(items.find((item) => item.id === supplyRequestId)?.facility.code).toBe(FACILITY_A.code);
    expect(items.find((item) => item.id === maintenanceRequestId)?.facility.code).toBe(FACILITY_B.code);
    expect(items.find((item) => item.id === supplyRequestId)).not.toHaveProperty('notes');
    expect(items.find((item) => item.id === supplyRequestId)).not.toHaveProperty('statusNote');
    expect(items.find((item) => item.id === supplyRequestId)?.vendorStatusNote).toBeNull();
    expect(items.find((item) => item.id === supplyRequestId)).not.toHaveProperty('requestedBy');
    expect(items.find((item) => item.id === supplyRequestId)).not.toHaveProperty('patientId');
    expect(listed.json.data.counts).toHaveProperty('PENDING');

    const otherDetail = await call('GET', `/vendor/requests/${encodeURIComponent(otherPartnerRequestId)}`, { token: tokens.vendor });
    expect(otherDetail.status).toBe(404);

    const staffOnlyRoute = await call('GET', '/stores/gustav-biomed/requests', { token: tokens.vendor });
    expect(staffOnlyRoute.status).toBe(401);
  });

  it('enforces supplier status transitions, records audit entries, and rotates the refresh cookie', async () => {
    const missingNote = await call('PATCH', `/vendor/requests/${encodeURIComponent(supplyRequestId)}/status`, {
      token: tokens.vendor,
      body: { status: 'SCHEDULED' }
    });
    expect(missingNote.status).toBe(400);

    const acknowledged = await call('PATCH', `/vendor/requests/${encodeURIComponent(supplyRequestId)}/status`, {
      token: tokens.vendor,
      body: { status: 'ACKNOWLEDGED' }
    });
    expect(acknowledged.status, acknowledged.text).toBe(200);
    expect(acknowledged.json.data.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.json.data).not.toHaveProperty('notes');

    const scheduled = await call('PATCH', `/vendor/requests/${encodeURIComponent(supplyRequestId)}/status`, {
      token: tokens.vendor,
      body: { status: 'SCHEDULED', statusNote: 'Service visit planned for next Tuesday at 10:00.' }
    });
    expect(scheduled.status, scheduled.text).toBe(200);
    expect(scheduled.json.data.vendorStatusNote).toBe('Service visit planned for next Tuesday at 10:00.');
    expect(scheduled.json.data).not.toHaveProperty('statusNote');

    const audits = await runAsSystem('vendor portal integration assertion', () => prisma.vendorPortalAudit.findMany({
      where: { requestId: supplyRequestId, vendorUserId },
      orderBy: { createdAt: 'asc' }
    }));
    expect(audits.some((entry) => entry.action === 'REQUEST_STATUS_UPDATED' && entry.newStatus === 'ACKNOWLEDGED')).toBe(true);
    expect(audits.some((entry) => entry.action === 'REQUEST_STATUS_UPDATED' && entry.newStatus === 'SCHEDULED')).toBe(true);

    expect(refreshCookie).toContain('vendor_refresh_token=');
    const [refreshOne, refreshTwo] = await Promise.all([
      call('POST', '/vendor/auth/refresh', { cookie: refreshCookie }),
      call('POST', '/vendor/auth/refresh', { cookie: refreshCookie })
    ]);
    expect(refreshOne.status, refreshOne.text).toBe(200);
    expect(refreshTwo.status, refreshTwo.text).toBe(200);
    const winner = refreshOne.headers.get('set-cookie') ? refreshOne : refreshTwo;
    expect(winner.headers.get('set-cookie')).toContain('vendor_refresh_token=');
    tokens.vendor = refreshOne.json.data.accessToken;
    refreshCookie = winner.headers.get('set-cookie')?.split(';')[0] || refreshCookie;
  });

  it('revokes existing vendor sessions when a platform operator deactivates the account', async () => {
    const deactivated = await call('PATCH', `/platform/vendor-portal-users/${encodeURIComponent(vendorUserId)}/status`, {
      token: tokens.platform,
      body: { status: 'INACTIVE' }
    });
    expect(deactivated.status, deactivated.text).toBe(200);
    expect(deactivated.json.data.status).toBe('INACTIVE');
    const statusAudit = await runAsSystem('vendor portal integration assertion', () => prisma.vendorPortalAudit.findFirst({
      where: { vendorUserId, action: 'ACCOUNT_INACTIVE' },
      orderBy: { createdAt: 'desc' }
    }));
    expect(statusAudit?.actorPlatformUserId).toBeTruthy();
    const rejected = await call('GET', '/vendor/requests', { token: tokens.vendor });
    expect(rejected.status).toBe(401);
  });
});

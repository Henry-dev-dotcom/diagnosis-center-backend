import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { CatalogItemType, DepartmentType } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { apiRouter } from '../../src/routes/index.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A } from './fixtures.js';

// A facility that subscribes to only some departments.
const CODE = `D${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const ENABLED = ['reception', 'laboratory', 'clinician_portal'];
const ADMIN_PASSWORD = 'delta-admin-pass-1';

let server: Server;
let baseUrl: string;
let platformToken: string;
let adminToken: string;
let facilityId: string;
let labItemId: string;
let scanItemId: string;

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

const send = (method: string, path: string, token: string, body?: unknown) =>
  api(path, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });

async function login(facilityCode: string | undefined, username: string, password: string) {
  const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ facilityCode, username, password }) });
  expect(res.status, res.text).toBe(200);
  return res.json.data as { accessToken: string; user: { modules: string[]; permissions: string[]; customRole: { name: string } | null } };
}

function parameterlessGetRoutes(): string[] {
  const paths = new Set<string>();
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route?.methods?.get && typeof layer.route.path === 'string' && !layer.route.path.includes(':')) paths.add(layer.route.path);
      else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((apiRouter as any).stack);
  return [...paths].sort();
}

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  platformToken = (await login(undefined, 'platform', 'platform123')).accessToken;

  const created = await send('POST', '/platform/facilities', platformToken, {
    code: CODE,
    name: 'Delta Lab Clinic',
    modules: ENABLED,
    admin: { name: 'Delta Admin', username: 'admin', password: ADMIN_PASSWORD }
  });
  expect(created.status, created.text).toBe(201);
  facilityId = created.json.data.facility.id;
  expect(created.json.data.facility.modules).toEqual([...ENABLED].sort());

  // A small catalog: one lab test and one scan.
  const items = await runWithFacility(facilityId, async () => {
    const dept = await prisma.department.create({ data: { name: 'Lab', code: 'LAB', type: DepartmentType.LABORATORY } });
    const lab = await prisma.catalogItem.create({ data: { catalogCode: 'FBC', name: 'FBC', type: CatalogItemType.LAB, price: 50, departmentId: dept.id } });
    const scan = await prisma.catalogItem.create({ data: { catalogCode: 'XR', name: 'Chest X-ray', type: CatalogItemType.SCAN, price: 120 } });
    return { lab: lab.id, scan: scan.id };
  });
  labItemId = items.lab;
  scanItemId = items.scan;

  adminToken = (await login(CODE, 'admin', ADMIN_PASSWORD)).accessToken;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('department modules', () => {
  it('sign-in tells the frontend which modules are on', async () => {
    const session = await login(CODE, 'admin', ADMIN_PASSWORD);
    expect(session.user.modules).toEqual([...ENABLED].sort());
  });

  it('switched-off modules answer 403 MODULE_DISABLED; switched-on ones work', async () => {
    for (const path of ['/billing/invoices', '/finance/shifts', '/scan/queue', '/results', '/reports/dashboard', '/encounters']) {
      const res = await api(path, { token: adminToken });
      expect(res.status, `${path}: ${res.text.slice(0, 160)}`).toBe(403);
      expect(res.json.code).toBe('MODULE_DISABLED');
    }
    for (const path of ['/reception/incoming-orders', '/lab/queue', '/doctor/profile', '/patients']) {
      const res = await api(path, { token: adminToken });
      expect(res.status, `${path}: ${res.text.slice(0, 160)}`).not.toBe(403);
    }
  });

  it('no endpoint errors when modules are off', async () => {
    const failures: string[] = [];
    for (const path of parameterlessGetRoutes()) {
      const res = await api(path, { token: adminToken });
      if (res.status >= 500) failures.push(`${path} -> ${res.status} ${res.text.slice(0, 160)}`);
    }
    expect(failures).toEqual([]);
  });

  it('a walk-in for a lab test works and raises no invoice without Billing', async () => {
    const res = await send('POST', '/reception/walk-ins', adminToken, {
      patient: { firstName: 'Delta', lastName: 'Walkin', phone: '+233200000001' },
      requestedItems: [{ catalogItemId: labItemId }]
    });
    expect(res.status, res.text).toBe(201);
    const invoices = await runWithFacility(facilityId, () => prisma.invoice.count());
    expect(invoices).toBe(0);
  });

  it('refuses to order a scan while Imaging is off', async () => {
    const res = await send('POST', '/reception/walk-ins', adminToken, {
      patient: { firstName: 'Delta', lastName: 'Scan', phone: '+233200000002' },
      requestedItems: [{ catalogItemId: scanItemId }]
    });
    expect(res.status, res.text).toBe(400);
    expect(res.json.code).toBe('MODULE_DISABLED');
  });

  it('the platform can switch a module on, and it applies on the next request', async () => {
    const on = await send('PUT', `/platform/facilities/${facilityId}/modules`, platformToken, { modules: [...ENABLED, 'imaging'] });
    expect(on.status, on.text).toBe(200);
    expect((await api('/scan/queue', { token: adminToken })).status).toBe(200);

    await send('PUT', `/platform/facilities/${facilityId}/modules`, platformToken, { modules: ENABLED });
    expect((await api('/scan/queue', { token: adminToken })).status).toBe(403);
  });

  it('rejects a module set with a missing dependency (Finance without Billing)', async () => {
    const res = await send('PUT', `/platform/facilities/${facilityId}/modules`, platformToken, { modules: [...ENABLED, 'finance'] });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Finance requires Billing/);
  });

  it('module changes in one facility do not touch another', async () => {
    const alpha = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    expect(alpha.user.modules).toContain('billing');
    expect((await api('/billing/invoices', { token: alpha.accessToken })).status).toBe(200);
  });
});

describe('custom staff roles', () => {
  let roleId: string;

  it('an admin creates a narrow role and assigns it to a user', async () => {
    const role = await send('POST', '/admin/roles', adminToken, {
      name: 'Lab Reader',
      baseRole: 'LAB_STAFF',
      permissions: ['lab:queue:read', 'system:read']
    });
    expect(role.status, role.text).toBe(201);
    roleId = role.json.data.id;

    const user = await send('POST', '/admin/users', adminToken, {
      name: 'Reader One',
      username: 'reader',
      customRoleId: roleId,
      password: 'reader-pass-1'
    });
    expect(user.status, user.text).toBe(201);
    expect(user.json.data.role).toBe('LAB_STAFF');
    expect(user.json.data.customRole.name).toBe('Lab Reader');
  });

  it('the role\'s permissions replace the base role\'s defaults', async () => {
    const session = await login(CODE, 'reader', 'reader-pass-1');
    expect(session.user.customRole?.name).toBe('Lab Reader');
    expect(session.user.permissions).toEqual(['lab:queue:read', 'system:read']);
    expect((await api('/lab/queue', { token: session.accessToken })).status).toBe(200);
    // A default LAB_STAFF permission the custom role does not grant:
    const inventory = await api('/lab/inventory', { token: session.accessToken });
    expect(inventory.status).toBe(403);
    expect(inventory.json.code).toBe('FORBIDDEN_PERMISSION');
  });

  it('editing the role changes access on the next request', async () => {
    const session = await login(CODE, 'reader', 'reader-pass-1');
    await send('PATCH', `/admin/roles/${roleId}`, adminToken, { permissions: ['lab:queue:read', 'lab:inventory:manage'] });
    expect((await api('/lab/inventory', { token: session.accessToken })).status).toBe(200);
  });

  it('refuses platform or admin permissions and admin base roles', async () => {
    const platformPerm = await send('POST', '/admin/roles', adminToken, { name: 'Sneaky', baseRole: 'LAB_STAFF', permissions: ['platform:facilities:manage'] });
    expect(platformPerm.status).toBe(400);
    const adminPerm = await send('POST', '/admin/roles', adminToken, { name: 'Sneaky2', baseRole: 'LAB_STAFF', permissions: ['admin:users:manage'] });
    expect(adminPerm.status).toBe(400);
    const adminBase = await send('POST', '/admin/roles', adminToken, { name: 'Sneaky3', baseRole: 'ADMIN', permissions: [] });
    expect(adminBase.status).toBe(400);
  });

  it('cannot delete a role that is in use', async () => {
    expect((await send('DELETE', `/admin/roles/${roleId}`, adminToken)).status).toBe(409);
  });

  it('cannot see or assign another facility\'s roles', async () => {
    const alpha = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    const roles = await api('/admin/roles', { token: alpha.accessToken });
    expect(roles.json.data.custom.map((r: { id: string }) => r.id)).not.toContain(roleId);
    const assign = await send('POST', '/admin/users', alpha.accessToken, {
      name: 'Borrowed Role',
      username: 'borrowed',
      customRoleId: roleId,
      password: 'borrowed-pass-1'
    });
    expect(assign.status).toBe(404);
  });

  it('switching a user back to a base role clears the custom role', async () => {
    const users = await api('/admin/users', { token: adminToken });
    const reader = users.json.data.items.find((u: { username: string }) => u.username === 'reader');
    const updated = await send('PATCH', `/admin/users/${reader.id}`, adminToken, { role: 'RECEPTIONIST' });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.json.data.customRole).toBeNull();
    expect((await send('DELETE', `/admin/roles/${roleId}`, adminToken)).status).toBe(200);
  });
});

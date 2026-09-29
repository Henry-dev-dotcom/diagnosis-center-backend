import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { exportableModels } from '../../src/services/dataExport.service.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

// Phase 7: a facility's complete data export (Act 843 access and portability).
let server: Server;
let base: string;

const get = (path: string, token: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
async function login(facilityCode: string | undefined, username: string, password: string) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facilityCode, username, password }) });
  return (await res.json()).data.accessToken as string;
}

beforeAll(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('facility data export', () => {
  it('covers every facility table', () => {
    const names = exportableModels().map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['Patient', 'Encounter', 'Invoice', 'User', 'AuditLog', 'Subscription']));
    expect(names).not.toContain('Plan');
    expect(names).not.toContain('Facility');
  });

  it('downloads everything of one facility and nothing of another, without secrets', async () => {
    const admin = await login(FACILITY_A.code, 'admin', DEMO_USERS.admin);
    const res = await get('/admin/data-export', admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="lhims-ALPHA-/);
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.formatVersion).toBe(1);
    expect(data.facility.code).toBe(FACILITY_A.code);

    // Row counts match the database for this facility.
    const [patients, users] = await runWithFacility(FACILITY_A.id, () => Promise.all([prisma.patient.count(), prisma.user.count()]));
    expect(data.tables.Patient).toHaveLength(patients);
    expect(data.counts.User).toBe(users);

    // Only this facility's rows.
    for (const [table, rows] of Object.entries(data.tables as Record<string, { facilityId: string }[]>)) {
      for (const row of rows) expect(row.facilityId, table).toBe(FACILITY_A.id);
    }
    expect(text).not.toContain(FACILITY_B.id);

    // Secrets are replaced, never exported.
    const hash = await runWithFacility(FACILITY_A.id, () => prisma.user.findFirstOrThrow({ where: { username: 'admin' }, select: { passwordHash: true } }));
    expect(text).not.toContain(hash.passwordHash);
    expect(data.tables.User.every((u: { passwordHash: string }) => u.passwordHash === '[not exported]')).toBe(true);

    const audit = await runWithFacility(FACILITY_A.id, () => prisma.auditLog.count({ where: { action: 'DATA_EXPORTED' } }));
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('is for administrators only, and never during a support session', async () => {
    const nurse = await login(FACILITY_A.code, 'nurse', DEMO_USERS.nurse);
    expect((await get('/admin/data-export', nurse)).status).toBe(403);

    const platform = await login(undefined, 'platform', 'platform123');
    const support = await fetch(`${base}/platform/facilities/${FACILITY_A.id}/support-session`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${platform}` }, body: JSON.stringify({ reason: 'Checking the export for a support ticket' })
    });
    expect(support.status).toBe(201);
    const token = (await support.json()).data.accessToken as string;
    const res = await get('/admin/data-export', token);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SUPPORT_SESSION_READ_ONLY');
  });
});

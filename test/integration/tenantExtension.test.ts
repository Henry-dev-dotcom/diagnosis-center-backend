import { randomUUID } from 'node:crypto';
import { DepartmentType } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/services/prisma.service.js';
import { runAsPlatform, runAsSystem, runWithFacility } from '../../src/services/tenantContext.js';

// Two throwaway facilities, separate from the seeded ALPHA/BRAVO data.
const suffix = randomUUID().slice(0, 8);
const A = `fac_ext_a_${suffix}`;
const B = `fac_ext_b_${suffix}`;
const inA = <T>(fn: () => Promise<T>) => runWithFacility(A, fn);
const inB = <T>(fn: () => Promise<T>) => runWithFacility(B, fn);

async function department(code: string) {
  return prisma.department.create({ data: { name: `Dept ${code}`, code, type: DepartmentType.LABORATORY } });
}

async function patient(code: string, extra: Record<string, unknown> = {}) {
  return prisma.patient.create({ data: { patientCode: code, firstName: 'Test', lastName: code, ...extra } });
}

beforeAll(async () => {
  await prisma.facility.createMany({
    data: [
      { id: A, code: `EXTA${suffix}`.toUpperCase(), name: 'Extension A' },
      { id: B, code: `EXTB${suffix}`.toUpperCase(), name: 'Extension B' }
    ]
  });
});

describe('tenant extension: context rules', () => {
  it('refuses tenant queries with no facility context', async () => {
    await expect(prisma.patient.findMany()).rejects.toMatchObject({ code: 'TENANT_CONTEXT_MISSING' });
    await expect(patient('NOCTX')).rejects.toMatchObject({ code: 'TENANT_CONTEXT_MISSING' });
  });

  it('refuses tenant queries in platform context', async () => {
    await expect(runAsPlatform(() => prisma.patient.count())).rejects.toMatchObject({
      code: 'TENANT_DATA_FORBIDDEN_FOR_PLATFORM'
    });
  });

  it('leaves non-tenant models (Facility) usable without context', async () => {
    expect(await prisma.facility.findUnique({ where: { id: A } })).not.toBeNull();
  });

  it('allows log writes without context', async () => {
    const log = await prisma.auditLog.create({ data: { action: 'TEST', module: 'Test' } });
    expect(log.facilityId).toBeNull();
  });

  it('system context sees every facility', async () => {
    await inA(() => department(`SYS-A-${suffix}`));
    await inB(() => department(`SYS-B-${suffix}`));
    const codes = await runAsSystem('test', () => prisma.department.findMany({ where: { code: { startsWith: 'SYS-' } } }));
    expect(codes.map((d) => d.facilityId)).toEqual(expect.arrayContaining([A, B]));
  });
});

describe('tenant extension: isolation', () => {
  it('stamps creates with the current facility', async () => {
    const dept = await inA(() => department(`STAMP-${suffix}`));
    expect(dept.facilityId).toBe(A);
  });

  it('ignores a facilityId supplied by the caller', async () => {
    const dept = await inA(() =>
      prisma.department.create({ data: { name: 'Spoof', code: `SPOOF-${suffix}`, type: DepartmentType.IMAGING, facilityId: B } })
    );
    expect(dept.facilityId).toBe(A);
  });

  it('hides other facilities from reads, counts, aggregates and groupBy', async () => {
    const other = await inB(() => department(`HIDDEN-${suffix}`));
    await inA(async () => {
      expect(await prisma.department.findUnique({ where: { id: other.id } })).toBeNull();
      expect(await prisma.department.findFirst({ where: { code: other.code } })).toBeNull();
      const all = await prisma.department.findMany();
      expect(all.every((d) => d.facilityId === A)).toBe(true);
      expect(await prisma.department.count({ where: { id: other.id } })).toBe(0);
      const grouped = await prisma.department.groupBy({ by: ['facilityId'], _count: true });
      expect(grouped.map((g) => g.facilityId)).toEqual([A]);
    });
  });

  it('cannot update or delete another facility\'s rows', async () => {
    const other = await inB(() => department(`LOCKED-${suffix}`));
    await inA(async () => {
      await expect(prisma.department.update({ where: { id: other.id }, data: { name: 'hijacked' } })).rejects.toMatchObject({
        code: 'P2025'
      });
      await expect(prisma.department.delete({ where: { id: other.id } })).rejects.toMatchObject({ code: 'P2025' });
      expect((await prisma.department.updateMany({ where: { id: other.id }, data: { name: 'x' } })).count).toBe(0);
      expect((await prisma.department.deleteMany({ where: { id: other.id } })).count).toBe(0);
    });
    const still = await inB(() => prisma.department.findUnique({ where: { id: other.id } }));
    expect(still?.name).toBe(other.name);
  });

  it('refuses to move a row to another facility', async () => {
    const dept = await inA(() => department(`MOVE-${suffix}`));
    await expect(inA(() => prisma.department.update({ where: { id: dept.id }, data: { facilityId: B } }))).rejects.toMatchObject({
      code: 'TENANT_REASSIGNMENT_FORBIDDEN'
    });
  });

  it('allows the same code in two facilities (per-facility uniqueness)', async () => {
    const code = `SAME-${suffix}`;
    const a = await inA(() => department(code));
    const b = await inB(() => department(code));
    expect(a.facilityId).toBe(A);
    expect(b.facilityId).toBe(B);
    await expect(inA(() => department(code))).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('tenant extension: nested writes and transactions', () => {
  it('stamps nested creates (unchecked input)', async () => {
    const created = await inA(() =>
      patient(`NEST-${suffix}`, { contacts: { create: [{ type: 'phone', value: '0200000000' }] } })
    );
    const contacts = await inA(() => prisma.patientContact.findMany({ where: { patientId: created.id } }));
    expect(contacts).toHaveLength(1);
    expect(contacts[0].facilityId).toBe(A);
  });

  it('stamps nested creates under an update', async () => {
    const p = await inA(() => patient(`NESTUPD-${suffix}`));
    await inA(() =>
      prisma.patient.update({ where: { id: p.id }, data: { contacts: { create: { type: 'email', value: 'a@b.c' } } } })
    );
    const contacts = await inA(() => prisma.patientContact.findMany({ where: { patientId: p.id } }));
    expect(contacts[0]?.facilityId).toBe(A);
  });

  it('stamps unchecked creates that mix scalar foreign keys with nested back-relation creates', async () => {
    // Same shape as an order (patientId + items: { create }): a scalar FK
    // (hospitalId) plus a nested back-relation list (contacts).
    const hospital = await inA(() => prisma.hospital.create({ data: { name: 'Referrer', code: `REF-${suffix}` } }));
    const created = await inA(() =>
      patient(`MIXED-${suffix}`, { hospitalId: hospital.id, contacts: { create: [{ type: 'phone', value: '2' }] } })
    );
    expect(created.facilityId).toBe(A);
    const contacts = await inA(() => prisma.patientContact.findMany({ where: { patientId: created.id } }));
    expect(contacts[0]?.facilityId).toBe(A);
  });

  it('stamps creates that use relation (checked) input', async () => {
    const p = await inA(() => patient(`CHECKED-${suffix}`));
    const contact = await inA(() =>
      prisma.patientContact.create({ data: { type: 'phone', value: '1', patient: { connect: { id: p.id } } } })
    );
    expect(contact.facilityId).toBe(A);
  });

  it('refuses to connect to another facility\'s row', async () => {
    const otherPatient = await inB(() => patient(`FOREIGN-${suffix}`));
    await expect(
      inA(() => prisma.patientContact.create({ data: { type: 'phone', value: '1', patient: { connect: { id: otherPatient.id } } } }))
    ).rejects.toThrow();
  });

  it('scopes interactive transactions', async () => {
    const other = await inB(() => department(`TXB-${suffix}`));
    const result = await inA(() =>
      prisma.$transaction(async (tx) => {
        const created = await tx.department.create({ data: { name: 'Tx', code: `TXA-${suffix}`, type: DepartmentType.RECEPTION } });
        const seen = await tx.department.findUnique({ where: { id: other.id } });
        return { created, seen };
      })
    );
    expect(result.created.facilityId).toBe(A);
    expect(result.seen).toBeNull();
  });

  it('scopes batch transactions', async () => {
    const other = await inB(() => department(`BATCHB-${suffix}`));
    const [created, seen] = await inA(() =>
      prisma.$transaction([
        prisma.department.create({ data: { name: 'Batch', code: `BATCHA-${suffix}`, type: DepartmentType.ADMIN } }),
        prisma.department.findUnique({ where: { id: other.id } })
      ])
    );
    expect(created.facilityId).toBe(A);
    expect(seen).toBeNull();
  });

  it('stamps createMany rows', async () => {
    await inA(() =>
      prisma.department.createMany({
        data: [
          { name: 'M1', code: `MANY1-${suffix}`, type: DepartmentType.LABORATORY },
          { name: 'M2', code: `MANY2-${suffix}`, type: DepartmentType.LABORATORY }
        ]
      })
    );
    const rows = await runAsSystem('test', () => prisma.department.findMany({ where: { code: { startsWith: 'MANY' } } }));
    expect(rows.filter((r) => r.code.endsWith(suffix)).every((r) => r.facilityId === A)).toBe(true);
  });

  it('upsert creates in the current facility and cannot update another\'s', async () => {
    const other = await inB(() => department(`UPS-${suffix}`));
    const upserted = await inA(() =>
      prisma.department.upsert({
        where: { id: other.id },
        update: { name: 'hijacked' },
        create: { name: 'fresh', code: `UPSA-${suffix}`, type: DepartmentType.IMAGING }
      })
    );
    expect(upserted.facilityId).toBe(A);
    expect(upserted.name).toBe('fresh');
    const untouched = await inB(() => prisma.department.findUnique({ where: { id: other.id } }));
    expect(untouched?.name).toBe(other.name);
  });
});

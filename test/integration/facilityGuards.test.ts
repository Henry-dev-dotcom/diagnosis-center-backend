import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/services/prisma.service.js';
import { runAsSystem, runWithFacility } from '../../src/services/tenantContext.js';
import { guardedReferences } from '../../scripts/facility-guards.js';
import { FACILITY_A, FACILITY_B } from './fixtures.js';

describe('same-facility reference guards (database triggers)', () => {
  it('every tenant foreign key in the schema has a guard installed', async () => {
    const rows = await prisma.$queryRaw<Array<{ table: string; args: string }>>`
      SELECT c.relname AS table, encode(t.tgargs, 'escape') AS args
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'lhims_same_facility'`;
    const installed = new Map(rows.map((r) => [r.table, r.args.split('\\000').filter(Boolean)]));

    const missing: string[] = [];
    for (const [table, refs] of guardedReferences()) {
      const args = installed.get(table) ?? [];
      for (const ref of refs) {
        const at = args.indexOf(ref.column);
        if (at < 0 || args[at + 1] !== ref.target) missing.push(`${table}.${ref.column} -> ${ref.target}`);
      }
    }
    // If this fails, regenerate: npx tsx scripts/facility-guards.ts > a new migration.
    expect(missing).toEqual([]);
  });

  it('rejects a create that references another facility\'s row by raw id', async () => {
    const bravoPatient = await runWithFacility(FACILITY_B.id, () => prisma.patient.findFirstOrThrow());
    await expect(
      runWithFacility(FACILITY_A.id, () =>
        prisma.patientContact.create({ data: { patientId: bravoPatient.id, type: 'phone', value: '0' } })
      )
    ).rejects.toThrow(/Cross-facility reference rejected/);
  });

  it('rejects an update that re-points a reference into another facility', async () => {
    const [alphaContact, bravoPatient] = await Promise.all([
      runWithFacility(FACILITY_A.id, () => prisma.patientContact.findFirstOrThrow()),
      runWithFacility(FACILITY_B.id, () => prisma.patientContact.findFirstOrThrow())
    ]);
    await expect(
      runWithFacility(FACILITY_A.id, () =>
        prisma.patientContact.update({ where: { id: alphaContact.id }, data: { patientId: bravoPatient.patientId } })
      )
    ).rejects.toThrow(/Cross-facility reference rejected/);
  });

  it('still allows same-facility references, including rows created earlier in the same transaction', async () => {
    const code = `GUARD-${randomUUID().slice(0, 8)}`;
    const contact = await runWithFacility(FACILITY_A.id, () =>
      prisma.$transaction(async (tx) => {
        const patient = await tx.patient.create({ data: { patientCode: code, firstName: 'Guard', lastName: 'Test' } });
        return tx.patientContact.create({ data: { patientId: patient.id, type: 'phone', value: '1' } });
      })
    );
    expect(contact.facilityId).toBe(FACILITY_A.id);
  });

  it('also stops raw SQL that bypasses the Prisma extension', async () => {
    const bravoPatient = await runWithFacility(FACILITY_B.id, () => prisma.patient.findFirstOrThrow());
    await expect(
      runAsSystem('test', () =>
        prisma.$executeRaw`INSERT INTO "PatientContact" ("id", "facilityId", "patientId", "type", "value")
          VALUES (${randomUUID()}, ${FACILITY_A.id}, ${bravoPatient.id}, 'phone', '0')`
      )
    ).rejects.toThrow(/Cross-facility reference rejected/);
  });
});

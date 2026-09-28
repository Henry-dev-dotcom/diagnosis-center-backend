/*
  Same-facility reference guards.

  Every foreign key from one tenant-owned table to another must point at a row
  in the same facility. The Prisma tenant extension scopes queries, but a create
  that passes a raw id (`patientId: '<another facility's id>'`) would otherwise
  link across facilities. A trigger per table enforces the rule in PostgreSQL,
  so it also covers raw SQL and rows created earlier in the same transaction.

  Log tables (AuditLog, SystemEvent, ApiRequestLog) are excluded: they are written
  by system code, sometimes before a facility is known.

  Usage:
    npx tsx scripts/facility-guards.ts            print the SQL for a migration
  The integration test test/integration/facilityGuards.test.ts fails when the
  schema gains a tenant foreign key that has no guard, so regenerate then.
*/
import { Prisma } from '@prisma/client';

const LOG_TABLES = new Set(['AuditLog', 'SystemEvent', 'ApiRequestLog']);

export type GuardedReference = { column: string; target: string };

export function guardedReferences(): Map<string, GuardedReference[]> {
  const models = Prisma.dmmf.datamodel.models;
  const tenant = new Set(models.filter((m) => m.fields.some((f) => f.name === 'facilityId')).map((m) => m.name));
  const result = new Map<string, GuardedReference[]>();
  for (const model of models) {
    if (!tenant.has(model.name) || LOG_TABLES.has(model.name)) continue;
    const refs: GuardedReference[] = [];
    for (const field of model.fields) {
      if (field.kind !== 'object' || field.type === 'Facility' || !tenant.has(field.type)) continue;
      const from = field.relationFromFields ?? [];
      if (from.length === 0) continue; // the other side owns the foreign key
      if (from.length !== 1 || field.relationToFields?.[0] !== 'id') {
        throw new Error(`${model.name}.${field.name}: only single-column foreign keys to id are supported`);
      }
      refs.push({ column: from[0], target: field.type });
    }
    if (refs.length) result.set(model.name, refs.sort((a, b) => a.column.localeCompare(b.column)));
  }
  return result;
}

export const GUARD_FUNCTION_SQL = `
-- Arguments come in pairs: (foreign key column, referenced table).
CREATE OR REPLACE FUNCTION lhims_enforce_same_facility() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  i integer := 0;
  ref_id text;
  ref_facility text;
  found_rows integer;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I::text', TG_ARGV[i]) INTO ref_id USING NEW;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT "facilityId" FROM %I WHERE "id" = $1', TG_ARGV[i + 1]) INTO ref_facility USING ref_id;
      GET DIAGNOSTICS found_rows = ROW_COUNT;
      -- A missing row is left to the foreign key constraint to report.
      IF found_rows > 0 AND ref_facility IS DISTINCT FROM NEW."facilityId" THEN
        RAISE EXCEPTION 'Cross-facility reference rejected: %.% points at a % row in another facility',
          TG_TABLE_NAME, TG_ARGV[i], TG_ARGV[i + 1]
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;
`.trim();

export function triggerSql(table: string, refs: GuardedReference[]) {
  const columns = ['facilityId', ...refs.map((r) => r.column)].map((c) => `"${c}"`).join(', ');
  const args = refs.map((r) => `'${r.column}', '${r.target}'`).join(', ');
  return [
    `DROP TRIGGER IF EXISTS lhims_same_facility ON "${table}";`,
    `CREATE TRIGGER lhims_same_facility BEFORE INSERT OR UPDATE OF ${columns} ON "${table}"`,
    `  FOR EACH ROW EXECUTE FUNCTION lhims_enforce_same_facility(${args});`
  ].join('\n');
}

export function allGuardsSql() {
  const parts = [GUARD_FUNCTION_SQL];
  for (const [table, refs] of guardedReferences()) parts.push(triggerSql(table, refs));
  return parts.join('\n\n') + '\n';
}

const isEntryPoint = process.argv[1] && /facility-guards\.ts$/.test(process.argv[1].replace(/\\/g, '/'));
if (isEntryPoint) process.stdout.write(allGuardsSql());

#!/usr/bin/env node
/*
  Phase 7: proves a backup restores. Restores the newest backup in BACKUP_DIR
  (or the file given as the first argument) into a throwaway database, then
  compares it with the source: the same migrations applied, and the same
  number of rows in the key tables. Exits 1 on any difference.

  RESTORE_CHECK_DATABASE_URL names the throwaway database; it is dropped and
  re-created, so its name must contain "restore". Defaults to DATABASE_URL
  with the database renamed <name>_restore_check.

  Usage: npm run db:restore-check [-- path/to/file.dump]
*/
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { libpqUrl, sha256, tool } from './db-backup.mjs';

dotenv.config();

const KEY_TABLES = ['Facility', 'User', 'Patient', 'Encounter', 'Order', 'Invoice', 'Payment', 'Prescription', 'Admission', 'Subscription', 'SubscriptionInvoice', 'AuditLog'];

function run(name, args) {
  const result = spawnSync(tool(name), args, { encoding: 'utf8' });
  if (result.error) throw new Error(`${name} could not start (${result.error.message}). Install the PostgreSQL client tools or set PG_BIN.`);
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || '').trim().split('\n').slice(-3).join(' ')}`);
  return result.stdout;
}

async function counts(url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const out = {};
    for (const table of KEY_TABLES) {
      const rows = await client.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`);
      out[table] = rows[0].n;
    }
    const migrations = await client.$queryRawUnsafe('SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
    out._migrations = migrations[0].n;
    return out;
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error('DATABASE_URL is not set');
  const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
  const file = process.argv[2] ? path.resolve(process.argv[2]) : (() => {
    const latest = readdirSync(dir).filter((f) => /^lhims-.*\.dump$/.test(f)).sort().pop();
    if (!latest) throw new Error(`No backups in ${dir}. Run npm run db:backup first.`);
    return path.join(dir, latest);
  })();

  const target = new URL(process.env.RESTORE_CHECK_DATABASE_URL || source);
  if (!process.env.RESTORE_CHECK_DATABASE_URL) target.pathname = `${target.pathname.slice(1)}_restore_check`;
  const targetDb = target.pathname.slice(1);
  if (!/restore/i.test(targetDb)) throw new Error('The restore-check database name must contain "restore" (it is dropped and re-created).');
  if (targetDb === new URL(source).pathname.slice(1)) throw new Error('The restore-check database must not be the source database.');

  console.log(`Checking ${path.basename(file)} (SHA-256 ${await sha256(file)})`);
  const admin = new URL(libpqUrl(target.toString()));
  admin.pathname = '/postgres';
  run('dropdb', ['--if-exists', `--maintenance-db=${admin}`, targetDb]);
  run('createdb', [`--maintenance-db=${admin}`, targetDb]);
  const started = Date.now();
  run('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${libpqUrl(target.toString())}`, file]);
  console.log(`Restored into ${targetDb} in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  const [a, b] = await Promise.all([counts(source), counts(target.toString())]);
  const diffs = Object.keys(a).filter((k) => a[k] !== b[k]);
  console.table(Object.keys(a).map((k) => ({ table: k, source: a[k], restored: b[k], same: a[k] === b[k] ? 'yes' : 'NO' })));
  run('dropdb', ['--if-exists', `--maintenance-db=${admin}`, targetDb]);
  if (diffs.length) {
    console.error(`Restore check FAILED: ${diffs.join(', ')} differ. (If the source changed since the backup, take a new backup and check again.)`);
    process.exit(1);
  }
  console.log('Restore check passed: the backup restores completely.');
}

main().catch((error) => {
  console.error(`Restore check failed: ${error.message}`);
  process.exit(1);
});

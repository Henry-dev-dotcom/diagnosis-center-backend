#!/usr/bin/env node
/*
  Phase 7: database backup. Writes a compressed pg_dump (custom format) of
  DATABASE_URL to BACKUP_DIR (default ./backups), prints its size and SHA-256,
  and keeps the newest BACKUP_KEEP files (default 14).

  Needs the PostgreSQL client tools: on PATH, or set PG_BIN to their folder
  (for example "C:\Program Files\PostgreSQL\13\bin").

  Usage: npm run db:backup
  Pair with: npm run db:restore-check   (proves the backup restores)
*/
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export function tool(name) {
  const bin = process.env.PG_BIN;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return bin ? path.join(bin, exe) : exe;
}

/** pg tools reject Prisma's ?schema= parameter. */
export function libpqUrl(url) {
  const u = new URL(url);
  u.search = '';
  return u.toString();
}

export function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
  const keep = Number(process.env.BACKUP_KEEP || 14);
  mkdirSync(dir, { recursive: true });

  const db = new URL(url).pathname.slice(1) || 'db';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `lhims-${db}-${stamp}.dump`);
  const started = Date.now();
  const run = spawnSync(tool('pg_dump'), ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', `--file=${file}`, libpqUrl(url)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (run.error) throw new Error(`pg_dump could not start (${run.error.message}). Install the PostgreSQL client tools or set PG_BIN.`);
  if (run.status !== 0) throw new Error(`pg_dump failed with exit code ${run.status}`);

  const size = statSync(file).size;
  console.log(`Backup written: ${file}`);
  console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB · ${((Date.now() - started) / 1000).toFixed(1)} s · SHA-256 ${await sha256(file)}`);

  const old = readdirSync(dir).filter((f) => /^lhims-.*\.dump$/.test(f) && f.includes(`-${db}-`)).sort().reverse().slice(keep);
  for (const f of old) {
    unlinkSync(path.join(dir, f));
    console.log(`Removed old backup ${f}`);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('db-backup.mjs')) {
  main().catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
  });
}

#!/usr/bin/env node
/*
  Phase 7: load test with many tenants. No extra packages.

  1. Setup: the platform operator creates LOAD_FACILITIES facilities (LD001,
     LD002, …; reused if they exist), each with an administrator, and each
     administrator registers a few patients whose surname carries the
     facility code.
  2. Load: LOAD_CONCURRENCY virtual users, each signed in to a random
     facility, run a mix of reads and writes for LOAD_SECONDS seconds.
  3. Report: requests per second, latency percentiles per request type,
     errors, and an isolation check — every patient list must contain only
     that facility's patients, even under load.

  Run against a server started for this purpose (its rate limits raised), never
  against production:
    LOAD_BASE_URL=http://localhost:5055/api node scripts/load-test.mjs
  Exits 1 if the error rate is above LOAD_MAX_ERROR_RATE (default 1%), p95
  above LOAD_MAX_P95_MS (default 1500), or any isolation breach.
*/

import { performance } from 'node:perf_hooks';

const BASE = process.env.LOAD_BASE_URL || 'http://localhost:5055/api';
const FACILITIES = Number(process.env.LOAD_FACILITIES || 50);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 40);
const SECONDS = Number(process.env.LOAD_SECONDS || 60);
const PATIENTS_EACH = 3;
const MAX_ERROR_RATE = Number(process.env.LOAD_MAX_ERROR_RATE || 0.01);
const MAX_P95 = Number(process.env.LOAD_MAX_P95_MS || 1500);
const PASSWORD = 'load-test-pass-1';
if (/lhims\.app|onrender\.com|github\.io/.test(BASE)) throw new Error('Refusing to load-test what looks like a production address.');

async function api(method, path, { token, body } = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, ms: performance.now() - started, json: text ? JSON.parse(text) : null };
}

async function login(facilityCode, username, password) {
  const res = await api('POST', '/auth/login', { body: { facilityCode, username, password } });
  if (res.status !== 200) throw new Error(`Sign-in failed for ${facilityCode ?? 'platform'}/${username}: ${res.status} ${res.json?.message}`);
  return res.json.data.accessToken;
}

const code = (i) => `LD${String(i + 1).padStart(3, '0')}`;

async function setup() {
  const platform = await login(undefined, process.env.LOAD_PLATFORM_USER || 'platform', process.env.LOAD_PLATFORM_PASSWORD || 'platform123');
  const tenants = [];
  for (let i = 0; i < FACILITIES; i += 1) {
    const c = code(i);
    const created = await api('POST', '/platform/facilities', { token: platform, body: { code: c, name: `Load Test Hospital ${i + 1}`, admin: { name: `Load Admin ${c}`, username: 'admin', password: PASSWORD } } });
    if (created.status !== 201 && created.json?.code !== 'FACILITY_CODE_TAKEN') throw new Error(`Could not create ${c}: ${created.status} ${created.json?.message}`);
    const token = await login(c, 'admin', PASSWORD);
    const existing = await api('GET', '/patients?limit=100', { token });
    const have = (existing.json?.data?.items ?? existing.json?.data ?? []).length;
    for (let p = have; p < PATIENTS_EACH; p += 1) {
      await api('POST', '/patients', { token, body: { firstName: `Patient${p + 1}`, lastName: `Of${c}`, gender: p % 2 ? 'MALE' : 'FEMALE', phone: `+2332000${String(i).padStart(3, '0')}${p}` } });
    }
    tenants.push({ code: c, token });
    process.stdout.write(`\rSetup: ${i + 1}/${FACILITIES} facilities ready`);
  }
  process.stdout.write('\n');
  return tenants;
}

const stats = new Map();
const record = (name, res, ok) => {
  const s = stats.get(name) ?? { ms: [], errors: 0 };
  s.ms.push(res.ms);
  if (!ok) s.errors += 1;
  stats.set(name, s);
};
const breaches = [];

// The mix of work a busy facility does: mostly reads, some registrations.
const ACTIONS = [
  { name: 'GET /auth/me', weight: 3, run: (t) => api('GET', '/auth/me', { token: t.token }) },
  { name: 'GET /patients', weight: 4, run: async (t) => {
    const res = await api('GET', '/patients?limit=50', { token: t.token });
    const items = res.json?.data?.items ?? res.json?.data ?? [];
    const foreign = items.filter((p) => p.lastName?.startsWith('OfLD') && p.lastName !== `Of${t.code}`);
    if (foreign.length) breaches.push(`${t.code} saw ${foreign.map((p) => p.lastName).join(', ')}`);
    return res;
  } },
  { name: 'GET /catalog', weight: 2, run: (t) => api('GET', '/catalog?limit=50', { token: t.token }) },
  { name: 'GET /onboarding', weight: 1, run: (t) => api('GET', '/onboarding', { token: t.token }) },
  { name: 'GET /admin/audit-logs', weight: 1, run: (t) => api('GET', '/admin/audit-logs?limit=20', { token: t.token }) },
  { name: 'POST /patients', weight: 1, run: (t) => api('POST', '/patients', { token: t.token, body: { firstName: 'Walkin', lastName: `Of${t.code}`, gender: 'FEMALE', phone: '+233200009999' } }) }
];
const bag = ACTIONS.flatMap((a) => Array(a.weight).fill(a));

async function worker(tenants, until) {
  while (Date.now() < until) {
    const tenant = tenants[Math.floor(Math.random() * tenants.length)];
    const action = bag[Math.floor(Math.random() * bag.length)];
    try {
      const res = await action.run(tenant);
      record(action.name, res, res.status < 400);
    } catch {
      record(action.name, { ms: 0 }, false);
    }
  }
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

async function main() {
  console.log(`Load test against ${BASE}: ${FACILITIES} facilities, ${CONCURRENCY} concurrent users, ${SECONDS} s`);
  const tenants = await setup();
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(tenants, started + SECONDS * 1000)));
  const elapsed = (Date.now() - started) / 1000;

  const rows = [];
  let total = 0;
  let errors = 0;
  const all = [];
  for (const [name, s] of stats) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    all.push(...sorted);
    total += sorted.length;
    errors += s.errors;
    rows.push({ request: name, count: sorted.length, errors: s.errors, p50: Math.round(pct(sorted, 50)), p95: Math.round(pct(sorted, 95)), p99: Math.round(pct(sorted, 99)), max: Math.round(sorted.at(-1) ?? 0) });
  }
  all.sort((a, b) => a - b);
  console.table(rows);
  const p95 = Math.round(pct(all, 95));
  const errorRate = total ? errors / total : 1;
  console.log(`Total ${total} requests in ${elapsed.toFixed(0)} s = ${(total / elapsed).toFixed(1)} req/s · p50 ${Math.round(pct(all, 50))} ms · p95 ${p95} ms · errors ${(errorRate * 100).toFixed(2)}%`);
  console.log(breaches.length ? `ISOLATION BREACHES: ${breaches.length}\n${breaches.slice(0, 10).join('\n')}` : 'Isolation: every patient list held only its own facility\'s patients.');

  const failed = breaches.length > 0 || errorRate > MAX_ERROR_RATE || p95 > MAX_P95;
  console.log(failed ? `FAILED (limits: errors ≤ ${MAX_ERROR_RATE * 100}%, p95 ≤ ${MAX_P95} ms, no breaches)` : 'PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`Load test could not run: ${error.message}`);
  process.exit(1);
});

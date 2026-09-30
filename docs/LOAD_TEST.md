# Load test

`npm run test:load` (script: `scripts/load-test.mjs`, no extra packages).

It creates up to 50 facilities (codes `LD001`…`LD050`), each with an administrator and a few
patients, then runs concurrent staff traffic: signing in checks, patient lists, the price list,
the setup checklist, the audit log, and new patient registrations. It reports latency per request
type and checks **isolation under load**: every patient list must contain only that facility's
patients.

Pass limits (override with environment variables): errors ≤ 1% (`LOAD_MAX_ERROR_RATE`),
p95 ≤ 1500 ms (`LOAD_MAX_P95_MS`), no isolation breach.

## How to run

Never against production. Use a separate database and a server started with the rate limits raised:

```bash
createdb lhims_load                                   # PostgreSQL client tools
DATABASE_URL=postgresql://…/lhims_load npx prisma migrate deploy
DATABASE_URL=postgresql://…/lhims_load npx prisma db seed
npm run build
DATABASE_URL=postgresql://…/lhims_load PORT=5055 RATE_LIMIT_MAX_REQUESTS=10000000 AUTH_RATE_LIMIT_MAX_REQUESTS=10000000 node dist/server.js
LOAD_BASE_URL=http://localhost:5055/api npm run test:load
```

Settings: `LOAD_FACILITIES` (50), `LOAD_CONCURRENCY` (40), `LOAD_SECONDS` (60).

## Result, 2026-09-29 (development laptop, one API process, local PostgreSQL 13)

50 facilities, 40 concurrent users, 60 seconds:

| Request | Count | Errors | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|
| GET /catalog | 1303 | 0 | 219 | 296 | 364 |
| GET /onboarding | 645 | 0 | 263 | 338 | 420 |
| GET /patients | 2569 | 0 | 290 | 373 | 445 |
| GET /admin/audit-logs | 650 | 0 | 332 | 422 | 492 |
| GET /auth/me | 1928 | 0 | 349 | 443 | 524 |
| POST /patients | 646 | 0 | 361 | 449 | 500 |

**7,741 requests, 128.6 per second, p95 416 ms, 0 errors, no isolation breach — passed.**

## Result after tuning, 2026-09-30 (same laptop, production mode)

Run in production mode (`NODE_ENV=production`: no per-query logging), 50 facilities, 40 concurrent users, 60 s each:

| Build | Requests/s | p50 ms | p95 ms | Errors | Isolation |
|---|---|---|---|---|---|
| Before tuning | 139.7 | 286 | 374 | 0 | held |
| + departments and subscription state cached per facility (5 s) | 152.7 | 250 | 385 | 0 | held |
| + request logs written in batches (every second or 200 rows) | **234.0** | **163** | **256** | 0 | held |

Per request type after tuning (p50): `GET /catalog` 112 ms, `GET /auth/me` 149, `GET /onboarding` 149, `GET /patients` 175, `GET /admin/audit-logs` 204, `POST /patients` 230. All 32,250 request-log rows were written.

Trade-offs, both deliberate:
- A change to a facility's departments or subscription is seen at once by the server that made it and within 5 seconds by any other server (`ACCESS_CACHE_TTL_MS`; 0 turns caching off).
- If the process crashes, up to one second of request-log rows can be lost. Audit-log entries (who did what) are still written immediately.

## What it means

- One API process now handles about 230 requests a second with 40 users working at once. A busy
  50-bed hospital makes roughly 1–3 requests a second at peak, so one process serves dozens of
  such facilities; add processes behind the load balancer as facilities grow.
- Rate limits are kept per process. With more than one process, move them to a shared store
  (see SECURITY_AND_DATA_PROTECTION.md).

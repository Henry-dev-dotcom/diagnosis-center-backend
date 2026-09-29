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

## What it means

- One API process handled about 130 requests a second with 40 users working at once. A busy
  50-bed hospital makes roughly 1–3 requests a second at peak, so one process serves several
  dozen such facilities; add processes behind the load balancer as facilities grow.
- Latency here is mostly per-request work every call does (session, facility, departments and
  subscription checks, request logging). If needed later: cache the department and subscription
  state for a few seconds per facility, and write request logs in batches.
- Rate limits are kept per process. With more than one process, move them to a shared store
  (see SECURITY_AND_DATA_PROTECTION.md).

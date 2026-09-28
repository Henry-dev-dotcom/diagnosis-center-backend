# Multi-tenancy (Phase 1)

LHIMS hosts many facilities (hospitals, clinics, diagnostic centres) in one
database. A **Facility** is a tenant. Every tenant-owned row has a `facilityId`,
and no facility can read or change another facility's data.

`Hospital` is a different thing: the *referring* hospitals a facility receives
orders from. It is itself tenant-owned.

## Who is who

| Account | `facilityId` | Signs in with | Can reach |
|---|---|---|---|
| Facility staff (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `LAB_STAFF`, `SCAN_STAFF`, `BILLING_STAFF`) | their facility | facility code + username | their facility's data only |
| Platform operator (`PLATFORM_ADMIN`) | `null` | username only (no code) | `/platform/*` only; no facility data |

`requireAuth` enforces that exactly the `PLATFORM_ADMIN` role has no facility, and
rejects requests from users whose facility is `SUSPENDED` or `DISABLED`, so a
suspension takes effect on the next request.

## How isolation is enforced

1. **Request context.** `requireAuth` runs the rest of the request inside
   `runWithFacility(user.facilityId)` (or `runAsPlatform` for the operator), using
   AsyncLocalStorage.
2. **Prisma extension** (`src/services/tenantContext.ts`). For every model with a
   `facilityId` it adds `facilityId` to every `where`, and stamps every create,
   including nested creates, `createMany`, `upsert` and interactive or batch
   transactions. Moving a row to another facility is refused. **It fails
   closed**: a tenant query with no facility context throws `TENANT_CONTEXT_MISSING`.
3. **Fail-loud default.** Required `facilityId` columns default to
   `current_setting('lhims.facility_id')`, which is never set, so an insert that
   somehow skips the extension errors instead of writing an unowned row.
4. **Same-facility guards.** Database triggers (`scripts/facility-guards.ts`)
   reject any foreign key that points into another facility, such as
   `patientId: '<another facility's patient>'`. This also covers raw SQL.

`runAsSystem(reason, fn)` bypasses scoping. It is for authentication lookups,
platform administration and seeds only. Keep call sites few and obvious.

## Rules for new code

- **New tenant table:** add `facilityId String @default(dbgenerated("current_setting('lhims.facility_id'::text)"))`,
  `facility Facility @relation(...)`, `@@index([facilityId])`, and a back-relation
  on `Facility`. Make codes unique per facility with `@@unique([facilityId, code])`.
- **New foreign key between tenant tables:** regenerate the guards
  (`npx tsx scripts/facility-guards.ts`) into a new migration. The integration test
  `facilityGuards.test.ts` fails until you do.
- **No `$queryRaw` in tenant code.** Raw reads are not scoped.
- **Don't return an unstarted query from `runWithFacility` callbacks yourself.**
  The helpers already start it inside the context; just `await` the result.
- **Log tables** (`AuditLog`, `SystemEvent`, `ApiRequestLog`) accept writes with no
  context. Pass `facilityId` explicitly from `req.user` in `res.on('finish')` handlers.

## Tests

`npm run test:integration` (part of `npm run qa`) rebuilds `TEST_DATABASE_URL`,
seeds two facilities with identical demo data (ALPHA, and BRAVO with `B-`-prefixed
ids), and then:

- unit-tests the extension (context rules, nested writes, transactions, upsert),
- signs in as every role in ALPHA and calls every parameterless GET route, failing
  if any response contains BRAVO data or a 5xx (verified to catch a deliberate
  scoping break),
- checks detail reads and updates of BRAVO records by id return 404,
- runs write workflows (walk-in, doctor order → confirm → payment) in both facilities,
- covers platform facility management and suspension.

## Local accounts (demo seed)

`npx tsx prisma/seed.ts` creates facility **DEMO** (staff logins as before) and a
platform operator `platform` (no facility code). See `prisma/seed.ts` for passwords.

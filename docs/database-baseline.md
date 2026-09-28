# Database baseline migration (Phase 0)

## Why

The old `prisma/migrations` history could not build a working database from scratch:

- It never created the 50 core tables (`User`, `Patient`, `Order`, `Invoice`, …). Those
  had only ever been created with `prisma db push`.
- It created 13 draft "multi-facility" tables (`DiagnosticFacility`, `LabAcceptedSample`, …)
  that are not in `schema.prisma` and that no compiled code uses.
- On a fresh database, `prisma migrate deploy` failed at
  `20260628135656_reception_direct_routing_refinement` with
  `relation "lab_accepted_samples" does not exist`, so the Render start command could not succeed.

## What changed

- The old folder moved to `prisma/migrations_legacy/` (kept for reference; Prisma ignores it).
- `prisma/migrations/20260928000000_baseline` is generated from `schema.prisma` with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
- `npm run db:drift` exits non-zero if the database in `DATABASE_URL` differs from the schema.

Verified on a fresh PostgreSQL 13 database: `migrate deploy` → `db:drift` (no drift) →
`prisma/seed.ts` → `prisma/seed.production.ts` all succeed.

## New or empty database

```bash
npx prisma migrate deploy
npm run prisma:seed          # demo data, local only
```

## Existing database that already has the core tables (created by `db push`)

Take a backup first, then check for drift and mark the baseline as already applied:

```bash
npm run db:drift             # must exit 0; if not, reconcile before continuing
npx prisma migrate resolve --applied 20260928000000_baseline
```

The `_prisma_migrations` table may still list the old migration names, which
`prisma migrate status` will report as missing locally. Check `migrate status` and
`migrate deploy` against a copy of that database before touching production.
The 13 draft tables may also exist in such a database. They hold no data the app reads,
and they will be reviewed in Phase 1 before any are dropped.

# LHIMS Backend

Express + TypeScript + Prisma + PostgreSQL API for LHIMS. It covers reception, the
doctor portal, laboratory, scan/imaging, billing and finance, results delivery,
reports and administration. The web app lives in the separate `LHIMS-Frontend` repo.

## Requirements

- Node.js 20 or newer
- PostgreSQL 13 or newer

## Local setup

```bash
npm ci
cp .env.example .env          # then set DATABASE_URL and the two JWT secrets
npx prisma generate
npx prisma migrate deploy     # creates every table from prisma/migrations
npm run prisma:seed           # demo users and data (logins printed at the end)
npm run dev                   # http://localhost:5000, docs at /api/docs
```

## Changing the database

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <short_description>` creates and applies a migration.
3. Commit the schema and the new `prisma/migrations/<timestamp>_<name>` folder together.

`npm run db:drift` exits non-zero if the database in `DATABASE_URL` no longer matches
the schema. See `docs/database-baseline.md` for why the migration history starts at
`20260928000000_baseline`.

## Quality gate

```bash
npm run qa
```

This runs schema validation, typecheck, lint, the Vitest suite, the build and the
production readiness check. It must pass before a branch is merged.

## Deployment

See `docs/deployment-runbook.md`. `render.yaml` provisions the API and a PostgreSQL
database. The start command runs `prisma migrate deploy` and the idempotent
production seed, which creates the first administrator from the `SEED_ADMIN_*` variables.
`.env.production.example` lists every production variable.

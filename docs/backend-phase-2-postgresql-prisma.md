# Backend Phase 2 — PostgreSQL + Prisma Foundation

## Scope completed

This phase activates the database layer for the Diagnosis Center / SUNKWA backend.

Implemented:

- PostgreSQL datasource through Prisma
- Prisma client singleton
- Database connect/disconnect helpers
- Database health check using `SELECT 1`
- Database status summary endpoint
- Expanded Prisma schema foundation
- Seed data for demo users, hospital, doctor profile, patients, departments, equipment, catalog items, and reference ranges
- Docker Compose PostgreSQL service retained from Phase 1
- Static Phase 2 QA script

## New/updated endpoints

- `GET /api/health`
- `GET /api/database/status`
- `GET /api/version`

## Schema foundation added

The schema now includes:

- `User`
- `Hospital`
- `DoctorProfile`
- `Patient`
- `Department`
- `Equipment`
- `CatalogItem`
- `ReferenceParameter`
- `ReferenceRange`
- `AuditLog`

This is not the full production schema yet. Phase 3 will add the remaining operational models for orders, lab workflow, scan workflow, billing, finance, files, notifications, and delivery logs.

## Seed data

Seed data includes:

- Admin, Doctor, Reception, Lab, Scan, and Billing users
- St. Raphael Hospital
- Dr. Abena Mensah profile
- Demo patients
- Laboratory and Imaging departments
- Lab analyzer and imaging equipment
- SUNKWA-style catalog codes such as `t1`, `t3`, `t17`
- Lab reference ranges for key panels including FBC, LFT, RFT, Lipid Profile, Blood Glucose, and TFT

## Local setup

```bash
copy .env.example .env
npm install
docker compose up -d
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

On macOS/Linux:

```bash
cp .env.example .env
```

## Test database status

```bash
npm run db:status
```

Or open:

```txt
http://localhost:5000/api/database/status
```

## Acceptance checks

- Prisma client exists and has a stable import path.
- Health endpoint checks database connectivity.
- Database status endpoint returns counts for seeded foundation tables.
- Seed script creates users, hospital, doctor, patients, catalog, and reference ranges.
- Docker Compose PostgreSQL config is included.

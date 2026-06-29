# Backend Phase 13: Seed Data and Demo Records

## Purpose

Phase 13 adds seed data so the upgraded backend can be tested as a multi-facility diagnostic platform.

It creates demo records for:

- Multiple diagnostic facilities
- Facility features
- Facility departments
- Facility lab and scan service catalogs
- Facility routing rules
- Facility usage limits
- Optional facility assignment for existing users
- Demo accepted lab samples
- Demo per-test lab results
- Demo lab result document metadata
- Demo accepted scan requests
- Demo scan result document metadata
- Demo clinician result inbox records
- Demo workflow event history

## Facilities created

| Code | Facility | Type | Purpose |
|---|---|---|---|
| `SUNKWA-MAIN` | Sunkwa Diagnostic Centre | Full diagnostic center | End-to-end lab, scan, reception, billing, and result delivery testing |
| `EASTERN-LAB` | Eastern Partner Laboratory | Partner lab | Lab-only feature customization testing |
| `IMG-PARTNER` | Community Imaging Partner | Imaging center | Scan-only feature customization testing |

## Important workflow coverage

The seed data supports the key workflows introduced in the frontend and backend updates:

```text
Lab Queue → Add Test → Accept Sample → Accepted Samples → Enter Results → Add Document → Push to Clinician → Results Archive
```

```text
Scan Queue → Accept Request → Enter Findings → Add Document → Push to Clinician → Results Archive
```

## Files included

```text
backend/prisma/seeds/phase13_multi_facility_demo.seed.sql
backend/prisma/seed.phase13.ts
backend/src/config/demoFacilitySeed.config.ts
backend/scripts/apply_phase13_seed_data_patch.sh
backend/docs/PHASE_13_SEED_DATA.md
```

## How to apply

After applying Phases 2 through 12, copy these files into your backend and run:

```bash
cd backend
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
bash scripts/apply_phase13_seed_data_patch.sh
```

Alternative Prisma runner:

```bash
cd backend
npx tsx prisma/seed.phase13.ts
```

## Safety notes

- The seed SQL is idempotent and can be re-run.
- It uses `ON CONFLICT` updates for facilities, features, departments, catalogs, and demo records.
- It does not force-create users because live user schemas vary.
- If a `User` or `users` table exists with a compatible `facilityId` or `facility_id` column, existing users are assigned to `SUNKWA-MAIN` automatically.
- Demo patient and order IDs are synthetic because the Phase 2 workflow tables intentionally avoid hard foreign keys to legacy patient/order tables.

## QA checks after seeding

1. Open Admin → Facilities and confirm all three facilities appear.
2. Confirm Sunkwa Main has both lab and scan enabled.
3. Confirm Eastern Partner Laboratory has scan disabled.
4. Confirm Community Imaging Partner has laboratory disabled.
5. Open Lab → Accepted Samples and confirm demo accepted samples are visible.
6. Open Lab → Results and confirm sent lab result records are available.
7. Open Scan → Accepted Scans/Results and confirm the demo imaging record is available.
8. Open Clinician → Results and confirm demo inbox records can be retrieved by the clinician result APIs.
9. Open Admin → Workflow Events and confirm Phase 13 demo events are visible.

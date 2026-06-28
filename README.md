# Backend Full Workflow Update

This package consolidates backend Phases 2–14 for the upgraded multi-facility diagnostic platform.

## Included upgrades

- Multi-facility schema foundation
- Facility features, departments, catalog, branding, routing, and limits
- Facility-scoped role permissions
- Clinician, Reception, Laboratory, and Scan workflow APIs
- Laboratory Queue → Accepted Samples → Per-test Result Entry → Push to Clinician
- Scan Queue → Accepted Scan → Findings/Documents → Push to Clinician
- Result document uploads for lab and scan results
- Clinician result inbox and archive
- Reception walk-in direct routing to Lab Queue / Scan Queue
- Admin Facilities Management APIs
- Workflow notifications and audit event tracking
- Validation and security middleware
- Demo seed data
- Route registration and QA scripts

## Apply order

Apply the migrations in this order:

1. `20260628130852_multi_facility_workflow_schema`
2. `20260628134953_result_document_storage`
3. `20260628135403_clinician_result_delivery_refinement`
4. `20260628135656_reception_direct_routing_refinement`
5. `20260628140248_scan_workflow_refinement`
6. `20260628140630_admin_facilities_api`
7. `20260628140903_notifications_audit_workflow_tracking`
8. `20260628141254_validation_security_rules`

## Install and build

```bash
cd backend
npm install multer
npm install -D @types/multer
npx prisma format
npx prisma migrate dev
npx prisma generate
npm run build
```

## Seed demo data

```bash
cd backend
npx tsx prisma/seed.phase13.ts
```

## Route registration

Review and register the route examples inside:

```text
backend/src/routes/phase4.routes.example.ts
backend/src/routes/phase7.routes.example.ts
backend/src/routes/phase8.routes.example.ts
backend/src/routes/phase9.routes.example.ts
backend/src/routes/phase10.routes.example.ts
backend/src/routes/phase11.routes.example.ts
backend/src/routes/phase12.routes.example.ts
backend/src/routes/phase14.routes.example.ts
```

The central route file added in this package is:

```text
backend/src/routes/diagnosticPlatform.routes.ts
```

## QA checks

```bash
cd backend
npm run build
npx tsx scripts/phase14_route_integrity_check.ts
```

After the backend server is running:

```bash
API_BASE_URL=http://localhost:4000/api \
API_TOKEN=<JWT_TOKEN> \
FACILITY_ID=<FACILITY_ID> \
npx tsx scripts/phase14_http_smoke_test.ts
```

## Note

This is a consolidated backend patch package. Apply it into the existing backend project, then resolve any naming differences between your current Prisma models and the new migration/model names if your original schema uses different table names.

# Backend Phase 14: Route Registration, Integration Checks, and Full Workflow QA

## Purpose

Phase 14 connects the backend updates from Phases 2 through 13 into one final route registration layer and adds QA tools to verify the workflows.

This phase is focused on integration rather than new database models.

## What this phase includes

- Central diagnostic platform router
- Workflow readiness route
- Route manifest for the upgraded system
- Database readiness checks for required Phase 2-13 tables
- Route integrity check script
- HTTP smoke test script
- Final QA checklist for lab, scan, reception, clinician, admin facilities, notifications, audit, and documents

## New files

```text
backend/src/constants/phase14WorkflowManifest.constants.ts
backend/src/controllers/workflowReadiness.controller.ts
backend/src/services/workflowReadiness.service.ts
backend/src/routes/workflowReadiness.routes.ts
backend/src/routes/diagnosticPlatform.routes.ts
backend/src/routes/phase14.routes.example.ts
backend/scripts/phase14_route_integrity_check.ts
backend/scripts/phase14_http_smoke_test.ts
backend/scripts/apply_phase14_route_registration_patch.sh
backend/docs/PHASE_14_ROUTE_REGISTRATION_AND_QA.md
backend/docs/PHASE_14_FINAL_WORKFLOW_QA_CHECKLIST.md
```

## Route registration

Recommended registration if `src/routes/index.ts` exports an Express router mounted under `/api`:

```ts
import diagnosticPlatformRoutes from './diagnosticPlatform.routes';

router.use('/', diagnosticPlatformRoutes);
```

Recommended registration if your `src/app.ts` registers routes directly:

```ts
import diagnosticPlatformRoutes from './routes/diagnosticPlatform.routes';

app.use('/api', diagnosticPlatformRoutes);
```

## Important mounting order

`diagnosticPlatform.routes.ts` mounts `resultDocumentRoutes` before the lab and scan routes.

This is intentional because the Phase 6 document upload route includes multipart upload handling. If the older lab or scan route still contains placeholder document routes, mounting the document route first allows the actual upload route to handle the request first.

## Readiness endpoints

Once mounted, the following admin diagnostic endpoints become available:

```text
GET /api/admin/workflow-readiness
GET /api/admin/workflow-readiness/database
GET /api/admin/workflow-readiness/routes
```

These should be mounted behind your normal admin authentication middleware in production.

## Local checks

Run TypeScript build first:

```bash
cd backend
npm run build
```

Then run the static route check:

```bash
npx tsx scripts/phase14_route_integrity_check.ts
```

Then run HTTP smoke tests after starting the backend:

```bash
API_BASE_URL=http://localhost:4000/api \
API_TOKEN=<JWT_TOKEN> \
FACILITY_ID=fac_sunkwa_main \
npx tsx scripts/phase14_http_smoke_test.ts
```

For the smoke test, `401` and `403` responses are acceptable because they show that the route exists behind authorization. `404` and `405` are failures.

## Final expected backend workflow

```text
Admin creates/customizes facility
→ Users are assigned to facility
→ Clinician or reception creates diagnostic request
→ Lab/scan queue receives request for that facility
→ Diagnostic staff accepts selected tests/scans
→ Accepted samples/scans are processed
→ Results and documents are entered
→ Result is pushed directly to clinician
→ Result is stored in archive
→ Notifications and audit events are recorded
```

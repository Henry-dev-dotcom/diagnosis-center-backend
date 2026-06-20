# Backend Phase 8 — Audit Logging Foundation

## Goal

Phase 8 turns the audit tables created in the core schema into an active backend foundation. It adds reusable audit services, API request logging, system event logging, access-failure tracking, and admin-only audit review endpoints.

## Implemented files

```txt
src/services/audit.service.ts
src/middleware/audit.ts
src/controllers/audit.controller.ts
src/validators/audit.validators.ts
src/routes/admin.routes.ts
src/app.ts
src/middleware/auth.ts
src/middleware/errorHandler.ts
src/controllers/protectedModule.controller.ts
src/config/phase6RouteMap.ts
src/config/openapi.ts
scripts/check-phase8.mjs
docs/backend-phase-8-audit-logging-foundation.md
```

## Audit tables used

The Prisma schema already includes the Phase 8 logging tables:

```txt
AuditLog
SystemEvent
ApiRequestLog
```

## Audit service

The reusable audit service exposes:

```txt
createAuditLog(input)
createSystemEvent(input)
createApiRequestLog(input)
getRequestAuditContext(req)
auditSuccessfulRequest(req, res, options)
```

It supports:

```txt
actor ID
actor role
action
module
entity type
entity ID
before snapshot
after snapshot
details JSON
IP address
user agent
timestamp
```

Audit failures are caught internally so a failed audit write does not break clinical, billing, finance, or authentication workflows.

## API request logging

A global API request logger now records every request routed through `/api`.

Captured fields:

```txt
request ID
user ID when authenticated
HTTP method
path
status code
duration in milliseconds
IP address
user agent
timestamp
```

## Access-control logging

The auth and permission middleware now logs:

```txt
missing token
invalid access token
inactive/missing user
invalid or expired session
role denial
permission denial
any-permission denial
unknown route attempts
```

These events are written to `AuditLog` and security-relevant items are also written to `SystemEvent`.

## Major action logging

Protected placeholder endpoints now create audit logs for major actions in the route contract phase, especially:

```txt
patient created/updated
order created/confirmed/cancelled
sample accepted/rejected
lab result drafted/submitted/signed off
scan accepted/booked/reported/signed off
payment recorded
shift started/closed
expense recorded/paid/written off
admin user/catalog/reference range edits
report viewed/downloaded/sent
notification delivery actions
file upload/delete actions
```

When deeper module business logic is implemented, the same audit service should be called inside transactions with real `beforeData` and `afterData` snapshots.

## Admin audit endpoints

Admin-only audit review endpoints are now implemented:

```txt
GET /api/admin/audit-logs
GET /api/admin/system-events
GET /api/admin/api-request-logs
```

All require:

```txt
ADMIN role
admin:audit:read permission
```

Supported query filters include pagination, date ranges, actor, role, module, action, entity, source, HTTP method, path, and status code depending on endpoint.

## Example audit log query

```bash
curl "http://localhost:5000/api/admin/audit-logs?page=1&limit=20&module=Authentication" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN"
```

## Example API request log query

```bash
curl "http://localhost:5000/api/admin/api-request-logs?statusCode=403" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN"
```

## OpenAPI and route map

The Phase 6 route contract map now marks admin audit endpoints as implemented foundation endpoints:

```txt
GET /admin/audit-logs
GET /admin/system-events
GET /admin/api-request-logs
```

OpenAPI version is now `0.8.0`.

## Acceptance checks covered

Phase 8 acceptance checks covered by the static QA script:

```txt
AuditLog service exists and supports actor, role, module, entity, before/after/details, IP, user agent
SystemEvent service exists
ApiRequestLog service exists
API request logger middleware exists
Access failure audit helper exists
Admin audit controller exists
Audit validators exist
Admin routes expose audit/system/API request log endpoints
OpenAPI version updated to 0.8.0
package version updated to 0.8.0
Phase 8 route contracts registered
```

## Notes for later phases

The audit layer is foundation-ready, but later real module implementations should move audit writes into Prisma transactions where possible. For example, when Phase 10+ adds real payment recording, the payment, float transaction, ledger entry, receipt, and audit log should be created together inside one transaction.

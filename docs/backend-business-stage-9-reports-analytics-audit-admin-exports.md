# Business Logic Stage 9 — Reports, Analytics, Audit Review, Admin Exports

## Goal

Business Logic Stage 9 deepens the reporting layer after results delivery and upload support. It turns the existing report endpoints into frontend-ready operational dashboards and gives administrators exportable views of configuration, access policy, audit logs, request logs, and system events.

## New analytics service

Added:

```txt
src/services/analytics.service.ts
src/controllers/analytics.controller.ts
```

The analytics service centralizes dashboard data across clinical, reception, finance, audit, and admin modules.

## New report analytics endpoints

```txt
GET /api/reports/dashboard
GET /api/reports/analytics/finance
GET /api/reports/analytics/lab
GET /api/reports/analytics/scan
GET /api/reports/analytics/reception
GET /api/reports/analytics/audit
```

### Executive dashboard

`GET /api/reports/dashboard` returns:

- today’s order count
- today’s visit count
- today’s payment count and total
- order status distribution
- invoice status distribution
- invoice totals
- lab pending count
- scan pending count
- generated reports count
- failed delivery count
- alert list
- recent audit activity

### Finance analytics

`GET /api/reports/analytics/finance` returns:

- payment total and count
- payment method distribution
- invoice status totals
- expense status totals
- open cashier shifts
- ledger credits, debits, and net movement
- top outstanding invoices

### Laboratory analytics

`GET /api/reports/analytics/lab` returns:

- sample status distribution
- lab-result status distribution
- abnormal result flags
- top requested lab tests
- pending review queue preview
- recent QC runs
- low-stock inventory alerts

### Scan / imaging analytics

`GET /api/reports/analytics/scan` returns:

- scan acceptance status distribution
- scan result status distribution
- scan booking status distribution
- DICOM file summary by modality
- retake queue preview
- pending review queue preview

### Reception analytics

`GET /api/reports/analytics/reception` returns:

- incoming order count
- daily visit list
- appointment status distribution
- generated result inbox count
- duplicate patient flag distribution
- walk-in order count

### Audit analytics

`GET /api/reports/analytics/audit` returns:

- audit activity by module
- audit activity by action
- audit activity by actor role
- unauthorized / denied / failed access attempts
- API error status counts
- slow request list
- system event level distribution

## New admin review and export endpoints

```txt
GET /api/admin/audit-summary
GET /api/admin/audit-export
GET /api/admin/full-export
```

### Audit summary

`GET /api/admin/audit-summary` exposes the same audit-review dashboard under the admin namespace.

### Audit export

`GET /api/admin/audit-export` returns an export payload containing:

- audit summary
- audit logs
- system events
- API request logs
- generation metadata
- active filters
- record counts

### Full admin export

`GET /api/admin/full-export` returns a broader admin bundle containing:

- configuration counts
- hospitals
- departments
- equipment
- catalog items
- reference ranges
- users
- doctor profiles
- permissions
- role-permission matrix
- route contracts
- executive dashboard snapshot
- audit review snapshot

## Audit logging

Stage 9 logs analytics and export reads using audit entries such as:

```txt
EXECUTIVE_DASHBOARD_VIEWED
FINANCE_DASHBOARD_VIEWED
LAB_DASHBOARD_VIEWED
SCAN_DASHBOARD_VIEWED
RECEPTION_DASHBOARD_VIEWED
AUDIT_REVIEW_DASHBOARD_VIEWED
AUDIT_REVIEW_EXPORTED
ADMIN_FULL_EXPORT_GENERATED
```

## Route contract updates

The Phase 6 route contract map now includes the new report and admin export endpoints so the frontend can discover them through:

```txt
GET /api/access/route-contracts
```

## QA

Added:

```txt
scripts/check-business-stage9.mjs
```

The standard QA chain now includes Business Logic Stage 9.

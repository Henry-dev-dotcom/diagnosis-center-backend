# Diagnosis Center Backend — Production Ready Stage 11

Current backend version: `2.1.0`

Current stage:

```txt
Production Readiness Stage — Deployment Hardening and Runtime QA
```

New in this stage:

```txt
Production env validation
Strong JWT secret guards
Multi-origin CORS
Rate limiting
Liveness and readiness probes
Production Dockerfile
Deployment runbook
Production QA script
```

Run production-readiness QA:

```bash
npm run qa:production
```

See:

```txt
docs/backend-production-readiness.md
docs/deployment-runbook.md
```

---

# Diagnosis Center Backend — Phase 10 Backend Foundation QA

This is the backend foundation for the Diagnosis Center / SUNKWA platform.

It supports the completed React frontend that was prepared with an API readiness layer.

## Current phase

```txt
Business Logic Stage 10 — Frontend Live API Integration + Final Full-System QA
```

Current business logic package:

```txt
Business Logic Stage 10 — Frontend Live API Integration + Final Full-System QA
```

## Final foundation package

```txt
diagnosis-center-backend-foundation.zip
```

A phase-specific package is also included:

```txt
diagnosis-center-backend-business-stage10-frontend-live-api-final-qa.zip
```

## What is included

```txt
Express + TypeScript server
Environment configuration
CORS for frontend
Security middleware
Request IDs
Central error handler
Health endpoint with database check
Database status endpoint
Version endpoint
Swagger/OpenAPI docs
Docker Compose PostgreSQL service with healthcheck
Prisma client singleton
Full Phase 3 core database schema
JWT authentication
Access and refresh tokens
Refresh session storage
Role and permission middleware
Authentication audit logging
Phase 6 protected API route contracts
Frontend compatibility route aliases
Route contract endpoint
OpenAPI paths generated from Phase 6 route map
Phase 7 Zod validation foundation
Standard 400/401/403/404/409/500 API error envelope
Route-level body/query/params validation
Prisma duplicate/missing-record error mapping
Phase 8 audit service foundation
API request logging
System event logging
Access failure audit logging
Admin audit log query endpoints
Phase 9 frontend-compatible seed data
Phase 10 static foundation QA scripts
Final local QA checklist
```

## Backend foundation phase status

| Phase | Status |
|---|---|
| Phase 1 — Backend Project Setup | Done |
| Phase 2 — PostgreSQL + Prisma Foundation | Done |
| Phase 3 — Core Database Schema | Done |
| Phase 4 — Authentication System | Done |
| Phase 5 — Role Permissions | Done |
| Phase 6 — API Route Structure | Done |
| Phase 7 — Validation and Error Handling | Done |
| Phase 8 — Audit Logging Foundation | Done |
| Phase 9 — Seed Data | Done |
| Phase 10 — Backend Foundation QA | Done |

## Requirements

```txt
Node.js 20+
npm 10+
Docker Desktop for local PostgreSQL
```

## Setup

Copy the environment file:

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm install
```

Start PostgreSQL:

```bash
docker compose up -d
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Run Prisma migration:

```bash
npm run prisma:migrate
```

Seed demo data:

```bash
npm run prisma:seed
```

Start development server:

```bash
npm run dev
```

Open:

```txt
http://localhost:5000
http://localhost:5000/api/health
http://localhost:5000/api/version
http://localhost:5000/api/database/status
http://localhost:5000/api/docs
```

## Useful scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run qa
npm run qa:static
npm run qa:phases
npm run qa:runtime
npm run qa:full
npm run check:foundation
npm run db:status
npm run health:local
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
npm run prisma:reset
```

## QA notes

`npm run qa` runs the Phase 10 static foundation QA. It also runs the phase-chain static check for earlier phases.

For complete local QA after extracting the ZIP, run:

```bash
npm install
npm run qa:full
docker compose up -d
npm run prisma:migrate
npm run prisma:seed
npm run db:status
npm run dev
npm run health:local
```

See:

```txt
docs/backend-foundation-local-qa-checklist.md
```

## Demo users seeded

```txt
admin     / admin123
doctor    / doctor123
reception / reception123
lab       / lab123
scan      / scan123
billing   / billing123
doctor2   / doctor123
```

The `doctor2` account supports the second frontend doctor profile used by historical demo orders.

## Authentication endpoints

```txt
POST  /api/auth/login
POST  /api/auth/refresh
POST  /api/auth/logout
GET   /api/auth/me
PATCH /api/auth/change-password
```

### Login example

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Current user example

Use the `accessToken` from login:

```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Role and permission middleware

Implemented middleware:

```txt
requireAuth
requireRole(...roles)
requirePermission(permission)
requireAnyPermission(...permissions)
```

Implemented helper:

```txt
canViewPrices(role)
```

Only these roles can view prices:

```txt
ADMIN
RECEPTIONIST
BILLING_STAFF
```

Blocked from price visibility:

```txt
DOCTOR
LAB_STAFF
SCAN_STAFF
```

## Phase 7 validation foundation

Implemented middleware:

```txt
validateRequest({ body, query, params })
validateBody(schema)
validateQuery(schema)
validateParams(schema)
```

Main validator files:

```txt
src/validators/common.validators.ts
src/validators/auth.validators.ts
src/validators/patient.validators.ts
src/validators/order.validators.ts
src/validators/reception.validators.ts
src/validators/lab.validators.ts
src/validators/scan.validators.ts
src/validators/billing.validators.ts
src/validators/finance.validators.ts
src/validators/admin.validators.ts
src/validators/result.validators.ts
src/validators/notification.validators.ts
src/validators/file.validators.ts
src/validators/audit.validators.ts
```

## Phase 8 audit foundation

Implemented audit files:

```txt
src/services/audit.service.ts
src/middleware/audit.ts
src/controllers/audit.controller.ts
src/validators/audit.validators.ts
```

Admin audit endpoints:

```txt
GET /api/admin/audit-logs
GET /api/admin/system-events
GET /api/admin/api-request-logs
```

All admin audit endpoints require:

```txt
ADMIN
admin:audit:read
```

Example:

```bash
curl "http://localhost:5000/api/admin/audit-logs?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN"
```

## Phase 9 seed coverage

```txt
Admin user
Doctor user
Reception user
Lab user
Scan user
Billing user
Additional demo doctor profile for frontend order history
Hospitals
Doctor profiles
Departments
Equipment
Patients
Patient contacts
Patient insurance records
SUNKWA test catalog
Reference parameters
Reference ranges
Sample orders
Order status timelines
Reception appointment and visit records
Accepted lab samples
Lab results and result parameters
Scan acceptance, booking, DICOM-ready file metadata, and scan review
Invoices
Invoice items
Payments
Receipts
Cashier shift
Float transactions
Expenses
Expense payments
Ledger entries
Reports
Secure result links
Notifications
Delivery logs
Inventory items and transactions
Quality-control runs
Audit logs
System events
```

## API base URL for frontend

When backend integration begins, set the frontend environment to:

```env
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:5000/api
```

## Important note

This package completes the backend foundation. Most business module endpoints are protected, validated, documented route contracts with placeholder handlers. The next backend stage should implement real module services/controllers for patients, orders, reception, billing, lab, scan, results, reports, notifications, and files.

## Business Logic Stage 1 — Patient and Admin Catalog Foundation

This package continues after the completed backend foundation and starts replacing route-contract placeholder handlers with real database-backed services.

Implemented live modules:

```txt
Patients
Admin users
Admin hospitals
Admin doctors
Admin catalog items
Admin reference ranges
Admin departments
Admin equipment
Doctor profile
Doctor referred patient list
Doctor patient trends handoff
```

Live patient endpoints:

```txt
GET    /api/patients
POST   /api/patients
GET    /api/patients/:id
PATCH  /api/patients/:id
GET    /api/patients/:id/orders
GET    /api/patients/:id/trends
POST   /api/patients/check-duplicates
```

Live admin configuration endpoints:

```txt
GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
GET    /api/admin/hospitals
POST   /api/admin/hospitals
PATCH  /api/admin/hospitals/:id
GET    /api/admin/doctors
POST   /api/admin/doctors
PATCH  /api/admin/doctors/:id
GET    /api/admin/catalog
POST   /api/admin/catalog
PATCH  /api/admin/catalog/:id
GET    /api/admin/reference-ranges
POST   /api/admin/reference-ranges
PATCH  /api/admin/reference-ranges/:id
GET    /api/admin/departments
POST   /api/admin/departments
PATCH  /api/admin/departments/:id
GET    /api/admin/equipment
POST   /api/admin/equipment
PATCH  /api/admin/equipment/:id
GET    /api/admin/config-export
```

Additional live doctor endpoints:

```txt
GET    /api/doctor/profile
PATCH  /api/doctor/profile
GET    /api/doctor/patients
GET    /api/doctor/patient-trends/:patientId
```

Run the new static QA check with:

```bash
npm run qa:business-stage1
```

Run all available static QA checks with:

```bash
npm run qa
```

After extracting locally, run Prisma generation before building:

```bash
npm install
npm run prisma:generate
npm run build
npm run lint
```

## Business Logic Stage 1 — Patient and Admin Catalog Foundation

Live database-backed endpoints are implemented for patients, duplicate checks, doctor profile/patient support, and admin configuration areas such as users, hospitals, doctors, catalog, reference ranges, departments, and equipment.

## Business Logic Stage 2 — Doctor Order Creation and Order Registry

Live database-backed endpoints are now implemented for doctor order creation and the shared order registry.

Implemented live endpoints:

```txt
POST  /api/doctor/orders
GET   /api/doctor/orders/active
GET   /api/doctor/orders/completed
GET   /api/orders
GET   /api/orders/:id
PATCH /api/orders/:id/status
POST  /api/orders/:id/transition
POST  /api/orders/:id/cancel
GET   /api/orders/:id/timeline
GET   /api/reception/incoming-orders
POST  /api/reception/orders/:id/confirm
GET   /api/lab/queue
GET   /api/scan/queue
```

This stage adds:

```txt
Doctor-owned order creation
Catalog item validation before order creation
Automatic LAB / SCAN order item splitting
Order status history timeline
Guarded order status transitions
Order cancellation with reason
Reception incoming order queue
Reception order confirmation
Invoice handoff helper for confirmed orders
Lab queue from real LAB order items
Scan queue from real SCAN order items
Audit logs for order lifecycle changes
```

Stage-specific QA:

```bash
npm run qa:business-stage2
```

## Business Logic Stage 3 — Reception Workflow, Patient Check-in, Walk-ins, and Appointments

Live database-backed endpoints are now implemented for the main reception workflow.

Implemented live endpoints:

```txt
POST  /api/reception/check-in
POST  /api/reception/walk-ins
GET   /api/reception/appointments
POST  /api/reception/appointments
PATCH /api/reception/appointments/:id
GET   /api/reception/daily-visits
GET   /api/reception/results-inbox
POST  /api/reception/results/:id/send-notice
```

This stage adds:

```txt
Patient check-in using real PatientVisit records
Appointment-linked and order-linked check-ins
Confirmed order movement to IN_PROGRESS at check-in
Walk-in intake for existing or newly-created patients
Walk-in order creation with LAB / SCAN item splitting
Optional invoice creation for walk-ins
Optional immediate check-in for walk-ins
Appointment listing, creation, and updates
Daily visit log from real visit records
Reception result inbox from generated reports
Privacy-safe patient result notices
Notification and DeliveryLog creation for sent notices
Audit logs for check-ins, walk-ins, appointments, and result notices
```

Stage-specific QA:

```bash
npm run qa:business-stage3
```


## Business Logic Stage 5 — Laboratory Workflow

Business Logic Stage 5 replaces lab placeholders with live Prisma-backed workflows for sample acceptance, accepted samples, lab result drafting, result parameter flags, submit-for-review, senior sign-off, rejected/retest queues, reference ranges, patient lab trends, QC, and inventory.

New/updated commands:

```bash
npm run qa:business-stage5
npm run qa
```

Live lab endpoints now include:

```txt
POST /api/lab/samples/accept
POST /api/lab/orders/:orderId/accept
GET  /api/lab/accepted-samples
POST /api/lab/results/draft
POST /api/lab/results
POST /api/lab/results/submit-review
POST /api/lab/results/:id/sign-off
POST /api/lab/samples/:id/reject
GET  /api/lab/review-queue
GET  /api/lab/rejected-retest
GET  /api/lab/reference-ranges/:catalogItemId
GET  /api/lab/patient-trends/:patientId
GET  /api/lab/qc
POST /api/lab/qc
GET  /api/lab/inventory
POST /api/lab/inventory
POST /api/lab/inventory/:id/transactions
```

## Business Logic Stage 4 — Billing and Finance Workflow Foundation

Live database-backed endpoints are now implemented for central billing, cashier shifts, float, expenses, ledger, finance analytics, and receivable ageing.

Implemented live billing endpoints:

```txt
GET   /api/billing/invoices
GET   /api/billing/invoices/:id
PATCH /api/billing/invoices/:id
POST  /api/billing/invoices/:id/payments
POST  /api/billing/invoices/:id/refund
GET   /api/billing/receipts/:id
```

Implemented live finance endpoints:

```txt
POST /api/finance/shifts/start
POST /api/finance/shifts
POST /api/finance/shifts/:id/close
GET  /api/finance/shifts/current
GET  /api/finance/shifts
GET  /api/finance/shifts/history
GET  /api/finance/float
POST /api/finance/float/adjustments
GET  /api/finance/expenses
POST /api/finance/expenses
PATCH /api/finance/expenses/:id
POST /api/finance/expenses/:id/payment
POST /api/finance/expenses/:id/write-off
GET  /api/finance/ledger
GET  /api/finance/analytics
GET  /api/finance/ageing
```

This stage adds:

```txt
Invoice register and invoice detail loading
Invoice discount/status/insurance metadata update foundation
Active cashier shift guard before payment recording
Payment creation with float transaction, ledger credit, receipt, and invoice balance update
Refund foundation with reason and supervisor approval tracking
Cashier shift start/current/history/close workflow
Float register and adjustment workflow
Expense creation, update, payment, and write-off workflow
Expense payment ledger debit creation
Finance ledger listing
Finance analytics summary
Receivable ageing buckets
Audit logs for billing and finance mutations
```

Stage-specific QA:

```bash
npm run qa:business-stage4
```

## Business Logic Stage 6 — Scan / Imaging Workflow

Business Logic Stage 6 replaces scan/imaging placeholders with live Prisma-backed workflows for scan acceptance, accepted scans, equipment bookings, imaging report drafts, submit-for-review, radiologist/senior sign-off, retake handling, DICOM-ready image metadata, prior scan comparison, and audit logging.

New/updated commands:

```bash
npm run qa:business-stage6
npm run qa
```

Live scan endpoints now include:

```txt
GET  /api/scan/queue
POST /api/scan/accept
POST /api/scan/orders/:orderId/accept
GET  /api/scan/accepted-scans
POST /api/scan/bookings
GET  /api/scan/bookings
POST /api/scan/results/draft
POST /api/scan/results
POST /api/scan/results/submit-review
POST /api/scan/results/:id/sign-off
POST /api/scan/retake
GET  /api/scan/review-queue
GET  /api/scan/rejected-retake
POST /api/scan/results/:id/files
GET  /api/scan/prior/:patientId
```


## Business Logic Stage 7 — Results Delivery + Reporting

This package adds live results, report delivery, reporting dashboard, notification, and file metadata workflows.

Implemented highlights:

- Result list/detail/release endpoints backed by `Report` records.
- Doctor-owned result list through `GET /api/doctor/results`.
- PDF-ready report payload generation and `PDF_DOWNLOAD` delivery logging.
- Privacy-safe SMS and WhatsApp notices that do not include clinical values or diagnosis.
- Email result delivery records with notification and delivery log creation.
- Secure result link creation with hashed token storage.
- Delivery log listing and retry workflow.
- Operational, finance, delivery, abnormal-result, staff productivity, and export report endpoints.
- In-app notification list, mark-read, logs, retry, and settings validation/audit foundation.
- Metadata-only file layer using scan/DICOM metadata persistence where supported by the current schema.

QA command:

```bash
npm run qa:business-stage7
```


## Business Logic Stage 8 — Notifications + Files + DICOM-ready Upload Layer

This package continues after Business Logic Stage 7 and adds:

```txt
Notification creation and channel delivery controls
Read, unread, read-all, preferences, delivery logs, and retry workflow
Local/base64 upload support through JSON payloads
Metadata-only fallback for modules without a dedicated file table
ScanResultFile persistence for scan images and DICOM-ready metadata
Lab attachment upload/audit support pending a future generic FileAsset table
Signed download payloads and local file download route
DICOM-ready study list/detail endpoints grouped by Study UID
Upload environment configuration
```

New upload environment settings:

```txt
UPLOAD_STORAGE_DRIVER=local
UPLOAD_ROOT=uploads
MAX_UPLOAD_BYTES=26214400
SIGNED_FILE_URL_TTL_MINUTES=15
DICOM_GATEWAY_MODE=metadata-only
```

## Business Logic Stage 9 — Reports, Analytics, Audit Review, Admin Exports

Version `1.9.0` adds frontend-ready analytics dashboards and admin export tools.

New report endpoints:

```txt
GET /api/reports/dashboard
GET /api/reports/analytics/finance
GET /api/reports/analytics/lab
GET /api/reports/analytics/scan
GET /api/reports/analytics/reception
GET /api/reports/analytics/audit
```

New admin endpoints:

```txt
GET /api/admin/audit-summary
GET /api/admin/audit-export
GET /api/admin/full-export
```

Run the Stage 9 static QA check with:

```bash
npm run qa:business-stage9
```


## Business logic stage status

| Stage | Status |
|---|---|
| Business Logic Stage 1 — Patient + Admin Catalog Foundation | Done |
| Business Logic Stage 2 — Doctor Order Creation + Order Registry | Done |
| Business Logic Stage 3 — Reception Workflow | Done |
| Business Logic Stage 4 — Billing + Finance Workflow Foundation | Done |
| Business Logic Stage 5 — Laboratory Workflow | Done |
| Business Logic Stage 6 — Scan / Imaging Workflow | Done |
| Business Logic Stage 7 — Results Delivery + Reporting | Done |
| Business Logic Stage 8 — Notifications + Files + DICOM-ready Upload Layer | Done |
| Business Logic Stage 9 — Reports, Analytics, Audit Review, Admin Exports | Done |
| Business Logic Stage 10 — Frontend Live API Integration + Final Full-System QA | Done |

## Frontend live mode

Run the completed frontend with:

```txt
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:5000/api
```

See:

```txt
docs/full-system-local-runbook.md
docs/frontend-live-api-integration-contract.md
```

## Foundation compatibility note

Backend Phase 10 — Backend Foundation QA remains complete inside this Stage 10 business package.

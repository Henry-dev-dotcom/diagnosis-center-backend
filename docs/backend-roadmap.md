# Backend Roadmap

## Phase 1 — Backend Project Setup
Done in this package.

Implemented:
- Express server
- TypeScript configuration
- environment configuration
- CORS/security middleware
- health/version routes
- request IDs
- central error boundary

## Phase 2 — PostgreSQL + Prisma Foundation
Done in this package.

Implemented:
- PostgreSQL Docker Compose setup
- Prisma client singleton
- database connection health check
- database status endpoint
- migration-ready Prisma workflow

## Phase 3 — Core Database Schema
Done in this package.

Implemented:
- users, sessions, and access-related tables
- hospitals, doctors, departments, and equipment
- patients, contacts, insurance, and duplicate flags
- catalog items, parameters, and reference ranges
- orders and order items
- laboratory workflow tables
- scan/imaging workflow tables
- billing and finance workflow tables
- results delivery tables
- audit, system event, and API request log tables

## Phase 4 — Authentication System
Done in this package.

Implemented:
- login
- logout
- refresh token rotation
- current user endpoint
- password change
- password hashing
- JWT access and refresh tokens
- session invalidation
- auth audit logging

## Phase 5 — Role Permissions
Done in this package.

Implemented:
- role permission registry
- price visibility rules
- `requireAuth`
- `requireRole`
- `requirePermission`
- `requireAnyPermission`
- protected route groups
- access matrix endpoint

## Phase 6 — API Route Structure
Done in this package.

Implemented:
- route files for auth, users, patients, doctor, orders, reception, lab, scan, billing, finance, admin, results, reports, notifications, and files
- route contract registry
- route contract endpoint
- frontend compatibility aliases
- OpenAPI paths generated from the route map

## Phase 7 — Validation and Error Handling
Done in this package.

Implemented:
- reusable Zod validators
- body/query/params validation middleware
- standard API success/error envelopes
- validation error formatting
- Prisma duplicate/missing-record mapping
- consistent 400/401/403/404/409/500 handling

## Phase 8 — Audit Logging Foundation
Done in this package.

Implemented:
- reusable audit service
- system event service
- API request log service
- API request logging middleware
- access failure audit logging
- major protected action logging
- admin audit log query endpoints
- admin system event query endpoint
- admin API request log query endpoint

## Phase 9 — Seed Data
Done in this package.

Implemented:
- frontend-compatible deterministic seed IDs and codes
- demo login users with hashed passwords
- hospitals and doctor profiles
- departments and equipment
- patient records, contacts, and insurance records
- full SUNKWA lab/scan catalog
- reference parameters and reference ranges
- sample orders and status history timelines
- reception appointment and visit records
- lab samples, lab results, result parameters, and review records
- scan acceptance, booking, report, review, and DICOM-ready file metadata
- invoices, invoice items, payments, receipts, cashier shift, float transactions, expenses, and ledger entries
- reports, secure result links, notifications, delivery logs, inventory, QC, audit logs, and system events

## Phase 10 — Backend Foundation QA
Done in this package.

Implemented:
- final foundation package version `1.0.0`
- static QA orchestration for phases 1 through 9
- Phase 10 final foundation QA script
- package script cleanup for static, runtime, and full local QA
- ESLint 9 flat config readiness
- Swagger/OpenAPI version update
- version endpoint update
- local QA checklist
- final foundation documentation
- final package names:
  - `diagnosis-center-backend-phase10-foundation-qa.zip`
  - `diagnosis-center-backend-foundation.zip`

## Next Backend Stage — Deeper Business Logic
Recommended next implementation order after this foundation:
- real patient service/controllers
- admin catalog/reference range service/controllers
- doctor order creation and order registry logic
- reception confirmation/check-in/walk-in logic
- billing invoice/payment logic
- lab sample/result workflow logic
- scan booking/report/file workflow logic
- results release and safe delivery logic
- reporting/export logic
- file upload/storage layer

## Business Logic Stage 1 — Patient and Admin Catalog Foundation

Done in this package.

Implemented real Prisma-backed services and controllers for patients, admin users, hospitals, doctors, catalog items, reference ranges, departments, equipment, doctor profile, and doctor referred-patient access.

Next recommended stage: Business Logic Stage 2 — Doctor Order Creation and Order Registry.

## Business Logic Stage 2 — Doctor Order Creation and Order Registry

Status: Done

Implemented live Prisma-backed order creation, doctor order lists, shared order registry, order detail, status transitions, cancellation, timeline, reception incoming order queue, reception confirmation, invoice handoff helper, and lab/scan queue handoff from real order items.

## Business Logic Stage 3 — Reception Workflow, Patient Check-in, Walk-ins, and Appointments

Status: Done

Implemented live Prisma-backed reception check-in, walk-in intake, appointment listing/creation/update, daily visit logs, reception results inbox, and privacy-safe patient result notices.

Next recommended stage: Business Logic Stage 4 — Billing and Finance Workflow Foundation.

## Business Logic Stage 4 — Billing and Finance Workflow Foundation

Status: Done

Implemented live Prisma-backed billing invoice register/detail/update, payment recording, receipt loading, refund foundation, cashier shift start/current/history/close, float register/adjustments, expense creation/update/payment/write-off, ledger listing, finance analytics, and receivable ageing.

Next recommended stage: Business Logic Stage 5 — Laboratory Workflow.

## Business Logic Stage 5 — Laboratory Workflow

Status: Done

Implemented live Prisma-backed lab sample acceptance, accepted samples, lab result drafting, automatic parameter flagging from reference ranges, submit-for-review, senior sign-off, report generation, rejected/retest queues, lab reference ranges, patient lab trends, QC, inventory, and audit logs.

## Business Logic Stage 6 — Scan / Imaging Workflow

Status: Done

Implemented live Prisma-backed scan acceptance, accepted scan queue, equipment booking, imaging report drafting, scan image/DICOM-ready metadata attachment, submit-for-review, sign-off, retake workflow, review queue, rejected/retake queue, prior scan comparison, report generation, doctor notification, and audit logs.

Next recommended stage: Business Logic Stage 7 — Results Delivery and Reporting.


## Business Logic Stage 7 — Results Delivery + Reporting
Done in this package.

- Results list/detail/release/report payloads are live.
- Secure result links and delivery logs are live.
- SMS and WhatsApp delivery notices remain privacy-safe.
- Reporting endpoints are backed by Prisma summaries and lists.
- Notifications and file metadata routes have live controller/service implementations.


## Business Logic Stage 8 — Notifications + Files + DICOM-ready Upload Layer
Done in this package.

Implemented:
- notification creation, delivery, read/unread, read-all, delivery log retry, and default preferences
- privacy-safe SMS and WhatsApp notification delivery handling
- local/base64 upload support with metadata-only fallback
- scan result file persistence through ScanResultFile
- lab result attachment storage/audit support pending a future FileAsset table
- signed download payloads and local file download route
- DICOM-ready study list/detail endpoints grouped by Study UID
- upload-related environment configuration and QA checks

## Business Logic Stage 9 — Reports, Analytics, Audit Review, Admin Exports

Status: Completed.

Implemented frontend-ready dashboards for executive operations, finance, laboratory, scan/imaging, reception, and audit review. Added admin audit summary, audit export, and full admin export bundle endpoints. Updated route contracts, documentation, and static QA.


## Business Logic Stage 10 — Frontend Live API Integration + Final Full-System QA

Done in this package.

Includes backend version 2.0.0, final business-logic QA registration, full-system local runbook, frontend live API integration contract, and packaging guidance for the live-ready frontend/backend bundle.


## Production Readiness Stage — Deployment Hardening and Runtime QA

Status: Done

Includes backend version 2.1.0, production environment validation, weak JWT secret guards, multi-origin CORS, built-in rate limiting, `/api/live` and `/api/ready` probes, Dockerfile, deployment runbook, and production-readiness QA.

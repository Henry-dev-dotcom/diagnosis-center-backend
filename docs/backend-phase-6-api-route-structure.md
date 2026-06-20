# Backend Phase 6 — API Route Structure

## Goal

Phase 6 completes the backend route contract layer. The backend now exposes the protected route groups required by the backend foundation plan, while keeping the real module business logic as safe `endpoint-contract-ready` placeholders for later implementation phases.

This phase does **not** implement patient/order/lab/scan/finance business processing yet. It prepares the API surface, access protection, endpoint naming, and frontend integration aliases.

## What was added

- Full Phase 6 route contract map in `src/config/phase6RouteMap.ts`.
- Route contract controller in `src/controllers/routeContracts.controller.ts`.
- Authenticated route contract endpoint: `GET /api/access/route-contracts`.
- Swagger/OpenAPI route documentation generated from the Phase 6 route contract map.
- Static Phase 6 QA script: `scripts/check-phase6.mjs`.
- `package.json` version updated to `0.6.0`.
- `npm run qa` now runs the Phase 6 static route check.

## Protected route groups

The backend route index registers these groups:

```txt
/api/auth
/api/access
/api/users
/api/patients
/api/doctor
/api/orders
/api/reception
/api/lab
/api/scan
/api/billing
/api/finance
/api/admin
/api/results
/api/reports
/api/notifications
/api/files
```

## Main Phase 6 endpoint map

### Auth

```txt
POST  /api/auth/login
POST  /api/auth/logout
POST  /api/auth/refresh
GET   /api/auth/me
PATCH /api/auth/change-password
```

### Access

```txt
GET /api/access/me
GET /api/access/role-matrix
GET /api/access/route-contracts
```

### Patients

```txt
GET   /api/patients
POST  /api/patients
GET   /api/patients/:id
PATCH /api/patients/:id
GET   /api/patients/:id/orders
GET   /api/patients/:id/trends
POST  /api/patients/check-duplicates
```

### Doctor

```txt
GET   /api/doctor/profile
PATCH /api/doctor/profile
GET   /api/doctor/patients
POST  /api/doctor/orders
GET   /api/doctor/orders/active
GET   /api/doctor/orders/completed
GET   /api/doctor/results
GET   /api/doctor/patient-trends/:patientId
```

### Orders

```txt
GET   /api/orders
GET   /api/orders/:id
PATCH /api/orders/:id/status
POST  /api/orders/:id/transition
POST  /api/orders/:id/cancel
GET   /api/orders/:id/timeline
```

`POST /api/orders/:id/transition` is a frontend compatibility alias for the completed frontend service layer. The planned backend route remains `PATCH /api/orders/:id/status`.

### Reception

```txt
GET   /api/reception/incoming-orders
POST  /api/reception/orders/:id/confirm
POST  /api/reception/check-in
POST  /api/reception/walk-ins
GET   /api/reception/appointments
POST  /api/reception/appointments
PATCH /api/reception/appointments/:id
GET   /api/reception/daily-visits
GET   /api/reception/results-inbox
```

### Lab

```txt
GET  /api/lab/queue
POST /api/lab/samples/accept
POST /api/lab/orders/:orderId/accept
GET  /api/lab/accepted-samples
POST /api/lab/results/draft
POST /api/lab/results
POST /api/lab/results/submit-review
POST /api/lab/results/:id/sign-off
POST /api/lab/results/:id/files
POST /api/lab/samples/:id/reject
GET  /api/lab/review-queue
GET  /api/lab/rejected-retest
GET  /api/lab/reference-ranges/:catalogItemId
```

Frontend compatibility aliases:

- `POST /api/lab/orders/:orderId/accept`
- `POST /api/lab/results`
- `POST /api/lab/results/:id/files`

### Scan

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
POST /api/scan/results/:id/files
POST /api/scan/retake
GET  /api/scan/review-queue
GET  /api/scan/rejected-retake
```

Frontend compatibility aliases:

- `POST /api/scan/orders/:orderId/accept`
- `POST /api/scan/results`

### Billing and Finance

```txt
GET   /api/billing/invoices
PATCH /api/billing/invoices/:id
POST  /api/billing/invoices/:id/payments

POST /api/finance/shifts/start
POST /api/finance/shifts/:id/close
GET  /api/finance/shifts/current
GET  /api/finance/shifts
GET  /api/finance/float
POST /api/finance/float/adjustments
GET  /api/finance/expenses
POST /api/finance/expenses
PATCH /api/finance/expenses/:id
POST /api/finance/expenses/:id/payment
POST /api/finance/expenses/:id/write-off
GET  /api/finance/ledger
GET  /api/finance/analytics
```

`GET /api/finance/shifts` is a frontend compatibility alias. The planned backend route for the active shift remains `GET /api/finance/shifts/current`.

### Admin

```txt
GET   /api/admin/users
POST  /api/admin/users
PATCH /api/admin/users/:id
GET   /api/admin/catalog
POST  /api/admin/catalog
PATCH /api/admin/catalog/:id
GET   /api/admin/reference-ranges
POST  /api/admin/reference-ranges
PATCH /api/admin/reference-ranges/:id
GET   /api/admin/hospitals
POST  /api/admin/hospitals
GET   /api/admin/doctors
POST  /api/admin/doctors
GET   /api/admin/audit-logs
```

The route file also keeps additional admin foundation routes for departments, equipment, and config export because those exist in the database schema and frontend admin area.

### Results

```txt
GET  /api/results
GET  /api/results/delivery-logs
GET  /api/results/:id
POST /api/results/:id/release
GET  /api/results/:id/report
POST /api/results/:id/email
POST /api/results/:id/sms
POST /api/results/:id/whatsapp
```

Privacy rule preserved: SMS and WhatsApp notices must not include clinical values or diagnosis.

## Acceptance checks

Run:

```bash
npm run qa
```

Expected output:

```txt
Backend Phase 6 API route structure static check passed.
```

## Next phase

Phase 7 should add validation and error handling schemas around these route contracts, starting with Zod validators for auth, patients, orders, sample acceptance, lab results, scan results, payments, shifts, expenses, catalog, and reference ranges.

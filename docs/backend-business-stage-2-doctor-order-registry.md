# Backend Business Logic Stage 2 — Doctor Order Creation and Order Registry

## Goal

Replace the Phase 6 placeholder order-contract layer with live Prisma-backed order workflow logic.

This stage connects the doctor workflow to the shared order registry and prepares downstream reception, lab, scan, and billing handoff points.

## Implemented modules

### Doctor order creation

Live endpoint:

```txt
POST /api/doctor/orders
```

The backend now:

- verifies the authenticated doctor profile
- validates the selected patient
- validates active catalog items
- creates one order with many order items
- splits each order item into `LAB` or `SCAN` from the catalog item type
- stores expected completion timestamps
- records initial `SUBMITTED` timeline history
- creates an in-app reception notification
- audit logs the order creation action

### Doctor order lists

Live endpoints:

```txt
GET /api/doctor/orders/active
GET /api/doctor/orders/completed
```

Doctor users only see orders connected to their own `DoctorProfile`.

### Shared order registry

Live endpoints:

```txt
GET   /api/orders
GET   /api/orders/:id
PATCH /api/orders/:id/status
POST  /api/orders/:id/transition
POST  /api/orders/:id/cancel
GET   /api/orders/:id/timeline
```

The registry supports:

- pagination
- search
- status filters
- urgency filters
- patient/doctor/hospital filters
- date range filters
- order detail loading
- order timeline loading
- guarded status transitions
- cancellation with reason
- audit logging

### Reception handoff

Live endpoints:

```txt
GET  /api/reception/incoming-orders
POST /api/reception/orders/:id/confirm
```

Reception can now see submitted doctor orders. Confirming an order moves it to `CONFIRMED`, writes status history, and creates an invoice when `invoiceNow` is not set to `false`.

### Lab and scan queue handoff

Live endpoints:

```txt
GET /api/lab/queue
GET /api/scan/queue
```

These endpoints now read real order items by catalog item type:

- lab staff sees `LAB` order items
- scan staff sees `SCAN` order items
- queues include patient, doctor, hospital, catalog, invoice, and acceptance/sample context

Full acceptance/result processing remains for later module stages.

## Status transition guard

Allowed order transitions:

```txt
SUBMITTED      -> CONFIRMED, CANCELLED
CONFIRMED      -> IN_PROGRESS, CANCELLED
IN_PROGRESS    -> PENDING_REVIEW, CANCELLED
PENDING_REVIEW -> IN_PROGRESS, FINAL_RELEASED, CANCELLED
FINAL_RELEASED -> no transition
CANCELLED      -> no transition
```

Invalid transitions return a `409` conflict response.

## Files added

```txt
src/services/order.service.ts
src/controllers/order.controller.ts
scripts/check-business-stage2.mjs
docs/backend-business-stage-2-doctor-order-registry.md
```

## Files updated

```txt
src/routes/orders.routes.ts
src/routes/doctors.routes.ts
src/routes/reception.routes.ts
src/routes/lab.routes.ts
src/routes/scan.routes.ts
src/controllers/system.controller.ts
src/config/openapi.ts
package.json
package-lock.json
README.md
```

## QA

Run:

```bash
npm run qa:business-stage2
npm run qa
```

Expected result:

```txt
Backend Business Logic Stage 2 static check passed.
```

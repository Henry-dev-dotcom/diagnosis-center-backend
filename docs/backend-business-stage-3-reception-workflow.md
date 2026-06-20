# Backend Business Logic Stage 3 — Reception Workflow, Patient Check-in, Walk-ins, and Appointments

## Goal

Stage 3 turns the reception module from Phase 6/7 route contracts into real database-backed workflow logic. It builds the reception desk layer that sits between doctor-submitted orders, patient arrival, walk-in registration, appointments, billing handoff, and result-notice delivery.

## Implemented endpoints

```txt
GET  /api/reception/incoming-orders
POST /api/reception/orders/:id/confirm
POST /api/reception/check-in
POST /api/reception/walk-ins
GET  /api/reception/appointments
POST /api/reception/appointments
PATCH /api/reception/appointments/:id
GET  /api/reception/daily-visits
GET  /api/reception/results-inbox
POST /api/reception/results/:id/send-notice
```

The incoming-orders and confirm-order endpoints remain backed by the Stage 2 order service. The remaining reception endpoints are now backed by `src/services/reception.service.ts` and `src/controllers/reception.controller.ts`.

## Patient check-in

`POST /api/reception/check-in` now:

- validates that the patient exists
- optionally links the check-in to an order
- optionally links the check-in to an appointment
- creates a `PatientVisit` record
- marks the appointment as `CHECKED_IN` when an appointment is provided
- moves a confirmed order to `IN_PROGRESS` when appropriate
- writes an `OrderStatusHistory` entry for the check-in transition
- writes an audit log with action `PATIENT_CHECKED_IN`

## Walk-in intake

`POST /api/reception/walk-ins` now supports both:

- existing patient walk-ins using `patientId`
- new patient walk-ins using embedded `patient` details

The workflow can:

- create a patient record
- validate requested catalog items
- create a confirmed order
- split LAB and SCAN order items by catalog type
- create an invoice unless `invoiceNow` is false
- create a check-in visit unless `checkInNow` is false
- notify billing about the confirmed walk-in order
- write an audit log with action `WALK_IN_CREATED`

## Appointments

The appointment endpoints now support:

- paginated appointment listing
- search by appointment code, patient, room/area, and appointment type
- date-range filtering
- status filtering
- patient, doctor, and hospital filtering
- appointment creation
- appointment updates
- appointment/order/patient integrity checks
- audit logs for create/update actions

## Daily visit log

`GET /api/reception/daily-visits` now reads real `PatientVisit` records and supports:

- pagination
- search
- checked-in date range filtering
- status filtering
- patient filtering
- order filtering

This provides the backend data source for the frontend daily reception log.

## Results inbox and safe notices

`GET /api/reception/results-inbox` now reads generated `Report` records with patient/order context.

`POST /api/reception/results/:id/send-notice` creates:

- a `Notification`
- a linked `DeliveryLog`
- an audit log with action `SAFE_RESULT_NOTICE_SENT`

Privacy rule preserved:

```txt
SMS and WhatsApp notices do not include clinical values or diagnosis.
```

The service sends a generic safe message for non-email channels and marks delivery logs with `safeMessage: true`.

## Files added

```txt
src/services/reception.service.ts
src/controllers/reception.controller.ts
scripts/check-business-stage3.mjs
docs/backend-business-stage-3-reception-workflow.md
```

## Files updated

```txt
src/routes/reception.routes.ts
src/validators/reception.validators.ts
src/config/phase6RouteMap.ts
src/config/openapi.ts
src/controllers/system.controller.ts
package.json
package-lock.json
README.md
docs/backend-roadmap.md
docs/project-tree.txt
```

## QA

Run:

```bash
npm run qa:business-stage3
npm run qa
```

Expected result:

```txt
Backend Business Logic Stage 3 static check passed.
```

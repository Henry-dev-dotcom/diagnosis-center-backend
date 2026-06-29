# Phase 8: Reception Direct Diagnostic Routing

This phase refines the reception workflow so walk-in patients can be registered and routed directly to diagnostic queues.

## Goals

- Reception registers walk-in patients.
- Reception creates laboratory requests for walk-ins.
- Reception creates scan/imaging requests for walk-ins.
- Laboratory requests go directly to Lab Queue.
- Scan requests go directly to Scan Queue.
- Reception no longer pushes completed diagnostic results to clinicians.
- Reception can still view/print reference copies of sent results when needed.
- All records are facility-scoped.

## API routes

Register `backend/src/routes/receptionWorkflow.routes.ts` under `/api`.

### Walk-in patients

```http
GET  /api/reception/walk-ins
GET  /api/reception/walk-ins/search?q=<name-or-id>
POST /api/reception/walk-ins
GET  /api/reception/walk-ins/:patientId
```

Example walk-in patient body:

```json
{
  "fullName": "Ama Mensah",
  "phone": "0240000000",
  "gender": "Female",
  "age": 34,
  "address": "Accra"
}
```

### Walk-in laboratory requests

```http
POST /api/reception/walk-ins/:patientId/request-labs
POST /api/reception/walk-ins/:patientId/request-tests
```

Example body:

```json
{
  "clinicianId": "clinician-user-id",
  "priority": "ROUTINE",
  "clinicalNotes": "Fever and headache",
  "tests": [
    { "testCode": "FBC", "testName": "Full Blood Count" },
    { "testCode": "MAL", "testName": "Malaria Parasite" }
  ]
}
```

Backend behavior:

```text
Reception → Walk-in lab request → Lab Queue
```

No receptionist result-push is required.

### Walk-in scan requests

```http
POST /api/reception/walk-ins/:patientId/request-scans
```

Example body:

```json
{
  "clinicianId": "clinician-user-id",
  "priority": "URGENT",
  "clinicalNotes": "Right shoulder pain",
  "scans": [
    { "scanCode": "XR-SHOULDER", "scanName": "X-Ray Shoulder" }
  ]
}
```

Backend behavior:

```text
Reception → Walk-in scan request → Scan Queue
```

### Patient request history

```http
GET /api/reception/walk-ins/:patientId/requests
```

### Reception reference result copies

```http
GET /api/reception/results/reference-copies
```

This endpoint is for viewing/printing reference copies only. It does not send or push results.

## Required previous phases

- Phase 2 schema update
- Phase 3 facility permissions
- Phase 4 workflow API foundation
- Phase 7 clinician result delivery

## Route registration

In `backend/src/routes/index.ts`:

```ts
import receptionWorkflowRoutes from './receptionWorkflow.routes';
router.use('/api', receptionWorkflowRoutes);
```

If the older Phase 4 reception route is already registered, replace it with this Phase 8 route.

# Phase 7: Clinician Result Delivery and Inbox Refinement

This phase refines direct diagnostic result delivery to clinicians.

## Main goals

- Lab and scan results go directly to the clinician.
- Reception no longer pushes diagnostic results manually.
- Clinicians have one inbox for lab and scan results.
- Documents uploaded in lab/scan workflows appear with the delivered result.
- Sent results are stored in the result archive.
- Results can be marked read or archived by the clinician.
- All actions remain facility-scoped.

## New API routes

Register `backend/src/routes/clinicianResultDelivery.routes.ts` under `/api`.

### Staff delivery endpoint

```http
POST /api/results/deliver-to-clinician
```

Body example for lab:

```json
{
  "source": "LAB",
  "clinicianId": "user-id",
  "patientId": "patient-id",
  "orderId": "order-id",
  "acceptedSampleId": "sample-id",
  "priority": "ROUTINE"
}
```

Body example for scan:

```json
{
  "source": "SCAN",
  "clinicianId": "user-id",
  "patientId": "patient-id",
  "orderId": "order-id",
  "scanAcceptedRequestId": "scan-accepted-id",
  "priority": "URGENT"
}
```

### Clinician inbox

```http
GET /api/clinician/results
GET /api/clinician/results/:inboxId
GET /api/clinician/results/:inboxId/documents
PATCH /api/clinician/results/:inboxId/read
PATCH /api/clinician/results/:inboxId/archive
```

Supported query filters:

```text
q, status, source, priority, patientId, orderId, from, to, take, skip
```

## Workflow behavior

1. Lab staff completes accepted sample tests.
2. Lab staff pushes result to clinician.
3. Backend creates `ResultDeliveryInbox` record.
4. Backend creates/updates result archive record.
5. Backend notifies clinician.
6. Clinician opens the result directly in clinician portal.
7. Clinician can mark it as read or archive it.

## Required previous phases

- Phase 2 schema update
- Phase 3 facility permissions
- Phase 4 workflow API foundation
- Phase 5 lab refinement
- Phase 6 result document upload

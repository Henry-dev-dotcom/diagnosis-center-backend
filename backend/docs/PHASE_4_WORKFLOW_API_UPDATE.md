# Phase 4 Backend Workflow API Update

This phase connects the new frontend workflows to backend endpoints.

## Scope completed

Phase 4 adds facility-scoped APIs for:

1. Laboratory Queue
2. Accepted Samples
3. Per-test laboratory result entry
4. Lab result push directly to clinician
5. Lab Results archive
6. Scan Queue
7. Accepted scan requests
8. Scan result push directly to clinician
9. Clinician results inbox
10. Reception walk-in requests routed directly to diagnostic queues

## Laboratory workflow supported

```text
Clinician / Reception creates lab request
→ Lab Queue
→ Search patient request
→ Add selected tests
→ Accept selected tests
→ Accepted Samples
→ Enter each test result
→ Mark each test completed
→ Push result directly to clinician
→ Store result in Results archive
```

### Laboratory routes

```text
GET    /api/lab/queue
GET    /api/lab/queue/search?search=
GET    /api/lab/queue/:orderId
POST   /api/lab/queue/:orderId/accept-tests
GET    /api/lab/accepted-samples
GET    /api/lab/accepted-samples/search?search=
GET    /api/lab/accepted-samples/:sampleId
POST   /api/lab/accepted-samples/:sampleId/tests/:testId/result
PATCH  /api/lab/accepted-samples/:sampleId/tests/:testId/complete
POST   /api/lab/accepted-samples/:sampleId/push-to-clinician
GET    /api/lab/results
```

### Accept selected lab tests payload

```json
{
  "tests": [
    {
      "orderItemId": "ORDER_ITEM_ID",
      "testId": "CATALOG_TEST_ID",
      "testName": "Full Blood Count",
      "testCode": "FBC",
      "referenceRange": "4.0 - 11.0",
      "unit": "10^9/L"
    }
  ],
  "notes": "Sample received at bench."
}
```

### Save test result payload

```json
{
  "resultValue": "6.4",
  "parameters": [
    {
      "name": "WBC",
      "value": "6.4",
      "unit": "10^9/L",
      "referenceRange": "4.0 - 11.0"
    }
  ],
  "resultNotes": "Within range",
  "equipmentNotes": "Analyzer 1"
}
```

## Scan workflow supported

```text
Clinician / Reception creates scan request
→ Scan Queue
→ Review request
→ Accept to imaging
→ Enter findings / impression
→ Push result directly to clinician
→ Store result in Results archive
```

### Scan routes

```text
GET   /api/scan/queue
GET   /api/scan/queue/search?search=
POST  /api/scan/queue/:orderId/accept
GET   /api/scan/accepted
POST  /api/scan/accepted/:scanId/result
POST  /api/scan/accepted/:scanId/push-to-clinician
```

## Clinician result delivery

Results are pushed directly to the clinician and stored in `ResultDeliveryInbox`.

### Clinician result routes

```text
GET    /api/clinician/results
PATCH  /api/clinician/results/:resultId/read
```

## Reception walk-in workflow

Reception requests no longer wait for receptionist result pushing.

### Reception routes

```text
POST  /api/reception/walk-ins
POST  /api/reception/walk-ins/:patientId/request-tests
POST  /api/reception/walk-ins/:patientId/request-scans
```

Lab requests go directly to Lab Queue. Scan requests go directly to Scan Queue.

## Important implementation notes

- The services use facility scoping from Phase 3.
- Every workflow endpoint expects facility context through one of these:
  - `x-facility-id` header
  - `facilityId` request param
  - `facilityId` body field
  - authenticated user's assigned primary facility
- Super Admin can access all facilities when a facility context is explicitly provided.
- Accepted Samples only contains tests accepted during Queue → Add Test → Accept Sample.
- Results cannot be pushed to clinicians until all accepted tests are completed.
- This phase prepares for Phase 5 and Phase 6, where document upload will be wired to real storage endpoints.

## Files added

```text
backend/src/constants/diagnosticWorkflow.constants.ts
backend/src/utils/diagnosticWorkflow.utils.ts
backend/src/validators/diagnosticWorkflow.validators.ts
backend/src/services/diagnosticWorkflow.service.ts
backend/src/controllers/labWorkflow.controller.ts
backend/src/controllers/scanWorkflow.controller.ts
backend/src/controllers/receptionWorkflow.controller.ts
backend/src/controllers/clinicianResults.controller.ts
backend/src/routes/labWorkflow.routes.ts
backend/src/routes/scanWorkflow.routes.ts
backend/src/routes/receptionWorkflow.routes.ts
backend/src/routes/clinicianResults.routes.ts
backend/src/routes/phase4.routes.example.ts
```

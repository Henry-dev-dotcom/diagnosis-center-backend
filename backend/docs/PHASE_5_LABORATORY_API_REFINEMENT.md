# Phase 5: Laboratory API Refinement

This phase tightens the backend support for the regenerated Laboratory section.

## Purpose

The laboratory frontend now has three major sections:

1. Queue
2. Accepted Samples
3. Results

The backend now enforces the same workflow instead of only relying on frontend state.

## Workflow enforced

```text
Lab Queue
→ search patient/order
→ review requested laboratory tests
→ accept selected tests only
→ move accepted tests to Accepted Samples
→ enter each accepted test result one by one
→ mark each test completed
→ push completed result directly to clinician
→ store sent result in Results archive
```

## Main behavior added

### Queue

- Returns only orders that have laboratory tests.
- Excludes orders already accepted into Accepted Samples.
- Supports patient/order/test search.
- Returns `requestedTests` for each queue item.
- Adds `/queue/summary` for compact dashboard cards.

### Accept selected tests

The backend now validates that:

- At least one test is selected.
- Every selected test belongs to the original patient order.
- No test is selected twice.
- The same order cannot be accepted again.

Only selected tests are copied to `LabAcceptedSampleTest`.

### Accepted Samples

- Shows accepted patients/samples only.
- Returns only accepted tests, not all order tests.
- Supports search by sample code, order ID, patient ID, clinician ID, priority, status, and test name.

### Per-test result entry

Each test result is controlled separately:

- Save result value or parameter list.
- Keep test in `IN_PROGRESS` while being edited.
- Mark test `COMPLETED` only after a saved result or attached document exists.
- Automatically marks the sample `COMPLETED` after all accepted tests are completed.
- Prevents editing after results are sent to clinician.

### Result document attachment readiness

The service supports documents attached to a specific accepted test result:

```text
POST /api/lab/accepted-samples/:sampleId/tests/:testId/documents
DELETE /api/lab/accepted-samples/documents/:documentId
```

This route accepts either:

- `req.file` from your existing upload middleware, or
- `req.body.fileMetadata` from an already-uploaded file reference.

If you use multer or cloud storage, place the upload middleware before `validateLabResultDocument`.

### Push to clinician

The backend now validates that:

- All accepted tests are completed.
- The sample has a clinician recipient.
- The result was not already sent.

Then it:

- Creates `ResultDeliveryInbox`.
- Marks the sample as `SENT_TO_CLINICIAN`.
- Updates the order status to `SENT_TO_CLINICIAN`.
- Creates a clinician notification.
- Writes an audit log.

## Endpoints

```text
GET    /api/lab/queue
GET    /api/lab/queue/summary
GET    /api/lab/queue/search
GET    /api/lab/queue/:orderId
POST   /api/lab/queue/:orderId/accept-tests

GET    /api/lab/accepted-samples
GET    /api/lab/accepted-samples/search
GET    /api/lab/accepted-samples/:sampleId
POST   /api/lab/accepted-samples/:sampleId/tests/:testId/result
PATCH  /api/lab/accepted-samples/:sampleId/tests/:testId/complete
PATCH  /api/lab/accepted-samples/:sampleId/tests/:testId/reopen
POST   /api/lab/accepted-samples/:sampleId/tests/:testId/documents
DELETE /api/lab/accepted-samples/documents/:documentId
POST   /api/lab/accepted-samples/:sampleId/push-to-clinician

GET    /api/lab/results
```

## Files added/replaced

```text
backend/src/types/labWorkflow.types.ts
backend/src/utils/labWorkflow.utils.ts
backend/src/services/labWorkflow.service.ts
backend/src/controllers/labWorkflow.controller.ts
backend/src/validators/labWorkflow.validators.ts
backend/src/routes/labWorkflow.routes.ts
```

## Registration

If you already registered Phase 4 routes, replace that lab route file with this one and keep the same mount point:

```ts
router.use('/lab', labWorkflowRoutes);
```

## Build check

After applying Phase 2, Phase 3, Phase 4, and this Phase 5 patch, run:

```bash
cd backend
npm run build
```

# Business Logic Stage 5 — Laboratory Workflow

## Goal

Business Logic Stage 5 turns the laboratory module from a protected route shell into a live Prisma-backed workflow for lab order items, samples, result entry, review, sign-off, reference ranges, QC, and inventory support.

This stage follows the backend foundation plan requirement that lab staff should only see LAB order items, accept samples, enter results, save drafts, submit for review, sign off with senior permission, view trends, and use reference ranges.

## Implemented endpoints

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
GET  /api/lab/patient-trends/:patientId
GET  /api/lab/qc
POST /api/lab/qc
GET  /api/lab/inventory
POST /api/lab/inventory
POST /api/lab/inventory/:id/transactions
```

## Sample acceptance

Sample acceptance now creates or updates `LabSample` records for eligible LAB `OrderItem` records.

Rules:

- only LAB order items can be accepted;
- cancelled/final-released items are blocked;
- one sample is maintained per order item;
- accepted samples update the order item to `ACCEPTED`;
- parent orders are moved to `IN_PROGRESS` when the lab workflow starts;
- actions are audit logged.

## Accepted samples queue

`GET /api/lab/accepted-samples` loads real accepted/draft/review/signed samples with:

- patient details;
- order details;
- catalog item details;
- invoice summary;
- latest result;
- rejection history.

## Result draft entry

`POST /api/lab/results/draft` and the frontend alias `POST /api/lab/results` now create or update `LabResult` records.

Rules:

- an accepted sample must exist before result entry;
- result parameters are recreated on draft save;
- numeric values are parsed when possible;
- reference parameters and ranges are matched by `parameterId` or parameter name;
- flags are calculated from critical/high/low ranges unless the payload provides a non-pending flag;
- sample and order-item status move to `DRAFT`.

## Review workflow

`POST /api/lab/results/submit-review` moves the result to `PENDING_REVIEW`, updates the sample and order item, and creates a `LabResultReview` record.

`GET /api/lab/review-queue` lists pending-review results with patient, order, catalog, parameters, and review history.

## Sign-off workflow

`POST /api/lab/results/:id/sign-off` supports:

- `SIGNED_OFF` — result becomes signed off, sample becomes signed off, order item becomes signed off, and a `Report` record is generated if one does not exist.
- `REJECTED` — result is cancelled, sample requires recollection, order item is marked for retest, and a sample rejection record is created.

Sign-off also creates notifications and audit logs.

## Rejected/retest workflow

`POST /api/lab/samples/:id/reject` supports full sample rejection or recollection request.

`GET /api/lab/rejected-retest` lists samples/order items in rejected or retest status.

## Reference ranges and trends

`GET /api/lab/reference-ranges/:catalogItemId` returns the lab catalog item with parameters and ranges.

`GET /api/lab/patient-trends/:patientId` groups signed-off lab parameters by parameter name for graph/trend display.

## QC and inventory

Quality control:

```txt
GET  /api/lab/qc
POST /api/lab/qc
```

Inventory:

```txt
GET  /api/lab/inventory
POST /api/lab/inventory
POST /api/lab/inventory/:id/transactions
```

Inventory transactions guard against negative stock and record audit logs.

## Files note

`POST /api/lab/results/:id/files` now records a validated/audited attachment request, but binary upload/storage remains for the later files/upload stage.

## QA

Run:

```bash
npm run qa:business-stage5
npm run qa
```


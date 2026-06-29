# Phase 9: Scan / Imaging Workflow Backend Refinement

This update refines the scan/imaging backend so it matches the frontend same-section flow.

## Workflow supported

```text
Clinician / Reception creates scan request
→ Request appears in Scan Queue
→ Scan staff searches and reviews the request
→ Scan staff accepts the selected scan request to imaging
→ Accepted request appears in Accepted Scans
→ Scan staff enters findings / impression / conclusion
→ Scan staff uploads result document or image if needed
→ Scan result is marked completed
→ Scan result is pushed directly to clinician
→ Sent result is stored in the Results archive
```

## API routes

Mount `scanWorkflow.routes.ts` at `/api/scan`.

### Queue

```text
GET  /api/scan/queue
GET  /api/scan/queue/summary
GET  /api/scan/queue/search
GET  /api/scan/queue/:orderId
POST /api/scan/queue/:orderId/accept
```

### Accepted Scans

```text
GET   /api/scan/accepted
GET   /api/scan/accepted/search
GET   /api/scan/accepted/:scanId
POST  /api/scan/accepted/:scanId/result
PATCH /api/scan/accepted/:scanId/complete
GET   /api/scan/accepted/:scanId/documents
POST  /api/scan/accepted/:scanId/documents
DELETE /api/scan/accepted/documents/:documentId
POST  /api/scan/accepted/:scanId/push-to-clinician
```

### Results Archive

```text
GET /api/scan/results
```

## Rules enforced

- Only scan/imaging items appear in the scan queue.
- Lab-only requests do not appear in the scan queue.
- Already accepted scan requests are removed from the queue.
- Duplicate scan acceptance is blocked.
- Only selected scans from the original order can be accepted.
- Results cannot be pushed without findings, impression, or conclusion.
- Results cannot be edited after being sent to the clinician.
- Documents cannot be added or removed after result delivery.
- All records are facility-scoped.
- Push to clinician creates result inbox records, notifications, archive records, and audit logs where those tables are available.

## Prisma changes

The migration is additive and safe. It extends `ScanAcceptedRequest` with:

```text
requestedScans
resultStatus
scheduledAt
conclusion
recommendation
radiologistNotes
```

It also extends `ScanResultDocument` with:

```text
checksum
metadata
```

## Route registration

In `backend/src/routes/index.ts`, replace the older Phase 4 scan route if it is already registered:

```ts
import scanWorkflowRoutes from './scanWorkflow.routes';
router.use('/api/scan', scanWorkflowRoutes);
```

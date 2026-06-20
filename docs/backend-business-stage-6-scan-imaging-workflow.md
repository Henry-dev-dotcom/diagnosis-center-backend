# Business Logic Stage 6 — Scan / Imaging Workflow

## Status

Implemented in package version `1.6.0`.

This stage replaces scan/imaging placeholder route handlers with live Prisma-backed workflow logic.

## Implemented endpoints

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
POST /api/scan/retake
GET  /api/scan/review-queue
GET  /api/scan/rejected-retake
POST /api/scan/results/:id/files
GET  /api/scan/prior/:patientId
```

## Workflow coverage

- Scan-only queue remains backed by real `OrderItem` records with `CatalogItemType.SCAN`.
- Scan acceptance creates or updates `ScanAcceptance` records.
- Accepted scan queue reads live `ScanAcceptance` records.
- Equipment booking creates real `ScanBooking` records with booking codes, patient, order item, equipment, start/end time, and creator.
- Report drafts create or update `ScanResult` records.
- Scan image and DICOM-ready metadata are stored in `ScanResultFile` records.
- Submit-for-review moves scan result, acceptance, and order item to review states.
- Sign-off creates a review record, signs off the result, generates a report, and notifies the referring doctor.
- Rejection or explicit retake request creates `ScanRetake` records and moves the order item to retest/retake state.
- Prior scan comparison returns signed-off scan history for a patient.
- Major scan actions write `AuditLog` entries.

## DICOM-ready metadata

The file metadata endpoint supports:

```txt
fileName
fileType
fileSize
storageKey
isDicom
studyUid
seriesUid
instanceUid
modality
```

This does not implement a PACS server yet. It prepares the data layer so the future upload/storage stage can connect uploaded files or DICOM studies to scan results.

## QA

Run:

```bash
npm run qa:business-stage6
npm run qa
```

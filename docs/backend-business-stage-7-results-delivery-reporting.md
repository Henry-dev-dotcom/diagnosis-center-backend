# Backend Business Logic Stage 7 — Results Delivery + Reporting

## Goal

Turn the results, reports, notifications, and file-metadata route groups from placeholders into real Prisma-backed workflows.

This stage sits after laboratory and scan sign-off. It handles what happens after clinical results are ready: release, doctor/reception visibility, patient-safe delivery notices, delivery logs, report downloads, reporting dashboards, notifications, and metadata-only file records.

## Implemented route groups

### Results

- `GET /api/results`
- `GET /api/results/:id`
- `POST /api/results/:id/release`
- `GET /api/results/:id/report`
- `POST /api/results/:id/email`
- `POST /api/results/:id/sms`
- `POST /api/results/:id/whatsapp`
- `GET /api/results/delivery-logs`
- `GET /api/results/delivery/logs`
- `POST /api/results/delivery/logs/:id/retry`

### Reports

- `GET /api/reports`
- `GET /api/reports/tat`
- `GET /api/reports/order-volume`
- `GET /api/reports/revenue`
- `GET /api/reports/outstanding`
- `GET /api/reports/abnormal-results`
- `GET /api/reports/staff-productivity`
- `GET /api/reports/results-delivery`
- `GET /api/reports/export`

### Notifications

- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `GET /api/notifications/logs`
- `POST /api/notifications/logs/:id/retry`
- `PATCH /api/notifications/settings`

### Files

- `GET /api/files`
- `POST /api/files/upload`
- `GET /api/files/:id`
- `DELETE /api/files/:id`

### Doctor result view

- `GET /api/doctor/results`

## Privacy rule

SMS and WhatsApp delivery bodies are always generated as safe notices. They do not include clinical values, impressions, diagnoses, lab parameter values, or scan findings.

Email and PDF-ready report payloads can contain clinical detail because they are protected through authenticated endpoints and delivery audit logs.

## Important implementation notes

- Reports are backed by the existing `Report` table created by lab and scan sign-off workflows.
- Secure result links are backed by `SecureResultLink` with a hashed token and seven-day expiry.
- PDF generation is not performed yet. `GET /api/results/:id/report` returns a PDF-ready structured payload and records a `PDF_DOWNLOAD` delivery log.
- File storage is metadata-only at this stage. Scan image/DICOM metadata persists in `ScanResultFile`. Other module file uploads are accepted and audit-logged but require a future generic `FileAsset` table or object-storage adapter for persistence.
- Delivery retries update `DeliveryLog` status, retry count, performer, and audit trail.

## Audit coverage

Stage 7 emits audit logs for:

- result release
- report download/access
- result delivery by email/SMS/WhatsApp
- delivery retry
- notification read status update
- notification settings update
- report export
- file metadata upload, view, and delete

## QA

Run:

```bash
npm run qa:business-stage7
npm run qa
```

# Backend Business Logic Stage 8 — Notifications + Files + DICOM-ready Upload Layer

## Goal

Business Logic Stage 8 turns the Stage 7 notification/file metadata foundation into an operational delivery and upload layer.

It adds:

- notification creation and delivery controls
- read, unread, read-all, log retry, and default preference endpoints
- local/base64 upload support without adding external storage dependencies
- metadata-only fallback for modules without a dedicated file table
- scan-result file persistence through `ScanResultFile`
- lab attachment audit/storage support pending a future generic `FileAsset` table
- signed download payloads for locally stored files
- DICOM-ready study list/detail endpoints grouped by Study UID
- audit logs for notification and file operations

## Notification endpoints

```txt
GET   /api/notifications
POST  /api/notifications
PATCH /api/notifications/read-all
PATCH /api/notifications/:id/read
PATCH /api/notifications/:id/unread
POST  /api/notifications/:id/deliver
GET   /api/notifications/logs
POST  /api/notifications/logs/:id/retry
GET   /api/notifications/preferences
PATCH /api/notifications/preferences
PATCH /api/notifications/settings
```

## File endpoints

```txt
GET    /api/files
POST   /api/files/upload
GET    /api/files/:id
GET    /api/files/:id/download
DELETE /api/files/:id
GET    /api/files/dicom/studies
GET    /api/files/dicom/studies/:studyUid
```

## Upload modes

### 1. Metadata-only upload

```json
{
  "module": "SCAN",
  "entityType": "ScanResult",
  "entityId": "scan_result_id",
  "files": [
    {
      "fileName": "chest-xray.dcm",
      "fileType": "application/dicom",
      "fileSize": 204800,
      "storageKey": "scan/result/chest-xray.dcm",
      "isDicom": true,
      "studyUid": "1.2.840.study",
      "seriesUid": "1.2.840.series",
      "instanceUid": "1.2.840.instance",
      "modality": "DX"
    }
  ]
}
```

### 2. Local/base64 upload

```json
{
  "module": "SCAN",
  "entityType": "ScanResult",
  "entityId": "scan_result_id",
  "files": [
    {
      "fileName": "image.png",
      "fileType": "image/png",
      "contentBase64": "iVBORw0KGgoAAA...",
      "modality": "US"
    }
  ]
}
```

When `contentBase64`, `base64`, or `dataUrl` is supplied and `UPLOAD_STORAGE_DRIVER=local`, the backend writes file bytes under `UPLOAD_ROOT` and stores metadata through the existing scan file table.

## Environment variables

```txt
UPLOAD_STORAGE_DRIVER=local
UPLOAD_ROOT=uploads
MAX_UPLOAD_BYTES=26214400
SIGNED_FILE_URL_TTL_MINUTES=15
DICOM_GATEWAY_MODE=metadata-only
```

## DICOM readiness

This stage does not install or require a PACS server. Instead, it persists DICOM-ready metadata:

```txt
isDicom
studyUid
seriesUid
instanceUid
modality
storageKey
uploadedAt
```

This prepares the project for a later PACS/DICOM gateway integration while allowing the frontend scan module to manage image metadata now.

## Privacy rule

SMS and WhatsApp notification deliveries remain privacy-safe. The delivery audit records use a generic notice and do not expose clinical values, diagnosis, findings, impressions, or lab result values.

## QA

Run:

```bash
npm run qa:business-stage8
npm run qa
```

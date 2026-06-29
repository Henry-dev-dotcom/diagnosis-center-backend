# Phase 6 — Result Document Upload and Storage

This phase connects uploaded documents to the new laboratory and scan result workflows.

## What this phase supports

### Laboratory result popup

The lab staff can now attach files while entering a result for one accepted test.

Supported files:

- PDF
- DOC
- DOCX
- XLS
- XLSX
- PNG
- JPG / JPEG

Each uploaded document is linked to:

- facility
- accepted sample
- individual accepted test
- order
- patient
- uploading lab staff member

### Scan result entry

Scan staff can attach documents or images to accepted scan requests.

Each uploaded scan document is linked to:

- facility
- accepted scan request
- order
- patient
- uploading scan staff member

## New API endpoints

### Laboratory documents

```http
GET    /api/lab/accepted-samples/:sampleId/tests/:testId/documents
POST   /api/lab/accepted-samples/:sampleId/tests/:testId/documents
DELETE /api/lab/accepted-samples/documents/:documentId
```

The upload endpoint expects multipart form data with field name:

```text
document
```

It also supports metadata-only submission for systems that upload to external storage first:

```json
{
  "file": {
    "fileName": "cbc-result.pdf",
    "originalName": "cbc-result.pdf",
    "mimeType": "application/pdf",
    "fileSize": 123456,
    "fileUrl": "https://storage.example/cbc-result.pdf"
  }
}
```

### Scan documents

```http
GET    /api/scan/accepted/:scanId/documents
POST   /api/scan/accepted/:scanId/documents
DELETE /api/scan/accepted/documents/:documentId
```

## Workflow rules enforced

- Documents cannot be attached after a result has been sent to the clinician.
- Documents cannot be removed after a result has been sent to the clinician.
- Lab documents must belong to a valid accepted sample and accepted test.
- Scan documents must belong to a valid accepted scan request.
- File type and size are validated before saving.
- Deleted files are soft-deleted when the Phase 6 schema fields are available.
- Uploads are audit logged.

## Database additions

Phase 2 already added:

- `LabTestResultDocument`
- `ScanResultDocument`

Phase 6 adds optional storage metadata fields:

- `storageProvider`
- `storageKey`
- `checksumSha256`
- `documentType`
- `extension`
- `isDeleted`
- `deletedAt`
- `deletedById`

## Required route registration

Add the new route module to your main backend routes, usually in `backend/src/routes/index.ts`:

```ts
import resultDocumentRoutes from './resultDocument.routes';

router.use('/', resultDocumentRoutes);
```

Or merge the route snippets into the existing lab and scan routers.

## Required install

```bash
npm install multer
npm install -D @types/multer
```

## Required environment setting

Optional local upload folder:

```env
RESULT_UPLOAD_DIR=uploads/results
```

When not set, the backend uses:

```text
<backend working directory>/uploads/results
```

## Apply commands

```bash
cd backend
npx prisma migrate dev --name result_document_storage
npx prisma generate
npm run build
```

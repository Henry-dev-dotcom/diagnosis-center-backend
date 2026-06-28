# Phase 12: Validation and Security Rules

This phase protects the new multi-facility diagnostic workflow from invalid access, incomplete workflow actions, and unsafe document uploads.

## Main protections added

1. Facility context is required for facility-scoped workflow actions.
2. Users cannot access records outside their assigned facility.
3. Lab staff can only accept tests that were part of the original request.
4. Duplicate lab sample acceptance is blocked.
5. Accepted Samples only accepts results for accepted tests.
6. Lab results cannot be pushed to the clinician until all accepted tests are completed.
7. Lab and scan records are locked after delivery to the clinician.
8. Result documents cannot be added or removed after delivery.
9. Uploaded result documents are validated by MIME type, extension, and file size.
10. Blocked security events are logged.

## Files added

- `backend/src/constants/securityValidation.constants.ts`
- `backend/src/types/securityValidation.types.ts`
- `backend/src/utils/securityValidation.utils.ts`
- `backend/src/services/securityValidation.service.ts`
- `backend/src/middleware/facilitySecurity.middleware.ts`
- `backend/src/middleware/fileSecurity.middleware.ts`
- `backend/src/middleware/workflowValidation.middleware.ts`
- `backend/src/validators/securityWorkflow.validators.ts`
- `backend/src/routes/phase12.routes.example.ts`

## How to integrate

Register the middleware around the existing Phase 4 to Phase 10 workflow routes.
Use `phase12.routes.example.ts` as the direct integration guide.

### Lab queue acceptance

Use:

```ts
validateBody(acceptLabTestsSecureSchema),
validateLabAcceptanceSelection()
```

before the controller that accepts selected lab tests.

### Lab result entry

Use:

```ts
preventPostDeliveryLabEdits(),
validateBody(saveLabTestResultSecureSchema)
```

before the controller that saves a test result.

### Lab push to clinician

Use:

```ts
requireAllLabTestsCompletedBeforeDelivery()
```

before the controller that pushes lab results to the clinician.

### Document uploads

Use:

```ts
blockDocumentMutationAfterDelivery('labAcceptedSample', 'sampleId'),
validateResultDocumentUpload()
```

or:

```ts
blockDocumentMutationAfterDelivery('scanAcceptedRequest', 'scanId'),
validateResultDocumentUpload()
```

before the upload controller.

## File upload rules

Allowed formats:

- PDF
- DOC
- DOCX
- XLS
- XLSX
- PNG
- JPG/JPEG

Default maximum file size:

- 15 MB

Change it in:

```ts
MAX_RESULT_DOCUMENT_SIZE_BYTES
```

## Migration

The migration adds defensive lock/checksum columns and helpful indexes. It is written defensively, so it only adds columns when the relevant tables exist.

Run:

```bash
npx prisma migrate dev --name validation_security_rules
npx prisma generate
npm run build
```

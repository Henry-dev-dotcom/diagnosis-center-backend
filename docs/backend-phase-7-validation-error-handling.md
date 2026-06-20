# Backend Phase 7 — Validation and Error Handling

## Goal

Phase 7 turns the Phase 6 protected route contracts into safer API endpoints by adding reusable request validation and consistent error responses before deeper business logic is implemented.

The backend still uses placeholder controllers for most business modules, but the request payloads, query parameters, and route parameters now pass through Zod validation before those placeholders run.

## Main files added or upgraded

### Middleware

- `src/middleware/validate.ts`
  - `validateRequest({ body, query, params })`
  - `validateBody(schema)`
  - `validateQuery(schema)`
  - `validateParams(schema)`

- `src/middleware/errorHandler.ts`
  - Converts Zod validation errors into clean `400` responses.
  - Converts `AppError` into structured API errors.
  - Handles common Prisma errors like duplicate values and missing records.
  - Hides unsafe internal details in production.

### Shared response types

- `src/types/api.ts`
  - `ApiSuccess<T>`
  - `ApiValidationError`
  - `ApiError`
  - `ApiResponse<T>`

### Validators

- `src/validators/common.validators.ts`
- `src/validators/auth.validators.ts`
- `src/validators/patient.validators.ts`
- `src/validators/order.validators.ts`
- `src/validators/reception.validators.ts`
- `src/validators/lab.validators.ts`
- `src/validators/scan.validators.ts`
- `src/validators/billing.validators.ts`
- `src/validators/finance.validators.ts`
- `src/validators/admin.validators.ts`
- `src/validators/result.validators.ts`
- `src/validators/notification.validators.ts`
- `src/validators/file.validators.ts`

## Validator coverage

Phase 7 includes validators for the planned foundation schemas:

| Area | Key validators |
|---|---|
| Auth | `loginSchema`, `refreshTokenSchema`, `logoutSchema`, `changePasswordSchema` |
| Patients | `createPatientSchema`, `updatePatientSchema`, `checkDuplicatesSchema` |
| Orders | `createOrderSchema`, `updateOrderStatusSchema`, `orderTransitionSchema`, `cancelOrderSchema` |
| Reception | `confirmOrderSchema`, `checkInSchema`, `createWalkInSchema`, `appointmentSchema`, `sendResultNoticeSchema` |
| Lab | `acceptSampleSchema`, `labResultSchema`, `submitLabResultReviewSchema`, `signOffLabResultSchema`, `rejectSampleSchema` |
| Scan | `acceptScanSchema`, `scanBookingSchema`, `scanResultSchema`, `submitScanResultReviewSchema`, `signOffScanResultSchema`, `scanRetakeSchema` |
| Billing | `updateInvoiceSchema`, `paymentSchema`, `refundSchema` |
| Finance | `startShiftSchema`, `closeShiftSchema`, `floatAdjustmentSchema`, `expenseSchema`, `expensePaymentSchema` |
| Admin | `createUserSchema`, `hospitalSchema`, `doctorProfileSchema`, `catalogSchema`, `referenceRangeSchema`, `departmentSchema`, `equipmentSchema` |
| Results | `releaseResultSchema`, `resultDeliverySchema`, `retryDeliverySchema` |
| Notifications | `notificationSettingsSchema` |
| Files | `fileUploadSchema` |

## Standard success response

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {}
}
```

## Standard validation error response

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_FAILED",
  "requestId": "example-request-id",
  "method": "POST",
  "path": "/api/patients",
  "timestamp": "2026-06-19T00:00:00.000Z",
  "errors": [
    {
      "field": "firstName",
      "message": "First name is required",
      "code": "too_small"
    }
  ]
}
```

## Error response coverage

| HTTP status | Meaning |
|---:|---|
| 400 | Validation failure, malformed payload, invalid database query input |
| 401 | Missing/invalid token or invalid session |
| 403 | Role, permission, or resource-scope denial |
| 404 | Missing route or missing resource |
| 409 | Unique constraint conflict |
| 500 | Safe internal server error response |

## Route-level validation

The following Phase 6 route groups now use validation middleware where request input is expected:

- patients
- doctor orders/profile updates
- orders
- reception
- lab
- scan
- billing
- finance
- admin
- results
- reports query filters
- notifications
- files
- users

## OpenAPI update

`src/config/openapi.ts` is updated to version `0.7.0` and includes a `400` validation response on route contracts.

## QA

Run:

```bash
npm run qa
```

This runs:

```bash
node scripts/check-phase7.mjs
```

The check confirms that Phase 7 validators, validation middleware, standard error handler markers, OpenAPI updates, and route-level validator wiring are present.

## Notes for the next phase

Phase 8 should add audit logging hooks around successful/failed major business actions. The current validation layer is intentionally placed before protected module handlers so that later business services receive clean, typed input.

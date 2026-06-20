# Backend Phase 3 — Core Database Schema

## Scope

This phase expands the PostgreSQL/Prisma foundation into the full relational data model needed by the Diagnosis Center / SUNKWA platform.

It does not yet implement business logic routes. It prepares the database structure that later API phases will use.

## Schema groups added

### Identity and access

- `User`
- `UserSession`
- `PasswordResetToken`
- Role/status enums

### Organization

- `Hospital`
- `DoctorProfile`
- `Department`
- `Equipment`

### Patients and reception

- `Patient`
- `PatientContact`
- `PatientInsurance`
- `PatientDuplicateFlag`
- `Appointment`
- `PatientVisit`

### Catalog and reference ranges

- `CatalogItem`
- `ReferenceParameter`
- `ReferenceRange`

Reference ranges support:

- low / high limits
- critical low / critical high limits
- gender rules
- age range rules
- display range text
- analyzer / method notes through reference parameters

### Orders

- `Order`
- `OrderItem`
- `OrderStatusHistory`
- `OrderCancellation`

One order can contain many order items. Each order item is typed as either `LAB` or `SCAN`, allowing department-specific queues while keeping a shared order header.

### Laboratory

- `LabSample`
- `LabResult`
- `LabResultParameter`
- `LabResultReview`
- `LabResultAmendment`
- `SampleRejection`
- `QualityControlRun`
- `InventoryItem`
- `InventoryTransaction`

Laboratory statuses include sample acceptance, draft result entry, pending review, signed off, rejected, and recollection requested.

### Scan / imaging

- `ScanAcceptance`
- `ScanBooking`
- `ScanResult`
- `ScanResultFile`
- `ScanReview`
- `ScanRetake`

DICOM-ready metadata is represented through `ScanResultFile` fields such as `isDicom`, `studyUid`, `seriesUid`, `instanceUid`, and `modality`.

### Billing and finance

- `Invoice`
- `InvoiceItem`
- `Payment`
- `CashierShift`
- `FloatTransaction`
- `Expense`
- `ExpensePayment`
- `LedgerEntry`
- `Receipt`

Finance supports invoices, active cashier shifts, float transactions, expense payments, write-offs, and running ledger entries.

### Results delivery

- `Report`
- `Notification`
- `DeliveryLog`
- `SecureResultLink`

Delivery channels include in-app, email, SMS, WhatsApp, print, and PDF download. The schema supports privacy-safe delivery logging and retry tracking.

### Audit and reliability

- `AuditLog`
- `SystemEvent`
- `ApiRequestLog`

Audit logs include actor, role, module, entity type, before/after JSON payloads, IP address, user agent, and timestamp.

## Important schema decisions

### Order header vs order item

The schema separates `Order` from `OrderItem` so a clinician can create one order containing multiple tests and scans.

- Lab staff query `OrderItem` rows where `type = LAB`.
- Scan staff query `OrderItem` rows where `type = SCAN`.
- Doctors, reception, and admin can view the full order.

### Server-side flagging readiness

The database stores both reference range definitions and captured result parameter metadata. This allows later API phases to calculate and store flags server-side:

- `NORMAL`
- `LOW`
- `HIGH`
- `CRITICAL`
- `NO_RANGE`
- `PENDING`

### Finance workflow readiness

The schema supports the original SUNKWA finance workflow:

- no payment without an active shift
- every payment can link to a cashier shift
- every payment can create a float transaction
- every finance movement can become a ledger entry
- expenses and write-offs are tracked separately

## New static QA script

Phase 3 adds:

```bash
npm run qa
```

which now runs:

```bash
node scripts/check-phase3.mjs
```

The script verifies that all core schema groups are present.

## Next phase

Backend Phase 4 will implement authentication:

- password hashing
- login/logout
- refresh tokens
- `GET /api/auth/me`
- JWT middleware
- role-based request protection foundation

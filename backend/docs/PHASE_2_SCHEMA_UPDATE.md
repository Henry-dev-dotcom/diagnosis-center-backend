# Phase 2 Backend Schema Update

This update prepares the backend database for the frontend workflow changes already made to the platform.

## Scope

Phase 2 is database/schema work only. It adds the structure needed for:

1. Multi-diagnostic-facility support
2. Facility features and customization
3. Facility departments
4. Facility-specific test and scan catalogs
5. Facility user assignments
6. Facility limits and routing rules
7. Lab Queue → Add Test → Accept Sample
8. Accepted Samples → per-test result entry
9. Lab result document uploads per test
10. Direct result delivery to clinician
11. Scan Queue → Accept to Imaging → Push to Clinician

## Files included

```text
backend/prisma/migrations/20260628130852_multi_facility_workflow_schema/migration.sql
backend/prisma/extensions/phase2_schema_extension.prisma
backend/prisma/extensions/existing_model_field_additions.prisma.txt
backend/src/types/facility-workflow.types.ts
backend/scripts/apply_phase2_schema_patch.sh
backend/docs/PHASE_2_SCHEMA_UPDATE.md
```

## New tables

### Multi-facility tables

```text
DiagnosticFacility
FacilityFeature
FacilityDepartment
FacilityServiceCatalog
FacilityRoutingRule
FacilityLimit
FacilityUserAssignment
```

### Laboratory workflow tables

```text
LabAcceptedSample
LabAcceptedSampleTest
LabTestResultDocument
```

### Result delivery table

```text
ResultDeliveryInbox
```

### Scan/imaging workflow tables

```text
ScanAcceptedRequest
ScanResultDocument
```

## Existing tables extended

The migration safely attempts to add `facilityId` to common existing tables if they exist:

```text
User / users
Patient / patients
Order / orders
OrderItem / order_items
LabRequest / lab_requests
ScanRequest / scan_requests
Result / results
Notification / notifications
AuditLog / audit_logs
File / files
Invoice / invoices
Payment / payments
```

These are safe `ALTER TABLE IF EXISTS` statements.

## Why this matters

The platform now needs to behave as a multi-facility diagnostic system. This means every important item should be scoped to a facility:

```text
patients
orders
lab samples
scan requests
results
documents
notifications
audit logs
users
billing records
```

## Laboratory workflow supported by this schema

```text
Request created by clinician/reception
→ Request appears in Lab Queue
→ Lab staff searches patient
→ Lab staff clicks Add Test
→ Lab staff selects only the tests being accepted
→ Accepted tests are stored in LabAcceptedSampleTest
→ Accepted sample appears in Accepted Samples
→ Lab staff enters each test result one-by-one
→ Lab staff attaches documents to individual tests
→ Each completed test is marked completed
→ Completed sample is pushed directly to clinician
→ Delivery record is stored in ResultDeliveryInbox
```

## Scan workflow supported by this schema

```text
Scan request created by clinician/reception
→ Request appears in Scan Queue
→ Scan staff reviews request
→ Scan staff accepts to imaging
→ Scan staff enters findings/impression
→ Scan staff uploads image/report document
→ Result is pushed directly to clinician
→ Delivery record is stored in ResultDeliveryInbox
```

## How to apply

### Option A: Prisma migration SQL

Copy the migration folder into your project:

```text
backend/prisma/migrations/20260628130852_multi_facility_workflow_schema
```

Then run:

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### Option B: Merge Prisma extension first

Copy this file into your project:

```text
backend/prisma/extensions/phase2_schema_extension.prisma
```

Then append its content to:

```text
backend/prisma/schema.prisma
```

Add the existing model fields listed in:

```text
backend/prisma/extensions/existing_model_field_additions.prisma.txt
```

Then run:

```bash
cd backend
npx prisma format
npx prisma migrate dev --name multi_facility_workflow_schema
npx prisma generate
```

## Important note

This phase does not yet update controllers, routes, or services. It only prepares the database and TypeScript constants.

The next backend phase should update role permissions and facility scoping so users only see records that belong to their assigned diagnostic facility.

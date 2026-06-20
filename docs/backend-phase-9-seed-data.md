# Backend Phase 9 — Seed Data

Phase 9 upgrades the Prisma seed script from a small foundation sample into a frontend-compatible demo database. The goal is to make the backend contain realistic data for every major workflow already built in the frontend.

## Main file

```txt
prisma/seed.ts
```

The seed script is intentionally deterministic. It resets demo data first, then recreates stable IDs and codes that mirror the frontend seed records, such as:

```txt
HOSP-001
DOC-001
PAT-0001
ORD-2026-0001
INV-0001
SMP-0001
RES-0001
RPT-0001
SHIFT-SEED-001
```

This keeps future frontend-to-backend mapping predictable when live API wiring begins.

## Seeded access accounts

```txt
admin     / admin123
doctor    / doctor123
reception / reception123
lab       / lab123
scan      / scan123
billing   / billing123
```

Additional internal demo account:

```txt
doctor2   / doctor123
```

`doctor2` exists so the second frontend doctor profile can own historical seeded orders.

## Seeded organization data

```txt
Hospitals
Doctor profiles
Departments
Equipment
```

Hospitals seeded:

```txt
St. Raphael Hospital
North Ridge Medical Centre
```

Doctor profiles seeded:

```txt
Dr. Abena Mensah
Dr. Michael Nortey
```

Equipment includes X-ray, ultrasound, CT, MRI, and lab analyzers.

## Seeded patient data

```txt
Ama Serwaa Boateng
Kojo Nyarko
Nana Yaa Prempeh
```

Each patient includes identifiers, contact details, hospital/doctor linkage, insurance details where applicable, emergency contact, and allergy/condition notes.

## Seeded catalog and reference ranges

The seed now includes the full frontend SUNKWA catalog:

```txt
13 lab tests
9 scan/imaging investigations
```

Lab tests include parameters and reference ranges for:

```txt
Full Blood Count
Urinalysis
Liver Function Test
Renal Function Test
Lipid Profile
Blood Glucose
Malaria Test
Widal Test
Hepatitis B Screening
HIV Screening
Semen Analysis
Pregnancy Test
Thyroid Function Test
```

Scan investigations include:

```txt
CT Scan - Head
CT Scan - Chest
CT Scan - Abdomen
X-Ray - Chest
X-Ray - Spine
Ultrasound - Abdomen
Ultrasound - Pelvic
Ultrasound - Obstetric
Echocardiography
```

## Seeded order workflow

Seeded orders:

```txt
ORD-2026-0001
ORD-2026-0002
ORD-2026-0003
ORD-2026-0004
ORD-2026-0005
ORD-2026-0006
```

The orders cover submitted, confirmed, pending review, and final released states. Each order also receives order items and status history timeline entries.

## Seeded lab workflow

The seed includes:

```txt
Accepted lab samples
Signed-off historical FBC results
Pending-review LFT result
Result parameters
Reference range snapshots
Result flags
Lab review records
Quality-control runs
Inventory items
Inventory transactions
```

This supports lab queue, accepted samples, result entry, result review, and patient trend screens.

## Seeded scan workflow

The seed includes:

```txt
Scan acceptance
Scan booking
Pending-review ultrasound report
Scan result file metadata
DICOM-ready metadata
Scan review record
```

DICOM-ready metadata includes:

```txt
isDicom
studyUid
seriesUid
instanceUid
modality
storageKey
```

## Seeded billing and finance workflow

The seed includes:

```txt
Invoices
Invoice items
Payments
Receipts
Cashier shift
Float adjustment
Payment float transactions
Expenses
Expense payments
Ledger entries
```

This gives finance screens enough data for invoice status, payment history, float review, expense tracking, and ledger views.

## Seeded results delivery workflow

The seed includes:

```txt
Reports
Secure result links
Notifications
Delivery logs
Safe SMS result notice example
Email result notice example
```

SMS content is kept safe and does not include clinical values or diagnoses.

## Seeded audit and system records

The seed creates baseline records in:

```txt
AuditLog
SystemEvent
```

This makes the admin audit screens useful immediately after seeding.

## How to run

```bash
npm run prisma:migrate
npm run prisma:seed
```

For a clean database during development:

```bash
npm run prisma:reset
```

## Acceptance coverage

Phase 9 covers the seed requirements from the backend roadmap:

```txt
Admin user
Doctor user
Reception user
Lab user
Scan user
Billing user
Hospitals
Doctor profile
Patients
SUNKWA test catalog
Reference ranges
Departments
Equipment
Sample orders
Invoices
Demo login accounts
```

It also adds workflow records for lab, scan, finance, reports, notifications, inventory, QC, audit, and system events so the frontend has realistic data across all completed screens.

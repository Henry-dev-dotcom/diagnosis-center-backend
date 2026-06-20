# Backend Business Logic Stage 1 — Patient and Admin Catalog Foundation

## Goal

Start turning the completed backend foundation into a real API-backed platform by replacing key placeholder route handlers with Prisma services and controllers.

This stage focuses on the records that every later module depends on:

- Patients
- Users
- Hospitals
- Doctor profiles
- Departments
- Equipment
- Catalog items
- Reference ranges
- Doctor profile and referred-patient access

## Why this stage comes first

Doctor orders, reception confirmation, laboratory sample handling, scan workflow, billing, finance, reports, and results delivery all depend on accurate patient and catalog data. This stage creates that stable data layer before adding deeper order workflow logic.

## Implemented files

```txt
src/services/query.service.ts
src/services/patient.service.ts
src/services/adminBusiness.service.ts
src/controllers/patient.controller.ts
src/controllers/adminBusiness.controller.ts
src/controllers/doctor.controller.ts
scripts/check-business-stage1.mjs
docs/backend-business-stage-1-patient-admin-catalog-foundation.md
```

## Live patient endpoints

```txt
GET    /api/patients
POST   /api/patients
GET    /api/patients/:id
PATCH  /api/patients/:id
GET    /api/patients/:id/orders
GET    /api/patients/:id/trends
POST   /api/patients/check-duplicates
```

Implemented behavior:

- Paginated patient listing
- Search by patient code, name, phone, email, national ID, or policy number
- Patient creation with generated `PAT-000x` codes
- Contact and insurance child-record creation from patient fields
- Patient profile loading with hospital, referring doctor, contacts, insurance, and counts
- Patient updates with audit logging
- Patient order history
- Patient clinical trend summary
- Duplicate patient checks
- Doctor patient access scoping so doctors can only see referred patients

## Live admin endpoints

```txt
GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
GET    /api/admin/hospitals
POST   /api/admin/hospitals
PATCH  /api/admin/hospitals/:id
GET    /api/admin/doctors
POST   /api/admin/doctors
PATCH  /api/admin/doctors/:id
GET    /api/admin/catalog
POST   /api/admin/catalog
PATCH  /api/admin/catalog/:id
GET    /api/admin/reference-ranges
POST   /api/admin/reference-ranges
PATCH  /api/admin/reference-ranges/:id
GET    /api/admin/departments
POST   /api/admin/departments
PATCH  /api/admin/departments/:id
GET    /api/admin/equipment
POST   /api/admin/equipment
PATCH  /api/admin/equipment/:id
GET    /api/admin/config-export
```

Implemented behavior:

- Admin user listing, creation, update, and status toggle through `/api/users/:id/deactivate`
- Password hashing for admin-created or reset user passwords
- Hospital CRUD foundation
- Doctor profile CRUD foundation with user-role validation
- Catalog CRUD foundation for lab and scan items
- Reference range creation and update with automatic reference-parameter upsert
- Department CRUD foundation
- Equipment CRUD foundation
- Configuration export for frontend/admin setup screens
- Audit logs for all mutations

## Live doctor endpoints added in this stage

```txt
GET    /api/doctor/profile
PATCH  /api/doctor/profile
GET    /api/doctor/patients
GET    /api/doctor/patient-trends/:patientId
```

## Schema fix included

The Prisma schema had a duplicated `ReferenceParameter.ranges` relation marker. This stage removes the duplicate so Prisma generation can proceed cleanly once Prisma engine binaries are available locally.

## QA

Static QA command:

```bash
npm run qa:business-stage1
```

Full available static QA command:

```bash
npm run qa
```

Runtime QA to run locally after extraction:

```bash
npm install
npm run prisma:generate
npm run build
npm run lint
docker compose up -d
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## Next recommended stage

Backend Business Logic Stage 2 should implement real doctor order creation and the order registry. That stage should create orders, order items, timelines, and invoice preparation from the catalog and patient foundation built here.

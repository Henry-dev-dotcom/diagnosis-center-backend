# Business Logic Stage 10 — Frontend Live API Integration + Final Full-System QA

## Goal

Finalize the backend business-logic build so it is ready to be used by the completed React frontend in live API mode.

This stage does not replace the frontend UI. It confirms that the backend exposes the routes needed by the frontend service layer, documents the live integration path, and adds final static QA checks before local runtime testing.

## Completed backend foundation

The backend foundation phases are complete:

1. Project setup
2. PostgreSQL + Prisma foundation
3. Core database schema
4. Authentication system
5. Role permissions
6. API route structure
7. Validation and error handling
8. Audit logging foundation
9. Seed data
10. Backend foundation QA

## Completed business logic stages

1. Patient + admin catalog foundation
2. Doctor order creation + order registry
3. Reception workflow + check-in + walk-ins + appointments
4. Billing + finance workflow foundation
5. Laboratory workflow
6. Scan / imaging workflow
7. Results delivery + reporting
8. Notifications + files + DICOM-ready upload layer
9. Reports, analytics, audit review, admin exports
10. Frontend live API integration + final full-system QA

## Stage 10 additions

- Backend version moved to `2.0.0`.
- OpenAPI metadata moved to `2.0.0`.
- Version endpoint now reports Stage 10.
- Phase-chain QA now checks foundation phases 1 through 10.
- `npm run qa` now checks Business Logic Stages 1 through 10.
- Full-system local runbook added.
- Frontend live API integration contract added.
- Final backend QA marker added for Stage 10.

## Integration expectation

The frontend should run with:

```bash
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:5000/api
```

The backend should run with:

```bash
FRONTEND_URL=http://localhost:5173
```

## Local QA sequence

```bash
npm install
npm run prisma:generate
npm run build
npm run lint
npm run qa
docker compose up -d
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Then run the frontend in live mode and verify login, patient, doctor, reception, lab, scan, billing, results, notification, file, and reports pages.

# Full-System Local Runbook — Backend + Frontend Live API Mode

## Backend setup

```bash
cd diagnosis-center-backend-business-stage10-frontend-live-api-final-qa
cp .env.example .env
npm install
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm run qa
npm run dev
```

Backend URLs:

```txt
http://localhost:5000/api/health
http://localhost:5000/api/version
http://localhost:5000/api/database/status
http://localhost:5000/api/docs
```

## Frontend setup

```bash
cd diagnosis-center-frontend-live-api-ready
cp .env.example .env
npm install
npm run qa
npm run dev
```

Frontend `.env` for live mode:

```txt
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:5000/api
VITE_API_TIMEOUT_MS=15000
VITE_MOCK_API_DELAY_MS=120
```

## Demo accounts

```txt
admin / admin123
doctor / doctor123
reception / reception123
lab / lab123
scan / scan123
billing / billing123
```

## Manual smoke-test order

1. Login as `doctor`.
2. Create an order for a seeded patient with at least one lab test and one scan.
3. Login as `reception` and confirm the order.
4. Check in the patient.
5. Login as `billing` and record payment after starting a cashier shift.
6. Login as `lab`, accept the lab sample, enter results, submit for review, and sign off.
7. Login as `scan`, accept the scan, book equipment, enter the report, submit for review, and sign off.
8. Login as `reception` or `admin`, release/deliver the result using privacy-safe channels.
9. Review delivery logs, reports dashboard, audit logs, and admin export payloads.

## Expected safety behavior

SMS and WhatsApp notices must not include clinical values, diagnoses, lab parameter values, imaging findings, or imaging impressions.

## Common troubleshooting

- If the frontend cannot connect, verify `VITE_API_BASE_URL=http://localhost:5000/api`.
- If login fails, verify `npm run prisma:seed` completed successfully.
- If billing payment fails, start a cashier shift first.
- If Prisma generation fails, check internet access for Prisma engine download, then rerun `npm run prisma:generate`.

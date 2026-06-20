# Backend Foundation Local QA Checklist

Use this checklist after extracting the final backend foundation package.

## 1. Install dependencies

```bash
npm install
```

## 2. Generate Prisma client

```bash
npm run prisma:generate
```

## 3. Run static foundation QA

```bash
npm run qa
```

This runs the Phase 10 static check and verifies the phase chain.

## 4. Run full local QA

```bash
npm run qa:full
```

This runs static QA, Prisma generation, TypeScript build, and lint.

## 5. Start PostgreSQL

```bash
docker compose up -d
```

## 6. Migrate database

```bash
npm run prisma:migrate
```

## 7. Seed demo data

```bash
npm run prisma:seed
```

## 8. Check database status

```bash
npm run db:status
```

## 9. Start the API server

```bash
npm run dev
```

## 10. Smoke-test system endpoints

```bash
npm run health:local
```

Open these URLs:

```txt
http://localhost:5000
http://localhost:5000/api/health
http://localhost:5000/api/version
http://localhost:5000/api/database/status
http://localhost:5000/api/docs
```

## 11. Test login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Copy the returned access token and test:

```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 12. Test access contracts

```bash
curl http://localhost:5000/api/access/route-contracts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 13. Test admin audit logs

```bash
curl "http://localhost:5000/api/admin/audit-logs?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Expected result

The backend should be ready as the stable foundation before deeper business modules are implemented.

Successful checks should confirm:

- server boots
- health endpoint responds
- database connects
- migrations run
- seed data loads
- login works
- protected routes require JWT
- role/permission checks block unauthorized users
- Swagger docs open
- audit/admin endpoints are protected

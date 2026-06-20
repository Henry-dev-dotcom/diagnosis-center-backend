# Deployment Runbook

## 1. Prepare environment files

Copy the production examples:

```bash
cp .env.production.example .env.production
```

Edit these fields before deployment:

```txt
FRONTEND_URL
FRONTEND_URLS
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
UPLOAD_ROOT
```

Use long random values for both JWT secrets. Do not reuse the same value.

## 2. Local production-style Docker run

From the full-system root:

```bash
cp .env.production.example .env.production
cp backend/.env.production.example backend/.env.production
cp frontend/.env.production.example frontend/.env.production

docker compose -f docker-compose.production.yml up --build
```

The frontend will be available on:

```txt
http://localhost:8080
```

The backend will be available on:

```txt
http://localhost:5000/api/live
http://localhost:5000/api/ready
```

## 3. Database migration and seed

For a fresh deployment, run migrations before opening the system to users:

```bash
docker compose -f docker-compose.production.yml exec backend npx prisma migrate deploy
```

Seed only demo/testing deployments:

```bash
docker compose -f docker-compose.production.yml exec backend npm run prisma:seed
```

Do not seed real production unless the demo data is intentionally required.

## 4. Production smoke test

Check:

```bash
curl http://localhost:5000/api/live
curl http://localhost:5000/api/ready
curl http://localhost:5000/api/version
```

Then log in from the frontend with the seeded/demo users only in a demo environment.

## 5. Operational notes

- Mount `/app/uploads` to persistent storage.
- Keep PostgreSQL on a persistent volume or managed database.
- Set `ENABLE_API_DOCS=false` for public deployments.
- Set `TRUST_PROXY=true` when running behind Nginx, Traefik, Caddy, or a cloud load balancer.
- Restrict database network exposure.
- Back up PostgreSQL before migrations.

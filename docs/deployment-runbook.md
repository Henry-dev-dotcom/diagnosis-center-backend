# Deployment Runbook

## Option A — Render (free cloud, recommended)

The repo ships a `render.yaml` blueprint that provisions a free PostgreSQL
database and a Node web service in one step.

1. Push this backend repo to GitHub (already done for `master`).
2. In Render, choose **New + → Blueprint** and select this repository. Render
   reads `render.yaml`, creates `diagnosis-center-db` and
   `diagnosis-center-backend`, wires `DATABASE_URL`, and generates the two JWT
   secrets automatically.
3. When prompted (the `sync:false` vars), set:
   - `SEED_ADMIN_PASSWORD` — a strong password for the first admin login.
   - `SEED_ADMIN_EMAIL` — the admin's email.
   - `FRONTEND_URL` and `FRONTEND_URLS` — the GitHub Pages **origin only**
     (no repo path), e.g. `https://henry-dev-dotcom.github.io`.
4. Deploy. The build runs `prisma generate` + `tsc`; the start command runs
   `prisma migrate deploy`, the idempotent production seed (admin + reference
   data only), then the server.
5. Note the service URL, e.g. `https://diagnosis-center-backend.onrender.com`.
   Health check: `https://<service>.onrender.com/api/health`.
6. Point the frontend at it: in the **frontend** repo settings, set the repo
   variable `VITE_API_BASE_URL=https://<service>.onrender.com/api` (and
   `VITE_API_MODE=live`), then trigger the Pages deploy.

Free-tier notes: the web service sleeps after inactivity (first request after
idle takes ~30s to wake); the free Postgres is capped and expires after 90
days unless upgraded. Fine for pilots, not for a busy clinic.

## Option B — Docker / self-hosted

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

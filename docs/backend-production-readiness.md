# Backend Production Readiness Stage

## Goal

This stage hardens the Diagnosis Center backend after Business Logic Stage 10 so it can be deployed more safely in a production-like environment.

## Added production readiness features

- Backend version updated to `2.1.0`.
- Production environment template added: `.env.production.example`.
- Production JWT guard prevents default or weak secrets when `NODE_ENV=production`.
- Access and refresh token secrets must be different in production.
- Multi-origin CORS support through `FRONTEND_URLS`.
- Optional reverse-proxy support through `TRUST_PROXY`.
- Optional API docs exposure through `ENABLE_API_DOCS`.
- Configurable request body size through `BODY_LIMIT`.
- Built-in lightweight API rate limiting through `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`.
- New liveness endpoint: `GET /api/live`.
- New readiness endpoint: `GET /api/ready`.
- Production Dockerfile and `.dockerignore`.
- Upload directory placeholder for mounted storage.
- Production QA script: `npm run qa:production`.

## Runtime endpoint behavior

| Endpoint | Purpose |
|---|---|
| `GET /api/live` | Confirms the API process is running. Does not require database access. |
| `GET /api/ready` | Confirms the API can serve traffic, including database connectivity. Returns `503` if database is unavailable. |
| `GET /api/health` | Detailed health payload for local/admin diagnostics. |
| `GET /api/version` | Runtime version and deployment metadata. |

## Production environment rules

When `NODE_ENV=production`:

- `JWT_ACCESS_SECRET` must not be the default value.
- `JWT_REFRESH_SECRET` must not be the default value.
- Both JWT secrets must be at least 32 characters.
- Access and refresh secrets must be different.

## QA command

```bash
npm run qa:production
```

For the full backend chain:

```bash
npm run qa
npm run build
npm run lint
```

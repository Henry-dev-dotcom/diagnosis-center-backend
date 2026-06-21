# Backend QA Check Report

Date: 2026-06-21

## Summary

The backend dependency `404` issue has been fixed. The package now installs successfully when lifecycle scripts are skipped, and the backend static QA suite passes.

## Commands run

```bash
cd backend
npm ci --ignore-scripts
npm run qa
npm audit --audit-level=moderate
```

## Results

- `npm ci --ignore-scripts`: PASSED
- `npm run qa`: PASSED
- `npm audit --audit-level=moderate`: PASSED, 0 vulnerabilities

## Remaining environment-dependent item

A normal `npm ci`, `npm run prisma:generate`, or `npm run build` still requires Prisma to download its query engine from:

```text
https://binaries.prisma.sh
```

In the QA environment, DNS access to that host failed with:

```text
getaddrinfo EAI_AGAIN binaries.prisma.sh
```

Because Prisma Client generation did not complete, `npm run build` cannot compile the generated Prisma enum/type exports yet. This is not the old dependency `404`; it is a Prisma binary download/network access issue.

## Local/hosting fix

On a machine or hosting server with internet access to Prisma binaries, run:

```bash
cd backend
npm ci
npx prisma generate
npm run build
npm run qa
```

If that still fails, allow outbound HTTPS/DNS access to `binaries.prisma.sh`, or run Prisma generation during build on a machine/network where that endpoint is accessible.

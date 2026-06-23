# Build & Verification Guide

This document records the **one correct build order** for the backend and why it
matters. Follow it on any machine (local, CI, or hosting) before trusting a build.

## TL;DR

```bash
cd backend
npm ci
npx prisma generate   # <-- REQUIRED, and must come before build/typecheck
npm run typecheck
npm run build
```

Or simply:

```bash
cd backend
bash scripts/verify-build.sh
```

## Why `prisma generate` must run first

The backend imports its enums and model types from `@prisma/client`
(`UserRole`, `InvoiceStatus`, `OrderStatus`, `Prisma.TransactionClient`, etc.).
Those types **do not exist until `prisma generate` produces the client**.

If you build without generating first, `tsc` emits a large, misleading wall of
errors that look like real bugs but are not:

- `Module '"@prisma/client"' has no exported member 'UserRole'` (and ~25 other enums)
- `Parameter 'tx' implicitly has an 'any' type` (the Prisma transaction generic is missing)
- `'user' is possibly 'undefined'` (narrowing breaks when `UserRole` is unresolved)
- `Property 'type' does not exist on type '{}'` (query results lose their inferred shape)

All of the above resolve themselves the moment the client is generated. Do not
"fix" them by editing source — generate the client instead.

## Network requirement

`prisma generate` downloads a query engine from `binaries.prisma.sh` on first run.
If your build environment cannot reach that host (the symptom is
`getaddrinfo EAI_AGAIN binaries.prisma.sh`), you must either:

1. Allowlist `binaries.prisma.sh` for the build environment, **or**
2. Pre-generate the client elsewhere and ship `node_modules/.prisma` into the
   environment, **or**
3. Use a Prisma binary mirror via the `PRISMA_ENGINES_MIRROR` env var.

## Genuine source fixes already applied (Stage 1)

These were real bugs, independent of Prisma generation, and are now fixed:

- `validators/scan.validators.ts` — `scanWorkflowQuerySchema` was calling
  `.extend()` on a refined schema (a `ZodEffects`), which Zod does not allow.
  It now extends the unrefined base (`dateRangeQueryBaseSchema`) and re-applies
  the date-range refinement afterward.
- `controllers/audit.controller.ts` (3 sites) — `req.query` was cast directly to
  a refined Zod inferred type, which TypeScript rejects. The cast now routes
  through `unknown`, which is safe here because `validateRequest({ query })`
  middleware has already parsed and replaced `req.query` with the validated value.

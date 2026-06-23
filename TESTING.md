# Testing Guide

Stage 2 introduced a real automated test suite using [Vitest](https://vitest.dev).
These tests cover the highest-stakes pure logic in the backend: authentication
primitives, role-based access control, money math, and the production config guard.

## Running the tests

```bash
cd backend
npm ci
npx prisma generate   # required: tests import enum values from @prisma/client
npm test              # run once
npm run test:watch    # watch mode during development
npm run test:coverage # with coverage report
```

> The suites import `UserRole` and `InvoiceStatus` from `@prisma/client`, so the
> Prisma client must be generated first (same prerequisite as the build — see
> BUILD.md). Without it the tests cannot resolve those enum values.

## What is covered

| Suite | File | What it locks down |
| --- | --- | --- |
| Money | `test/money.test.ts` | `roundMoney` rounding (incl. float-precision and negative edges) and `calculateInvoiceStatus` transitions, including the sticky terminal statuses (INSURANCE_PENDING / WRITTEN_OFF / REFUNDED). |
| Permissions | `test/permission.service.test.ts` | ADMIN `*` wildcard, per-role scoping, cross-department isolation, and the any/all combinators. |
| Password | `test/password.test.ts` | bcrypt hash/verify round-trips, wrong-password rejection, unique salts, cost factor 12. |
| Token | `test/token.test.ts` | JWT sign/verify round-trips, access-vs-refresh secret isolation, tamper rejection, `hashToken` determinism. |
| Env guard | `test/env.guard.test.ts` | Production refuses default / too-short / identical JWT secrets; DATABASE_URL is always required. Runs the real `env.ts` in child processes. |

## Source change made for testability

`roundMoney` and `calculateInvoiceStatus` were previously duplicated inside
`billing.service.ts` and `finance.service.ts`. They were extracted into
`src/utils/money.ts` as a single, tested source of truth. The behavior is
unchanged; both services now import from the shared module.

## Behaviors documented (not bugs, but worth a team decision)

- `calculateInvoiceStatus(0, 0)` returns `UNPAID`, not `PAID`, because the
  `paid <= 0` check runs before `paid >= total`. If a zero-total invoice should
  read as `PAID`, that is an intentional logic change to make in `utils/money.ts`.
- `roundMoney` uses `Math.round`, which rounds halves toward +Infinity. Combined
  with IEEE-754, some negative half-cent values round away from zero
  (e.g. `-10.005 -> -10.01`). Acceptable for display rounding; noted for awareness.

## Next testing layers (not yet implemented)

These pure-logic tests are the foundation. Service-level tests that touch the
database (order creation, payment recording end-to-end) belong in a later stage
and should run against a disposable Postgres instance (e.g. Testcontainers or a
CI service container), kept separate from this fast, dependency-free suite.

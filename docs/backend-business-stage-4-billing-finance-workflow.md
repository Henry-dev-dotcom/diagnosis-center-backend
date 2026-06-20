# Backend Business Logic Stage 4 — Billing and Finance Workflow Foundation

## Goal

Replace the billing and finance placeholder route handlers with database-backed business logic that supports the current frontend finance workflow and the backend finance rules.

## Implemented billing endpoints

```txt
GET   /api/billing/invoices
GET   /api/billing/invoices/:id
PATCH /api/billing/invoices/:id
POST  /api/billing/invoices/:id/payments
POST  /api/billing/invoices/:id/refund
GET   /api/billing/receipts/:id
```

## Implemented finance endpoints

```txt
POST /api/finance/shifts/start
POST /api/finance/shifts
POST /api/finance/shifts/:id/close
GET  /api/finance/shifts/current
GET  /api/finance/shifts
GET  /api/finance/shifts/history
GET  /api/finance/float
POST /api/finance/float/adjustments
GET  /api/finance/expenses
POST /api/finance/expenses
PATCH /api/finance/expenses/:id
POST /api/finance/expenses/:id/payment
POST /api/finance/expenses/:id/write-off
GET  /api/finance/ledger
GET  /api/finance/analytics
GET  /api/finance/ageing
```

## Billing behavior

- Invoice register supports pagination, search, status filtering, patient/hospital filtering, and date range filtering.
- Invoice detail includes patient, hospital, order, invoice items, payments, receipts, shift summary, and creator.
- Invoice update supports status, discount, insurance claim reference, and audit details.
- Payment recording requires an active cashier shift.
- Every completed payment creates:
  - `Payment`
  - `FloatTransaction` with type `PAYMENT`
  - `LedgerEntry` with type `CREDIT`
  - `Receipt`
  - updated invoice `amountPaid`, `balance`, and `status`
- Refund foundation records a float refund, debit ledger entry, invoice balance adjustment, reason, supervisor approval reference, and audit log.

## Finance behavior

- Cashier shift start prevents duplicate active shifts for the same cashier.
- Opening float is stored on the shift and, when greater than zero, creates a float transaction.
- Cashier shift close stores counted cash and variance.
- Float register reads real float transactions.
- Float adjustments update expected cash and create a ledger entry.
- Expenses support creation, update, payment, and write-off.
- Every expense payment creates a debit ledger entry.
- Ledger endpoint returns credit/debit entries with linked payment, expense, float, and user context.
- Analytics endpoint summarizes invoices, payments by method, expenses, ledger credits/debits, and open shifts.
- Receivable ageing endpoint groups outstanding invoice balances into current, 1–30, 31–60, 61–90, and over-90-day buckets.

## Audit actions added

```txt
INVOICE_UPDATED
PAYMENT_RECORDED
REFUND_RECORDED
SHIFT_STARTED
SHIFT_CLOSED
FLOAT_ADJUSTMENT_RECORDED
EXPENSE_CREATED
EXPENSE_UPDATED
EXPENSE_PAYMENT_RECORDED
EXPENSE_WRITTEN_OFF
```

## QA

Run:

```bash
npm run qa:business-stage4
npm run qa
```

The stage is considered complete when all billing and finance routes are no longer placeholders, route contracts are marked as implemented, and the stage-specific static QA check passes.

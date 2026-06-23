import { InvoiceStatus } from '@prisma/client';

/**
 * Rounds a monetary value to 2 decimal places using half-up rounding on cents.
 *
 * Extracted from billing.service.ts and finance.service.ts, which previously
 * each defined an identical copy. Centralizing it gives a single, tested source
 * of truth for money rounding across the backend.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Derives an invoice's status from its total and amount paid.
 *
 * Terminal/override statuses (INSURANCE_PENDING, WRITTEN_OFF, REFUNDED) are
 * sticky: once set they are preserved regardless of payment amounts. Otherwise
 * the status is computed from how much has been paid relative to the total.
 */
export function calculateInvoiceStatus(
  total: number,
  paid: number,
  currentStatus?: InvoiceStatus
): InvoiceStatus {
  if (currentStatus === InvoiceStatus.INSURANCE_PENDING) return InvoiceStatus.INSURANCE_PENDING;
  if (currentStatus === InvoiceStatus.WRITTEN_OFF) return InvoiceStatus.WRITTEN_OFF;
  if (currentStatus === InvoiceStatus.REFUNDED) return InvoiceStatus.REFUNDED;
  if (paid <= 0) return InvoiceStatus.UNPAID;
  if (paid >= total) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIAL;
}

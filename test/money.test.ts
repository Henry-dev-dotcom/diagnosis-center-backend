import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from '@prisma/client';
import { roundMoney, calculateInvoiceStatus } from '../src/utils/money.js';

describe('roundMoney', () => {
  it('rounds to two decimal places', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(2.5)).toBe(2.5);
  });

  it('handles classic floating-point sums cleanly', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('leaves whole numbers unchanged', () => {
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(0)).toBe(0);
  });

  it('rounds large monetary values correctly', () => {
    expect(roundMoney(1234567.891)).toBe(1234567.89);
    expect(roundMoney(1234567.895)).toBe(1234567.9);
  });

  it('handles negative values (e.g. adjustments/refunds)', () => {
    // Note: Math.round rounds half toward +Infinity, and IEEE-754 means
    // -10.005 * 100 is slightly below -1000.5, so it rounds to -1001 -> -10.01.
    expect(roundMoney(-10.005)).toBe(-10.01);
    expect(roundMoney(-10.004)).toBe(-10);
    expect(roundMoney(-10.006)).toBe(-10.01);
  });
});

describe('calculateInvoiceStatus', () => {
  describe('payment-derived statuses', () => {
    it('returns UNPAID when nothing is paid', () => {
      expect(calculateInvoiceStatus(100, 0)).toBe(InvoiceStatus.UNPAID);
    });

    it('returns UNPAID for a non-positive paid amount', () => {
      expect(calculateInvoiceStatus(100, -5)).toBe(InvoiceStatus.UNPAID);
    });

    it('returns PARTIAL when some but not all is paid', () => {
      expect(calculateInvoiceStatus(100, 40)).toBe(InvoiceStatus.PARTIAL);
    });

    it('returns PAID when paid equals total', () => {
      expect(calculateInvoiceStatus(100, 100)).toBe(InvoiceStatus.PAID);
    });

    it('returns PAID when paid exceeds total (overpayment edge)', () => {
      expect(calculateInvoiceStatus(100, 120)).toBe(InvoiceStatus.PAID);
    });

    it('treats a fully paid zero-total invoice as PAID', () => {
      // total 0, paid 0: paid <= 0 short-circuits to UNPAID by design.
      expect(calculateInvoiceStatus(0, 0)).toBe(InvoiceStatus.UNPAID);
    });
  });

  describe('sticky terminal/override statuses', () => {
    it('preserves INSURANCE_PENDING regardless of payment', () => {
      expect(calculateInvoiceStatus(100, 100, InvoiceStatus.INSURANCE_PENDING)).toBe(
        InvoiceStatus.INSURANCE_PENDING
      );
      expect(calculateInvoiceStatus(100, 0, InvoiceStatus.INSURANCE_PENDING)).toBe(
        InvoiceStatus.INSURANCE_PENDING
      );
    });

    it('preserves WRITTEN_OFF regardless of payment', () => {
      expect(calculateInvoiceStatus(100, 100, InvoiceStatus.WRITTEN_OFF)).toBe(
        InvoiceStatus.WRITTEN_OFF
      );
    });

    it('preserves REFUNDED regardless of payment', () => {
      expect(calculateInvoiceStatus(100, 50, InvoiceStatus.REFUNDED)).toBe(InvoiceStatus.REFUNDED);
    });

    it('recomputes normally when current status is a non-terminal one', () => {
      // A currently-UNPAID invoice receiving full payment becomes PAID.
      expect(calculateInvoiceStatus(100, 100, InvoiceStatus.UNPAID)).toBe(InvoiceStatus.PAID);
      // A currently-PARTIAL invoice still owing becomes PARTIAL.
      expect(calculateInvoiceStatus(100, 30, InvoiceStatus.PARTIAL)).toBe(InvoiceStatus.PARTIAL);
    });
  });
});

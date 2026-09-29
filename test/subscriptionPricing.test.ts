import { describe, expect, it } from 'vitest';
import { entitledModules, periodEnd, periodPrice, prorationCharge, quote, remainingShare } from '../src/services/subscriptionPricing.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const standard = { name: 'Standard', monthlyPrice: 1500, yearlyDiscountPercent: 15, modules: ['opd', 'pharmacy', 'billing'] };

describe('prices', () => {
  it('yearly is twelve months less the discount', () => {
    expect(periodPrice(1500, 'MONTHLY', 15)).toBe(1500);
    expect(periodPrice(1500, 'YEARLY', 15)).toBe(15300);
    expect(periodPrice(99.99, 'YEARLY', 0)).toBe(1199.88);
  });

  it('a quote is the plan plus add-ons, and included departments are never charged twice', () => {
    const q = quote({
      plan: standard,
      addOns: [
        { moduleKey: 'laboratory', name: 'Laboratory', monthlyPrice: 400 },
        { moduleKey: 'pharmacy', name: 'Pharmacy', monthlyPrice: 300 }
      ],
      interval: 'MONTHLY'
    });
    expect(q.lines).toEqual([
      { description: 'Standard plan (monthly)', amount: 1500 },
      { description: 'Add-on: Laboratory', amount: 400 }
    ]);
    expect(q.total).toBe(1900);
  });

  it('yearly quotes discount the add-ons too and report a monthly equivalent', () => {
    const q = quote({ plan: standard, addOns: [{ moduleKey: 'laboratory', name: 'Laboratory', monthlyPrice: 400 }], interval: 'YEARLY' });
    expect(q.total).toBe(15300 + 4080);
    expect(q.monthlyEquivalent).toBe(1615);
  });
});

describe('periods and proration', () => {
  it('a monthly period ends on the same date next month, clamped at month end', () => {
    expect(periodEnd(d('2026-01-31'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(periodEnd(d('2026-03-15'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(periodEnd(d('2026-03-15'), 'YEARLY').toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('an upgrade halfway through pays half the difference; a downgrade charges nothing now', () => {
    expect(remainingShare(d('2026-04-01'), d('2026-05-01'), d('2026-04-16'))).toBe(0.5);
    expect(prorationCharge(1500, 1900, d('2026-04-01'), d('2026-05-01'), d('2026-04-16'))).toBe(200);
    expect(prorationCharge(1900, 1500, d('2026-04-01'), d('2026-05-01'), d('2026-04-16'))).toBe(0);
  });

  it('entitlements are the plan’s departments plus add-ons', () => {
    expect(entitledModules(['opd', 'billing'], ['laboratory', 'opd'])).toEqual(['billing', 'laboratory', 'opd']);
  });
});

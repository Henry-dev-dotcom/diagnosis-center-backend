/*
  Subscription pricing (Phase 5). Pure and unit tested: this is money.

  A facility pays for a plan (its base price includes the plan's departments)
  plus any add-on departments at their own monthly price. Yearly billing is
  twelve months less the plan's yearly discount. All amounts are GHS and are
  rounded to the pesewa at the end of each line, so lines always add up.
*/

export type Interval = 'MONTHLY' | 'YEARLY';
export type PriceLine = { description: string; amount: number };

const round = (value: number) => Math.round(value * 100) / 100;

export function periodPrice(monthly: number, interval: Interval, yearlyDiscountPercent: number) {
  return interval === 'MONTHLY' ? round(monthly) : round(monthly * 12 * (1 - yearlyDiscountPercent / 100));
}

/** The price of a plan plus add-on departments for one billing period. */
export function quote(input: {
  plan: { name: string; monthlyPrice: number; yearlyDiscountPercent: number; modules: readonly string[] };
  addOns: ReadonlyArray<{ moduleKey: string; name: string; monthlyPrice: number }>;
  interval: Interval;
}) {
  const discount = input.plan.yearlyDiscountPercent;
  const lines: PriceLine[] = [{ description: `${input.plan.name} plan (${input.interval === 'MONTHLY' ? 'monthly' : 'yearly'})`, amount: periodPrice(input.plan.monthlyPrice, input.interval, discount) }];
  for (const addOn of input.addOns) {
    // A department the plan already includes is never charged twice.
    if (input.plan.modules.includes(addOn.moduleKey)) continue;
    lines.push({ description: `Add-on: ${addOn.name}`, amount: periodPrice(addOn.monthlyPrice, input.interval, discount) });
  }
  const total = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const monthlyEquivalent = round(input.interval === 'MONTHLY' ? total : total / 12);
  return { lines, total, monthlyEquivalent };
}

const DAY_MS = 86_400_000;

/** A period starting on `start` for one interval (calendar months, clamped to the month's last day). */
export function periodEnd(start: Date, interval: Interval) {
  const months = interval === 'MONTHLY' ? 1 : 12;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
}

/** The unused share of a period from `now`, 0 to 1, by whole days remaining. */
export function remainingShare(periodStart: Date, periodEndAt: Date, now: Date) {
  const total = Math.max(1, Math.round((periodEndAt.getTime() - periodStart.getTime()) / DAY_MS));
  const left = Math.min(total, Math.max(0, Math.ceil((periodEndAt.getTime() - now.getTime()) / DAY_MS)));
  return left / total;
}

/**
 * Upgrading mid-period: the new price for the days left, less what the old
 * price already paid for those days. Never negative: downgrades take effect at
 * renewal instead, so there is no refund to compute.
 */
export function prorationCharge(oldPeriodTotal: number, newPeriodTotal: number, periodStart: Date, periodEndAt: Date, now: Date) {
  const share = remainingShare(periodStart, periodEndAt, now);
  return Math.max(0, round((newPeriodTotal - oldPeriodTotal) * share));
}

/** The departments a subscription entitles a facility to: the plan's plus add-ons, without duplicates. */
export function entitledModules(planModules: readonly string[], addOns: readonly string[]) {
  return [...new Set([...planModules, ...addOns])].sort();
}

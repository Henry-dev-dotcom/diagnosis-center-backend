import { Prisma, ResultFlag } from '@prisma/client';

/*
  How a number becomes normal, high, low or critical.

  This lives on its own because two paths reach it: a technician typing a value,
  and an analyzer sending one. They must flag identically — a result that would
  be called critical when typed cannot be called normal when it arrives down a
  cable. Our own reference ranges decide, never the analyzer's.
*/

export type FlagRange = {
  low: Prisma.Decimal | null;
  high: Prisma.Decimal | null;
  criticalLow: Prisma.Decimal | null;
  criticalHigh: Prisma.Decimal | null;
};

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeFlag(value: string, range?: FlagRange | null, provided?: ResultFlag) {
  if (provided && provided !== ResultFlag.PENDING) return provided;
  const numeric = numberOrNull(value);
  if (numeric === null || !range) return ResultFlag.NO_RANGE;

  const criticalLow = range.criticalLow === null ? null : Number(range.criticalLow);
  const criticalHigh = range.criticalHigh === null ? null : Number(range.criticalHigh);
  const low = range.low === null ? null : Number(range.low);
  const high = range.high === null ? null : Number(range.high);

  if (criticalLow !== null && numeric < criticalLow) return ResultFlag.CRITICAL;
  if (criticalHigh !== null && numeric > criticalHigh) return ResultFlag.CRITICAL;
  if (low !== null && numeric < low) return ResultFlag.LOW;
  if (high !== null && numeric > high) return ResultFlag.HIGH;
  if (low === null && high === null) return ResultFlag.NO_RANGE;
  return ResultFlag.NORMAL;
}

export function referenceDisplay(parameter: { unit: string | null; ranges: Array<{ displayRange: string | null; low: Prisma.Decimal | null; high: Prisma.Decimal | null }> }) {
  const range = parameter.ranges[0];
  if (!range) return null;
  if (range.displayRange) return range.displayRange;
  if (range.low !== null && range.high !== null) return `${range.low.toString()} - ${range.high.toString()}${parameter.unit ? ` ${parameter.unit}` : ''}`;
  return null;
}

/*
  An analyzer's own abnormal marker, read only when we have no range of our own.
  It is advisory: we never let it override a flag our ranges produced, because
  the instrument does not know this facility's population or its cut-offs.
*/
export function flagFromAnalyzerMarker(marker: string | null | undefined): ResultFlag | null {
  if (!marker) return null;
  const code = marker.trim().toUpperCase();
  if (code === '') return null;
  // HL7 table 0078 and the ASTM equivalents, plus the doubled forms instruments
  // use for a panic value.
  if (['HH', 'LL', 'AA', '>>', '<<', 'C', 'P', 'PANIC', 'CRIT', 'CRITICAL'].includes(code)) return ResultFlag.CRITICAL;
  if (['H', '>', 'A'].includes(code)) return ResultFlag.HIGH;
  if (['L', '<'].includes(code)) return ResultFlag.LOW;
  if (['N', 'NORMAL', 'OK'].includes(code)) return ResultFlag.NORMAL;
  return null;
}

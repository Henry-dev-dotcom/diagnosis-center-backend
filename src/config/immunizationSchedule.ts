/*
  Routine childhood immunization schedule, based on the Ghana Expanded
  Programme on Immunization (EPI). Facilities must confirm it against current
  Ghana Health Service guidance; codes are stored on records, so a vaccine may
  be added here but an existing code must never be renamed.

  minAgeDays: earliest age for the dose. A dose in a series is also due no
  sooner than minIntervalDays after the previous dose. maxAgeDays: after this
  age the dose is no longer given (OPV0 is replaced by the OPV1 series).
*/

export type ScheduledDose = {
  code: string;
  name: string;
  series: string;
  dose: number;
  minAgeDays: number;
  minIntervalDays?: number;
  maxAgeDays?: number;
  route: string;
};

const W = 7;
const M = 30.4375; // days per month, on average

const dose = (code: string, name: string, series: string, n: number, minAgeDays: number, route: string, extra: Partial<ScheduledDose> = {}): ScheduledDose => ({
  code, name, series, dose: n, minAgeDays: Math.round(minAgeDays), route, ...extra
});

export const IMMUNIZATION_SCHEDULE: readonly ScheduledDose[] = [
  dose('BCG', 'BCG', 'BCG', 1, 0, 'Intradermal, right upper arm'),
  dose('OPV0', 'Oral polio (birth dose)', 'OPV0', 1, 0, 'Oral', { maxAgeDays: 14 }),
  dose('OPV1', 'Oral polio 1', 'OPV', 1, 6 * W, 'Oral'),
  dose('PENTA1', 'Pentavalent 1 (DTP-HepB-Hib)', 'PENTA', 1, 6 * W, 'IM, left thigh'),
  dose('PCV1', 'Pneumococcal 1', 'PCV', 1, 6 * W, 'IM, right thigh'),
  dose('ROTA1', 'Rotavirus 1', 'ROTA', 1, 6 * W, 'Oral'),
  dose('OPV2', 'Oral polio 2', 'OPV', 2, 10 * W, 'Oral', { minIntervalDays: 28 }),
  dose('PENTA2', 'Pentavalent 2 (DTP-HepB-Hib)', 'PENTA', 2, 10 * W, 'IM, left thigh', { minIntervalDays: 28 }),
  dose('PCV2', 'Pneumococcal 2', 'PCV', 2, 10 * W, 'IM, right thigh', { minIntervalDays: 28 }),
  dose('ROTA2', 'Rotavirus 2', 'ROTA', 2, 10 * W, 'Oral', { minIntervalDays: 28 }),
  dose('OPV3', 'Oral polio 3', 'OPV', 3, 14 * W, 'Oral', { minIntervalDays: 28 }),
  dose('PENTA3', 'Pentavalent 3 (DTP-HepB-Hib)', 'PENTA', 3, 14 * W, 'IM, left thigh', { minIntervalDays: 28 }),
  dose('PCV3', 'Pneumococcal 3', 'PCV', 3, 14 * W, 'IM, right thigh', { minIntervalDays: 28 }),
  dose('IPV1', 'Inactivated polio', 'IPV', 1, 14 * W, 'IM, right thigh'),
  dose('MALARIA1', 'Malaria vaccine 1', 'MALARIA', 1, 6 * M, 'IM, left upper arm'),
  dose('MALARIA2', 'Malaria vaccine 2', 'MALARIA', 2, 7 * M, 'IM, left upper arm', { minIntervalDays: 28 }),
  dose('MALARIA3', 'Malaria vaccine 3', 'MALARIA', 3, 9 * M, 'IM, left upper arm', { minIntervalDays: 28 }),
  dose('MR1', 'Measles-rubella 1', 'MR', 1, 9 * M, 'Subcutaneous, right upper arm'),
  dose('YF', 'Yellow fever', 'YF', 1, 9 * M, 'Subcutaneous, left upper arm'),
  dose('MR2', 'Measles-rubella 2', 'MR', 2, 18 * M, 'Subcutaneous, right upper arm', { minIntervalDays: 28 }),
  dose('MENA', 'Meningococcal A conjugate', 'MENA', 1, 18 * M, 'IM, left thigh'),
  dose('MALARIA4', 'Malaria vaccine 4', 'MALARIA', 4, 24 * M, 'IM, left upper arm', { minIntervalDays: 28 })
];

export const SCHEDULE_BY_CODE = new Map(IMMUNIZATION_SCHEDULE.map((d) => [d.code, d]));

/** The earlier dose in the same series, if any (OPV2 -> OPV1). */
export function previousDose(d: ScheduledDose) {
  return IMMUNIZATION_SCHEDULE.find((x) => x.series === d.series && x.dose === d.dose - 1) ?? null;
}

/** A dose becomes overdue this many days after it falls due (the defaulter-tracing threshold). */
export const OVERDUE_AFTER_DAYS = 28;

import type { MedicationBlock } from '@prisma/client';

/*
  The medication chart's schedule.

  A prescription says how often a medicine is given in words ("twice daily", "TDS",
  "every 8 hours"). The ward chart needs that as boxes to tick: which parts of the day, how
  many doses. This turns the words into slots, and works out which slots are due now.

  Facility time is UTC (Africa/Accra), so a "day" here is a UTC day.

  The parts of the day:
    MORNING    06:00 to 12:00
    AFTERNOON  12:00 to 18:00
    NIGHT      18:00 to 06:00 the next morning

  A frequency that is not a regular schedule (as needed, once only, anything the parser does
  not recognise) has no slots. Those medicines are still chartable: a nurse records each
  dose as it is given, which is the safe reading of words nobody has taught the system.
*/

export const BLOCKS: MedicationBlock[] = ['MORNING', 'AFTERNOON', 'NIGHT'];

const START_HOUR: Record<MedicationBlock, number> = { MORNING: 6, AFTERNOON: 12, NIGHT: 18 };
// Night runs past midnight, to 06:00 the next day (hour 30 of the day it starts on).
const END_HOUR: Record<MedicationBlock, number> = { MORNING: 12, AFTERNOON: 18, NIGHT: 30 };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type Slot = { block: MedicationBlock; slot: number };
export type Schedule = { asNeeded: boolean; slots: Slot[] };

const M = (slot = 0): Slot => ({ block: 'MORNING', slot });
const A = (slot = 0): Slot => ({ block: 'AFTERNOON', slot });
const N = (slot = 0): Slot => ({ block: 'NIGHT', slot });

/** Reads how often a medicine is given. Order matters: "twice daily" must be found before "daily". */
export function parseFrequency(text: string | null | undefined): Schedule {
  const t = ` ${String(text ?? '').toLowerCase().replace(/[.,;]/g, ' ').replace(/\s+/g, ' ')} `;
  const has = (pattern: RegExp) => pattern.test(t);

  if (has(/\b(prn|as needed|when needed|if needed|when required|stat|once only|single dose|one off)\b/)) return { asNeeded: true, slots: [] };
  if (has(/\b(four times|4 times|4x|qds|q d s|qid|q i d|q6h|6 hourly|6-hourly|every (6|six) ?h(ours?|rs?)?)\b/)) return { asNeeded: false, slots: [M(), A(), N(0), N(1)] };
  if (has(/\b(three times|3 times|3x|thrice|tds|t d s|tid|t i d|q8h|8 hourly|8-hourly|every (8|eight) ?h(ours?|rs?)?)\b/)) return { asNeeded: false, slots: [M(), A(), N()] };
  if (has(/\b(twice|two times|2 times|2x|bd|b d|bid|b i d|q12h|12 hourly|12-hourly|every (12|twelve) ?h(ours?|rs?)?)\b/)) return { asNeeded: false, slots: [M(), N()] };
  if (has(/\b(nocte|at night|at bedtime|bedtime|in the evening|evening)\b/)) return { asNeeded: false, slots: [N()] };
  if (has(/\b(afternoon)\b/)) return { asNeeded: false, slots: [A()] };
  if (has(/\b(once|1 time|1x|od|o d|qd|q d|q24h|daily|every day|every (24|twenty.?four) ?h(ours?|rs?)?|24 hourly|24-hourly|morning|mane)\b/)) return { asNeeded: false, slots: [M()] };
  return { asNeeded: true, slots: [] };
}

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
export const validDayKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(new Date(`${value}T00:00:00.000Z`)) === value;
const dayStart = (key: string) => new Date(`${key}T00:00:00.000Z`).getTime();

/** When a slot's part of the day opens and closes. */
export function slotWindow(day: string, block: MedicationBlock) {
  const start = dayStart(day);
  return { opens: start + START_HOUR[block] * HOUR_MS, closes: start + END_HOUR[block] * HOUR_MS };
}

/** Whether a prescription is running on a day: from the day it was written, for its length (open-ended when none). */
export function runsOn(day: string, prescribedAt: Date, durationDays: number | null | undefined) {
  const first = dayStart(dayKey(prescribedAt));
  const d = dayStart(day);
  if (d < first) return false;
  return durationDays == null || d < first + durationDays * DAY_MS;
}

export type SlotState = 'GIVEN' | 'DUE' | 'OVERDUE' | 'UPCOMING' | 'NOT_APPLICABLE';

/**
 * Where a slot stands. A dose cannot be missed before the medicine was prescribed, so a slot
 * whose part of the day was already over when it was written does not apply.
 */
export function slotState(day: string, block: MedicationBlock, prescribedAt: Date, now: number, recorded: boolean): SlotState {
  if (recorded) return 'GIVEN';
  const { opens, closes } = slotWindow(day, block);
  if (closes <= prescribedAt.getTime()) return 'NOT_APPLICABLE';
  if (now < opens) return 'UPCOMING';
  return now < closes ? 'DUE' : 'OVERDUE';
}

export type ChartItem = { id: string; frequency: string; prescribedAt: Date; durationDays: number | null };
export type Recorded = { prescriptionItemId: string; scheduleDate: string | null; scheduleBlock: MedicationBlock | null; scheduleSlot: number | null };

/**
 * How many scheduled doses are waiting right now. Looks back one day as well as today, because
 * the night part of yesterday runs into this morning. An overdue dose counts until somebody records
 * it - given, held, refused or missed - because an unexplained gap is exactly what the chart is for.
 */
export function dosesWaiting(items: ChartItem[], recorded: Recorded[], now: number) {
  const done = new Set(recorded.filter((r) => r.scheduleDate).map((r) => `${r.prescriptionItemId}|${r.scheduleDate}|${r.scheduleBlock}|${r.scheduleSlot}`));
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - DAY_MS));
  let due = 0;
  let overdue = 0;
  for (const item of items) {
    const schedule = parseFrequency(item.frequency);
    for (const day of [yesterday, today]) {
      if (!runsOn(day, item.prescribedAt, item.durationDays)) continue;
      for (const { block, slot } of schedule.slots) {
        const state = slotState(day, block, item.prescribedAt, now, done.has(`${item.id}|${day}|${block}|${slot}`));
        if (state === 'DUE') due += 1;
        if (state === 'OVERDUE') overdue += 1;
      }
    }
  }
  return { due, overdue };
}

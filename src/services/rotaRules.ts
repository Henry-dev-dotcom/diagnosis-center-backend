/*
  Duty rota rules (Phase 4D). Pure and unit tested. Rota dates are calendar
  days and shift times are facility-local "HH:MM" (Ghana is UTC all year, so
  UTC arithmetic is exact). A shift whose end is at or before its start runs
  into the next day (a night shift).
*/

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const MIN_REST_HOURS = 11;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The shift's start and end instants on a rota date. */
export function shiftWindow(date: Date, startTime: string, endTime: string) {
  const start = dayStart(date) + minutes(startTime) * 60_000;
  let end = dayStart(date) + minutes(endTime) * 60_000;
  if (end <= start) end += DAY_MS;
  return { start, end };
}

type Window = { start: number; end: number };

export const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

/** Hours between two shifts that do not overlap (whichever comes first). */
export function restHoursBetween(a: Window, b: Window) {
  return (a.end <= b.start ? b.start - a.end : a.start - b.end) / HOUR_MS;
}

/** Why a new shift cannot go alongside a person's other shifts, or null. */
export function shiftConflict(proposed: Window, existing: Array<Window & { label: string }>) {
  for (const other of existing) {
    if (overlaps(proposed, other)) return { code: 'SHIFT_OVERLAP', message: `This overlaps their ${other.label} shift` };
  }
  for (const other of existing) {
    const rest = restHoursBetween(proposed, other);
    if (rest < MIN_REST_HOURS) return { code: 'INSUFFICIENT_REST', message: `Only ${Math.round(rest * 10) / 10} hours’ rest next to their ${other.label} shift; at least ${MIN_REST_HOURS} are needed` };
  }
  return null;
}

/** Monday to Friday days in an inclusive date range. */
export function workingDays(start: Date, end: Date) {
  let count = 0;
  for (let t = dayStart(start); t <= dayStart(end); t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/** Inclusive date ranges overlap. */
export const periodsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => dayStart(aStart) <= dayStart(bEnd) && dayStart(bStart) <= dayStart(aEnd);

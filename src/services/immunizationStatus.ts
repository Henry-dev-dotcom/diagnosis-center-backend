import { IMMUNIZATION_SCHEDULE, OVERDUE_AFTER_DAYS, previousDose, type ScheduledDose } from '../config/immunizationSchedule.js';

/*
  Where a child is on the schedule. Pure, so it is unit tested on its own.
  A dose is due from the later of its minimum age and the minimum interval
  after the previous dose in its series; it waits while that previous dose
  has not been given.
*/

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const addDays = (d: Date, days: number) => new Date(utcDay(d) + days * DAY_MS);

export type DoseStatus = 'GIVEN' | 'DUE' | 'OVERDUE' | 'UPCOMING' | 'WAITING' | 'MISSED_WINDOW';
export type GivenDose = { vaccine: string; givenAt: Date };

export type DoseState = ScheduledDose & { status: DoseStatus; dueDate: Date | null; givenAt: Date | null };

export function scheduleFor(dateOfBirth: Date, given: GivenDose[], today = new Date()): DoseState[] {
  const byCode = new Map(given.map((g) => [g.vaccine, g.givenAt]));
  const todayDay = utcDay(today);
  const ageDays = Math.floor((todayDay - utcDay(dateOfBirth)) / DAY_MS);

  return IMMUNIZATION_SCHEDULE.map((d) => {
    const givenAt = byCode.get(d.code) ?? null;
    if (givenAt) return { ...d, status: 'GIVEN', dueDate: null, givenAt };
    const prev = previousDose(d);
    const prevGiven = prev ? byCode.get(prev.code) : undefined;
    if (prev && !prevGiven) return { ...d, status: 'WAITING', dueDate: null, givenAt: null };
    if (d.maxAgeDays !== undefined && ageDays > d.maxAgeDays) return { ...d, status: 'MISSED_WINDOW', dueDate: null, givenAt: null };

    let due = addDays(dateOfBirth, d.minAgeDays);
    if (prevGiven && d.minIntervalDays) {
      const afterPrev = addDays(prevGiven, d.minIntervalDays);
      if (afterPrev > due) due = afterPrev;
    }
    const dueDay = utcDay(due);
    const status: DoseStatus = todayDay < dueDay ? 'UPCOMING' : todayDay > dueDay + OVERDUE_AFTER_DAYS * DAY_MS ? 'OVERDUE' : 'DUE';
    return { ...d, status, dueDate: due, givenAt: null };
  });
}

/** Why a dose cannot be recorded on this date, or null when it can. */
export function doseProblem(d: ScheduledDose, dateOfBirth: Date, givenAt: Date, given: GivenDose[], { fromCard = false } = {}) {
  const ageDays = Math.floor((utcDay(givenAt) - utcDay(dateOfBirth)) / DAY_MS);
  if (ageDays < 0) return 'The date given is before the child was born';
  const prev = previousDose(d);
  const prevGiven = prev ? given.find((g) => g.vaccine === prev.code)?.givenAt : undefined;
  if (prev && !prevGiven) return `${prev.name} has to be recorded first`;
  // Card dates are copied as written; only doses given here are held to the minimum ages and intervals.
  if (fromCard) return null;
  if (ageDays < d.minAgeDays) return `${d.name} is given from ${Math.round(d.minAgeDays / 7)} weeks of age`;
  if (d.maxAgeDays !== undefined && ageDays > d.maxAgeDays) return `${d.name} is only given up to ${d.maxAgeDays} days of age`;
  if (prevGiven && d.minIntervalDays && utcDay(givenAt) < utcDay(prevGiven) + d.minIntervalDays * DAY_MS) {
    return `${d.name} needs at least ${d.minIntervalDays} days after ${prev?.name}`;
  }
  return null;
}

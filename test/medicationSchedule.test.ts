import { describe, expect, it } from 'vitest';
import { dayKey, dosesWaiting, parseFrequency, runsOn, slotState, slotWindow, validDayKey, type ChartItem, type Recorded } from '../src/services/medicationSchedule.js';

const blocks = (text: string) => parseFrequency(text).slots.map((s) => `${s.block[0]}${s.slot}`);
const at = (iso: string) => new Date(iso).getTime();

describe('reading how often a medicine is given', () => {
  it('reads twice a day as morning and night', () => {
    for (const text of ['Twice daily', 'twice a day', 'BD', 'b.d.', 'BID', 'every 12 hours', 'Two times daily']) expect(blocks(text), text).toEqual(['M0', 'N0']);
  });

  it('reads three times a day as morning, afternoon and night', () => {
    for (const text of ['Three times daily', 'TDS', 't.d.s.', 'TID', 'every 8 hours', 'thrice daily']) expect(blocks(text), text).toEqual(['M0', 'A0', 'N0']);
  });

  it('reads four times a day as four doses, two of them at night', () => {
    for (const text of ['Four times daily', 'QDS', 'QID', 'every 6 hours']) expect(blocks(text), text).toEqual(['M0', 'A0', 'N0', 'N1']);
  });

  it('reads once a day as morning, unless it says night or afternoon', () => {
    for (const text of ['Once daily', 'OD', 'daily', 'every day', 'once daily in the morning']) expect(blocks(text), text).toEqual(['M0']);
    for (const text of ['at night', 'nocte', 'Once daily at night', 'at bedtime', 'in the evening']) expect(blocks(text), text).toEqual(['N0']);
    expect(blocks('every afternoon')).toEqual(['A0']);
  });

  it('treats "as needed" as no schedule, even when a number of times is also given', () => {
    for (const text of ['PRN', 'as needed', 'when needed', 'Twice daily if needed', 'Three times daily as needed', 'stat', 'once only']) {
      const s = parseFrequency(text);
      expect(s.asNeeded, text).toBe(true);
      expect(s.slots, text).toEqual([]);
    }
  });

  it('does not guess at words it does not know: they become as-needed, so a nurse can still record each dose', () => {
    for (const text of ['', 'weekly', 'every 4 hours', 'with meals', null, undefined]) expect(parseFrequency(text as string).asNeeded, String(text)).toBe(true);
  });
});

describe('days and parts of the day', () => {
  it('knows a day key is a real date', () => {
    expect(validDayKey('2026-10-12')).toBe(true);
    expect(validDayKey('2026-02-30')).toBe(false);
    expect(validDayKey('12/10/2026')).toBe(false);
    expect(dayKey(new Date('2026-10-12T23:59:00Z'))).toBe('2026-10-12');
  });

  it('runs the night past midnight', () => {
    const night = slotWindow('2026-10-12', 'NIGHT');
    expect(new Date(night.opens).toISOString()).toBe('2026-10-12T18:00:00.000Z');
    expect(new Date(night.closes).toISOString()).toBe('2026-10-13T06:00:00.000Z');
  });

  it('runs a prescription from the day it was written for as many days as it lasts', () => {
    const written = new Date('2026-10-10T20:00:00Z');
    expect(runsOn('2026-10-09', written, 3)).toBe(false);
    for (const day of ['2026-10-10', '2026-10-11', '2026-10-12']) expect(runsOn(day, written, 3), day).toBe(true);
    expect(runsOn('2026-10-13', written, 3)).toBe(false);
    expect(runsOn('2027-01-01', written, null), 'no end date means it keeps running').toBe(true);
  });
});

describe('where a scheduled dose stands', () => {
  const written = new Date('2026-10-12T09:00:00Z');

  it('is due while its part of the day is open, overdue once it closes, and upcoming before it opens', () => {
    expect(slotState('2026-10-12', 'MORNING', written, at('2026-10-12T10:00:00Z'), false)).toBe('DUE');
    expect(slotState('2026-10-12', 'MORNING', written, at('2026-10-12T13:00:00Z'), false)).toBe('OVERDUE');
    expect(slotState('2026-10-12', 'AFTERNOON', written, at('2026-10-12T10:00:00Z'), false)).toBe('UPCOMING');
  });

  it('is given once it is recorded, whatever the time', () => {
    expect(slotState('2026-10-12', 'MORNING', written, at('2026-10-12T20:00:00Z'), true)).toBe('GIVEN');
  });

  it('does not hold a nurse to a dose from before the medicine was written', () => {
    expect(slotState('2026-10-12', 'MORNING', new Date('2026-10-12T14:00:00Z'), at('2026-10-12T20:00:00Z'), false)).toBe('NOT_APPLICABLE');
    expect(slotState('2026-10-12', 'AFTERNOON', new Date('2026-10-12T14:00:00Z'), at('2026-10-12T15:00:00Z'), false)).toBe('DUE');
  });
});

describe('doses waiting on a patient', () => {
  const tds: ChartItem = { id: 'item-1', frequency: 'Three times daily', prescribedAt: new Date('2026-10-11T07:00:00Z'), durationDays: 5 };
  const given = (day: string, block: 'MORNING' | 'AFTERNOON' | 'NIGHT'): Recorded => ({ prescriptionItemId: 'item-1', scheduleDate: day, scheduleBlock: block, scheduleSlot: 0 });
  const yesterdayAll = [given('2026-10-11', 'MORNING'), given('2026-10-11', 'AFTERNOON'), given('2026-10-11', 'NIGHT')];

  it('counts the dose that is due this afternoon', () => {
    const waiting = dosesWaiting([tds], [...yesterdayAll, given('2026-10-12', 'MORNING')], at('2026-10-12T13:00:00Z'));
    expect(waiting).toEqual({ due: 1, overdue: 0 });
  });

  it('counts a missed morning dose as overdue until somebody records it', () => {
    expect(dosesWaiting([tds], yesterdayAll, at('2026-10-12T13:00:00Z'))).toEqual({ due: 1, overdue: 1 });
  });

  it('counts yesterday\'s night dose as still due at two in the morning', () => {
    const bd: ChartItem = { id: 'item-2', frequency: 'BD', prescribedAt: new Date('2026-10-10T08:00:00Z'), durationDays: null };
    const recorded: Recorded[] = [{ prescriptionItemId: 'item-2', scheduleDate: '2026-10-11', scheduleBlock: 'MORNING', scheduleSlot: 0 }];
    expect(dosesWaiting([bd], recorded, at('2026-10-12T02:00:00Z'))).toEqual({ due: 1, overdue: 0 });
  });

  it('ignores as-needed medicines, doses outside the course, and doses already recorded', () => {
    const prn: ChartItem = { id: 'item-3', frequency: 'PRN', prescribedAt: new Date('2026-10-11T07:00:00Z'), durationDays: null };
    const finished: ChartItem = { id: 'item-4', frequency: 'BD', prescribedAt: new Date('2026-10-01T07:00:00Z'), durationDays: 3 };
    expect(dosesWaiting([prn, finished], [], at('2026-10-12T13:00:00Z'))).toEqual({ due: 0, overdue: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { periodsOverlap, restHoursBetween, shiftConflict, shiftWindow, workingDays } from '../src/services/rotaRules.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const w = (date: string, start: string, end: string, label = 'other') => ({ ...shiftWindow(d(date), start, end), label });

describe('shift windows', () => {
  it('a night shift runs into the next day', () => {
    const night = shiftWindow(d('2026-10-05'), '19:00', '07:00');
    expect(new Date(night.start).toISOString()).toBe('2026-10-05T19:00:00.000Z');
    expect(new Date(night.end).toISOString()).toBe('2026-10-06T07:00:00.000Z');
  });

  it('rest between a day shift and the next day’s day shift', () => {
    expect(restHoursBetween(w('2026-10-05', '07:00', '15:00'), w('2026-10-06', '07:00', '15:00'))).toBe(16);
  });
});

describe('rota conflicts', () => {
  it('refuses overlapping shifts', () => {
    expect(shiftConflict(w('2026-10-05', '14:00', '22:00'), [w('2026-10-05', '07:00', '15:00', 'morning')])?.code).toBe('SHIFT_OVERLAP');
  });

  it('refuses a morning shift straight after a night shift', () => {
    const conflict = shiftConflict(w('2026-10-06', '07:00', '15:00'), [w('2026-10-05', '19:00', '07:00', 'night')]);
    expect(conflict?.code).toBe('INSUFFICIENT_REST');
    expect(conflict?.message).toMatch(/Only 0 hours/);
  });

  it('allows back-to-back days with enough rest', () => {
    expect(shiftConflict(w('2026-10-06', '07:00', '15:00'), [w('2026-10-05', '07:00', '15:00'), w('2026-10-07', '07:00', '15:00')])).toBeNull();
    // Afternoon 15:00-22:00 then next morning 07:00 is 9 hours: refused.
    expect(shiftConflict(w('2026-10-06', '07:00', '15:00'), [w('2026-10-05', '15:00', '22:00', 'afternoon')])?.code).toBe('INSUFFICIENT_REST');
  });
});

describe('leave periods', () => {
  it('counts working days only', () => {
    // Monday 5 Oct to Friday 16 Oct 2026: two working weeks.
    expect(workingDays(d('2026-10-05'), d('2026-10-16'))).toBe(10);
    expect(workingDays(d('2026-10-10'), d('2026-10-11'))).toBe(0);
  });

  it('detects overlapping periods, inclusive of the end day', () => {
    expect(periodsOverlap(d('2026-10-05'), d('2026-10-09'), d('2026-10-09'), d('2026-10-12'))).toBe(true);
    expect(periodsOverlap(d('2026-10-05'), d('2026-10-09'), d('2026-10-10'), d('2026-10-12'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { SCHEDULE_BY_CODE } from '../src/config/immunizationSchedule.js';
import { doseProblem, scheduleFor } from '../src/services/immunizationStatus.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const status = (rows: ReturnType<typeof scheduleFor>, code: string) => rows.find((r) => r.code === code);
const dose = (code: string) => SCHEDULE_BY_CODE.get(code)!;

describe('schedule status', () => {
  const dob = d('2026-01-01');

  it('a newborn is due BCG and OPV0; the 6-week doses are upcoming, later doses wait', () => {
    const rows = scheduleFor(dob, [], d('2026-01-03'));
    expect(status(rows, 'BCG')?.status).toBe('DUE');
    expect(status(rows, 'OPV0')?.status).toBe('DUE');
    expect(status(rows, 'PENTA1')).toMatchObject({ status: 'UPCOMING', dueDate: d('2026-02-12') });
    expect(status(rows, 'PENTA2')?.status).toBe('WAITING');
  });

  it('OPV0 is missed after two weeks, and a dose due more than 28 days ago is overdue', () => {
    const rows = scheduleFor(dob, [], d('2026-04-01'));
    expect(status(rows, 'OPV0')?.status).toBe('MISSED_WINDOW');
    expect(status(rows, 'PENTA1')?.status).toBe('OVERDUE');
    expect(status(rows, 'BCG')?.status).toBe('OVERDUE');
  });

  it('the next dose waits at least 28 days after a late previous dose', () => {
    // Penta1 given late at 9 weeks: Penta2 falls due 28 days later, not at 10 weeks.
    const rows = scheduleFor(dob, [{ vaccine: 'PENTA1', givenAt: d('2026-03-05') }], d('2026-03-12'));
    expect(status(rows, 'PENTA1')?.status).toBe('GIVEN');
    expect(status(rows, 'PENTA2')).toMatchObject({ status: 'UPCOMING', dueDate: d('2026-04-02') });
  });
});

describe('recording a dose', () => {
  const dob = d('2026-01-01');

  it('refuses doses out of order, too early, or too close to the previous one', () => {
    expect(doseProblem(dose('PENTA2'), dob, d('2026-03-20'), [])).toMatch(/Pentavalent 1 .* has to be recorded first/);
    expect(doseProblem(dose('PENTA1'), dob, d('2026-01-20'), [])).toMatch(/from 6 weeks/);
    expect(doseProblem(dose('PENTA2'), dob, d('2026-03-15'), [{ vaccine: 'PENTA1', givenAt: d('2026-03-01') }])).toMatch(/at least 28 days/);
    expect(doseProblem(dose('OPV0'), dob, d('2026-01-20'), [])).toMatch(/up to 14 days/);
    expect(doseProblem(dose('BCG'), dob, d('2025-12-31'), [])).toMatch(/before the child was born/);
  });

  it('accepts a valid dose, and card entries keep the order rule but not the intervals', () => {
    expect(doseProblem(dose('PENTA2'), dob, d('2026-03-20'), [{ vaccine: 'PENTA1', givenAt: d('2026-02-12') }])).toBeNull();
    expect(doseProblem(dose('PENTA2'), dob, d('2026-02-20'), [{ vaccine: 'PENTA1', givenAt: d('2026-02-12') }], { fromCard: true })).toBeNull();
    expect(doseProblem(dose('PENTA2'), dob, d('2026-02-20'), [], { fromCard: true })).toMatch(/recorded first/);
  });
});

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { wardCharges } from '../src/services/inpatient.service.js';

const medical = { id: 'w1', name: 'Medical', dailyRate: new Prisma.Decimal(60) };
const icu = { id: 'w2', name: 'ICU', dailyRate: new Prisma.Decimal(300) };
const at = (iso: string) => new Date(iso);

describe('ward charges (midnight census)', () => {
  it('charges one night for a stay that crosses no midnight', () => {
    const lines = wardCharges([{ startedAt: at('2026-09-28T08:00Z'), endedAt: at('2026-09-28T18:00Z'), ward: medical }], at('2026-09-28T08:00Z'), at('2026-09-28T18:00Z'));
    expect(lines.map((l) => [l.ward.name, l.nights])).toEqual([['Medical', 1]]);
  });

  it('does not double-charge a same-day move between beds', () => {
    const spells = [
      { startedAt: at('2026-09-28T08:00Z'), endedAt: at('2026-09-28T12:00Z'), ward: medical },
      { startedAt: at('2026-09-28T12:00Z'), endedAt: at('2026-09-28T18:00Z'), ward: medical }
    ];
    expect(wardCharges(spells, at('2026-09-28T08:00Z'), at('2026-09-28T18:00Z')).map((l) => l.nights)).toEqual([1]);
  });

  it('charges each midnight to the ward the patient was on', () => {
    // Admitted Mon 20:00 to Medical, moved to ICU Tue 10:00, discharged Thu 09:00: midnights Tue, Wed, Thu.
    const spells = [
      { startedAt: at('2026-09-28T20:00Z'), endedAt: at('2026-09-29T10:00Z'), ward: medical },
      { startedAt: at('2026-09-29T10:00Z'), endedAt: at('2026-10-01T09:00Z'), ward: icu }
    ];
    const lines = wardCharges(spells, at('2026-09-28T20:00Z'), at('2026-10-01T09:00Z'));
    expect(lines.map((l) => [l.ward.name, l.nights])).toEqual([['Medical', 1], ['ICU', 2]]);
  });

  it('skips wards with no nightly rate', () => {
    const free = { id: 'w3', name: 'Observation', dailyRate: new Prisma.Decimal(0) };
    expect(wardCharges([{ startedAt: at('2026-09-28T08:00Z'), endedAt: null, ward: free }], at('2026-09-28T08:00Z'), at('2026-09-29T08:00Z'))).toEqual([]);
  });
});

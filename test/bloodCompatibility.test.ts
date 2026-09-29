import { describe, expect, it } from 'vitest';
import { BLOOD_GROUPS, donationProblem, isCompatible, isEmergencyReleasable, type BloodGroup } from '../src/services/bloodCompatibility.js';

const allowed = (component: Parameters<typeof isCompatible>[0], recipient: BloodGroup) => BLOOD_GROUPS.filter((d) => isCompatible(component, recipient, d)).sort();

describe('red cell compatibility (the standard donor chart)', () => {
  it.each([
    ['O-', ['O-']],
    ['O+', ['O+', 'O-']],
    ['A-', ['A-', 'O-']],
    ['A+', ['A+', 'A-', 'O+', 'O-']],
    ['B-', ['B-', 'O-']],
    ['B+', ['B+', 'B-', 'O+', 'O-']],
    ['AB-', ['A-', 'AB-', 'B-', 'O-']],
    ['AB+', [...BLOOD_GROUPS]]
  ] as Array<[BloodGroup, BloodGroup[]]>)('%s receives %j', (recipient, donors) => {
    expect(allowed('PACKED_RED_CELLS', recipient)).toEqual([...donors].sort());
  });
});

describe('plasma compatibility (the reverse of red cells, Rh ignored)', () => {
  it.each([
    ['O+', ['A+', 'A-', 'AB+', 'AB-', 'B+', 'B-', 'O+', 'O-']],
    ['A-', ['A+', 'A-', 'AB+', 'AB-']],
    ['B+', ['AB+', 'AB-', 'B+', 'B-']],
    ['AB+', ['AB+', 'AB-']]
  ] as Array<[BloodGroup, BloodGroup[]]>)('%s receives plasma from %j', (recipient, donors) => {
    expect(allowed('FRESH_FROZEN_PLASMA', recipient)).toEqual([...donors].sort());
    expect(allowed('PLATELETS', recipient)).toEqual([...donors].sort());
  });
});

describe('whole blood and emergency release', () => {
  it('whole blood is ABO-identical, Rh-negative for Rh-negative recipients', () => {
    expect(allowed('WHOLE_BLOOD', 'A+')).toEqual(['A+', 'A-']);
    expect(allowed('WHOLE_BLOOD', 'A-')).toEqual(['A-']);
    expect(isCompatible('WHOLE_BLOOD', 'AB+', 'O-')).toBe(false);
  });

  it('only O-negative red cells can be released uncrossmatched', () => {
    expect(isEmergencyReleasable('PACKED_RED_CELLS', 'O-')).toBe(true);
    expect(isEmergencyReleasable('PACKED_RED_CELLS', 'O+')).toBe(false);
    expect(isEmergencyReleasable('FRESH_FROZEN_PLASMA', 'O-')).toBe(false);
  });
});

describe('donor eligibility', () => {
  const on = new Date('2026-09-29T00:00:00Z');
  const donor = { dateOfBirth: new Date('1990-01-01'), gender: 'Male', lastDonationAt: null, deferredUntil: null };
  const ok = { weightKg: 70, haemoglobin: 14 };

  it('accepts a healthy adult and refuses on age, weight or haemoglobin', () => {
    expect(donationProblem(donor, ok, on)).toBeNull();
    expect(donationProblem({ ...donor, dateOfBirth: new Date('2010-06-01') }, ok, on)).toMatch(/17 to 60/);
    expect(donationProblem(donor, { ...ok, weightKg: 48 }, on)).toMatch(/50 kg/);
    expect(donationProblem(donor, { ...ok, haemoglobin: 11.9 }, on)).toMatch(/12.5/);
  });

  it('enforces the donation interval: 12 weeks for men, 16 for women', () => {
    const tenWeeksAgo = new Date(on.getTime() - 70 * 86_400_000);
    const fourteenWeeksAgo = new Date(on.getTime() - 98 * 86_400_000);
    expect(donationProblem({ ...donor, lastDonationAt: tenWeeksAgo }, ok, on)).toMatch(/every 12 weeks/);
    expect(donationProblem({ ...donor, lastDonationAt: fourteenWeeksAgo }, ok, on)).toBeNull();
    expect(donationProblem({ ...donor, gender: 'Female', lastDonationAt: fourteenWeeksAgo }, ok, on)).toMatch(/every 16 weeks/);
  });

  it('respects a deferral', () => {
    expect(donationProblem({ ...donor, deferredUntil: new Date('2026-12-01') }, ok, on)).toMatch(/deferred until 2026-12-01/);
  });
});

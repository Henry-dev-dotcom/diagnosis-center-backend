import { describe, expect, it } from 'vitest';
import { allergyConflicts } from '../src/services/allergyCheck.js';

describe('allergy conflicts', () => {
  it('matches the same drug by name, in either direction', () => {
    expect(allergyConflicts([{ substance: 'Amoxicillin' }], ['Amoxicillin 500 mg'])).toEqual(['Amoxicillin']);
    expect(allergyConflicts([{ substance: 'Benzylpenicillin injection' }], ['Benzylpenicillin'])).toEqual(['Benzylpenicillin injection']);
  });

  it('matches a drug class allergy to its members', () => {
    expect(allergyConflicts([{ substance: 'Penicillin' }], ['Amoxicillin'])).toEqual(['Penicillin']);
    expect(allergyConflicts([{ substance: 'Sulfa drugs' }], ['Co-trimoxazole'])).toEqual(['Sulfa drugs']);
    expect(allergyConflicts([{ substance: 'Sulfonamides' }], ['Septrin'])).toEqual(['Sulfonamides']);
    expect(allergyConflicts([{ substance: 'NSAIDs' }], ['Ibuprofen'])).toEqual(['NSAIDs']);
  });

  it('does not flag unrelated drugs', () => {
    expect(allergyConflicts([{ substance: 'Penicillin' }], ['Paracetamol'])).toEqual([]);
    expect(allergyConflicts([{ substance: 'Peanuts' }], ['Artemether-lumefantrine'])).toEqual([]);
    expect(allergyConflicts([{ substance: 'Sulfonamides' }], ['Amoxicillin'])).toEqual([]);
  });

  it('ignores very short entries that would match everything', () => {
    expect(allergyConflicts([{ substance: 'no' }], ['Nothing'])).toEqual([]);
  });
});

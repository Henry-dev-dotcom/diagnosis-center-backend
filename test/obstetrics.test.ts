import { describe, expect, it } from 'vitest';
import { ancAlerts, eddFromLmp, gestationalAge, isPostpartumHaemorrhage, postnatalAlerts } from '../src/services/obstetrics.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('dates', () => {
  it('Naegele: the due date is 280 days after the LMP', () => {
    expect(eddFromLmp(d('2026-01-01')).toISOString().slice(0, 10)).toBe('2026-10-08');
  });

  it('gestational age from the LMP, in weeks and days', () => {
    const ga = gestationalAge({ lmp: d('2026-01-01'), eddByLmp: eddFromLmp(d('2026-01-01')), eddByScan: null }, d('2026-03-05'));
    expect(ga).toMatchObject({ days: 63, weeks: 9, extraDays: 0, basis: 'LMP' });
  });

  it('a scan due date takes precedence over the LMP', () => {
    const ga = gestationalAge({ lmp: d('2026-01-01'), eddByLmp: d('2026-10-08'), eddByScan: d('2026-10-15') }, d('2026-03-05'));
    expect(ga).toMatchObject({ weeks: 8, extraDays: 0, basis: 'SCAN' });
  });

  it('no dates, no gestational age', () => {
    expect(gestationalAge({ lmp: null, eddByLmp: null, eddByScan: null }, new Date())).toBeNull();
  });
});

describe('antenatal alerts', () => {
  it('flags hypertension, and pre-eclampsia when protein is present after 20 weeks', () => {
    expect(ancAlerts({ bpSystolic: 145, bpDiastolic: 92 }, 30)).toEqual(['Hypertension']);
    expect(ancAlerts({ bpSystolic: 145, bpDiastolic: 92, urineProtein: '2+' }, 30)).toContain('Possible pre-eclampsia: hypertension with proteinuria');
    expect(ancAlerts({ bpSystolic: 145, bpDiastolic: 92, urineProtein: '2+' }, 16)).not.toContain('Possible pre-eclampsia: hypertension with proteinuria');
    expect(ancAlerts({ bpSystolic: 165, bpDiastolic: 100 }, 30)[0]).toMatch(/Severe hypertension/);
  });

  it('flags fetal heart rate, anaemia, malpresentation at term and danger signs', () => {
    const alerts = ancAlerts({ fetalHeartRate: 100, haemoglobin: 6.5, presentation: 'BREECH', dangerSigns: ['VAGINAL_BLEEDING'] }, 37);
    expect(alerts).toEqual([
      'Abnormal fetal heart rate (100/min)',
      'Severe anaemia (Hb 6.5 g/dL)',
      'Malpresentation at 37 weeks (breech)',
      'Danger signs: vaginal bleeding'
    ]);
    expect(ancAlerts({ presentation: 'BREECH' }, 28)).toEqual([]);
  });

  it('a normal visit raises nothing', () => {
    expect(ancAlerts({ bpSystolic: 110, bpDiastolic: 70, urineProtein: 'NEGATIVE', fetalHeartRate: 140, haemoglobin: 11.8, presentation: 'CEPHALIC' }, 36)).toEqual([]);
  });
});

describe('postnatal and delivery', () => {
  it('flags maternal sepsis signs and newborn danger signs', () => {
    const alerts = postnatalAlerts({ mother: { temperatureC: 38.4, lochia: 'OFFENSIVE' }, baby: { temperatureC: 35.1, cord: 'INFECTED' } });
    expect(alerts).toEqual(['Mother: fever (38.4 °C), consider sepsis', 'Mother: offensive lochia, possible infection', 'Baby: hypothermia (35.1 °C)', 'Baby: infected cord']);
  });

  it('postpartum haemorrhage thresholds differ for caesarean births', () => {
    expect(isPostpartumHaemorrhage(600, 'SVD')).toBe(true);
    expect(isPostpartumHaemorrhage(600, 'CAESAREAN')).toBe(false);
    expect(isPostpartumHaemorrhage(1000, 'CAESAREAN')).toBe(true);
    expect(isPostpartumHaemorrhage(undefined, 'SVD')).toBe(false);
  });
});

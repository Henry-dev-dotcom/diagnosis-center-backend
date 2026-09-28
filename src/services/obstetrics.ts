/*
  Obstetric calculations (Phase 4C). Pure functions, so they are unit tested
  on their own. Dates are handled in UTC days (facility time is Africa/Accra).
*/

const DAY_MS = 86_400_000;
const PREGNANCY_DAYS = 280;

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Naegele's rule: the due date is 280 days after the first day of the last menstrual period. */
export function eddFromLmp(lmp: Date) {
  return new Date(utcDay(lmp) + PREGNANCY_DAYS * DAY_MS);
}

export type GestationBasis = 'SCAN' | 'LMP';

/** Gestational age on a day, from the scan due date when there is one, else from the LMP. */
export function gestationalAge(p: { lmp: Date | null; eddByLmp: Date | null; eddByScan: Date | null }, at: Date) {
  const edd = p.eddByScan ?? p.eddByLmp ?? (p.lmp ? eddFromLmp(p.lmp) : null);
  if (!edd) return null;
  const days = PREGNANCY_DAYS - Math.round((utcDay(edd) - utcDay(at)) / DAY_MS);
  return { days, weeks: Math.floor(days / 7), extraDays: ((days % 7) + 7) % 7, basis: (p.eddByScan ? 'SCAN' : 'LMP') as GestationBasis, edd };
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

const PROTEIN_LEVEL: Record<string, number> = { NEGATIVE: 0, TRACE: 0.5, '1+': 1, '2+': 2, '3+': 3, '4+': 4 };

function bloodPressureAlerts(systolic?: number, diastolic?: number) {
  if (systolic === undefined || diastolic === undefined) return { alerts: [] as string[], hypertensive: false };
  if (systolic >= 160 || diastolic >= 110) return { alerts: ['Severe hypertension: review now'], hypertensive: true };
  if (systolic >= 140 || diastolic >= 90) return { alerts: ['Hypertension'], hypertensive: true };
  return { alerts: [], hypertensive: false };
}

/** Warning flags for an antenatal visit, following the Ghana Safe Motherhood / WHO ANC danger signs. */
export function ancAlerts(v: {
  bpSystolic?: number;
  bpDiastolic?: number;
  urineProtein?: string;
  fetalHeartRate?: number;
  fetalMovements?: string;
  haemoglobin?: number;
  presentation?: string;
  dangerSigns?: string[];
}, gestationWeeks: number | null) {
  const { alerts, hypertensive } = bloodPressureAlerts(v.bpSystolic, v.bpDiastolic);
  const protein = v.urineProtein ? PROTEIN_LEVEL[v.urineProtein] ?? 0 : 0;
  if (hypertensive && protein >= 1 && (gestationWeeks === null || gestationWeeks >= 20)) alerts.push('Possible pre-eclampsia: hypertension with proteinuria');
  if (v.fetalHeartRate !== undefined && (v.fetalHeartRate < 110 || v.fetalHeartRate > 160)) alerts.push(`Abnormal fetal heart rate (${v.fetalHeartRate}/min)`);
  if (v.fetalMovements === 'REDUCED' || v.fetalMovements === 'ABSENT') alerts.push(`${v.fetalMovements === 'ABSENT' ? 'Absent' : 'Reduced'} fetal movements`);
  if (v.haemoglobin !== undefined) {
    if (v.haemoglobin < 7) alerts.push(`Severe anaemia (Hb ${v.haemoglobin} g/dL)`);
    else if (v.haemoglobin < 11) alerts.push(`Anaemia (Hb ${v.haemoglobin} g/dL)`);
  }
  if (gestationWeeks !== null && gestationWeeks >= 36 && (v.presentation === 'BREECH' || v.presentation === 'TRANSVERSE' || v.presentation === 'OBLIQUE')) {
    alerts.push(`Malpresentation at ${gestationWeeks} weeks (${v.presentation.toLowerCase()})`);
  }
  if (gestationWeeks !== null && gestationWeeks >= 42) alerts.push('Post-term pregnancy (42 weeks or more)');
  if (v.dangerSigns?.length) alerts.push(`Danger signs: ${v.dangerSigns.map((s) => s.toLowerCase().replace(/_/g, ' ')).join(', ')}`);
  return alerts;
}

export function postnatalAlerts(v: {
  mother: { bpSystolic?: number; bpDiastolic?: number; temperatureC?: number; pulseBpm?: number; uterus?: string; lochia?: string; perineum?: string; mood?: string };
  baby?: { temperatureC?: number; feeding?: string; cord?: string; jaundice?: string };
}) {
  const alerts = bloodPressureAlerts(v.mother.bpSystolic, v.mother.bpDiastolic).alerts.map((a) => `Mother: ${a.toLowerCase()}`);
  const m = v.mother;
  if (m.temperatureC !== undefined && m.temperatureC >= 38) alerts.push(`Mother: fever (${m.temperatureC} °C), consider sepsis`);
  if (m.pulseBpm !== undefined && m.pulseBpm > 110) alerts.push(`Mother: tachycardia (${m.pulseBpm}/min)`);
  if (m.lochia === 'HEAVY') alerts.push('Mother: heavy bleeding, check for postpartum haemorrhage');
  if (m.lochia === 'OFFENSIVE') alerts.push('Mother: offensive lochia, possible infection');
  if (m.uterus === 'BOGGY') alerts.push('Mother: uterus not well contracted');
  if (m.uterus === 'TENDER') alerts.push('Mother: tender uterus, possible endometritis');
  if (m.perineum === 'INFECTED' || m.perineum === 'BREAKDOWN') alerts.push(`Mother: perineal wound ${m.perineum === 'INFECTED' ? 'infected' : 'breakdown'}`);
  if (m.mood === 'CONCERN') alerts.push('Mother: mood concern, screen for postnatal depression');
  const b = v.baby;
  if (b) {
    if (b.temperatureC !== undefined && b.temperatureC < 35.5) alerts.push(`Baby: hypothermia (${b.temperatureC} °C)`);
    if (b.temperatureC !== undefined && b.temperatureC >= 37.5) alerts.push(`Baby: fever (${b.temperatureC} °C), possible sepsis`);
    if (b.feeding === 'POOR') alerts.push('Baby: feeding poorly');
    if (b.cord === 'INFECTED') alerts.push('Baby: infected cord');
    if (b.jaundice === 'SEVERE') alerts.push('Baby: severe jaundice, check bilirubin');
  }
  return alerts;
}

/** Postpartum haemorrhage: 500 ml or more after vaginal birth, 1000 ml or more after caesarean. */
export function isPostpartumHaemorrhage(bloodLossMl: number | undefined, mode: string) {
  if (bloodLossMl === undefined) return false;
  return bloodLossMl >= (mode === 'CAESAREAN' ? 1000 : 500);
}

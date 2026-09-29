/*
  Blood group compatibility (Phase 4D). Pure, and unit tested on its own,
  because a mistake here harms a patient.

  Red cells (and whole blood) carry antigens: the recipient must not have
  antibodies to them. O red cells suit every ABO group; AB recipients accept
  every ABO group. Rh-negative recipients receive Rh-negative red cells.
  Whole blood also carries plasma, so it is given ABO-identical.

  Plasma products (FFP, cryoprecipitate, and platelets, which are suspended in
  plasma) carry antibodies: the donor plasma must not attack the recipient's
  cells. AB plasma suits everyone; O plasma suits only O recipients. Rh does
  not restrict plasma products.
*/

export const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export type Component = 'WHOLE_BLOOD' | 'PACKED_RED_CELLS' | 'PLATELETS' | 'FRESH_FROZEN_PLASMA' | 'CRYOPRECIPITATE';

const abo = (g: BloodGroup) => g.slice(0, -1) as 'O' | 'A' | 'B' | 'AB';
const rhPositive = (g: BloodGroup) => g.endsWith('+');

/** ABO antigens on the red cells. */
const antigens = { O: [], A: ['A'], B: ['B'], AB: ['A', 'B'] } as const;

function redCellsCompatible(recipient: BloodGroup, donor: BloodGroup) {
  const recipientAntigens: readonly string[] = antigens[abo(recipient)];
  // Every antigen on the donor cells must also be on the recipient's own cells (else the recipient has the antibody).
  const aboOk = antigens[abo(donor)].every((a) => recipientAntigens.includes(a));
  const rhOk = rhPositive(recipient) || !rhPositive(donor);
  return aboOk && rhOk;
}

function plasmaCompatible(recipient: BloodGroup, donor: BloodGroup) {
  // Donor plasma contains antibodies to the antigens the donor lacks; the recipient's cells must not carry them.
  const donorAntigens: readonly string[] = antigens[abo(donor)];
  return antigens[abo(recipient)].every((a) => donorAntigens.includes(a));
}

export function isCompatible(component: Component, recipient: BloodGroup, donor: BloodGroup) {
  switch (component) {
    case 'PACKED_RED_CELLS':
      return redCellsCompatible(recipient, donor);
    case 'WHOLE_BLOOD':
      return abo(recipient) === abo(donor) && (rhPositive(recipient) || !rhPositive(donor));
    default:
      return plasmaCompatible(recipient, donor);
  }
}

/** Shelf life from collection, in days (refrigerated red cells; frozen plasma and cryo; platelets at room temperature). */
export const SHELF_LIFE_DAYS: Record<Component, number> = {
  WHOLE_BLOOD: 35,
  PACKED_RED_CELLS: 35,
  PLATELETS: 5,
  FRESH_FROZEN_PLASMA: 365,
  CRYOPRECIPITATE: 365
};

/** Only uncrossmatched O-negative red cells may be released in an emergency. */
export const isEmergencyReleasable = (component: Component, group: BloodGroup) => (component === 'PACKED_RED_CELLS' || component === 'WHOLE_BLOOD') && group === 'O-';

/** Donation eligibility: age, weight, haemoglobin and the interval since the last donation (Ghana NBS practice). */
export function donationProblem(donor: { dateOfBirth: Date; gender: string; lastDonationAt: Date | null; deferredUntil: Date | null }, check: { weightKg: number; haemoglobin: number }, on: Date) {
  const age = (on.getTime() - donor.dateOfBirth.getTime()) / (365.25 * 86_400_000);
  if (age < 17 || age >= 61) return 'Donors must be 17 to 60 years old';
  if (donor.deferredUntil && donor.deferredUntil > on) return `The donor is deferred until ${donor.deferredUntil.toISOString().slice(0, 10)}`;
  if (check.weightKg < 50) return 'Donors must weigh at least 50 kg';
  if (check.haemoglobin < 12.5) return 'Haemoglobin must be at least 12.5 g/dL to donate';
  const female = donor.gender.trim().toUpperCase() === 'FEMALE';
  const minDays = female ? 16 * 7 : 12 * 7;
  if (donor.lastDonationAt) {
    const days = Math.floor((on.getTime() - donor.lastDonationAt.getTime()) / 86_400_000);
    if (days < minDays) return `${female ? 'Women' : 'Men'} can donate every ${minDays / 7} weeks; the last donation was ${days} days ago`;
  }
  return null;
}

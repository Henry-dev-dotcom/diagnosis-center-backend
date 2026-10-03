import { FacilityKind } from '@prisma/client';

/*
  The kinds of facility we sell to.

  This is the first question the pricing page asks, before any price is shown,
  because it is the one a customer can answer without reading anything: they
  know what they run. Plans are grouped by it.

  These are different shapes, not sizes of one thing. A diagnostic centre needs
  imaging and a way to send results back to the clinician who asked for them,
  and has no outpatient clinic at all; a pharmacy has nothing clinical. Only
  Hospital is sold in more than one size.
*/

export type FacilityKindDefinition = {
  key: FacilityKind;
  /** What a customer would call it. */
  name: string;
  /** Shown under the name while they are choosing, before any price. */
  summary: string;
  /** The words a customer might use for themselves, to help them recognise theirs. */
  examples: string;
  sortOrder: number;
};

export const FACILITY_KINDS: readonly FacilityKindDefinition[] = [
  {
    key: FacilityKind.DIAGNOSTIC_CENTRE,
    name: 'Diagnostic Centre',
    summary: 'A laboratory, a scan unit, or both, taking requests from clinicians elsewhere and sending results back.',
    examples: 'Laboratory · Imaging / scan centre · Pathology service',
    sortOrder: 1
  },
  {
    key: FacilityKind.PHARMACY,
    name: 'Pharmacy',
    summary: 'A standalone pharmacy: dispensing, stock by batch and expiry, suppliers and sales.',
    examples: 'Retail pharmacy · Chemical shop · Dispensary',
    sortOrder: 2
  },
  {
    key: FacilityKind.CLINIC,
    name: 'Clinic / Health Centre',
    summary: 'Outpatient care, usually with a small laboratory and a dispensary of your own.',
    examples: 'Clinic · Health centre · Polyclinic · Specialist practice',
    sortOrder: 3
  },
  {
    key: FacilityKind.HOSPITAL,
    name: 'Hospital',
    summary: 'Wards and admissions as well as outpatients, with theatre and the specialist departments as you need them.',
    examples: 'District hospital · Mission hospital · Teaching hospital · Private hospital',
    sortOrder: 4
  }
];

export function facilityKindView(kind: FacilityKind) {
  return FACILITY_KINDS.find((entry) => entry.key === kind) ?? null;
}

/*
  Department modules a facility can switch on or off.

  Core features (sign-in, users, admin, patients, orders, catalog, notifications,
  files) are always available and are not listed here. Each module below gates
  its routes with requireModule(); a facility's switched-on modules are the
  FacilityModule rows with enabled = true. Phase 5 subscriptions will decide
  which modules a facility has paid for; until then the platform operator sets them.

  Keys are stored in the database: never rename one, only add.
*/

export const MODULE_KEYS = [
  'opd',
  'emergency',
  'inpatient',
  'pharmacy',
  'reception',
  'laboratory',
  'imaging',
  'billing',
  'finance',
  'clinician_portal',
  'results_delivery',
  'reports',
  'theatre',
  'dental',
  'eye',
  'physiotherapy',
  'dietetics',
  'maternity',
  'child_health',
  'claims',
  'stores',
  'blood_bank',
  'mortuary',
  'hr',
  'medical_records'
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleDefinition = {
  key: ModuleKey;
  name: string;
  category: 'clinical' | 'diagnostics' | 'front_office' | 'finance' | 'insights';
  description: string;
  /** Modules that must also be on for this one to work. */
  dependsOn: ModuleKey[];
};

export const MODULES: readonly ModuleDefinition[] = [
  { key: 'opd', name: 'Outpatient (OPD)', category: 'clinical', dependsOn: [], description: 'Patient visits, triage and vitals, consultation notes, diagnoses and prescriptions.' },
  { key: 'emergency', name: 'Emergency', category: 'clinical', dependsOn: [], description: 'Emergency department board, triage-first queue and quick registration of unidentified patients.' },
  { key: 'inpatient', name: 'Wards & Admissions', category: 'clinical', dependsOn: [], description: 'Wards and beds, admissions, transfers, nursing care and medication rounds, discharge.' },
  { key: 'pharmacy', name: 'Pharmacy', category: 'clinical', dependsOn: [], description: 'Drug list, stock by batch and expiry, dispensing prescriptions and pharmacy bills.' },
  { key: 'reception', name: 'Reception', category: 'front_office', dependsOn: [], description: 'Incoming orders, check-in, walk-ins, appointments and the daily visit log.' },
  { key: 'laboratory', name: 'Laboratory', category: 'diagnostics', dependsOn: [], description: 'Sample acceptance, result entry, review and sign-off, QC and inventory, and analyzers that file their own results.' },
  { key: 'imaging', name: 'Imaging / Radiology', category: 'diagnostics', dependsOn: [], description: 'Scan queue, equipment booking, reporting and radiologist sign-off.' },
  { key: 'billing', name: 'Billing', category: 'finance', dependsOn: [], description: 'Invoices, payments, receipts and refunds.' },
  { key: 'finance', name: 'Finance', category: 'finance', dependsOn: ['billing'], description: 'Cashier shifts, float, expenses and the account ledger.' },
  { key: 'clinician_portal', name: 'Clinician Portal', category: 'clinical', dependsOn: [], description: 'Clinicians place orders, track them and view released results.' },
  { key: 'results_delivery', name: 'Results Delivery', category: 'clinical', dependsOn: [], description: 'Releasing results and delivering them by email, SMS, WhatsApp or PDF.' },
  { key: 'reports', name: 'Reports & Analytics', category: 'insights', dependsOn: [], description: 'Operational, turnaround, revenue and audit reports.' },
  { key: 'theatre', name: 'Theatre & Surgery', category: 'clinical', dependsOn: [], description: 'Operating theatre list, surgical safety checklist, operation notes and procedure charges.' },
  { key: 'dental', name: 'Dental', category: 'clinical', dependsOn: ['opd'], description: 'Dental clinic with a tooth-by-tooth chart (FDI numbering) and treatment record.' },
  { key: 'eye', name: 'Eye / Optometry', category: 'clinical', dependsOn: ['opd'], description: 'Eye clinic: visual acuity, eye pressure, examination findings and refraction.' },
  { key: 'physiotherapy', name: 'Physiotherapy', category: 'clinical', dependsOn: ['opd'], description: 'Physiotherapy assessments, goals and treatment sessions.' },
  { key: 'dietetics', name: 'Dietetics & Nutrition', category: 'clinical', dependsOn: ['opd'], description: 'Nutrition assessments with BMI and MUAC, diet plans and follow-up.' },
  { key: 'maternity', name: 'Maternity', category: 'clinical', dependsOn: ['opd'], description: 'Pregnancy register, antenatal and postnatal clinics, labour and delivery with newborn registration.' },
  { key: 'child_health', name: 'Child Health & Immunisation', category: 'clinical', dependsOn: ['opd'], description: 'Child welfare clinic, growth monitoring, the EPI immunisation schedule and the defaulter list.' },
  { key: 'claims', name: 'Insurance Claims (NHIS)', category: 'finance', dependsOn: ['billing'], description: 'NHIS and private scheme memberships, claim preparation, monthly batches, adjudication and scheme payments.' },
  { key: 'stores', name: 'Stores & Procurement', category: 'finance', dependsOn: [], description: 'General store items, suppliers, approved purchase orders, goods received and requisitions from wards and departments.' },
  { key: 'blood_bank', name: 'Blood Bank', category: 'diagnostics', dependsOn: [], description: 'Donors and donations, screening and quarantine, crossmatching, issue, emergency release and transfusion records.' },
  { key: 'mortuary', name: 'Mortuary', category: 'clinical', dependsOn: [], description: 'Deceased register, body tags and storage slots, death certification, police cases and release to family.' },
  { key: 'hr', name: 'HR & Duty Rota', category: 'insights', dependsOn: [], description: 'Staff profiles and professional registration, shift types, the duty rota with rest rules, and leave requests and approvals.' },
  { key: 'medical_records', name: 'Medical Records', category: 'clinical', dependsOn: [], description: 'The full patient chart across departments, a log of who opened each record, and release-of-information requests.' }
];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/** Returns the dependency problems in a proposed set of enabled modules. */
export function moduleDependencyErrors(enabled: readonly ModuleKey[]): string[] {
  const on = new Set(enabled);
  const errors: string[] = [];
  for (const module of MODULES) {
    if (!on.has(module.key)) continue;
    for (const dependency of module.dependsOn) {
      if (!on.has(dependency)) {
        const dependencyName = MODULES.find((m) => m.key === dependency)?.name ?? dependency;
        errors.push(`${module.name} requires ${dependencyName}.`);
      }
    }
  }
  return errors;
}

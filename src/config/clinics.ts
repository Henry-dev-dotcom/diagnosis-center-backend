import { Clinic, ClinicalFormType } from '@prisma/client';
import type { ModuleKey } from './modules.js';

/*
  Specialty clinics (Phase 4C). An outpatient visit is held in a clinic; each
  specialty clinic belongs to a department module, and so does each structured
  clinical form. Forms may be recorded on any open visit or stay (a dietitian
  can assess a ward patient) as long as the form's module is switched on.
*/

export const CLINIC_MODULE: Record<Clinic, ModuleKey> = {
  [Clinic.GENERAL]: 'opd',
  [Clinic.DENTAL]: 'dental',
  [Clinic.EYE]: 'eye',
  [Clinic.PHYSIOTHERAPY]: 'physiotherapy',
  [Clinic.DIETETICS]: 'dietetics',
  [Clinic.ANTENATAL]: 'maternity',
  [Clinic.POSTNATAL]: 'maternity'
};

export const CLINIC_NAME: Record<Clinic, string> = {
  [Clinic.GENERAL]: 'General outpatient',
  [Clinic.DENTAL]: 'Dental clinic',
  [Clinic.EYE]: 'Eye clinic',
  [Clinic.PHYSIOTHERAPY]: 'Physiotherapy',
  [Clinic.DIETETICS]: 'Dietetics',
  [Clinic.ANTENATAL]: 'Antenatal clinic',
  [Clinic.POSTNATAL]: 'Postnatal clinic'
};

/** Who may record a form: clinicians (consult permission), or also triage/nursing staff. */
export type FormWriters = 'clinician' | 'clinical_staff';

/** Antenatal forms need an ongoing pregnancy; postnatal forms a delivered one. */
export type FormPregnancy = 'ACTIVE' | 'DELIVERED';

export const FORM_RULES: Record<ClinicalFormType, { module: ModuleKey; writers: FormWriters; pregnancy?: FormPregnancy }> = {
  [ClinicalFormType.DENTAL_CHART]: { module: 'dental', writers: 'clinician' },
  [ClinicalFormType.EYE_EXAM]: { module: 'eye', writers: 'clinician' },
  [ClinicalFormType.PHYSIO_ASSESSMENT]: { module: 'physiotherapy', writers: 'clinician' },
  [ClinicalFormType.PHYSIO_SESSION]: { module: 'physiotherapy', writers: 'clinician' },
  [ClinicalFormType.NUTRITION_ASSESSMENT]: { module: 'dietetics', writers: 'clinical_staff' },
  // Midwives are nurses in the role model, so antenatal and postnatal care is open to clinical staff.
  [ClinicalFormType.ANC_VISIT]: { module: 'maternity', writers: 'clinical_staff', pregnancy: 'ACTIVE' },
  [ClinicalFormType.POSTNATAL_CHECK]: { module: 'maternity', writers: 'clinical_staff', pregnancy: 'DELIVERED' }
};

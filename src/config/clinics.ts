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
  [Clinic.DIETETICS]: 'dietetics'
};

export const CLINIC_NAME: Record<Clinic, string> = {
  [Clinic.GENERAL]: 'General outpatient',
  [Clinic.DENTAL]: 'Dental clinic',
  [Clinic.EYE]: 'Eye clinic',
  [Clinic.PHYSIOTHERAPY]: 'Physiotherapy',
  [Clinic.DIETETICS]: 'Dietetics'
};

/** Who may record a form: clinicians (consult permission), or also triage/nursing staff. */
export type FormWriters = 'clinician' | 'clinical_staff';

export const FORM_RULES: Record<ClinicalFormType, { module: ModuleKey; writers: FormWriters }> = {
  [ClinicalFormType.DENTAL_CHART]: { module: 'dental', writers: 'clinician' },
  [ClinicalFormType.EYE_EXAM]: { module: 'eye', writers: 'clinician' },
  [ClinicalFormType.PHYSIO_ASSESSMENT]: { module: 'physiotherapy', writers: 'clinician' },
  [ClinicalFormType.PHYSIO_SESSION]: { module: 'physiotherapy', writers: 'clinician' },
  [ClinicalFormType.NUTRITION_ASSESSMENT]: { module: 'dietetics', writers: 'clinical_staff' }
};

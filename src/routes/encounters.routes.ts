import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAnyPermission, requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireAnyModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  allergySchema,
  cancelSchema,
  emergencyRegistrationSchema,
  formularyQuerySchema,
  completeEncounterSchema,
  diagnosisSchema,
  encounterOrderSchema,
  encounterQuerySchema,
  icd10QuerySchema,
  noteSchema,
  prescriptionSchema,
  startEncounterSchema,
  subIdParamSchema,
  updateAllergySchema,
  vitalsSchema
} from '../validators/encounter.validators.js';
import {
  addAllergyController,
  addDiagnosisController,
  addNoteController,
  cancelEncounterController,
  completeEncounterController,
  emergencyRegistrationController,
  formularyController,
  getEncounterController,
  icd10SearchController,
  listAllergiesController,
  listEncountersController,
  orderInvestigationsController,
  patientTimelineController,
  prescribeController,
  recordVitalsController,
  resolveDiagnosisController,
  startConsultationController,
  startEncounterController,
  updateAllergyController
} from '../controllers/encounter.controller.js';
import { addClinicalFormController, listPatientFormsController } from '../controllers/clinicalForm.controller.js';
import { clinicalFormSchema, patientFormsQuerySchema } from '../validators/clinicalForm.validators.js';

const P = PERMISSIONS;

// Outpatient visits. Staff workspaces that take part in a visit; each action
// then needs its own permission (custom roles build on these workspaces).
export const encountersRoutes = Router();
encountersRoutes.use(
  '/encounters',
  requireAuth,
  requireAnyModule('opd', 'emergency', 'inpatient'),
  requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST)
);
encountersRoutes.get('/encounters', requirePermission(P.ENCOUNTERS_READ), validateRequest({ query: encounterQuerySchema }), listEncountersController);
encountersRoutes.post('/encounters', requirePermission(P.ENCOUNTERS_CREATE), validateRequest({ body: startEncounterSchema }), startEncounterController);
encountersRoutes.get('/encounters/diagnosis-codes', requirePermission(P.ENCOUNTERS_READ), validateRequest({ query: icd10QuerySchema }), icd10SearchController);
encountersRoutes.get('/encounters/formulary', requirePermission(P.PHARMACY_FORMULARY_READ), validateRequest({ query: formularyQuerySchema }), formularyController);
encountersRoutes.post('/encounters/emergency-arrivals', requirePermission(P.ENCOUNTERS_CREATE), validateRequest({ body: emergencyRegistrationSchema }), emergencyRegistrationController);
encountersRoutes.get('/encounters/:id', requirePermission(P.ENCOUNTERS_READ), validateRequest({ params: idParamSchema }), getEncounterController);
encountersRoutes.post('/encounters/:id/vitals', requireAnyPermission(P.ENCOUNTERS_TRIAGE, P.ENCOUNTERS_CONSULT), validateRequest({ params: idParamSchema, body: vitalsSchema }), recordVitalsController);
encountersRoutes.post('/encounters/:id/start-consultation', requirePermission(P.ENCOUNTERS_CONSULT), validateRequest({ params: idParamSchema }), startConsultationController);
encountersRoutes.post('/encounters/:id/notes', requireAnyPermission(P.ENCOUNTERS_TRIAGE, P.ENCOUNTERS_CONSULT), validateRequest({ params: idParamSchema, body: noteSchema }), addNoteController);
encountersRoutes.post('/encounters/:id/forms', requireAnyPermission(P.ENCOUNTERS_TRIAGE, P.ENCOUNTERS_CONSULT), validateRequest({ params: idParamSchema, body: clinicalFormSchema }), addClinicalFormController);
encountersRoutes.post('/encounters/:id/diagnoses', requirePermission(P.ENCOUNTERS_CONSULT), validateRequest({ params: idParamSchema, body: diagnosisSchema }), addDiagnosisController);
encountersRoutes.post('/encounters/:id/diagnoses/:subId/resolve', requirePermission(P.ENCOUNTERS_CONSULT), validateRequest({ params: subIdParamSchema }), resolveDiagnosisController);
encountersRoutes.post('/encounters/:id/orders', requirePermission(P.ENCOUNTERS_ORDER), validateRequest({ params: idParamSchema, body: encounterOrderSchema }), orderInvestigationsController);
encountersRoutes.post('/encounters/:id/prescriptions', requirePermission(P.ENCOUNTERS_PRESCRIBE), validateRequest({ params: idParamSchema, body: prescriptionSchema }), prescribeController);
encountersRoutes.post('/encounters/:id/complete', requirePermission(P.ENCOUNTERS_COMPLETE), validateRequest({ params: idParamSchema, body: completeEncounterSchema }), completeEncounterController);
encountersRoutes.post('/encounters/:id/cancel', requirePermission(P.ENCOUNTERS_CANCEL), validateRequest({ params: idParamSchema, body: cancelSchema }), cancelEncounterController);

// Patient-level clinical data (core; not gated by the OPD module).
export const patientClinicalRoutes = Router();
patientClinicalRoutes.get('/patients/:id/allergies', requireAuth, requireAnyPermission(P.PATIENTS_READ, P.ENCOUNTERS_READ), validateRequest({ params: idParamSchema }), listAllergiesController);
patientClinicalRoutes.post('/patients/:id/allergies', requireAuth, requirePermission(P.PATIENT_ALLERGIES_MANAGE), validateRequest({ params: idParamSchema, body: allergySchema }), addAllergyController);
patientClinicalRoutes.patch('/patients/:id/allergies/:subId', requireAuth, requirePermission(P.PATIENT_ALLERGIES_MANAGE), validateRequest({ params: subIdParamSchema, body: updateAllergySchema }), updateAllergyController);
patientClinicalRoutes.get('/patients/:id/forms', requireAuth, requirePermission(P.ENCOUNTERS_READ), validateRequest({ params: idParamSchema, query: patientFormsQuerySchema }), listPatientFormsController);
patientClinicalRoutes.get('/patients/:id/timeline', requireAuth, requireAnyPermission(P.PATIENTS_READ, P.ENCOUNTERS_READ), validateRequest({ params: idParamSchema }), patientTimelineController);

import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { searchIcd10 } from '../data/icd10Common.js';
import { formulary } from '../services/pharmacy.service.js';
import { getClinicalHistory } from '../services/clinicalHistory.service.js';
import { deleteDraft, getClinicianQueue, getDraft, resumeEncounter, saveDraft, suspendEncounter } from '../services/clinicianQueue.service.js';
import {
  addAllergy,
  addDiagnosis,
  addNote,
  cancelEncounter,
  completeEncounter,
  getEncounter,
  listAllergies,
  listEncounters,
  orderInvestigations,
  patientTimeline,
  prescribe,
  recordVitals,
  registerEmergencyArrival,
  resolveDiagnosis,
  setAllergyActive,
  startConsultation,
  startEncounter
} from '../services/encounter.service.js';

export const listEncountersController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Encounters loaded', await listEncounters(req.query as never))
);
export const getEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Encounter loaded', await getEncounter(req.params.id))
);
export const startEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Visit started', await startEncounter(req.body, req))
);
export const recordVitalsController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Vitals recorded', await recordVitals(req.params.id, req.body, req))
);
export const startConsultationController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Consultation started', await startConsultation(req.params.id, req))
);
export const addNoteController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Note saved', await addNote(req.params.id, req.body, req))
);
export const addDiagnosisController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Diagnosis recorded', await addDiagnosis(req.params.id, req.body, req))
);
export const resolveDiagnosisController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Diagnosis resolved', await resolveDiagnosis(req.params.id, req.params.subId, req))
);
export const orderInvestigationsController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Tests and scans ordered', await orderInvestigations(req.params.id, req.body, req))
);
export const prescribeController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Prescription issued', await prescribe(req.params.id, req.body, req))
);
export const completeEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Visit completed', await completeEncounter(req.params.id, req.body, req))
);
export const cancelEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Visit cancelled', await cancelEncounter(req.params.id, req.body, req))
);
export const icd10SearchController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Diagnosis codes loaded', searchIcd10(String(req.query.q ?? '')))
);

export const listAllergiesController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Allergies loaded', await listAllergies(req.params.id))
);
export const addAllergyController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Allergy recorded', await addAllergy(req.params.id, req.body, req))
);
export const updateAllergyController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Allergy updated', await setAllergyActive(req.params.id, req.params.subId, req.body.active, req))
);
export const patientTimelineController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Patient timeline loaded', await patientTimeline(req.params.id))
);

export const formularyController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Drug list loaded', await formulary(typeof req.query.q === 'string' ? req.query.q : undefined))
);
export const emergencyRegistrationController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Emergency arrival registered', await registerEmergencyArrival(req.body, req))
);

export const clinicianQueueController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Queue loaded', await getClinicianQueue(req.query as never, req))
);
export const suspendEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Visit paused for results', await suspendEncounter(req.params.id, req))
);
export const resumeEncounterController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Visit resumed', await resumeEncounter(req.params.id, req))
);
export const getDraftController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Draft loaded', await getDraft(req.params.id, req))
);
export const saveDraftController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Draft saved', await saveDraft(req.params.id, req.body.data, req))
);
export const deleteDraftController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Draft discarded', await deleteDraft(req.params.id, req))
);

export const clinicalHistoryController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Clinical history loaded', await getClinicalHistory(req.params.id, Number((req.query as { limit?: number }).limit ?? 5)))
);

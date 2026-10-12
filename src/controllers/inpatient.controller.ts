import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  addBeds,
  administer,
  admit,
  cancelAdmission,
  createWard,
  discharge,
  getAdmission,
  listAdmissions,
  listWards,
  setBedStatus,
  transfer,
  updateWard
} from '../services/inpatient.service.js';
import { getBoard, getMedicationChart, listFluids, markResultsReviewed, recordFluid } from '../services/wardChart.service.js';

export const listWardsController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Wards loaded', await listWards()));
export const createWardController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Ward created', await createWard(req.body, req)));
export const updateWardController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Ward updated', await updateWard(req.params.id, req.body, req)));
export const addBedsController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Beds added', await addBeds(req.params.id, req.body.labels, req)));
export const bedStatusController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Bed updated', await setBedStatus(req.params.id, req.body.status, req)));
export const listAdmissionsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Admissions loaded', await listAdmissions(req.query as never)));
export const getAdmissionController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Admission loaded', await getAdmission(req.params.id)));
export const admitController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Patient admitted', await admit(req.body, req)));
export const transferController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Patient moved', await transfer(req.params.id, req.body, req)));
export const administerController = asyncHandler(async (req: Request, res: Response) =>
  sendCreated(res, 'Recorded on the medication chart', await administer(req.params.id, req.params.itemId, req.body, req))
);
export const dischargeController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Patient discharged', await discharge(req.params.id, req.body, req)));
export const cancelAdmissionController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Admission cancelled', await cancelAdmission(req.params.id, req.body, req)));

export const boardController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Ward board loaded', await getBoard()));
export const medicationChartController = asyncHandler(async (req: Request, res: Response) =>
  sendSuccess(res, 'Medication chart loaded', await getMedicationChart(req.params.id, (req.query as { date?: string }).date))
);
export const resultsReviewedController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Results marked as reviewed', await markResultsReviewed(req.params.id, req)));
export const listFluidsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Fluid balance loaded', await listFluids(req.params.id, Number((req.query as { days?: number }).days ?? 3))));
export const recordFluidController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Recorded on the fluid balance chart', await recordFluid(req.params.id, req.body, req)));

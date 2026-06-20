import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  checkPatientDuplicates,
  createPatient,
  getPatient,
  getPatientOrders,
  getPatientTrends,
  listPatients,
  updatePatient
} from '../services/patient.service.js';

export const listPatientsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listPatients(req.query, req.user);
  return sendSuccess(res, 'Patients loaded successfully', result);
});

export const createPatientController = asyncHandler(async (req: Request, res: Response) => {
  const patient = await createPatient(req.body, req);
  return sendCreated(res, 'Patient created successfully', patient);
});

export const getPatientController = asyncHandler(async (req: Request, res: Response) => {
  const patient = await getPatient(req.params.id, req.user);
  return sendSuccess(res, 'Patient profile loaded successfully', patient);
});

export const updatePatientController = asyncHandler(async (req: Request, res: Response) => {
  const patient = await updatePatient(req.params.id, req.body, req);
  return sendSuccess(res, 'Patient updated successfully', patient);
});

export const patientOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPatientOrders(req.params.id, req.query, req.user);
  return sendSuccess(res, 'Patient orders loaded successfully', result);
});

export const patientTrendsController = asyncHandler(async (req: Request, res: Response) => {
  const trends = await getPatientTrends(req.params.id ?? req.params.patientId, req.query, req.user);
  return sendSuccess(res, 'Patient trends loaded successfully', trends);
});

export const checkPatientDuplicatesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await checkPatientDuplicates(req.body);
  return sendSuccess(res, 'Duplicate check completed successfully', result);
});

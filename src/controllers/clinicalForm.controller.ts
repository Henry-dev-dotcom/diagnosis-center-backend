import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { addClinicalForm, listPatientForms } from '../services/clinicalForm.service.js';

export const addClinicalFormController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Form recorded', await addClinicalForm(req.params.id, req.body, req)));
export const listPatientFormsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Forms loaded', await listPatientForms(req.params.id, req.query as never)));

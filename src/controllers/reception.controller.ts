import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  checkInPatient,
  createAppointment,
  createWalkIn,
  listAppointments,
  listDailyVisits,
  listReceptionResultsInbox,
  sendReceptionResultNotice,
  updateAppointment
} from '../services/reception.service.js';

export const checkInPatientController = asyncHandler(async (req: Request, res: Response) => {
  const visit = await checkInPatient(req.body, req);
  return sendCreated(res, 'Patient checked in successfully', visit);
});

export const createWalkInController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createWalkIn(req.body, req);
  return sendCreated(res, 'Walk-in intake created successfully', result);
});

export const listAppointmentsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAppointments(req.query);
  return sendSuccess(res, 'Appointments loaded successfully', result);
});

export const createAppointmentController = asyncHandler(async (req: Request, res: Response) => {
  const appointment = await createAppointment(req.body, req);
  return sendCreated(res, 'Appointment created successfully', appointment);
});

export const updateAppointmentController = asyncHandler(async (req: Request, res: Response) => {
  const appointment = await updateAppointment(req.params.id, req.body, req);
  return sendSuccess(res, 'Appointment updated successfully', appointment);
});

export const listDailyVisitsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listDailyVisits(req.query);
  return sendSuccess(res, 'Daily visits loaded successfully', result);
});

export const listReceptionResultsInboxController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listReceptionResultsInbox(req.query);
  return sendSuccess(res, 'Reception results inbox loaded successfully', result);
});

export const sendReceptionResultNoticeController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendReceptionResultNotice(req.params.id, req.body, req);
  return sendCreated(res, 'Privacy-safe result notice sent successfully', result);
});

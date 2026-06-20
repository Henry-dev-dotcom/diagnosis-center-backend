import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requireAnyPermission, requirePermission, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { dateRangeQuerySchema, idParamSchema, paginationQuerySchema } from '../validators/common.validators.js';
import { checkDuplicatesSchema, createPatientSchema, updatePatientSchema } from '../validators/patient.validators.js';
import {
  checkPatientDuplicatesController,
  createPatientController,
  getPatientController,
  listPatientsController,
  patientOrdersController,
  patientTrendsController,
  updatePatientController
} from '../controllers/patient.controller.js';

export const patientsRoutes = Router();
patientsRoutes.use('/patients', requireAuth);
patientsRoutes.get('/patients', requireAnyPermission(PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_PATIENTS_READ_OWN), validateRequest({ query: paginationQuerySchema }), listPatientsController);
patientsRoutes.post('/patients', requireAnyPermission(PERMISSIONS.PATIENTS_CREATE), validateRequest({ body: createPatientSchema }), createPatientController);
patientsRoutes.get('/patients/:id', requireAnyPermission(PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_PATIENTS_READ_OWN), validateRequest({ params: idParamSchema }), getPatientController);
patientsRoutes.patch('/patients/:id', requireRole(UserRole.ADMIN, UserRole.RECEPTIONIST), requirePermission(PERMISSIONS.PATIENTS_UPDATE), validateRequest({ params: idParamSchema, body: updatePatientSchema }), updatePatientController);
patientsRoutes.get('/patients/:id/orders', requireAnyPermission(PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN), validateRequest({ params: idParamSchema, query: dateRangeQuerySchema }), patientOrdersController);
patientsRoutes.get('/patients/:id/trends', requireAnyPermission(PERMISSIONS.PATIENTS_TRENDS_READ, PERMISSIONS.DOCTOR_TRENDS_READ_OWN, PERMISSIONS.LAB_TRENDS_READ), validateRequest({ params: idParamSchema, query: dateRangeQuerySchema }), patientTrendsController);
patientsRoutes.post('/patients/check-duplicates', requireAnyPermission(PERMISSIONS.PATIENTS_DUPLICATES_MANAGE, PERMISSIONS.PATIENTS_CREATE), validateRequest({ body: checkDuplicatesSchema }), checkPatientDuplicatesController);

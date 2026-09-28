import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  cancelSurgerySchema,
  completeSurgerySchema,
  createTheatreSchema,
  rescheduleSurgerySchema,
  scheduleSurgerySchema,
  signInSchema,
  surgeryQuerySchema,
  timeOutSchema,
  updateTheatreSchema
} from '../validators/theatre.validators.js';
import {
  cancelSurgeryController,
  completeSurgeryController,
  createTheatreController,
  getSurgeryController,
  listSurgeriesController,
  listTheatresController,
  rescheduleSurgeryController,
  scheduleSurgeryController,
  signInController,
  timeOutController,
  updateTheatreController
} from '../controllers/theatre.controller.js';

const P = PERMISSIONS;

export const theatreRoutes = Router();
theatreRoutes.use('/theatre', requireAuth, requireModule('theatre'), requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE));
theatreRoutes.get('/theatre/theatres', requirePermission(P.THEATRE_READ), listTheatresController);
theatreRoutes.post('/theatre/theatres', requirePermission(P.THEATRE_MANAGE), validateRequest({ body: createTheatreSchema }), createTheatreController);
theatreRoutes.patch('/theatre/theatres/:id', requirePermission(P.THEATRE_MANAGE), validateRequest({ params: idParamSchema, body: updateTheatreSchema }), updateTheatreController);
theatreRoutes.get('/theatre/surgeries', requirePermission(P.THEATRE_READ), validateRequest({ query: surgeryQuerySchema }), listSurgeriesController);
theatreRoutes.post('/theatre/surgeries', requirePermission(P.THEATRE_SCHEDULE), validateRequest({ body: scheduleSurgerySchema }), scheduleSurgeryController);
theatreRoutes.get('/theatre/surgeries/:id', requirePermission(P.THEATRE_READ), validateRequest({ params: idParamSchema }), getSurgeryController);
theatreRoutes.patch('/theatre/surgeries/:id', requirePermission(P.THEATRE_SCHEDULE), validateRequest({ params: idParamSchema, body: rescheduleSurgerySchema }), rescheduleSurgeryController);
theatreRoutes.post('/theatre/surgeries/:id/sign-in', requirePermission(P.THEATRE_CHECKLIST), validateRequest({ params: idParamSchema, body: signInSchema }), signInController);
theatreRoutes.post('/theatre/surgeries/:id/time-out', requirePermission(P.THEATRE_CHECKLIST), validateRequest({ params: idParamSchema, body: timeOutSchema }), timeOutController);
theatreRoutes.post('/theatre/surgeries/:id/complete', requirePermission(P.THEATRE_OPERATE), validateRequest({ params: idParamSchema, body: completeSurgerySchema }), completeSurgeryController);
theatreRoutes.post('/theatre/surgeries/:id/cancel', requirePermission(P.THEATRE_SCHEDULE), validateRequest({ params: idParamSchema, body: cancelSurgerySchema }), cancelSurgeryController);

import { Router, type Request, type Response } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { certifySchema, clearanceSchema, deceasedQuerySchema, moveSchema, registerSchema, releaseSchema, slotSchema } from '../validators/mortuary.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import * as mortuary from '../services/mortuary.service.js';

const P = PERMISSIONS;
const ok = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendSuccess(res, message, await fn(req)));
const created = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendCreated(res, message, await fn(req)));

// Mortuary attendants work under the nurse workspace (or a custom role based on it); doctors certify deaths.
export const mortuaryRoutes = Router();
mortuaryRoutes.use('/mortuary', requireAuth, requireModule('mortuary'), requireRole(UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR));
mortuaryRoutes.get('/mortuary/slots', requirePermission(P.MORTUARY_READ), ok('Slots loaded', () => mortuary.listSlots()));
mortuaryRoutes.post('/mortuary/slots', requirePermission(P.MORTUARY_SLOTS_MANAGE), validateRequest({ body: slotSchema }), created('Slot created', (req) => mortuary.createSlot(req.body, req)));
mortuaryRoutes.get('/mortuary/deceased', requirePermission(P.MORTUARY_READ), validateRequest({ query: deceasedQuerySchema }), ok('Register loaded', (req) => mortuary.listDeceased(req.query as never)));
mortuaryRoutes.post('/mortuary/deceased', requirePermission(P.MORTUARY_MANAGE), validateRequest({ body: registerSchema }), created('Registered in the mortuary', (req) => mortuary.registerDeceased(req.body, req)));
mortuaryRoutes.get('/mortuary/deceased/:id', requirePermission(P.MORTUARY_READ), validateRequest({ params: idParamSchema }), ok('Record loaded', (req) => mortuary.getDeceased(req.params.id)));
mortuaryRoutes.post('/mortuary/deceased/:id/certify', requirePermission(P.MORTUARY_CERTIFY), validateRequest({ params: idParamSchema, body: certifySchema }), ok('Death certified', (req) => mortuary.certifyDeath(req.params.id, req.body, req)));
mortuaryRoutes.post('/mortuary/deceased/:id/police-clearance', requirePermission(P.MORTUARY_MANAGE), validateRequest({ params: idParamSchema, body: clearanceSchema }), ok('Police clearance recorded', (req) => mortuary.recordPoliceClearance(req.params.id, req.body, req)));
mortuaryRoutes.post('/mortuary/deceased/:id/move', requirePermission(P.MORTUARY_MANAGE), validateRequest({ params: idParamSchema, body: moveSchema }), ok('Body moved', (req) => mortuary.moveSlot(req.params.id, req.body, req)));
mortuaryRoutes.post('/mortuary/deceased/:id/release', requirePermission(P.MORTUARY_MANAGE), validateRequest({ params: idParamSchema, body: releaseSchema }), ok('Body released', (req) => mortuary.releaseBody(req.params.id, req.body, req)));

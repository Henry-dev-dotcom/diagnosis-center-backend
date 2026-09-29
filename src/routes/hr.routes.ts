import { Router, type Request, type Response } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { assignSchema, decisionSchema, leaveQuerySchema, leaveSchema, profileSchema, rotaQuerySchema, shiftTypeSchema } from '../validators/hr.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import * as hr from '../services/hr.service.js';

const P = PERMISSIONS;
const ok = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendSuccess(res, message, await fn(req)));
const created = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendCreated(res, message, await fn(req)));

// Every member of staff sees the rota and their own leave; HR manages profiles, the rota and approvals.
export const hrRoutes = Router();
hrRoutes.use('/hr', requireAuth, requireModule('hr'));
hrRoutes.get('/hr/me', requirePermission(P.HR_LEAVE_REQUEST), ok('Your HR record loaded', (req) => hr.myHr(req)));
hrRoutes.get('/hr/staff', requirePermission(P.HR_MANAGE), ok('Staff loaded', () => hr.listStaff()));
hrRoutes.put('/hr/staff/:id', requirePermission(P.HR_MANAGE), validateRequest({ params: idParamSchema, body: profileSchema }), ok('Profile saved', (req) => hr.saveProfile(req.params.id, req.body, req)));
hrRoutes.get('/hr/shift-types', requirePermission(P.HR_ROTA_READ), ok('Shifts loaded', () => hr.listShiftTypes()));
hrRoutes.post('/hr/shift-types', requirePermission(P.HR_MANAGE), validateRequest({ body: shiftTypeSchema }), created('Shift created', (req) => hr.createShiftType(req.body, req)));
hrRoutes.get('/hr/rota', requirePermission(P.HR_ROTA_READ), validateRequest({ query: rotaQuerySchema }), ok('Rota loaded', (req) => hr.listRota(req.query as never)));
hrRoutes.post('/hr/rota', requirePermission(P.HR_MANAGE), validateRequest({ body: assignSchema }), created('Added to the rota', (req) => hr.assignShift(req.body, req)));
hrRoutes.delete('/hr/rota/:id', requirePermission(P.HR_MANAGE), validateRequest({ params: idParamSchema }), ok('Removed from the rota', (req) => hr.removeShift(req.params.id, req)));
hrRoutes.get('/hr/leave', requirePermission(P.HR_LEAVE_REQUEST), validateRequest({ query: leaveQuerySchema }), ok('Leave loaded', (req) => hr.listLeave(req.query as never, req)));
hrRoutes.post('/hr/leave', requirePermission(P.HR_LEAVE_REQUEST), validateRequest({ body: leaveSchema }), created('Leave requested', (req) => hr.requestLeave(req.body, req)));
hrRoutes.post('/hr/leave/:id/decision', requirePermission(P.HR_LEAVE_APPROVE), validateRequest({ params: idParamSchema, body: decisionSchema }), ok('Decision recorded', (req) => hr.decideLeave(req.params.id, req.body, req)));
hrRoutes.post('/hr/leave/:id/cancel', requirePermission(P.HR_LEAVE_REQUEST), validateRequest({ params: idParamSchema }), ok('Leave withdrawn', (req) => hr.cancelLeave(req.params.id, req)));

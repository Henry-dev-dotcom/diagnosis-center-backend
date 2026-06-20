import { Router } from 'express';
import { getDatabaseStatus, getHealth, getLiveness, getReadiness, getVersion } from '../controllers/system.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const systemRoutes = Router();

systemRoutes.get('/health', asyncHandler(getHealth));
systemRoutes.get('/live', getLiveness);
systemRoutes.get('/ready', asyncHandler(getReadiness));
systemRoutes.get('/database/status', asyncHandler(getDatabaseStatus));
systemRoutes.get('/version', getVersion);

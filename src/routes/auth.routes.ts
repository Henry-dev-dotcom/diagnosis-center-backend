import { Router } from 'express';
import { login, logout, me, refresh, updatePassword } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema } from '../validators/auth.validators.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', validateBody(loginSchema), login);
authRoutes.post('/auth/refresh', validateBody(refreshTokenSchema), refresh);
authRoutes.post('/auth/logout', validateBody(logoutSchema), logout);
authRoutes.get('/auth/me', requireAuth, me);
authRoutes.patch('/auth/change-password', requireAuth, validateBody(changePasswordSchema), updatePassword);

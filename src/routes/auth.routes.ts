import { Router } from 'express';
import { login, logout, me, refresh, requestEmailVerificationController, updatePassword, verifyEmail } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/security.js';
import { validateBody } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema, verifyEmailSchema } from '../validators/auth.validators.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', authRateLimit, validateBody(loginSchema), login);
authRoutes.post('/auth/refresh', authRateLimit, validateBody(refreshTokenSchema), refresh);
authRoutes.post('/auth/logout', validateBody(logoutSchema), logout);
authRoutes.get('/auth/me', requireAuth, me);
authRoutes.patch('/auth/change-password', requireAuth, validateBody(changePasswordSchema), updatePassword);

// Email verification: requesting a link needs a session; confirming one does not,
// since the person may open it on a phone that is not signed in. POST only - see
// the controller for why.
authRoutes.post('/auth/email/request-verification', authRateLimit, requireAuth, requestEmailVerificationController);
authRoutes.post('/auth/email/verify', authRateLimit, validateBody(verifyEmailSchema), verifyEmail);

import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as controller from '../controllers/vendorPortal.controller.js';
import { authRateLimit } from '../middleware/security.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireVendorAuth } from '../middleware/vendorPortalAuth.js';
import { validateRequest } from '../middleware/validate.js';
import {
  vendorInviteActivationSchema,
  vendorInviteSchema,
  vendorPartnerIdParamSchema,
  vendorPortalUserStatusSchema,
  vendorPortalUserIdParamSchema,
  vendorRequestIdParamSchema,
  vendorRequestListQuerySchema,
  vendorRequestStatusSchema,
  vendorLoginSchema
} from '../validators/vendorPortal.validators.js';

export const vendorPortalRoutes = Router();

// Partner identities are global; only a platform operator may issue or revoke access.
vendorPortalRoutes.get('/platform/vendor-partners', requireAuth, requireRole(UserRole.PLATFORM_ADMIN), controller.listPartnersController);
vendorPortalRoutes.post('/platform/vendor-partners/:id/invitations', requireAuth, requireRole(UserRole.PLATFORM_ADMIN), validateRequest({ params: vendorPartnerIdParamSchema, body: vendorInviteSchema }), controller.createInvitationController);
vendorPortalRoutes.patch('/platform/vendor-portal-users/:userId/status', requireAuth, requireRole(UserRole.PLATFORM_ADMIN), validateRequest({ params: vendorPortalUserIdParamSchema, body: vendorPortalUserStatusSchema }), controller.setVendorUserStatusController);
vendorPortalRoutes.delete('/platform/vendor-portal-users/:userId', requireAuth, requireRole(UserRole.PLATFORM_ADMIN), validateRequest({ params: vendorPortalUserIdParamSchema }), controller.deleteVendorUserController);

// The vendor uses a separate refresh cookie and vendor-only access-token claim.
vendorPortalRoutes.post('/vendor/auth/login', authRateLimit, validateRequest({ body: vendorLoginSchema }), controller.loginController);
vendorPortalRoutes.post('/vendor/auth/activate', authRateLimit, validateRequest({ body: vendorInviteActivationSchema }), controller.activateInvitationController);
vendorPortalRoutes.post('/vendor/auth/refresh', authRateLimit, controller.refreshController);
vendorPortalRoutes.get('/vendor/auth/me', requireVendorAuth, controller.currentVendorController);
vendorPortalRoutes.post('/vendor/auth/logout', requireVendorAuth, controller.logoutController);

vendorPortalRoutes.get('/vendor/requests', requireVendorAuth, validateRequest({ query: vendorRequestListQuerySchema }), controller.listRequestsController);
vendorPortalRoutes.get('/vendor/requests/:id', requireVendorAuth, validateRequest({ params: vendorRequestIdParamSchema }), controller.getRequestController);
vendorPortalRoutes.patch('/vendor/requests/:id/status', requireVendorAuth, validateRequest({ params: vendorRequestIdParamSchema, body: vendorRequestStatusSchema }), controller.updateRequestStatusController);

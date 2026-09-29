import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import {
  adjudicateSchema,
  batchQuerySchema,
  cancelClaimSchema,
  candidatesQuerySchema,
  claimPaymentSchema,
  claimQuerySchema,
  createClaimSchema,
  createSchemeSchema,
  membershipSchema,
  queryClaimSchema,
  submitClaimsSchema,
  updateSchemeSchema
} from '../validators/claims.validators.js';
import {
  addMembershipController,
  adjudicateClaimController,
  cancelClaimController,
  candidatesController,
  claimPaymentController,
  closeBatchController,
  createClaimController,
  createSchemeController,
  getClaimController,
  listBatchesController,
  listClaimsController,
  listMembershipsController,
  listSchemesController,
  queryClaimController,
  submitClaimsController,
  updateSchemeController
} from '../controllers/claims.controller.js';

const P = PERMISSIONS;

export const claimsRoutes = Router();
// Reception records patients' scheme cards; the claims office prepares, submits and settles claims.
claimsRoutes.use('/claims', requireAuth, requireModule('claims'), requireRole(UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.RECEPTIONIST));
claimsRoutes.get('/claims/schemes', requirePermission(P.CLAIMS_MEMBERSHIPS), listSchemesController);
claimsRoutes.post('/claims/schemes', requirePermission(P.CLAIMS_SCHEMES_MANAGE), validateRequest({ body: createSchemeSchema }), createSchemeController);
claimsRoutes.patch('/claims/schemes/:id', requirePermission(P.CLAIMS_SCHEMES_MANAGE), validateRequest({ params: idParamSchema, body: updateSchemeSchema }), updateSchemeController);
claimsRoutes.get('/claims/patients/:id/memberships', requirePermission(P.CLAIMS_MEMBERSHIPS), validateRequest({ params: idParamSchema }), listMembershipsController);
claimsRoutes.post('/claims/patients/:id/memberships', requirePermission(P.CLAIMS_MEMBERSHIPS), validateRequest({ params: idParamSchema, body: membershipSchema }), addMembershipController);
claimsRoutes.get('/claims/candidates', requirePermission(P.CLAIMS_MANAGE), validateRequest({ query: candidatesQuerySchema }), candidatesController);
claimsRoutes.get('/claims/batches', requirePermission(P.CLAIMS_READ), validateRequest({ query: batchQuerySchema }), listBatchesController);
claimsRoutes.post('/claims/batches/:id/close', requirePermission(P.CLAIMS_MANAGE), validateRequest({ params: idParamSchema }), closeBatchController);
claimsRoutes.get('/claims', requirePermission(P.CLAIMS_READ), validateRequest({ query: claimQuerySchema }), listClaimsController);
claimsRoutes.post('/claims', requirePermission(P.CLAIMS_MANAGE), validateRequest({ body: createClaimSchema }), createClaimController);
claimsRoutes.post('/claims/submit', requirePermission(P.CLAIMS_MANAGE), validateRequest({ body: submitClaimsSchema }), submitClaimsController);
claimsRoutes.get('/claims/:id', requirePermission(P.CLAIMS_READ), validateRequest({ params: idParamSchema }), getClaimController);
claimsRoutes.post('/claims/:id/cancel', requirePermission(P.CLAIMS_MANAGE), validateRequest({ params: idParamSchema, body: cancelClaimSchema }), cancelClaimController);
claimsRoutes.post('/claims/:id/query', requirePermission(P.CLAIMS_ADJUDICATE), validateRequest({ params: idParamSchema, body: queryClaimSchema }), queryClaimController);
claimsRoutes.post('/claims/:id/decision', requirePermission(P.CLAIMS_ADJUDICATE), validateRequest({ params: idParamSchema, body: adjudicateSchema }), adjudicateClaimController);
claimsRoutes.post('/claims/:id/payment', requirePermission(P.CLAIMS_ADJUDICATE), validateRequest({ params: idParamSchema, body: claimPaymentSchema }), claimPaymentController);

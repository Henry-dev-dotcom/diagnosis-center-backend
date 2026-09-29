import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  addMembership,
  adjudicateClaim,
  cancelClaim,
  claimCandidates,
  closeBatch,
  createClaim,
  createScheme,
  getClaim,
  listBatches,
  listClaims,
  listMemberships,
  listSchemes,
  queryClaim,
  recordClaimPayment,
  submitClaims,
  updateScheme
} from '../services/claims.service.js';

export const listSchemesController = asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, 'Schemes loaded', await listSchemes()));
export const createSchemeController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Scheme created', await createScheme(req.body, req)));
export const updateSchemeController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Scheme updated', await updateScheme(req.params.id, req.body, req)));
export const listMembershipsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Memberships loaded', await listMemberships(req.params.id)));
export const addMembershipController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Membership recorded', await addMembership(req.params.id, req.body, req)));
export const listClaimsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Claims loaded', await listClaims(req.query as never)));
export const candidatesController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Claimable visits loaded', await claimCandidates(req.query as never)));
export const getClaimController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Claim loaded', await getClaim(req.params.id)));
export const createClaimController = asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Claim prepared', await createClaim(req.body, req)));
export const cancelClaimController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Claim cancelled', await cancelClaim(req.params.id, req.body, req)));
export const submitClaimsController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Claims submitted', await submitClaims(req.body, req)));
export const queryClaimController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Query recorded', await queryClaim(req.params.id, req.body, req)));
export const adjudicateClaimController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Decision recorded', await adjudicateClaim(req.params.id, req.body, req)));
export const claimPaymentController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Payment applied', await recordClaimPayment(req.params.id, req.body, req)));
export const listBatchesController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Batches loaded', await listBatches(req.query as never)));
export const closeBatchController = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, 'Batch marked as sent', await closeBatch(req.params.id, req)));

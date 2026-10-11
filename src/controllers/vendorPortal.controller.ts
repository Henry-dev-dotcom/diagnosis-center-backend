import type { Request, Response } from 'express';
import { UserStatus } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import { clearVendorRefreshCookie, getVendorRefreshCookie, setVendorRefreshCookie } from '../utils/vendorPortalCookies.js';
import * as portal from '../services/vendorPortal.service.js';

function requestContext(req: Request) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null };
}

export const listPartnersController = asyncHandler(async (_req: Request, res: Response) =>
  sendSuccess(res, 'Vendor partners loaded', await portal.listVendorPartnersForPlatform())
);

export const createInvitationController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Platform administrator sign-in is required', 401, 'AUTH_REQUIRED');
  const result = await portal.createVendorInvitation(req.params.id, req.body, req.user.id, requestContext(req));
  return sendCreated(res, 'Vendor setup invitation created. Copy and share the one-time link securely.', result);
});

export const setVendorUserStatusController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Platform administrator sign-in is required', 401, 'AUTH_REQUIRED');
  const result = await portal.setVendorPortalUserStatus(req.params.userId, req.body.status as UserStatus, requestContext(req), req.user.id);
  return sendSuccess(res, 'Vendor account status updated', result);
});

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await portal.loginVendorPortal(req.body.email, req.body.password, requestContext(req));
  setVendorRefreshCookie(res, result.refreshToken);
  return sendSuccess(res, 'Vendor sign-in successful', { accessToken: result.accessToken, user: result.user });
});

export const activateInvitationController = asyncHandler(async (req: Request, res: Response) => {
  const result = await portal.activateVendorInvitation(req.body.token, req.body.password, requestContext(req));
  setVendorRefreshCookie(res, result.refreshToken);
  return sendSuccess(res, 'Account activated. You are signed in.', { accessToken: result.accessToken, user: result.user });
});

export const refreshController = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = getVendorRefreshCookie(req);
  if (!refreshToken) throw new AppError('Vendor refresh session is required', 401, 'VENDOR_REFRESH_REQUIRED');
  try {
    const result = await portal.refreshVendorPortalSession(refreshToken, requestContext(req));
    if (result.refreshToken) setVendorRefreshCookie(res, result.refreshToken);
    return sendSuccess(res, 'Vendor session refreshed', { accessToken: result.accessToken, user: result.user });
  } catch (error) {
    clearVendorRefreshCookie(res);
    throw error;
  }
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.vendorUser) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');
  await portal.logoutVendorPortal(req.vendorUser.sessionId, req.vendorUser);
  clearVendorRefreshCookie(res);
  return sendSuccess(res, 'Signed out', { loggedOut: true });
});

export const currentVendorController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.vendorUser) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');
  return sendSuccess(res, 'Vendor profile loaded', req.vendorUser);
});

export const listRequestsController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.vendorUser) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');
  return sendSuccess(res, 'Vendor requests loaded', await portal.listVendorRequests(req.vendorUser, req.query as never));
});

export const getRequestController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.vendorUser) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');
  return sendSuccess(res, 'Vendor request loaded', await portal.getVendorRequest(req.vendorUser, req.params.id));
});

export const updateRequestStatusController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.vendorUser) throw new AppError('Vendor sign-in is required', 401, 'VENDOR_AUTH_REQUIRED');
  return sendSuccess(res, 'Vendor request updated', await portal.updateVendorRequestStatus(req.vendorUser, req.params.id, req.body, requestContext(req)));
});

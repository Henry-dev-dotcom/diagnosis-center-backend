import { randomBytes, randomUUID } from 'node:crypto';
import { GustavRequestStatus, UserStatus, type Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from './prisma.service.js';
import { runAsSystem } from './tenantContext.js';
import { AppError } from '../utils/appError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { getRefreshExpiryDate, hashToken } from '../utils/token.js';
import { signVendorAccessToken, signVendorRefreshToken, verifyVendorRefreshToken } from '../utils/vendorPortalTokens.js';
import type { AuthenticatedVendor } from '../types/vendorPortal.js';

const GUSTAV_PARTNER_ID = 'gustav-biomed-limited';
const GUSTAV_PARTNER_CODE = 'GUSTAV_BIOMED';
const VENDOR_PUBLIC_REQUEST_SELECT = {
  id: true,
  requestCode: true,
  supplierName: true,
  type: true,
  status: true,
  requestingUnit: true,
  supplyCategory: true,
  itemDescription: true,
  quantity: true,
  quantityUnit: true,
  analyzerName: true,
  serviceDescription: true,
  preferredServiceDate: true,
  vendorStatusNote: true,
  statusUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  facility: { select: { id: true, name: true, code: true } }
} satisfies Prisma.GustavBiomedRequestSelect;

export type VendorRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function createVendorPortalAudit(input: {
  partnerId: string;
  vendorUserId?: string | null;
  actorPlatformUserId?: string | null;
  requestId?: string | null;
  action: string;
  previousStatus?: GustavRequestStatus | null;
  newStatus?: GustavRequestStatus | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return runAsSystem('vendor portal audit write', () => prisma.vendorPortalAudit.create({
    data: {
      partnerId: input.partnerId,
      vendorUserId: input.vendorUserId ?? null,
      actorPlatformUserId: input.actorPlatformUserId ?? null,
      requestId: input.requestId ?? null,
      action: input.action,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    }
  }));
}

function safeVendorUser(user: { id: string; partnerId: string; fullName: string; email: string; status: UserStatus; partner: { id: string; code: string; name: string; contactPhone: string | null } }) {
  return {
    id: user.id,
    partnerId: user.partnerId,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    partner: user.partner
  };
}

async function issueVendorSession(user: { id: string; partnerId: string; fullName: string; email: string; status: UserStatus; partner: { id: string; code: string; name: string; contactPhone: string | null } }, context: VendorRequestContext) {
  const session = await runAsSystem('vendor portal session creation', () => prisma.vendorPortalSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: `pending-${randomUUID()}`,
      expiresAt: getRefreshExpiryDate(),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null
    }
  }));
  const accessToken = signVendorAccessToken({ sub: user.id, sessionId: session.id, type: 'vendor_access' });
  const refreshToken = signVendorRefreshToken({ sub: user.id, sessionId: session.id, type: 'vendor_refresh' });
  await runAsSystem('vendor portal refresh-token hash write', () => prisma.vendorPortalSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(refreshToken) }
  }));
  await runAsSystem('vendor portal last-login update', () => prisma.vendorPortalUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  }));
  return { accessToken, refreshToken, user: safeVendorUser(user) };
}

export async function listVendorPartnersForPlatform() {
  const partners = await runAsSystem('platform vendor partner listing', () => prisma.vendorPartner.findMany({
    where: { code: GUSTAV_PARTNER_CODE },
    include: {
      users: { select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      invites: { where: { redeemedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, fullName: true, expiresAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }
    }
  }));
  return partners;
}

export async function createVendorInvitation(
  partnerId: string,
  input: { fullName: string; email: string },
  createdByUserId: string,
  context: VendorRequestContext
) {
  const partner = await runAsSystem('platform vendor invitation partner lookup', () => prisma.vendorPartner.findUnique({ where: { id: partnerId } }));
  if (!partner || partner.code !== GUSTAV_PARTNER_CODE || !partner.isActive) {
    throw new AppError('The vendor partner is unavailable', 404, 'VENDOR_PARTNER_NOT_FOUND');
  }
  const email = input.email.trim().toLowerCase();
  const existing = await runAsSystem('vendor invitation duplicate account check', () => prisma.vendorPortalUser.findUnique({ where: { partnerId_email: { partnerId, email } }, select: { id: true } }));
  if (existing) throw new AppError('An account already exists for this email address', 409, 'VENDOR_ACCOUNT_EXISTS');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const rawToken = randomBytes(32).toString('base64url');
  const invitation = await runAsSystem('platform vendor invitation creation', () => prisma.$transaction(async (tx) => {
    await tx.vendorPortalInvite.updateMany({
      where: { partnerId, email, redeemedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now }
    });
    return tx.vendorPortalInvite.create({
      data: {
        partnerId,
        fullName: input.fullName.trim(),
        email,
        tokenHash: hashToken(rawToken),
        createdByUserId,
        expiresAt
      }
    });
  }));
  await createVendorPortalAudit({ partnerId, actorPlatformUserId: createdByUserId, action: 'INVITATION_CREATED', ipAddress: context.ipAddress, userAgent: context.userAgent });

  const appUrl = new URL(env.FRONTEND_APP_URL ?? env.FRONTEND_URL);
  const basePath = appUrl.pathname.replace(/\/$/, '');
  const setupUrl = `${appUrl.origin}${basePath}/#/vendor/activate?token=${encodeURIComponent(rawToken)}`;
  return { id: invitation.id, email, fullName: invitation.fullName, expiresAt, setupUrl };
}

export async function setVendorPortalUserStatus(userId: string, status: UserStatus, context: VendorRequestContext, actorPlatformUserId: string) {
  if (status !== UserStatus.ACTIVE && status !== UserStatus.INACTIVE) {
    throw new AppError('Vendor accounts can only be activated or deactivated', 400, 'INVALID_VENDOR_ACCOUNT_STATUS');
  }
  return runAsSystem('platform vendor account status mutation', () => prisma.$transaction(async (tx) => {
    const user = await tx.vendorPortalUser.findUnique({ where: { id: userId }, include: { partner: true } });
    if (!user || user.partner.code !== GUSTAV_PARTNER_CODE) throw new AppError('Vendor account not found', 404, 'VENDOR_ACCOUNT_NOT_FOUND');
    await tx.vendorPortalUser.update({ where: { id: userId }, data: { status } });
    if (status !== UserStatus.ACTIVE) {
      await tx.vendorPortalSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await tx.vendorPortalAudit.create({
      data: {
        partnerId: user.partnerId,
        vendorUserId: user.id,
        actorPlatformUserId,
        action: `ACCOUNT_${status}`,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null
      }
    });
    return { id: user.id, fullName: user.fullName, email: user.email, status };
  }));
}

export async function activateVendorInvitation(token: string, password: string, context: VendorRequestContext) {
  const tokenHash = hashToken(token);
  const now = new Date();
  const result = await runAsSystem('vendor invitation activation', () => prisma.$transaction(async (tx) => {
    const invite = await tx.vendorPortalInvite.findUnique({ where: { tokenHash }, include: { partner: true } });
    if (!invite || invite.redeemedAt || invite.expiresAt <= now || !invite.partner.isActive || invite.partner.code !== GUSTAV_PARTNER_CODE) {
      throw new AppError('This invitation is invalid or expired. Ask the CurataMed administrator for a new link.', 400, 'VENDOR_INVITATION_INVALID');
    }
    const claimed = await tx.vendorPortalInvite.updateMany({
      where: { id: invite.id, redeemedAt: null, expiresAt: { gt: now } },
      data: { redeemedAt: now }
    });
    if (claimed.count !== 1) throw new AppError('This invitation has already been used', 409, 'VENDOR_INVITATION_USED');
    const user = await tx.vendorPortalUser.create({
      data: {
        partnerId: invite.partnerId,
        fullName: invite.fullName,
        email: invite.email,
        passwordHash: await hashPassword(password)
      },
      include: { partner: true }
    });
    await tx.vendorPortalAudit.create({ data: { partnerId: user.partnerId, vendorUserId: user.id, action: 'ACCOUNT_ACTIVATED', ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null } });
    return user;
  }));
  const session = await issueVendorSession(result, context);
  await createVendorPortalAudit({ partnerId: result.partnerId, vendorUserId: result.id, action: 'LOGIN_SUCCESS', ipAddress: context.ipAddress, userAgent: context.userAgent });
  return session;
}

export async function loginVendorPortal(emailInput: string, password: string, context: VendorRequestContext) {
  const email = emailInput.trim().toLowerCase();
  const user = await runAsSystem('vendor portal credential lookup', () => prisma.vendorPortalUser.findUnique({
    where: { partnerId_email: { partnerId: GUSTAV_PARTNER_ID, email } },
    include: { partner: true }
  }));
  const matches = user?.status === UserStatus.ACTIVE && user.partner.isActive && await verifyPassword(password, user.passwordHash);
  if (!matches || !user) {
    await createVendorPortalAudit({ partnerId: GUSTAV_PARTNER_ID, action: 'LOGIN_FAILED', ipAddress: context.ipAddress, userAgent: context.userAgent });
    throw new AppError('Email or password is incorrect', 401, 'VENDOR_LOGIN_FAILED');
  }
  const session = await issueVendorSession(user, context);
  await createVendorPortalAudit({ partnerId: user.partnerId, vendorUserId: user.id, action: 'LOGIN_SUCCESS', ipAddress: context.ipAddress, userAgent: context.userAgent });
  return session;
}

export async function refreshVendorPortalSession(refreshToken: string, context: VendorRequestContext) {
  let payload: ReturnType<typeof verifyVendorRefreshToken>;
  try {
    payload = verifyVendorRefreshToken(refreshToken);
  } catch (error) {
    const expired = error instanceof Error && error.name === 'TokenExpiredError';
    throw new AppError(expired ? 'Vendor refresh session has expired' : 'Invalid vendor refresh token', 401, expired ? 'VENDOR_REFRESH_EXPIRED' : 'INVALID_VENDOR_REFRESH_TOKEN');
  }
  const session = await runAsSystem('vendor refresh-session lookup', () => prisma.vendorPortalSession.findUnique({
    where: { id: payload.sessionId },
    include: { user: { include: { partner: true } } }
  }));
  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
    throw new AppError('Vendor refresh session is invalid or expired', 401, 'VENDOR_SESSION_INVALID');
  }
  if (session.user.status !== UserStatus.ACTIVE || !session.user.partner.isActive) {
    throw new AppError('Vendor account is not active', 403, 'VENDOR_ACCOUNT_INACTIVE');
  }
  const presentedHash = hashToken(refreshToken);
  const graceAccess = () => ({
    accessToken: signVendorAccessToken({ sub: session.user.id, sessionId: session.id, type: 'vendor_access' }),
    refreshToken: null,
    user: safeVendorUser(session.user)
  });
  if (session.refreshTokenHash !== presentedHash) {
    if (session.previousRefreshTokenHash === presentedHash && session.previousRefreshTokenValidUntil && session.previousRefreshTokenValidUntil > new Date()) {
      return graceAccess();
    }
    await runAsSystem('vendor refresh-reuse revocation', () => prisma.vendorPortalSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } }));
    await createVendorPortalAudit({ partnerId: session.user.partnerId, vendorUserId: session.user.id, action: 'REFRESH_REUSE_DETECTED', ipAddress: context.ipAddress, userAgent: context.userAgent });
    throw new AppError('Refresh token reuse detected; sign in again', 401, 'VENDOR_REFRESH_REUSE');
  }

  const accessToken = signVendorAccessToken({ sub: session.user.id, sessionId: session.id, type: 'vendor_access' });
  const refreshTokenNext = signVendorRefreshToken({ sub: session.user.id, sessionId: session.id, type: 'vendor_refresh' });
  const rotatedAt = new Date();
  const rotated = await runAsSystem('vendor refresh-token rotation', () => prisma.vendorPortalSession.updateMany({
    where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null, expiresAt: { gt: rotatedAt } },
    data: {
      previousRefreshTokenHash: presentedHash,
      previousRefreshTokenValidUntil: new Date(rotatedAt.getTime() + 30_000),
      refreshTokenHash: hashToken(refreshTokenNext),
      expiresAt: getRefreshExpiryDate(),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null
    }
  }));
  if (rotated.count !== 1) {
    const latest = await runAsSystem('vendor refresh-race lookup', () => prisma.vendorPortalSession.findUnique({ where: { id: session.id } }));
    const now = new Date();
    if (latest && !latest.revokedAt && latest.expiresAt > now && latest.previousRefreshTokenHash === presentedHash && latest.previousRefreshTokenValidUntil && latest.previousRefreshTokenValidUntil > now) {
      return graceAccess();
    }
    throw new AppError('Vendor refresh session changed; sign in again', 401, 'VENDOR_SESSION_INVALID');
  }
  return { accessToken, refreshToken: refreshTokenNext, user: safeVendorUser(session.user) };
}

export async function logoutVendorPortal(sessionId: string, vendorUser: AuthenticatedVendor) {
  await runAsSystem('vendor portal sign-out', () => prisma.vendorPortalSession.updateMany({ where: { id: sessionId, userId: vendorUser.id, revokedAt: null }, data: { revokedAt: new Date() } }));
  await createVendorPortalAudit({ partnerId: vendorUser.partnerId, vendorUserId: vendorUser.id, action: 'LOGOUT' });
}

const STATUS_TRANSITIONS: Record<GustavRequestStatus, GustavRequestStatus[]> = {
  [GustavRequestStatus.PENDING]: [GustavRequestStatus.ACKNOWLEDGED, GustavRequestStatus.SCHEDULED, GustavRequestStatus.DECLINED],
  [GustavRequestStatus.ACKNOWLEDGED]: [GustavRequestStatus.SCHEDULED, GustavRequestStatus.COMPLETED, GustavRequestStatus.DECLINED],
  [GustavRequestStatus.SCHEDULED]: [GustavRequestStatus.COMPLETED, GustavRequestStatus.DECLINED],
  [GustavRequestStatus.COMPLETED]: [],
  [GustavRequestStatus.DECLINED]: [],
  [GustavRequestStatus.CANCELLED]: []
};

function vendorRequestWhere(vendorUser: AuthenticatedVendor, filter: { status?: GustavRequestStatus; type?: string; search?: string } = {}) {
  const search = filter.search?.trim();
  return {
    supplierPartnerId: vendorUser.partnerId,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.type ? { type: filter.type as 'SUPPLY' | 'ANALYZER_MAINTENANCE' } : {}),
    ...(search ? {
      OR: [
        { requestCode: { contains: search, mode: 'insensitive' as const } },
        { requestingUnit: { contains: search, mode: 'insensitive' as const } },
        { itemDescription: { contains: search, mode: 'insensitive' as const } },
        { analyzerName: { contains: search, mode: 'insensitive' as const } },
        { serviceDescription: { contains: search, mode: 'insensitive' as const } },
        { facility: { name: { contains: search, mode: 'insensitive' as const } } },
        { facility: { code: { contains: search, mode: 'insensitive' as const } } }
      ]
    } : {})
  } satisfies Prisma.GustavBiomedRequestWhereInput;
}

export async function listVendorRequests(
  vendorUser: AuthenticatedVendor,
  query: { status?: GustavRequestStatus; type?: string; search?: string; cursor?: string; limit: number }
) {
  const where = vendorRequestWhere(vendorUser, query);
  return runAsSystem('vendor portal partner-scoped request list', async () => {
    const [rows, groupedCounts] = await Promise.all([
      prisma.gustavBiomedRequest.findMany({
        where,
        select: VENDOR_PUBLIC_REQUEST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: query.limit + 1
      }),
      prisma.gustavBiomedRequest.groupBy({
        by: ['status'],
        where: { supplierPartnerId: vendorUser.partnerId },
        _count: { _all: true }
      })
    ]);
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const counts = Object.fromEntries(Object.values(GustavRequestStatus).map((value) => [value, 0])) as Record<GustavRequestStatus, number>;
    for (const row of groupedCounts) counts[row.status] = row._count._all;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null, counts };
  });
}

export async function getVendorRequest(vendorUser: AuthenticatedVendor, id: string) {
  const request = await runAsSystem('vendor portal partner-scoped request detail', () => prisma.gustavBiomedRequest.findFirst({
    where: { id, supplierPartnerId: vendorUser.partnerId },
    select: VENDOR_PUBLIC_REQUEST_SELECT
  }));
  if (!request) throw new AppError('Request not found', 404, 'VENDOR_REQUEST_NOT_FOUND');
  return request;
}

export async function updateVendorRequestStatus(
  vendorUser: AuthenticatedVendor,
  id: string,
  input: { status: GustavRequestStatus; statusNote?: string },
  context: VendorRequestContext
) {
  return runAsSystem('vendor portal partner-scoped status update', () => prisma.$transaction(async (tx) => {
    const current = await tx.gustavBiomedRequest.findFirst({
      where: { id, supplierPartnerId: vendorUser.partnerId },
      select: { id: true, status: true }
    });
    if (!current) throw new AppError('Request not found', 404, 'VENDOR_REQUEST_NOT_FOUND');
    if (!STATUS_TRANSITIONS[current.status].includes(input.status)) {
      throw new AppError(`A ${current.status.toLowerCase()} request cannot be changed to ${input.status.toLowerCase()}`, 409, 'INVALID_VENDOR_REQUEST_TRANSITION');
    }
    const updated = await tx.gustavBiomedRequest.updateMany({
      where: { id, supplierPartnerId: vendorUser.partnerId, status: current.status },
      data: {
        status: input.status,
        ...(input.statusNote !== undefined ? { vendorStatusNote: input.statusNote } : {}),
        statusUpdatedById: null,
        statusUpdatedByVendorUserId: vendorUser.id,
        statusUpdatedAt: new Date()
      }
    });
    if (updated.count !== 1) throw new AppError('This request changed while you were updating it. Refresh and try again.', 409, 'VENDOR_REQUEST_CHANGED');
    const request = await tx.gustavBiomedRequest.findFirstOrThrow({
      where: { id, supplierPartnerId: vendorUser.partnerId },
      select: VENDOR_PUBLIC_REQUEST_SELECT
    });
    await tx.vendorPortalAudit.create({
      data: {
        partnerId: vendorUser.partnerId,
        vendorUserId: vendorUser.id,
        requestId: id,
        action: 'REQUEST_STATUS_UPDATED',
        previousStatus: current.status,
        newStatus: input.status,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null
      }
    });
    return request;
  }));
}

export function vendorPartnerId() {
  return GUSTAV_PARTNER_ID;
}

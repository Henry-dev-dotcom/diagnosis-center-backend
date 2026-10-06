import crypto from 'node:crypto';
import { FacilityStatus, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { runAsSystem, runWithFacility } from './tenantContext.js';
import { effectivePermissions, modulesForFacility, type CustomRoleLike } from './facilityAccess.service.js';
import { createAuditLog } from './audit.service.js';
import { subscriptionStateFor } from './subscription.service.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import {
  getRefreshExpiryDate,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../utils/token.js';
import { AppError } from '../utils/appError.js';

export type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type FacilitySummary = { id: string; code: string; name: string; logoDataUrl?: string | null; onboardingCompletedAt?: Date | null; receptionConfirmsOrders?: boolean };

function toFacilitySummary(facility: FacilitySummary | null | undefined): FacilitySummary | null {
  return facility
    ? { id: facility.id, code: facility.code, name: facility.name, logoDataUrl: facility.logoDataUrl ?? null, onboardingCompletedAt: facility.onboardingCompletedAt ?? null, receptionConfirmsOrders: facility.receptionConfirmsOrders ?? false }
    : null;
}

/** Shown to the app during a platform operator's read-only support session. */
export type SupportInfo = { impersonatorId: string; operatorName: string; reason: string | null; expiresAt: Date };

async function supportInfo(session: { impersonatorId: string | null; supportReason: string | null; expiresAt: Date }): Promise<SupportInfo | null> {
  if (!session.impersonatorId) return null;
  const operator = await runAsSystem('auth.support', () => prisma.user.findUnique({ where: { id: session.impersonatorId as string }, select: { name: true } }));
  return { impersonatorId: session.impersonatorId, operatorName: operator?.name ?? 'LHIMS support', reason: session.supportReason, expiresAt: session.expiresAt };
}

/** The signed-in user as the frontend sees it, including what they may use. */
async function sanitizeUser(user: {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: import('@prisma/client').UserRole;
  status: import('@prisma/client').UserStatus;
  lastLoginAt: Date | null;
  facility?: FacilitySummary | null;
  customRole?: CustomRoleLike | null;
  doctorProfile?: { id: string } | null;
}, support: SupportInfo | null = null) {
  const facility = toFacilitySummary(user.facility);
  const customRole = user.customRole && user.customRole.baseRole === user.role ? user.customRole : null;
  return {
    id: user.id,
    facilityId: facility?.id ?? null,
    facility,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    customRole: customRole ? { id: customRole.id, name: customRole.name } : null,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    permissions: effectivePermissions(user.role, customRole),
    // The clinician's own profile id, so their workspace finds their own orders
    // without needing the admin-only doctor list.
    doctorProfileId: user.doctorProfile?.id ?? null,
    modules: await modulesForFacility(facility?.id ?? null),
    subscription: facility ? await subscriptionStateFor(facility.id) : null,
    support
  };
}

/**
 * Staff sign in to one facility (by its code); platform administrators sign in
 * without a code. An unknown facility code fails exactly like a wrong password so
 * the login form does not reveal which facilities exist.
 */
export async function loginWithPassword(
  facilityCode: string | undefined,
  username: string,
  password: string,
  context: RequestContext
) {
  const normalizedUsername = username.trim().toLowerCase();
  if (!facilityCode) {
    return runAsSystem('auth.platform-login', () => authenticate(null, normalizedUsername, password, context));
  }

  const facility = await prisma.facility.findUnique({ where: { code: facilityCode } });
  if (!facility) {
    await createAuditLog({
      action: 'AUTH_LOGIN_FAILED',
      module: 'Authentication',
      details: { username: normalizedUsername, facilityCode, reason: 'FACILITY_NOT_FOUND' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }
  if (facility.status !== FacilityStatus.ACTIVE) {
    await createAuditLog({
      facilityId: facility.id,
      action: 'AUTH_LOGIN_BLOCKED',
      module: 'Authentication',
      details: { username: normalizedUsername, facilityCode, reason: `FACILITY_${facility.status}` },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('This facility account is not active. Contact support.', 403, 'FACILITY_NOT_ACTIVE');
  }

  return runWithFacility(facility.id, () => authenticate(facility, normalizedUsername, password, context));
}

async function authenticate(facility: FacilitySummary | null, normalizedUsername: string, password: string, context: RequestContext) {
  // Inside a facility context the tenant extension adds facilityId; for platform
  // sign-in only facility-less users may match.
  const user = await prisma.user.findFirst({
    where: { username: normalizedUsername, ...(facility ? {} : { facilityId: null, role: UserRole.PLATFORM_ADMIN }) },
    include: { customRole: true, doctorProfile: { select: { id: true } } }
  });

  if (!user) {
    await createAuditLog({
      action: 'AUTH_LOGIN_FAILED',
      module: 'Authentication',
      details: { username: normalizedUsername, reason: 'USER_NOT_FOUND' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status !== UserStatus.ACTIVE) {
    await createAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN_BLOCKED',
      module: 'Authentication',
      details: { username: normalizedUsername, status: user.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('User account is not active', 403, 'USER_NOT_ACTIVE');
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    await createAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN_FAILED',
      module: 'Authentication',
      details: { username: normalizedUsername, reason: 'INVALID_PASSWORD' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  return issueSession(user, facility, context);
}

type SessionUser = Parameters<typeof sanitizeUser>[0];

/**
 * Opens a session for a user and returns its tokens. A support session
 * (opened by a platform operator) has a fixed, short expiry, is read-only
 * (see requireAuth), and does not count as the user signing in.
 */
export async function issueSession(
  user: SessionUser,
  facility: FacilitySummary | null,
  context: RequestContext,
  support?: { impersonatorId: string; reason: string; expiresAt: Date }
) {
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshToken: `pending-${crypto.randomUUID()}`,
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
      expiresAt: support?.expiresAt ?? getRefreshExpiryDate(),
      impersonatorId: support?.impersonatorId ?? null,
      supportReason: support?.reason ?? null
    }
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    sessionId: session.id,
    type: 'access'
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    sessionId: session.id,
    type: 'refresh'
  });

  await prisma.userSession.update({ where: { id: session.id }, data: { refreshToken: hashToken(refreshToken) } });
  if (!support) await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await createAuditLog({
    actorId: support ? support.impersonatorId : user.id,
    actorRole: support ? UserRole.PLATFORM_ADMIN : user.role,
    action: support ? 'AUTH_SUPPORT_SESSION_STARTED' : 'AUTH_LOGIN_SUCCESS',
    module: 'Authentication',
    entityType: 'UserSession',
    entityId: session.id,
    details: support ? { asUserId: user.id, reason: support.reason, expiresAt: support.expiresAt } : undefined,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return {
    user: await sanitizeUser({ ...user, facility, lastLoginAt: support ? user.lastLoginAt : new Date() }, support ? await supportInfo({ impersonatorId: support.impersonatorId, supportReason: support.reason, expiresAt: support.expiresAt }) : null),
    accessToken,
    refreshToken
  };
}

export async function refreshTokenPair(refreshToken: string, context: RequestContext) {
  const payload = verifyRefreshToken(refreshToken);
  if (payload.type !== 'refresh') {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sessionId },
    include: { user: { include: { facility: true, customRole: true, doctorProfile: { select: { id: true } } } } }
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError('Refresh session is invalid or expired', 401, 'REFRESH_SESSION_INVALID');
  }

  if (session.refreshToken !== hashToken(refreshToken)) {
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await createAuditLog({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'AUTH_REFRESH_REUSE_DETECTED',
      module: 'Authentication',
      entityType: 'UserSession',
      entityId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    throw new AppError('Refresh token reuse detected', 401, 'REFRESH_REUSE_DETECTED');
  }

  if (session.user.facility && session.user.facility.status !== FacilityStatus.ACTIVE) {
    throw new AppError('This facility account is not active. Contact support.', 403, 'FACILITY_NOT_ACTIVE');
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    throw new AppError('User account is not active', 403, 'USER_NOT_ACTIVE');
  }

  const newAccessToken = signAccessToken({
    sub: session.user.id,
    role: session.user.role,
    sessionId: session.id,
    type: 'access'
  });
  const newRefreshToken = signRefreshToken({
    sub: session.user.id,
    role: session.user.role,
    sessionId: session.id,
    type: 'refresh'
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshToken: hashToken(newRefreshToken),
      // A support session never outlives its fixed window.
      expiresAt: session.impersonatorId ? session.expiresAt : getRefreshExpiryDate()
    }
  });

  await createAuditLog({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: 'AUTH_TOKEN_REFRESHED',
    module: 'Authentication',
    entityType: 'UserSession',
    entityId: session.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return {
    user: await sanitizeUser(session.user, await supportInfo(session)),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  };
}

export async function logoutSession(sessionId: string, userId: string, context: RequestContext) {
  const session = await prisma.userSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return;

  await prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  const user = await findSelf(userId);
  await createAuditLog({
    actorId: userId,
    actorRole: user?.role ?? null,
    action: 'AUTH_LOGOUT',
    module: 'Authentication',
    entityType: 'UserSession',
    entityId: sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });
}

export async function logoutByRefreshToken(refreshToken: string, context: RequestContext) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await prisma.userSession.findUnique({ where: { id: payload.sessionId } });
  if (!session) return;

  await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await createAuditLog({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'AUTH_LOGOUT',
    module: 'Authentication',
    entityType: 'UserSession',
    entityId: session.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });
}

// The signed-in user's own row, by the id from their verified session. Runs as
// system so it also works for platform administrators, who have no facility.
function findSelf(userId: string) {
  return runAsSystem('auth.self', () => prisma.user.findUnique({ where: { id: userId }, include: { facility: true, customRole: true, doctorProfile: { select: { id: true } } } }));
}

export async function getCurrentUser(userId: string, sessionId: string) {
  const user = await findSelf(userId);
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AppError('Current user is unavailable', 401, 'USER_UNAVAILABLE');
  }

  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError('Session is invalid or expired', 401, 'SESSION_INVALID');
  }

  return await sanitizeUser(user, await supportInfo(session));
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, context: RequestContext) {
  const user = await findSelf(userId);
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');

  const passwordHash = await hashPassword(newPassword);
  await runAsSystem('auth.self', () =>
    prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ])
  );

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'AUTH_PASSWORD_CHANGED',
    module: 'Authentication',
    entityType: 'User',
    entityId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });
}

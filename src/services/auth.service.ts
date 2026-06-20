import crypto from 'node:crypto';
import { UserStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { getPermissionsForRole } from './permission.service.js';
import { createAuditLog } from './audit.service.js';
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

function sanitizeUser(user: {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: import('@prisma/client').UserRole;
  status: import('@prisma/client').UserStatus;
  lastLoginAt: Date | null;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    permissions: getPermissionsForRole(user.role)
  };
}

export async function loginWithPassword(username: string, password: string, context: RequestContext) {
  const normalizedUsername = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });

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

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshToken: `pending-${crypto.randomUUID()}`,
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
      expiresAt: getRefreshExpiryDate()
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

  await prisma.$transaction([
    prisma.userSession.update({
      where: { id: session.id },
      data: { refreshToken: hashToken(refreshToken) }
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })
  ]);

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'AUTH_LOGIN_SUCCESS',
    module: 'Authentication',
    entityType: 'UserSession',
    entityId: session.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return {
    user: sanitizeUser({ ...user, lastLoginAt: new Date() }),
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
    include: { user: true }
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
      expiresAt: getRefreshExpiryDate()
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
    user: sanitizeUser(session.user),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  };
}

export async function logoutSession(sessionId: string, userId: string, context: RequestContext) {
  const session = await prisma.userSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return;

  await prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  const user = await prisma.user.findUnique({ where: { id: userId } });
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

export async function getCurrentUser(userId: string, sessionId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AppError('Current user is unavailable', 401, 'USER_UNAVAILABLE');
  }

  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError('Session is invalid or expired', 401, 'SESSION_INVALID');
  }

  return sanitizeUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, context: RequestContext) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);

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

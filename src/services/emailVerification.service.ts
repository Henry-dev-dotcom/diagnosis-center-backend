import crypto from 'node:crypto';
import { prisma } from './prisma.service.js';
import { runAsSystem } from './tenantContext.js';
import { createAuditLog } from './audit.service.js';
import { sendMail } from './mailer.service.js';
import { hashToken } from '../utils/token.js';
import { AppError } from '../utils/appError.js';
import type { RequestContext } from './auth.service.js';

const TOKEN_TTL_HOURS = 24;

const INVALID_LINK_MESSAGE = 'This verification link is invalid or has expired. Request a new one.';

/**
 * Emails a single-use verification link to the account's address. Mirrors the
 * password-reset pattern: the token is random 32 bytes, only its SHA-256 hash
 * is stored, and asking for a new link retires every previous one.
 *
 * linkBaseUrl is the public base of this API (including the API prefix),
 * resolved by the controller from API_PUBLIC_URL or the incoming request.
 */
export async function requestEmailVerification(userId: string, linkBaseUrl: string, context: RequestContext) {
  const user = await runAsSystem('auth.email-verification', () => prisma.user.findUnique({ where: { id: userId } }));
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  if (!user.email) {
    throw new AppError('Add an email address to the account before verifying it.', 400, 'EMAIL_NOT_SET');
  }
  if (user.emailVerifiedAt) {
    return { alreadyVerified: true as const, delivered: 'disabled' as const };
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await runAsSystem('auth.email-verification', async () => {
    // One live link per account: previous ones stop working immediately.
    await prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });
    await prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt }
    });
  });

  const link = `${linkBaseUrl}/auth/email/verify?token=${encodeURIComponent(token)}`;
  const delivered = await sendMail({
    to: user.email,
    subject: 'Verify your LHIMS email address',
    text: [
      `Hello ${user.name},`,
      '',
      'Confirm this email address belongs to you by opening the link below within 24 hours:',
      link,
      '',
      'If you did not ask for this, ignore this message; nothing changes.'
    ].join('\n')
  });

  // The token itself never appears in the audit trail or the logs.
  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'AUTH_EMAIL_VERIFICATION_SENT',
    module: 'Authentication',
    entityType: 'User',
    entityId: user.id,
    details: { delivered },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return { alreadyVerified: false as const, delivered };
}

/** Marks the account's email as verified when the token is genuine, unused and unexpired. */
export async function verifyEmailToken(token: string, context: RequestContext) {
  if (!token || token.length < 20) {
    throw new AppError(INVALID_LINK_MESSAGE, 400, 'EMAIL_VERIFICATION_INVALID');
  }

  const record = await runAsSystem('auth.email-verification', () =>
    prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  );

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(INVALID_LINK_MESSAGE, 400, 'EMAIL_VERIFICATION_INVALID');
  }

  await runAsSystem('auth.email-verification', () =>
    prisma.$transaction([
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } })
    ])
  );

  await createAuditLog({
    actorId: record.userId,
    actorRole: record.user.role,
    action: 'AUTH_EMAIL_VERIFIED',
    module: 'Authentication',
    entityType: 'User',
    entityId: record.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return { email: record.user.email };
}

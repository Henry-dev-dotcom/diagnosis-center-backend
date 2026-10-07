import crypto from 'node:crypto';
import { prisma } from './prisma.service.js';
import { runAsSystem } from './tenantContext.js';
import { createAuditLog } from './audit.service.js';
import { sendMail } from './mailer.service.js';
import { hashToken } from '../utils/token.js';
import { AppError } from '../utils/appError.js';
import { env } from '../config/env.js';
import type { RequestContext } from './auth.service.js';

const TOKEN_TTL_HOURS = 24;

const INVALID_LINK_MESSAGE = 'This verification link is invalid or has expired. Request a new one.';

/**
 * Emails a single-use verification link to the account's address. Mirrors the
 * password-reset pattern: the token is random 32 bytes, only its SHA-256 hash
 * is stored, and asking for a new link retires every previous one.
 *
 * The link points at a page in the web app, not at this API, and that page asks
 * the person to press a button before anything is consumed. A link that did the
 * work itself on being opened would be spent by the first mail scanner to fetch
 * it - corporate gateways open every link in a message to check it - and the
 * person would arrive to be told it had expired.
 */
export async function requestEmailVerification(userId: string, context: RequestContext) {
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

  // From configuration, never from a request header: a link built from the Host
  // header can be aimed at a site the attacker controls.
  const appBase = (env.FRONTEND_APP_URL ?? env.FRONTEND_URL).replace(/\/+$/, '');
  const link = `${appBase}/#/verify-email/${encodeURIComponent(token)}`;
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
    facilityId: user.facilityId,
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

  /*
    Spend the token and mark the address verified together, atomically.

    Reading the token and then updating it left a gap in which two requests
    carrying the same link could both pass the check. The conditional update
    below only succeeds for the first of them, because it matches on the token
    still being unused and unexpired, and the other finds nothing to update.
  */
  await runAsSystem('auth.email-verification', () =>
    prisma.$transaction(async (tx) => {
      const spent = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() }
      });
      if (spent.count !== 1) throw new AppError(INVALID_LINK_MESSAGE, 400, 'EMAIL_VERIFICATION_INVALID');
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    })
  );

  await createAuditLog({
    actorId: record.userId,
    actorRole: record.user.role,
    facilityId: record.user.facilityId,
    action: 'AUTH_EMAIL_VERIFIED',
    module: 'Authentication',
    entityType: 'User',
    entityId: record.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return { email: record.user.email };
}

import type { Request } from 'express';
import { DemoRequestStatus, FacilityStatus, SubscriptionInvoiceKind, SubscriptionInvoiceStatus, SubscriptionStatus, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { runAsSystem, runWithFacility } from './tenantContext.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { issueSession } from './auth.service.js';
import { priceFor } from './subscription.service.js';
import { AppError } from '../utils/appError.js';

/*
  Phase 6: the platform operator's console. Business metrics across every
  facility, and read-only support sessions. Support access is off when the
  facility has switched it off, lasts 30 minutes, needs a reason, and is
  written to the facility's own audit log so its administrator can see it.
*/

const DAY_MS = 86_400_000;
const round2 = (v: number) => Math.round(v * 100) / 100;
export const SUPPORT_SESSION_MINUTES = 30;

export async function platformMetrics(now = new Date()) {
  return runAsSystem('platform.metrics', async () => {
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const [facilities, subscriptions, paid, failed, demoNew] = await Promise.all([
      prisma.facility.findMany({ select: { id: true, status: true, signupSource: true, createdAt: true } }),
      prisma.subscription.findMany({ include: { facility: { select: { id: true, code: true, name: true } }, plan: { select: { name: true } } } }),
      prisma.subscriptionInvoice.findMany({ where: { status: SubscriptionInvoiceStatus.PAID, paidAt: { gte: sixMonthsAgo } }, select: { amount: true, paidAt: true } }),
      prisma.subscriptionInvoice.findMany({
        where: { status: SubscriptionInvoiceStatus.OPEN, kind: SubscriptionInvoiceKind.RENEWAL },
        select: { invoiceNumber: true, amount: true, attempts: true, lastError: true, createdAt: true, facility: { select: { code: true, name: true } }, subscription: { select: { status: true, graceEndsAt: true } } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.demoRequest.count({ where: { status: DemoRequestStatus.NEW } })
    ]);

    // Recurring revenue: what paying subscriptions (active or in grace) cost per month today.
    const paying = subscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE || s.status === SubscriptionStatus.PAST_DUE);
    let mrr = 0;
    for (const s of paying) {
      const price = await priceFor(s.planId, s.addOnModules, s.interval).catch(() => null);
      mrr += price?.monthlyEquivalent ?? 0;
    }

    const byStatus = Object.fromEntries(Object.values(SubscriptionStatus).map((st) => [st, subscriptions.filter((s) => s.status === st).length]));
    const cancelled30 = subscriptions.filter((s) => s.status === SubscriptionStatus.CANCELLED && s.cancelledAt && s.cancelledAt >= since30).length;
    const churnBase = paying.length + cancelled30;

    const months: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      months.push({ month: key, revenue: round2(paid.filter((p) => p.paidAt && p.paidAt.toISOString().slice(0, 7) === key).reduce((t, p) => t + Number(p.amount), 0)) });
    }

    const trialsEnding = subscriptions
      .filter((s) => s.status === SubscriptionStatus.TRIALING && s.trialEndsAt && s.trialEndsAt.getTime() - now.getTime() <= 7 * DAY_MS)
      .map((s) => ({ facility: s.facility, plan: s.plan.name, trialEndsAt: s.trialEndsAt }))
      .sort((a, b) => (a.trialEndsAt as Date).getTime() - (b.trialEndsAt as Date).getTime());

    return {
      currency: 'GHS',
      mrr: round2(mrr),
      arr: round2(mrr * 12),
      facilities: {
        total: facilities.length,
        active: facilities.filter((f) => f.status === FacilityStatus.ACTIVE).length,
        selfService: facilities.filter((f) => f.signupSource === 'SELF_SERVICE').length,
        new30: facilities.filter((f) => f.createdAt >= since30).length,
        platformManaged: facilities.length - subscriptions.length
      },
      subscriptions: byStatus,
      churn30: { cancelled: cancelled30, rate: churnBase ? round2((cancelled30 / churnBase) * 100) : 0 },
      revenue30: round2(paid.filter((p) => p.paidAt && p.paidAt >= since30).reduce((t, p) => t + Number(p.amount), 0)),
      revenueByMonth: months,
      trialsEnding,
      failedPayments: failed.map((f) => ({ ...f, amount: round2(Number(f.amount)) })),
      demoRequestsNew: demoNew
    };
  });
}

/**
 * Opens a read-only session as the facility's first active administrator.
 * The operator's own session is untouched; the support session is a separate
 * sign-in that expires on its own.
 */
export async function startSupportSession(facilityId: string, reason: string, req: Request) {
  const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new AppError('Facility not found', 404, 'FACILITY_NOT_FOUND');
  if (facility.status !== FacilityStatus.ACTIVE) throw new AppError('The facility is not active', 409, 'FACILITY_NOT_ACTIVE');
  if (!facility.allowSupportAccess) throw new AppError('This facility has switched off support access. Its administrator can turn it on under Facility setup.', 403, 'SUPPORT_ACCESS_DISABLED');
  const operator = req.user;
  if (!operator || operator.role !== UserRole.PLATFORM_ADMIN) throw new AppError('Only platform operators can open support sessions', 403, 'FORBIDDEN_ROLE');

  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MINUTES * 60_000);
  const context = { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null };
  const result = await runWithFacility(facility.id, async () => {
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE }, orderBy: { createdAt: 'asc' }, include: { customRole: true } });
    if (!admin) throw new AppError('The facility has no active administrator to support', 409, 'NO_FACILITY_ADMIN');
    const session = await issueSession(admin, facility, context, { impersonatorId: operator.id, reason, expiresAt });
    // In the facility's own log, so its administrator can see who looked and why.
    await createAuditLog({
      facilityId: facility.id,
      actorId: operator.id,
      actorRole: UserRole.PLATFORM_ADMIN,
      action: 'SUPPORT_SESSION_STARTED',
      module: 'Support',
      entityType: 'User',
      entityId: admin.id,
      details: { operator: operator.name, reason, expiresAt, readOnly: true },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return session;
  });
  await createAuditLog({ ...getRequestAuditContext(req), facilityId: null, action: 'SUPPORT_SESSION_STARTED', module: 'Platform', entityType: 'Facility', entityId: facility.id, details: { reason, expiresAt } });
  return { ...result, expiresAt };
}

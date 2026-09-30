import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';
import { remindersDue } from '../src/services/subscription.service.js';

const now = new Date('2026-10-10T08:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
const base = {
  status: SubscriptionStatus.ACTIVE,
  trialEndsAt: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  gatewayAuthorizationHint: null,
  gatewayAuthorizationCode: null,
  plan: { name: 'Starter', maxPatientsPerMonth: null, maxStorageMb: null }
};
const keys = (s: Partial<typeof base> & Record<string, unknown>, usage: { patientsThisMonth: number; storageMb: number } | null = null) =>
  remindersDue({ ...base, ...s } as Parameters<typeof remindersDue>[0], usage, now).map((r) => r.key.split(':')[0]);

describe('subscription reminders', () => {
  it('warns 3 days and 1 day before a trial ends, and not earlier', () => {
    expect(keys({ status: SubscriptionStatus.TRIALING, trialEndsAt: inDays(10) })).toEqual([]);
    expect(keys({ status: SubscriptionStatus.TRIALING, trialEndsAt: inDays(2.5) })).toEqual(['TRIAL_3D']);
    expect(keys({ status: SubscriptionStatus.TRIALING, trialEndsAt: inDays(0.5) })).toEqual(['TRIAL_1D']);
    expect(keys({ status: SubscriptionStatus.TRIALING, trialEndsAt: inDays(-1) })).toEqual([]);
  });

  it('announces a renewal, saying whether a saved method will be charged', () => {
    const saved = remindersDue({ ...base, currentPeriodEnd: inDays(2), gatewayAuthorizationCode: 'AUTH', gatewayAuthorizationHint: 'Visa ending 4081' }, null, now);
    expect(saved[0].key).toBe('RENEWAL_3D:2026-10-12');
    expect(saved[0].body).toContain('Visa ending 4081 will be charged');
    const none = remindersDue({ ...base, currentPeriodEnd: inDays(2) }, null, now);
    expect(none[0].body).toContain('No payment method is saved');
    expect(keys({ currentPeriodEnd: inDays(2), cancelAtPeriodEnd: true })).toEqual(['ENDING_3D']);
  });

  it('tells the facility about failed payments, read-only and a recent end', () => {
    expect(keys({ status: SubscriptionStatus.PAST_DUE, graceEndsAt: inDays(5) })).toEqual(['PAST_DUE']);
    expect(keys({ status: SubscriptionStatus.SUSPENDED, currentPeriodEnd: inDays(-8) })).toEqual(['SUSPENDED']);
    expect(keys({ status: SubscriptionStatus.CANCELLED, cancelledAt: inDays(-1) })).toEqual(['CANCELLED']);
    expect(keys({ status: SubscriptionStatus.CANCELLED, cancelledAt: inDays(-30) })).toEqual([]);
  });

  it('flags fair-use overruns once a month, without blocking anything', () => {
    const plan = { name: 'Starter', maxPatientsPerMonth: 100, maxStorageMb: 500 };
    expect(keys({ plan }, { patientsThisMonth: 100, storageMb: 500 })).toEqual([]);
    const over = remindersDue({ ...base, plan }, { patientsThisMonth: 101, storageMb: 750.5 }, now);
    expect(over.map((r) => r.key)).toEqual(['FAIRUSE_PATIENTS:2026-10', 'FAIRUSE_STORAGE:2026-10']);
    expect(over[0].body).toContain('Nothing is blocked');
  });
});

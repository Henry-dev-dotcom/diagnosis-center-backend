import { describe, expect, it } from 'vitest';
import { GustavRequestStatus, UserStatus } from '@prisma/client';
import {
  vendorInviteActivationSchema,
  vendorInviteSchema,
  vendorLoginSchema,
  vendorPortalUserStatusSchema,
  vendorRequestListQuerySchema,
  vendorRequestStatusSchema
} from '../src/validators/vendorPortal.validators.js';

describe('Gustav Biomed vendor portal validation', () => {
  it('normalizes vendor login email and rejects malformed identities', () => {
    const result = vendorLoginSchema.safeParse({ email: '  HEAD@GUSTAVBIOMED.COM ', password: 'not-the-password' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('head@gustavbiomed.com');
    expect(vendorLoginSchema.safeParse({ email: 'not-an-email', password: 'abc' }).success).toBe(false);
  });

  it('trims invitation details and requires a valid contact email', () => {
    const result = vendorInviteSchema.safeParse({ fullName: '  Head of Service  ', email: 'SERVICE@GUSTAVBIOMED.COM ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Head of Service');
      expect(result.data.email).toBe('service@gustavbiomed.com');
    }
  });

  it('requires a strong password and a sufficiently long single-use setup token', () => {
    const accepted = vendorInviteActivationSchema.safeParse({ token: 't'.repeat(43), password: 'StrongPass7' });
    expect(accepted.success).toBe(true);
    expect(vendorInviteActivationSchema.safeParse({ token: 'short', password: 'StrongPass7' }).success).toBe(false);
    expect(vendorInviteActivationSchema.safeParse({ token: 't'.repeat(43), password: 'weakpass' }).success).toBe(false);
  });

  it('parses safe request filters and supplies a bounded default page size', () => {
    const defaults = vendorRequestListQuerySchema.parse({});
    expect(defaults.limit).toBe(50);
    const parsed = vendorRequestListQuerySchema.parse({ status: GustavRequestStatus.PENDING, type: 'SUPPLY', limit: '25', search: '  GBR-1 ' });
    expect(parsed.limit).toBe(25);
    expect(parsed.search).toBe('GBR-1');
    expect(vendorRequestListQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
  });

  it('allows only supplier-appropriate status transitions and requires actionable notes', () => {
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.ACKNOWLEDGED }).success).toBe(true);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.COMPLETED }).success).toBe(true);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.SCHEDULED }).success).toBe(false);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.SCHEDULED, statusNote: '   ' }).success).toBe(false);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.SCHEDULED, statusNote: 'Book Tuesday at 10:00' }).success).toBe(true);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.DECLINED, statusNote: 'Need stock' }).success).toBe(true);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.DECLINED, statusNote: 'No' }).success).toBe(false);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.PENDING }).success).toBe(false);
    expect(vendorRequestStatusSchema.safeParse({ status: GustavRequestStatus.CANCELLED }).success).toBe(false);
  });

  it('lets platform operators activate or deactivate vendor access only', () => {
    expect(vendorPortalUserStatusSchema.parse({ status: UserStatus.ACTIVE }).status).toBe(UserStatus.ACTIVE);
    expect(vendorPortalUserStatusSchema.parse({ status: UserStatus.INACTIVE }).status).toBe(UserStatus.INACTIVE);
    expect(vendorPortalUserStatusSchema.safeParse({ status: UserStatus.SUSPENDED }).success).toBe(false);
  });
});

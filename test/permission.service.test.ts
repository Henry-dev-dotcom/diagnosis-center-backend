import { describe, it, expect } from 'vitest';
import { UserRole } from '@prisma/client';
import {
  getPermissionsForRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getAccessMatrix
} from '../src/services/permission.service.js';
import { PERMISSIONS } from '../src/config/permissions.js';

describe('permission resolution', () => {
  describe('ADMIN wildcard', () => {
    it('grants ADMIN every permission via the "*" wildcard', () => {
      // Every concrete permission should resolve true for ADMIN.
      for (const permission of Object.values(PERMISSIONS)) {
        expect(hasPermission(UserRole.ADMIN, permission)).toBe(true);
      }
    });

    it('grants ADMIN even an unknown/future permission string', () => {
      expect(hasPermission(UserRole.ADMIN, 'some:future:permission')).toBe(true);
    });

    it('exposes the literal "*" in the ADMIN permission list', () => {
      expect(getPermissionsForRole(UserRole.ADMIN)).toContain('*');
    });
  });

  describe('non-admin roles are scoped', () => {
    it('grants DOCTOR its own order-create permission', () => {
      expect(hasPermission(UserRole.DOCTOR, PERMISSIONS.DOCTOR_ORDERS_CREATE)).toBe(true);
    });

    it('denies DOCTOR a billing-management permission it should not hold', () => {
      expect(hasPermission(UserRole.DOCTOR, PERMISSIONS.BILLING_INVOICES_MANAGE)).toBe(false);
    });

    it('denies DOCTOR an unknown permission (no wildcard)', () => {
      expect(hasPermission(UserRole.DOCTOR, 'some:future:permission')).toBe(false);
    });

    it('grants BILLING_STAFF finance shift management but not lab sign-off', () => {
      expect(hasPermission(UserRole.BILLING_STAFF, PERMISSIONS.FINANCE_SHIFTS_MANAGE)).toBe(true);
      expect(hasPermission(UserRole.BILLING_STAFF, PERMISSIONS.LAB_RESULTS_SIGN_OFF)).toBe(false);
    });

    it('does not let LAB_STAFF sign off scan results (cross-department isolation)', () => {
      expect(hasPermission(UserRole.LAB_STAFF, PERMISSIONS.SCAN_RESULTS_SIGN_OFF)).toBe(false);
    });
  });

  describe('hasAnyPermission / hasAllPermissions', () => {
    it('hasAnyPermission is true when at least one matches', () => {
      expect(
        hasAnyPermission(UserRole.DOCTOR, [
          PERMISSIONS.BILLING_INVOICES_MANAGE,
          PERMISSIONS.DOCTOR_ORDERS_CREATE
        ])
      ).toBe(true);
    });

    it('hasAnyPermission is false when none match', () => {
      expect(
        hasAnyPermission(UserRole.DOCTOR, [
          PERMISSIONS.BILLING_INVOICES_MANAGE,
          PERMISSIONS.LAB_RESULTS_SIGN_OFF
        ])
      ).toBe(false);
    });

    it('hasAllPermissions requires every permission', () => {
      expect(
        hasAllPermissions(UserRole.DOCTOR, [
          PERMISSIONS.DOCTOR_ORDERS_CREATE,
          PERMISSIONS.DOCTOR_RESULTS_READ_OWN
        ])
      ).toBe(true);

      expect(
        hasAllPermissions(UserRole.DOCTOR, [
          PERMISSIONS.DOCTOR_ORDERS_CREATE,
          PERMISSIONS.BILLING_INVOICES_MANAGE
        ])
      ).toBe(false);
    });

    it('hasAllPermissions is vacuously true for an empty list', () => {
      expect(hasAllPermissions(UserRole.RECEPTIONIST, [])).toBe(true);
    });

    it('hasAnyPermission is false for an empty list', () => {
      expect(hasAnyPermission(UserRole.RECEPTIONIST, [])).toBe(false);
    });
  });

  describe('getPermissionsForRole returns a copy', () => {
    it('mutating the returned array does not affect later calls', () => {
      const first = getPermissionsForRole(UserRole.DOCTOR);
      const originalLength = first.length;
      first.push('injected:permission');
      const second = getPermissionsForRole(UserRole.DOCTOR);
      expect(second).toHaveLength(originalLength);
      expect(second).not.toContain('injected:permission');
    });
  });

  describe('access matrix', () => {
    it('produces one summary entry per role', () => {
      const matrix = getAccessMatrix();
      expect(matrix).toHaveLength(Object.values(UserRole).length);
      for (const entry of matrix) {
        expect(entry).toHaveProperty('role');
        expect(entry).toHaveProperty('permissions');
        expect(entry).toHaveProperty('canViewPrices');
      }
    });
  });
});

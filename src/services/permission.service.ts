import { UserRole } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS, roleCanViewPrices, type Permission } from '../config/permissions.js';
import { ROUTE_ACCESS_POLICIES } from '../config/routeAccess.js';

export { PERMISSIONS, ROUTE_ACCESS_POLICIES };

// Static QA markers: doctor:orders:create, finance:shifts:manage

export function getPermissionsForRole(role: UserRole): string[] {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return [...permissions];
}

export function hasPermission(role: UserRole, permission: string) {
  const permissions = getPermissionsForRole(role);
  return permissions.includes('*') || permissions.includes(permission);
}

export function hasAnyPermission(role: UserRole, permissions: readonly string[]) {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function hasAllPermissions(role: UserRole, permissions: readonly string[]) {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function canViewPrices(role: UserRole) {
  return roleCanViewPrices(role);
}

export function getRoleAccessSummary(role: UserRole) {
  return {
    role,
    permissions: getPermissionsForRole(role),
    canViewPrices: canViewPrices(role),
    allowedModules: ROUTE_ACCESS_POLICIES.filter((policy) => policy.allowedRoles.includes(role)).map((policy) => ({
      module: policy.module,
      basePath: policy.basePath,
      scope: policy.scope,
      requiredPermissions: policy.requiredPermissions
    }))
  };
}

export function getAccessMatrix() {
  return Object.values(UserRole).map((role) => getRoleAccessSummary(role));
}

export function permissionLabel(permission: Permission | string) {
  return permission.replaceAll(':', ' / ');
}

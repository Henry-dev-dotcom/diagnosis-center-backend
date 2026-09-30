import { CatalogItemType, type UserRole } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../config/permissions.js';
import { MODULES, isModuleKey, type ModuleKey } from '../config/modules.js';
import { prisma } from './prisma.service.js';
import { currentFacilityId, runWithFacility } from './tenantContext.js';
import { modulesCache } from './accessCache.js';
import { AppError } from '../utils/appError.js';

/**
 * What a signed-in user may do: the facility's switched-on modules and the
 * user's effective permissions. Computed once per request in requireAuth and
 * returned to the frontend at sign-in so it can hide what is unavailable.
 */

/**
 * Permissions a facility may put in a custom role. Platform scope never; admin
 * scope neither, because custom roles build on staff workspaces and the /admin
 * routes require the ADMIN role anyway.
 */
export const ASSIGNABLE_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS).filter(
  (p) => !p.startsWith('platform:') && !p.startsWith('admin:')
);
const assignable = new Set(ASSIGNABLE_PERMISSIONS);

export type CustomRoleLike = { id: string; name: string; baseRole: UserRole; permissions: string[] };

export function sanitizePermissions(permissions: readonly string[]): string[] {
  return [...new Set(permissions.filter((p) => assignable.has(p)))].sort();
}

/**
 * A custom role replaces the base role's default permissions. If the stored
 * base role and the user's role ever disagree, fall back to the defaults so a
 * stale assignment can never widen access.
 */
export function effectivePermissions(role: UserRole, customRole?: CustomRoleLike | null): string[] {
  if (customRole && customRole.baseRole === role) return sanitizePermissions(customRole.permissions);
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function permissionsInclude(permissions: readonly string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission);
}

/** Enabled module keys for the current facility context. */
export async function currentFacilityModules(): Promise<ModuleKey[]> {
  const load = async () => {
    const rows = await prisma.facilityModule.findMany({ where: { enabled: true }, select: { moduleKey: true } });
    return rows.map((row) => row.moduleKey).filter(isModuleKey).sort();
  };
  const facilityId = currentFacilityId();
  // Copied so callers can never alter the cached list.
  return facilityId ? [...(await modulesCache.get(facilityId, load))] : load();
}

export async function modulesForFacility(facilityId: string | null): Promise<ModuleKey[]> {
  if (!facilityId) return [];
  return runWithFacility(facilityId, () => currentFacilityModules());
}

/*
  Cross-module rules. A department's routes are gated by requireModule, but some
  workflows in one module create work for another (reception raises invoices,
  orders route to the lab or imaging). These helpers keep those side effects
  consistent with what the facility has switched on.
*/

const MODULE_FOR_ITEM_TYPE: Record<CatalogItemType, ModuleKey> = {
  [CatalogItemType.LAB]: 'laboratory',
  [CatalogItemType.SCAN]: 'imaging',
  [CatalogItemType.SERVICE]: 'opd'
};

export async function isModuleEnabled(key: ModuleKey) {
  return (await currentFacilityModules()).includes(key);
}

/**
 * Checks the item types in an order. Service items (consultation fees,
 * procedures) are charged on an encounter, never routed as orders; tests and
 * scans need their department switched on.
 */
export async function assertItemTypesAvailable(types: readonly CatalogItemType[]) {
  if (types.includes(CatalogItemType.SERVICE)) {
    throw new AppError('Service items are charged on a patient visit and cannot be ordered as tests or scans.', 400, 'SERVICE_NOT_ORDERABLE');
  }
  const enabled = await currentFacilityModules();
  const missing = [...new Set(types.map((type) => MODULE_FOR_ITEM_TYPE[type]))].filter((key) => !enabled.includes(key));
  if (missing.length) {
    const names = missing.map((key) => MODULES.find((m) => m.key === key)?.name ?? key).join(' and ');
    throw new AppError(`${names} ${missing.length > 1 ? 'are' : 'is'} not enabled for your facility, so these items cannot be ordered.`, 400, 'MODULE_DISABLED', {
      modules: missing
    });
  }
}

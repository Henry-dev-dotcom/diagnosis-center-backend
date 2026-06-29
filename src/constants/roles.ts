export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  FACILITY_ADMIN: 'FACILITY_ADMIN',
  CLINICIAN: 'CLINICIAN',
  DOCTOR: 'DOCTOR',
  RECEPTIONIST: 'RECEPTIONIST',
  LAB_STAFF: 'LAB_STAFF',
  LAB: 'LAB',
  SCAN_STAFF: 'SCAN_STAFF',
  RADIOLOGY: 'RADIOLOGY',
  CASHIER: 'CASHIER',
  FINANCE: 'FINANCE',
} as const;

export const SUPER_ADMIN_ROLES = new Set<string>([
  SYSTEM_ROLES.SUPER_ADMIN,
  'SUPERADMIN',
  'SYSTEM_ADMIN',
]);

export const FACILITY_ADMIN_ROLES = new Set<string>([
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.FACILITY_ADMIN,
  'FACILITY_MANAGER',
]);

export const CLINICIAN_ROLES = new Set<string>([
  SYSTEM_ROLES.CLINICIAN,
  SYSTEM_ROLES.DOCTOR,
  'PHYSICIAN',
]);

export const LAB_ROLES = new Set<string>([
  SYSTEM_ROLES.LAB_STAFF,
  SYSTEM_ROLES.LAB,
  'LABORATORY',
  'LAB_TECH',
  'LAB_TECHNICIAN',
]);

export const SCAN_ROLES = new Set<string>([
  SYSTEM_ROLES.SCAN_STAFF,
  SYSTEM_ROLES.RADIOLOGY,
  'IMAGING',
  'RADIOGRAPHER',
  'RADIOLOGY_STAFF',
]);

export const RECEPTION_ROLES = new Set<string>([
  SYSTEM_ROLES.RECEPTIONIST,
  'RECEPTION',
  'FRONT_DESK',
]);

export const FINANCE_ROLES = new Set<string>([
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.FINANCE,
  'ACCOUNTANT',
]);

export const ROLE_GROUPS = {
  superAdmin: SUPER_ADMIN_ROLES,
  facilityAdmin: FACILITY_ADMIN_ROLES,
  clinician: CLINICIAN_ROLES,
  lab: LAB_ROLES,
  scan: SCAN_ROLES,
  reception: RECEPTION_ROLES,
  finance: FINANCE_ROLES,
} as const;

export function normalizeRole(role?: string | null): string {
  return String(role || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function hasAnyRole(userRole: string | null | undefined, roles: Iterable<string>): boolean {
  const normalized = normalizeRole(userRole);
  for (const role of roles) {
    if (normalizeRole(role) === normalized) return true;
  }
  return false;
}

export function isSuperAdminRole(userRole: string | null | undefined): boolean {
  return hasAnyRole(userRole, SUPER_ADMIN_ROLES);
}

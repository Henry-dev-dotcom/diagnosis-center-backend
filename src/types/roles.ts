export const ROLES = {
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  RECEPTIONIST: 'RECEPTIONIST',
  LAB_STAFF: 'LAB_STAFF',
  SCAN_STAFF: 'SCAN_STAFF',
  BILLING_STAFF: 'BILLING_STAFF'
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

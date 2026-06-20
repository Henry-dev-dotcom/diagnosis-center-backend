import { UserRole } from '@prisma/client';
import { PERMISSIONS, type Permission } from './permissions.js';

export type RouteAccessPolicy = {
  module: string;
  basePath: string;
  description: string;
  allowedRoles: UserRole[];
  requiredPermissions: Permission[];
  scope?: 'global' | 'own-doctor' | 'lab-only' | 'scan-only' | 'finance-only' | 'admin-only' | 'authenticated';
  exposesPrices?: boolean;
};

export const ROUTE_ACCESS_POLICIES: RouteAccessPolicy[] = [
  {
    module: 'users',
    basePath: '/users',
    description: 'User account administration. Admin-only until delegated staff management is added.',
    allowedRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_USERS_MANAGE],
    scope: 'admin-only'
  },
  {
    module: 'patients',
    basePath: '/patients',
    description: 'Patient index, patient profile, duplicate detection, and trend data access.',
    allowedRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.LAB_STAFF, UserRole.SCAN_STAFF, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.PATIENTS_READ],
    scope: 'authenticated'
  },
  {
    module: 'doctors',
    basePath: '/doctor',
    description: 'Doctor profile, own patients, orders, results, and trend endpoints.',
    allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_PROFILE_READ],
    scope: 'own-doctor'
  },
  {
    module: 'orders',
    basePath: '/orders',
    description: 'Shared order registry with role-aware filtering and lifecycle access.',
    allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.ORDERS_READ],
    scope: 'authenticated'
  },
  {
    module: 'reception',
    basePath: '/reception',
    description: 'Incoming orders, check-in, appointments, walk-ins, visits, and reception result inbox.',
    allowedRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_ORDERS_READ],
    scope: 'global',
    exposesPrices: true
  },
  {
    module: 'lab',
    basePath: '/lab',
    description: 'Lab queue, accepted samples, result entry, review/sign-off, QC, and inventory.',
    allowedRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QUEUE_READ],
    scope: 'lab-only'
  },
  {
    module: 'scan',
    basePath: '/scan',
    description: 'Scan queue, accepted scans, bookings, reports, DICOM metadata, review, and retake tracking.',
    allowedRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_QUEUE_READ],
    scope: 'scan-only'
  },
  {
    module: 'billing',
    basePath: '/billing',
    description: 'Central invoice register, payments, receipts, refunds, and invoice filters.',
    allowedRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_INVOICES_READ],
    scope: 'finance-only',
    exposesPrices: true
  },
  {
    module: 'finance',
    basePath: '/finance',
    description: 'Shifts, float, expenses, ledger, cashier analytics, and finance reports.',
    allowedRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_LEDGER_READ],
    scope: 'finance-only',
    exposesPrices: true
  },
  {
    module: 'admin',
    basePath: '/admin',
    description: 'Admin settings, hospitals, doctors, catalog, reference ranges, departments, equipment, audit.',
    allowedRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    scope: 'admin-only',
    exposesPrices: true
  },
  {
    module: 'results',
    basePath: '/results',
    description: 'Released results, printable reports, delivery control, and delivery logs.',
    allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_READ],
    scope: 'authenticated'
  },
  {
    module: 'reports',
    basePath: '/reports',
    description: 'Operational, clinical, delivery, and finance reporting with role-aware filters.',
    allowedRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ],
    scope: 'authenticated'
  },
  {
    module: 'notifications',
    basePath: '/notifications',
    description: 'In-app notifications and delivery preferences/log visibility.',
    allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.LAB_STAFF, UserRole.SCAN_STAFF, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    scope: 'authenticated'
  },
  {
    module: 'files',
    basePath: '/files',
    description: 'Lab attachments, scan images, DICOM-ready upload metadata, and secure file access.',
    allowedRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ],
    scope: 'authenticated'
  }
];

export function getRouteAccessPolicy(moduleName: string) {
  return ROUTE_ACCESS_POLICIES.find((policy) => policy.module === moduleName);
}

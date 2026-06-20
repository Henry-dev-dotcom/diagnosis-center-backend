import { UserRole } from '@prisma/client';
import { PERMISSIONS, type Permission } from './permissions.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type Phase6RouteContract = {
  module: string;
  method: HttpMethod;
  path: string;
  summary: string;
  requiredRoles: UserRole[] | 'authenticated' | 'public';
  requiredPermissions: Permission[];
  status: 'implemented' | 'contract-placeholder';
  frontendAlias?: boolean;
  privacyNote?: string;
};

export const PHASE6_ROUTE_CONTRACTS: Phase6RouteContract[] = [
  // System and access foundation
  {
    module: 'System',
    method: 'GET',
    path: '/health',
    summary: 'API and database health check',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'System',
    method: 'GET',
    path: '/version',
    summary: 'API version metadata',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'System',
    method: 'GET',
    path: '/database/status',
    summary: 'Database health and seed count check',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Access Control',
    method: 'GET',
    path: '/access/me',
    summary: 'Current user role, permissions, price-visibility, and module access',
    requiredRoles: 'authenticated',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Access Control',
    method: 'GET',
    path: '/access/role-matrix',
    summary: 'Admin role and route access matrix',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ACCESS_MATRIX_READ],
    status: 'implemented'
  },
  {
    module: 'Access Control',
    method: 'GET',
    path: '/access/route-contracts',
    summary: 'Phase 6 route contracts for frontend/backend integration planning',
    requiredRoles: 'authenticated',
    requiredPermissions: [],
    status: 'implemented'
  },

  // Auth
  {
    module: 'Auth',
    method: 'POST',
    path: '/auth/login',
    summary: 'Login and receive access/refresh tokens',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Auth',
    method: 'POST',
    path: '/auth/logout',
    summary: 'Logout and revoke refresh session',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Auth',
    method: 'POST',
    path: '/auth/refresh',
    summary: 'Rotate refresh token and issue a new access token',
    requiredRoles: 'public',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Auth',
    method: 'GET',
    path: '/auth/me',
    summary: 'Current authenticated user profile',
    requiredRoles: 'authenticated',
    requiredPermissions: [],
    status: 'implemented'
  },
  {
    module: 'Auth',
    method: 'PATCH',
    path: '/auth/change-password',
    summary: 'Change current user password',
    requiredRoles: 'authenticated',
    requiredPermissions: [],
    status: 'implemented'
  },

  // Patients
  {
    module: 'Patients',
    method: 'GET',
    path: '/patients',
    summary: 'Patient search/list endpoint',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_PATIENTS_READ_OWN],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'POST',
    path: '/patients',
    summary: 'Create a patient record',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_CREATE],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'GET',
    path: '/patients/:id',
    summary: 'Patient profile/detail endpoint',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_PATIENTS_READ_OWN],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'PATCH',
    path: '/patients/:id',
    summary: 'Update a patient record',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.PATIENTS_UPDATE],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'GET',
    path: '/patients/:id/orders',
    summary: 'Patient order history',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'GET',
    path: '/patients/:id/trends',
    summary: 'Patient clinical trend summary',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_TRENDS_READ, PERMISSIONS.DOCTOR_TRENDS_READ_OWN, PERMISSIONS.LAB_TRENDS_READ],
    status: 'contract-placeholder'
  },
  {
    module: 'Patients',
    method: 'POST',
    path: '/patients/check-duplicates',
    summary: 'Check possible duplicate patient records before creation/update',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.PATIENTS_DUPLICATES_MANAGE, PERMISSIONS.PATIENTS_CREATE],
    status: 'contract-placeholder'
  },

  // Doctor
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/profile',
    summary: 'Doctor profile',
    requiredRoles: [UserRole.ADMIN, UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_PROFILE_READ, PERMISSIONS.ADMIN_DOCTORS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Doctor',
    method: 'PATCH',
    path: '/doctor/profile',
    summary: 'Update doctor profile',
    requiredRoles: [UserRole.ADMIN, UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_PROFILE_UPDATE],
    status: 'contract-placeholder'
  },
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/patients',
    summary: 'Doctor-owned referred patient list',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_PATIENTS_READ_OWN],
    status: 'contract-placeholder'
  },
  {
    module: 'Doctor',
    method: 'POST',
    path: '/doctor/orders',
    summary: 'Create doctor order containing one or more lab/scan items',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_ORDERS_CREATE],
    status: 'implemented'
  },
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/orders/active',
    summary: 'Doctor active orders',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'implemented'
  },
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/orders/completed',
    summary: 'Doctor completed orders',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'implemented'
  },
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/results',
    summary: 'Doctor patient results',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_RESULTS_READ_OWN],
    status: 'implemented'
  },
  {
    module: 'Doctor',
    method: 'GET',
    path: '/doctor/patient-trends/:patientId',
    summary: 'Doctor patient trends',
    requiredRoles: [UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.DOCTOR_TRENDS_READ_OWN],
    status: 'contract-placeholder'
  },

  // Orders
  {
    module: 'Orders',
    method: 'GET',
    path: '/orders',
    summary: 'Role-aware shared order registry',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'implemented'
  },
  {
    module: 'Orders',
    method: 'GET',
    path: '/orders/:id',
    summary: 'Order detail',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'implemented'
  },
  {
    module: 'Orders',
    method: 'PATCH',
    path: '/orders/:id/status',
    summary: 'Update order status',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.ORDERS_STATUS_UPDATE],
    status: 'implemented'
  },
  {
    module: 'Orders',
    method: 'POST',
    path: '/orders/:id/transition',
    summary: 'Frontend compatibility alias for controlled order status transition',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.ORDERS_STATUS_UPDATE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Orders',
    method: 'POST',
    path: '/orders/:id/cancel',
    summary: 'Cancel order with reason',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.DOCTOR],
    requiredPermissions: [PERMISSIONS.ORDERS_CANCEL, PERMISSIONS.RECEPTION_ORDERS_CONFIRM],
    status: 'implemented'
  },
  {
    module: 'Orders',
    method: 'GET',
    path: '/orders/:id/timeline',
    summary: 'Order status timeline',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.ORDERS_READ, PERMISSIONS.DOCTOR_ORDERS_READ_OWN],
    status: 'implemented'
  },

  // Reception
  {
    module: 'Reception',
    method: 'GET',
    path: '/reception/incoming-orders',
    summary: 'Incoming doctor orders pending reception confirmation',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_ORDERS_READ],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'POST',
    path: '/reception/orders/:id/confirm',
    summary: 'Confirm incoming doctor order',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_ORDERS_CONFIRM],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'POST',
    path: '/reception/check-in',
    summary: 'Check in a patient for visit/order processing',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_CHECK_IN],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'POST',
    path: '/reception/walk-ins',
    summary: 'Create walk-in patient/order intake',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_WALK_INS_CREATE],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'GET',
    path: '/reception/appointments',
    summary: 'Appointment list',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'POST',
    path: '/reception/appointments',
    summary: 'Create appointment',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'PATCH',
    path: '/reception/appointments/:id',
    summary: 'Update appointment',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'GET',
    path: '/reception/daily-visits',
    summary: 'Daily visits/check-in log',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_CHECK_IN],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'GET',
    path: '/reception/results-inbox',
    summary: 'Reception result inbox for patient notice workflow',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_RESULTS_READ],
    status: 'implemented'
  },
  {
    module: 'Reception',
    method: 'POST',
    path: '/reception/results/:id/send-notice',
    summary: 'Send privacy-safe patient result notice from reception',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RECEPTION_NOTICES_SEND],
    status: 'implemented',
    privacyNote: 'Patient SMS and WhatsApp notices must not include clinical values or diagnosis.'
  },

  // Lab
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/queue',
    summary: 'Lab-only order item queue',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/samples/accept',
    summary: 'Accept lab sample by order item/sample payload',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_SAMPLES_ACCEPT],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/orders/:orderId/accept',
    summary: 'Frontend compatibility alias for accepting lab sample from an order',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_SAMPLES_ACCEPT],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/accepted-samples',
    summary: 'Accepted lab samples queue',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/results/draft',
    summary: 'Save lab result draft',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_RESULTS_CREATE],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/results',
    summary: 'Frontend compatibility alias for saving a lab result draft',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_RESULTS_CREATE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/results/submit-review',
    summary: 'Submit lab result for review',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_RESULTS_SUBMIT_REVIEW],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/results/:id/sign-off',
    summary: 'Senior/supervisor sign-off for lab result',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_RESULTS_SIGN_OFF],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/results/:id/files',
    summary: 'Frontend compatibility endpoint for attaching files to lab results',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_UPLOAD],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/samples/:id/reject',
    summary: 'Reject lab sample or request recollection',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_SAMPLES_REJECT],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/review-queue',
    summary: 'Lab result review queue',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_REVIEW_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/rejected-retest',
    summary: 'Rejected samples and retest workflow queue',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/reference-ranges/:catalogItemId',
    summary: 'Reference ranges for a lab catalog item',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_RESULTS_CREATE],
    status: 'implemented'
  },


  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/patient-trends/:patientId',
    summary: 'Signed-off lab parameter trends for a patient',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_TRENDS_READ],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/qc',
    summary: 'Lab quality-control run list',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QC_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/qc',
    summary: 'Create lab quality-control run',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_QC_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'GET',
    path: '/lab/inventory',
    summary: 'Lab inventory register with low-stock summary',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_INVENTORY_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/inventory',
    summary: 'Create lab inventory item',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_INVENTORY_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Lab',
    method: 'POST',
    path: '/lab/inventory/:id/transactions',
    summary: 'Record lab inventory stock movement',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.LAB_INVENTORY_MANAGE],
    status: 'implemented'
  },

  // Scan
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/queue',
    summary: 'Scan-only order item queue',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/accept',
    summary: 'Accept scan request',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_ACCEPT],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/orders/:orderId/accept',
    summary: 'Frontend compatibility alias for accepting scan request from an order',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_ACCEPT],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/accepted-scans',
    summary: 'Accepted scan queue',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/bookings',
    summary: 'Create equipment booking',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_BOOKINGS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/bookings',
    summary: 'Scan equipment booking list',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_BOOKINGS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/results/draft',
    summary: 'Save scan report draft',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RESULTS_CREATE],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/results',
    summary: 'Frontend compatibility alias for saving a scan report draft',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RESULTS_CREATE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/results/submit-review',
    summary: 'Submit scan report for review',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RESULTS_SUBMIT_REVIEW],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/results/:id/sign-off',
    summary: 'Radiologist/senior sign-off for scan report',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RESULTS_SIGN_OFF],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/retake',
    summary: 'Request or record scan retake',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RETAKE_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/review-queue',
    summary: 'Scan report review queue',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_REVIEW_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/rejected-retake',
    summary: 'Rejected scans and retake queue',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_RETAKE_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'POST',
    path: '/scan/results/:id/files',
    summary: 'Attach scan image and DICOM-ready file metadata',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_FILES_UPLOAD],
    status: 'implemented'
  },
  {
    module: 'Scan',
    method: 'GET',
    path: '/scan/prior/:patientId',
    summary: 'Prior signed-off scan reports for comparison',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },

  // Billing / Finance
  {
    module: 'Billing',
    method: 'GET',
    path: '/billing/invoices',
    summary: 'Invoice register',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_INVOICES_READ],
    status: 'implemented'
  },
  {
    module: 'Billing',
    method: 'PATCH',
    path: '/billing/invoices/:id',
    summary: 'Update invoice status or metadata',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_INVOICES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Billing',
    method: 'POST',
    path: '/billing/invoices/:id/payments',
    summary: 'Record payment against invoice',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_PAYMENTS_CREATE],
    status: 'implemented'
  },
  {
    module: 'Billing',
    method: 'POST',
    path: '/billing/invoices/:id/refund',
    summary: 'Record invoice refund or adjustment with approval reference',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_REFUNDS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Billing',
    method: 'GET',
    path: '/billing/receipts/:id',
    summary: 'Load receipt preview for a completed payment',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.BILLING_INVOICES_READ],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/shifts/start',
    summary: 'Start cashier shift',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/shifts',
    summary: 'Frontend compatibility alias to start cashier shift',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/shifts/:id/close',
    summary: 'Close cashier shift',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/shifts/current',
    summary: 'Current active shift for user',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/shifts',
    summary: 'Frontend compatibility alias for shift summary/history',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/shifts/history',
    summary: 'Cashier shift history',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_SHIFTS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/float',
    summary: 'Cashier float tracker',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_FLOAT_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/float/adjustments',
    summary: 'Record float adjustment',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_FLOAT_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/expenses',
    summary: 'Expense register',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_EXPENSES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/expenses',
    summary: 'Create expense',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_EXPENSES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'PATCH',
    path: '/finance/expenses/:id',
    summary: 'Update expense',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_EXPENSES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/expenses/:id/payment',
    summary: 'Record expense payment',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_EXPENSES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'POST',
    path: '/finance/expenses/:id/write-off',
    summary: 'Write off expense with reason/approval foundation',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_EXPENSES_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/ledger',
    summary: 'Ledger entries',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_LEDGER_READ],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/analytics',
    summary: 'Finance analytics foundation',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_ANALYTICS_READ],
    status: 'implemented'
  },
  {
    module: 'Finance',
    method: 'GET',
    path: '/finance/ageing',
    summary: 'Receivable ageing buckets for outstanding invoices',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.FINANCE_ANALYTICS_READ],
    status: 'implemented'
  },

  // Admin
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/users',
    summary: 'Admin user list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_USERS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'POST',
    path: '/admin/users',
    summary: 'Create user',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_USERS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'PATCH',
    path: '/admin/users/:id',
    summary: 'Update user',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_USERS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/catalog',
    summary: 'Catalog list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_CATALOG_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'POST',
    path: '/admin/catalog',
    summary: 'Create catalog item',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_CATALOG_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'PATCH',
    path: '/admin/catalog/:id',
    summary: 'Update catalog item',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_CATALOG_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/reference-ranges',
    summary: 'Reference range list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'POST',
    path: '/admin/reference-ranges',
    summary: 'Create reference range',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'PATCH',
    path: '/admin/reference-ranges/:id',
    summary: 'Update reference range',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_REFERENCE_RANGES_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/hospitals',
    summary: 'Hospital list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_HOSPITALS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'POST',
    path: '/admin/hospitals',
    summary: 'Create hospital',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_HOSPITALS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/doctors',
    summary: 'Doctor profile list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_DOCTORS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'POST',
    path: '/admin/doctors',
    summary: 'Create doctor profile',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_DOCTORS_MANAGE],
    status: 'contract-placeholder'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/audit-logs',
    summary: 'Audit log list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/system-events',
    summary: 'System event log list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/api-request-logs',
    summary: 'API request log list',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },

  // Results
  {
    module: 'Results',
    method: 'GET',
    path: '/results',
    summary: 'Released/result inbox list',
    requiredRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_READ, PERMISSIONS.RESULTS_READ_OWN, PERMISSIONS.DOCTOR_RESULTS_READ_OWN, PERMISSIONS.RECEPTION_RESULTS_READ],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'GET',
    path: '/results/:id',
    summary: 'Result detail',
    requiredRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_READ, PERMISSIONS.RESULTS_READ_OWN, PERMISSIONS.DOCTOR_RESULTS_READ_OWN, PERMISSIONS.RECEPTION_RESULTS_READ],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'POST',
    path: '/results/:id/release',
    summary: 'Release final result/report',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.RESULTS_RELEASE],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'GET',
    path: '/results/:id/report',
    summary: 'PDF-ready report endpoint',
    requiredRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_REPORT_DOWNLOAD],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'POST',
    path: '/results/:id/email',
    summary: 'Send result notice by email',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_MANAGE, PERMISSIONS.RECEPTION_NOTICES_SEND],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'POST',
    path: '/results/:id/sms',
    summary: 'Send privacy-safe SMS result notice',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented',
    privacyNote: 'SMS must not include clinical values or diagnosis.'
  },
  {
    module: 'Results',
    method: 'POST',
    path: '/results/:id/whatsapp',
    summary: 'Send privacy-safe WhatsApp result notice',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_MANAGE, PERMISSIONS.RECEPTION_NOTICES_SEND],
    status: 'implemented',
    privacyNote: 'WhatsApp notices must not include clinical values or diagnosis.'
  },
  {
    module: 'Results',
    method: 'GET',
    path: '/results/delivery-logs',
    summary: 'Result delivery log list',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented'
  },

  // Reports, notifications, files foundation groups
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/export',
    summary: 'Export operational/finance report',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'GET',
    path: '/notifications',
    summary: 'Authenticated user notifications',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'POST',
    path: '/files/upload',
    summary: 'Upload file metadata foundation',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_UPLOAD, PERMISSIONS.SCAN_FILES_UPLOAD],
    status: 'implemented'
  },
  {
    module: 'Results',
    method: 'GET',
    path: '/results/delivery/logs',
    summary: 'Canonical result delivery log list',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Results',
    method: 'POST',
    path: '/results/delivery/logs/:id/retry',
    summary: 'Retry a result delivery log',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports',
    summary: 'Operational reporting overview',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_FINANCE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/tat',
    summary: 'Turnaround time report',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_QUEUE_READ, PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/order-volume',
    summary: 'Order volume report',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_QUEUE_READ, PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/revenue',
    summary: 'Revenue report',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/outstanding',
    summary: 'Outstanding invoice report',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/abnormal-results',
    summary: 'Abnormal result report',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_REVIEW_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/staff-productivity',
    summary: 'Staff productivity report',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/results-delivery',
    summary: 'Results delivery report',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.RESULTS_DELIVERY_READ, PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'PATCH',
    path: '/notifications/:id/read',
    summary: 'Mark notification as read',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'GET',
    path: '/notifications/logs',
    summary: 'Notification delivery logs',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'POST',
    path: '/notifications/logs/:id/retry',
    summary: 'Retry notification delivery',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'PATCH',
    path: '/notifications/settings',
    summary: 'Validate and audit notification settings',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_SETTINGS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'GET',
    path: '/files',
    summary: 'List file metadata records',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'GET',
    path: '/files/:id',
    summary: 'Read secure file metadata',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'DELETE',
    path: '/files/:id',
    summary: 'Delete file metadata',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.FILES_DELETE],
    status: 'implemented'
  }
  ,
  {
    module: 'Notifications',
    method: 'POST',
    path: '/notifications',
    summary: 'Create notification and queue delivery channels',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'PATCH',
    path: '/notifications/read-all',
    summary: 'Mark scoped notifications as read',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'PATCH',
    path: '/notifications/:id/unread',
    summary: 'Mark notification as unread',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'POST',
    path: '/notifications/:id/deliver',
    summary: 'Record notification delivery over selected channels',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.RESULTS_DELIVERY_MANAGE],
    privacyNote: 'SMS and WhatsApp delivery logs use privacy-safe message bodies.',
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'GET',
    path: '/notifications/preferences',
    summary: 'Get current notification preference defaults',
    requiredRoles: 'authenticated',
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_READ],
    status: 'implemented'
  },
  {
    module: 'Notifications',
    method: 'PATCH',
    path: '/notifications/preferences',
    summary: 'Update notification preferences alias',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.NOTIFICATIONS_SETTINGS_MANAGE],
    status: 'implemented',
    frontendAlias: true
  },
  {
    module: 'Files',
    method: 'POST',
    path: '/files/upload',
    summary: 'Upload local/base64 file payloads or file metadata records',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_UPLOAD, PERMISSIONS.SCAN_FILES_UPLOAD],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'GET',
    path: '/files/:id/download',
    summary: 'Download locally stored file bytes when available',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'GET',
    path: '/files/dicom/studies',
    summary: 'List DICOM-ready study metadata grouped by Study UID',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ, PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Files',
    method: 'GET',
    path: '/files/dicom/studies/:studyUid',
    summary: 'Get DICOM-ready study metadata and file instances',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.FILES_READ, PERMISSIONS.SCAN_QUEUE_READ],
    status: 'implemented'
  }

  ,
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/dashboard',
    summary: 'Executive operations dashboard for admin/front desk leadership',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF, UserRole.LAB_STAFF, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.REPORTS_FINANCE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/analytics/finance',
    summary: 'Detailed finance analytics dashboard',
    requiredRoles: [UserRole.ADMIN, UserRole.BILLING_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_FINANCE_READ, PERMISSIONS.FINANCE_ANALYTICS_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/analytics/lab',
    summary: 'Laboratory analytics dashboard',
    requiredRoles: [UserRole.ADMIN, UserRole.LAB_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.LAB_REVIEW_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/analytics/scan',
    summary: 'Scan and imaging analytics dashboard',
    requiredRoles: [UserRole.ADMIN, UserRole.SCAN_STAFF],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.SCAN_REVIEW_QUEUE_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/analytics/reception',
    summary: 'Reception and patient-flow analytics dashboard',
    requiredRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
    requiredPermissions: [PERMISSIONS.REPORTS_READ, PERMISSIONS.RECEPTION_ORDERS_READ],
    status: 'implemented'
  },
  {
    module: 'Reports',
    method: 'GET',
    path: '/reports/analytics/audit',
    summary: 'Audit and request-log analytics dashboard',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/audit-summary',
    summary: 'Audit review dashboard for admins',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/audit-export',
    summary: 'Audit logs, system events, and API request log export payload',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ],
    status: 'implemented'
  },
  {
    module: 'Admin',
    method: 'GET',
    path: '/admin/full-export',
    summary: 'Full admin configuration, access, dashboard, and audit export bundle',
    requiredRoles: [UserRole.ADMIN],
    requiredPermissions: [PERMISSIONS.ADMIN_AUDIT_READ, PERMISSIONS.REPORTS_EXPORT],
    status: 'implemented'
  }


];

export function getPhase6ContractsByModule() {
  return PHASE6_ROUTE_CONTRACTS.reduce<Record<string, Phase6RouteContract[]>>((groups, contract) => {
    groups[contract.module] ??= [];
    groups[contract.module].push(contract);
    return groups;
  }, {});
}

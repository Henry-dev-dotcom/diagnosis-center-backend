import { CatalogItemType, UserRole } from '@prisma/client';

export const PERMISSIONS = {
  SYSTEM_READ: 'system:read',
  ACCESS_MATRIX_READ: 'access:matrix:read',

  // Platform (SaaS operator) scope. Platform routes also require the
  // PLATFORM_ADMIN role, so a facility ADMIN's '*' never reaches them.
  PLATFORM_FACILITIES_READ: 'platform:facilities:read',
  PLATFORM_FACILITIES_MANAGE: 'platform:facilities:manage',
  PLATFORM_BILLING_MANAGE: 'platform:billing:manage',
  // A facility's complete data as one file (Act 843; administrators via '*').
  ADMIN_DATA_EXPORT: 'admin:data:export',
  // Read-only support sessions inside a facility (audited in that facility).
  PLATFORM_SUPPORT_SESSION: 'platform:support:session',
  // A facility's own subscription (its administrator; '*' covers it).
  SUBSCRIPTION_MANAGE: 'subscription:manage',

  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',

  PATIENTS_READ: 'patients:read',
  PATIENTS_CREATE: 'patients:create',
  PATIENTS_UPDATE: 'patients:update',
  PATIENTS_TRENDS_READ: 'patients:trends:read',
  PATIENTS_DUPLICATES_MANAGE: 'patients:duplicates:manage',

  DOCTOR_PROFILE_READ: 'doctor:profile:read',
  DOCTOR_PROFILE_UPDATE: 'doctor:profile:update',
  DOCTOR_PATIENTS_READ_OWN: 'doctor:patients:read-own',
  DOCTOR_ORDERS_CREATE: 'doctor:orders:create',
  DOCTOR_ORDERS_READ_OWN: 'doctor:orders:read-own',
  DOCTOR_RESULTS_READ_OWN: 'doctor:results:read-own',
  DOCTOR_TRENDS_READ_OWN: 'doctor:trends:read-own',

  ORDERS_READ: 'orders:read',
  ORDERS_READ_OWN: 'orders:read-own',
  ORDERS_STATUS_UPDATE: 'orders:status:update',
  ORDERS_CANCEL: 'orders:cancel',

  RECEPTION_ORDERS_READ: 'reception:orders:read',
  RECEPTION_ORDERS_CONFIRM: 'reception:orders:confirm',
  RECEPTION_CHECK_IN: 'reception:patients:check-in',
  RECEPTION_WALK_INS_CREATE: 'reception:walk-ins:create',
  RECEPTION_APPOINTMENTS_MANAGE: 'reception:appointments:manage',
  RECEPTION_RESULTS_READ: 'reception:results:read',
  RECEPTION_NOTICES_SEND: 'reception:notices:send',

  LAB_QUEUE_READ: 'lab:queue:read',
  LAB_SAMPLES_ACCEPT: 'lab:samples:accept',
  LAB_SAMPLES_REJECT: 'lab:samples:reject',
  LAB_RESULTS_CREATE: 'lab:results:create',
  LAB_RESULTS_SUBMIT_REVIEW: 'lab:results:submit-review',
  LAB_RESULTS_SIGN_OFF: 'lab:results:sign-off',
  LAB_REVIEW_QUEUE_READ: 'lab:review-queue:read',
  LAB_TRENDS_READ: 'lab:trends:read',
  LAB_QC_MANAGE: 'lab:qc:manage',
  LAB_INVENTORY_MANAGE: 'lab:inventory:manage',
  // A signed-off (sent) lab result, pulled back by the lab itself to correct it.
  LAB_RESULTS_REVERSE: 'lab:results:reverse',
  // Analyzers that send their own results in: the device list, the test-code
  // mapping, and the log of what each instrument sent.
  LAB_ANALYZERS_READ: 'lab:analyzers:read',
  LAB_ANALYZERS_MANAGE: 'lab:analyzers:manage',

  SCAN_QUEUE_READ: 'scan:queue:read',
  SCAN_ACCEPT: 'scan:accept',
  SCAN_BOOKINGS_MANAGE: 'scan:bookings:manage',
  SCAN_RESULTS_CREATE: 'scan:results:create',
  SCAN_RESULTS_SUBMIT_REVIEW: 'scan:results:submit-review',
  SCAN_RESULTS_SIGN_OFF: 'scan:results:sign-off',
  SCAN_REVIEW_QUEUE_READ: 'scan:review-queue:read',
  SCAN_RETAKE_MANAGE: 'scan:retake:manage',
  SCAN_FILES_UPLOAD: 'scan:files:upload',
  // A signed-off (sent) scan report, pulled back by the scan unit itself to correct it.
  SCAN_RESULTS_REVERSE: 'scan:results:reverse',

  BILLING_INVOICES_READ: 'billing:invoices:read',
  BILLING_INVOICES_MANAGE: 'billing:invoices:manage',
  BILLING_PAYMENTS_CREATE: 'billing:payments:create',
  BILLING_REFUNDS_MANAGE: 'billing:refunds:manage',

  FINANCE_SHIFTS_MANAGE: 'finance:shifts:manage',
  FINANCE_FLOAT_MANAGE: 'finance:float:manage',
  FINANCE_EXPENSES_MANAGE: 'finance:expenses:manage',
  FINANCE_LEDGER_READ: 'finance:ledger:read',
  FINANCE_ANALYTICS_READ: 'finance:analytics:read',

  ADMIN_USERS_MANAGE: 'admin:users:manage',
  ADMIN_ROLES_MANAGE: 'admin:roles:manage',
  ADMIN_HOSPITALS_MANAGE: 'admin:hospitals:manage',
  ADMIN_DOCTORS_MANAGE: 'admin:doctors:manage',
  ADMIN_CATALOG_MANAGE: 'admin:catalog:manage',
  ADMIN_REFERENCE_RANGES_MANAGE: 'admin:reference-ranges:manage',
  ADMIN_DEPARTMENTS_MANAGE: 'admin:departments:manage',
  ADMIN_EQUIPMENT_MANAGE: 'admin:equipment:manage',
  ADMIN_AUDIT_READ: 'admin:audit:read',

  RESULTS_READ: 'results:read',
  RESULTS_READ_OWN: 'results:read-own',
  RESULTS_RELEASE: 'results:release',
  RESULTS_REPORT_DOWNLOAD: 'results:report:download',
  RESULTS_DELIVERY_MANAGE: 'results:delivery:manage',
  RESULTS_DELIVERY_READ: 'results:delivery:read',

  REPORTS_READ: 'reports:read',
  REPORTS_FINANCE_READ: 'reports:finance:read',
  REPORTS_EXPORT: 'reports:export',

  /// Staff messaging. Every department talks to every other, so every staff role holds it.
  MESSAGES_READ: 'messages:read',
  MESSAGES_SEND: 'messages:send',
  NOTIFICATIONS_READ: 'notifications:read',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  NOTIFICATIONS_SETTINGS_MANAGE: 'notifications:settings:manage',

  FILES_UPLOAD: 'files:upload',
  FILES_READ: 'files:read',
  FILES_DELETE: 'files:delete',

  PRICING_READ: 'pricing:read',

  // Outpatient (OPD) encounters, Phase 3.
  ENCOUNTERS_READ: 'encounters:read',
  ENCOUNTERS_CREATE: 'encounters:create',
  ENCOUNTERS_TRIAGE: 'encounters:triage',
  ENCOUNTERS_CONSULT: 'encounters:consult',
  ENCOUNTERS_ORDER: 'encounters:order',
  ENCOUNTERS_PRESCRIBE: 'encounters:prescribe',
  ENCOUNTERS_COMPLETE: 'encounters:complete',
  ENCOUNTERS_CANCEL: 'encounters:cancel',
  PATIENT_ALLERGIES_MANAGE: 'patients:allergies:manage',

  // Pharmacy, Phase 4A.
  PHARMACY_FORMULARY_READ: 'pharmacy:formulary:read',
  PHARMACY_DRUGS_MANAGE: 'pharmacy:drugs:manage',
  PHARMACY_STOCK_MANAGE: 'pharmacy:stock:manage',
  PHARMACY_DISPENSE: 'pharmacy:dispense',

  // Wards & admissions, Phase 4B.
  INPATIENT_READ: 'inpatient:read',
  INPATIENT_ADMIT: 'inpatient:admit',
  INPATIENT_TRANSFER: 'inpatient:transfer',
  INPATIENT_DISCHARGE: 'inpatient:discharge',
  INPATIENT_ADMINISTER: 'inpatient:administer',
  INPATIENT_BED_STATUS: 'inpatient:beds:status',
  INPATIENT_WARDS_MANAGE: 'inpatient:wards:manage',

  // Operating theatre, Phase 4B.
  THEATRE_READ: 'theatre:read',
  THEATRE_SCHEDULE: 'theatre:schedule',
  THEATRE_CHECKLIST: 'theatre:checklist',
  THEATRE_OPERATE: 'theatre:operate',
  THEATRE_MANAGE: 'theatre:theatres:manage',

  // Maternity, Phase 4C.
  MATERNITY_READ: 'maternity:read',
  MATERNITY_REGISTER: 'maternity:register',
  MATERNITY_DELIVER: 'maternity:deliver',

  // Child health and immunisation, Phase 4C.
  IMMUNIZATION_READ: 'immunization:read',
  IMMUNIZATION_RECORD: 'immunization:record',

  // Insurance claims, Phase 4D.
  CLAIMS_READ: 'claims:read',
  CLAIMS_MANAGE: 'claims:manage',
  CLAIMS_ADJUDICATE: 'claims:adjudicate',
  CLAIMS_MEMBERSHIPS: 'claims:memberships',
  CLAIMS_SCHEMES_MANAGE: 'claims:schemes:manage',

  // Stores and procurement, Phase 4D.
  STORES_READ: 'stores:read',
  STORES_MANAGE: 'stores:manage',
  STORES_ORDER: 'stores:order',
  STORES_APPROVE: 'stores:approve',
  STORES_RECEIVE: 'stores:receive',
  STORES_ISSUE: 'stores:issue',
  STORES_REQUEST: 'stores:request',

  // Blood bank, Phase 4D.
  BLOODBANK_READ: 'bloodbank:read',
  BLOODBANK_MANAGE: 'bloodbank:manage',
  BLOODBANK_REQUEST: 'bloodbank:request',
  BLOODBANK_TRANSFUSE: 'bloodbank:transfuse',

  // Mortuary, Phase 4D.
  MORTUARY_READ: 'mortuary:read',
  MORTUARY_MANAGE: 'mortuary:manage',
  MORTUARY_CERTIFY: 'mortuary:certify',
  MORTUARY_SLOTS_MANAGE: 'mortuary:slots:manage',

  // HR and duty rota, Phase 4D.
  HR_ROTA_READ: 'hr:rota:read',
  HR_LEAVE_REQUEST: 'hr:leave:request',
  HR_MANAGE: 'hr:manage',
  HR_LEAVE_APPROVE: 'hr:leave:approve',

  // Medical records, Phase 4D.
  RECORDS_CHART_READ: 'records:chart:read',
  RECORDS_RELEASE: 'records:release',
  RECORDS_APPROVE: 'records:approve',
  RECORDS_AUDIT: 'records:audit'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[] | readonly ['*']> = {
  [UserRole.PLATFORM_ADMIN]: [PERMISSIONS.SYSTEM_READ, PERMISSIONS.PLATFORM_FACILITIES_READ, PERMISSIONS.PLATFORM_FACILITIES_MANAGE, PERMISSIONS.PLATFORM_BILLING_MANAGE, PERMISSIONS.PLATFORM_SUPPORT_SESSION],
  [UserRole.ADMIN]: ['*'],
  [UserRole.DOCTOR]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.DOCTOR_PROFILE_READ,
    PERMISSIONS.DOCTOR_PROFILE_UPDATE,
    PERMISSIONS.DOCTOR_PATIENTS_READ_OWN,
    PERMISSIONS.DOCTOR_ORDERS_CREATE,
    PERMISSIONS.DOCTOR_ORDERS_READ_OWN,
    // Reverse (cancel) an order they sent, while it is still their own to withdraw.
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.DOCTOR_RESULTS_READ_OWN,
    PERMISSIONS.DOCTOR_TRENDS_READ_OWN,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.RESULTS_REPORT_DOWNLOAD,
    PERMISSIONS.NOTIFICATIONS_READ,
    // In-house consultation (OPD module).
    PERMISSIONS.ENCOUNTERS_READ,
    PERMISSIONS.ENCOUNTERS_CONSULT,
    PERMISSIONS.ENCOUNTERS_ORDER,
    PERMISSIONS.ENCOUNTERS_PRESCRIBE,
    PERMISSIONS.ENCOUNTERS_COMPLETE,
    PERMISSIONS.PATIENT_ALLERGIES_MANAGE,
    // Prescribe from the pharmacy's drug list (Pharmacy module).
    PERMISSIONS.PHARMACY_FORMULARY_READ,
    // Admit, move and discharge inpatients (Wards & Admissions module).
    PERMISSIONS.INPATIENT_READ,
    PERMISSIONS.INPATIENT_ADMIT,
    PERMISSIONS.INPATIENT_TRANSFER,
    PERMISSIONS.INPATIENT_DISCHARGE,
    // Book operations, run the safety checklist and write the operation note (Theatre module).
    PERMISSIONS.THEATRE_READ,
    PERMISSIONS.THEATRE_SCHEDULE,
    PERMISSIONS.THEATRE_CHECKLIST,
    PERMISSIONS.THEATRE_OPERATE,
    // Pregnancy care and deliveries (Maternity module).
    PERMISSIONS.MATERNITY_READ,
    PERMISSIONS.MATERNITY_REGISTER,
    PERMISSIONS.MATERNITY_DELIVER,
    // Immunisations (Child Health module).
    PERMISSIONS.IMMUNIZATION_READ,
    PERMISSIONS.IMMUNIZATION_RECORD,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // Request blood and record transfusions (Blood Bank module).
    PERMISSIONS.BLOODBANK_READ,
    PERMISSIONS.BLOODBANK_REQUEST,
    PERMISSIONS.BLOODBANK_TRANSFUSE,
    // Certify the cause of death (Mortuary module).
    PERMISSIONS.MORTUARY_READ,
    PERMISSIONS.MORTUARY_CERTIFY,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST,
    // Read the full patient chart (Medical Records module).
    PERMISSIONS.RECORDS_CHART_READ
  ],
  [UserRole.NURSE]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.ENCOUNTERS_READ,
    // Emergency triage nurses register arrivals themselves.
    PERMISSIONS.ENCOUNTERS_CREATE,
    PERMISSIONS.ENCOUNTERS_TRIAGE,
    PERMISSIONS.PATIENT_ALLERGIES_MANAGE,
    PERMISSIONS.NOTIFICATIONS_READ,
    // Ward nursing: medication rounds, bed moves and bed readiness.
    PERMISSIONS.INPATIENT_READ,
    PERMISSIONS.INPATIENT_TRANSFER,
    PERMISSIONS.INPATIENT_ADMINISTER,
    PERMISSIONS.INPATIENT_BED_STATUS,
    // Theatre nurses run the surgical safety checklist.
    PERMISSIONS.THEATRE_READ,
    PERMISSIONS.THEATRE_CHECKLIST,
    // Midwives: pregnancy booking, antenatal care and deliveries.
    PERMISSIONS.MATERNITY_READ,
    PERMISSIONS.MATERNITY_REGISTER,
    PERMISSIONS.MATERNITY_DELIVER,
    // Child welfare clinic: immunisations and growth monitoring.
    PERMISSIONS.IMMUNIZATION_READ,
    PERMISSIONS.IMMUNIZATION_RECORD,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // Record transfusions and reactions on the ward (Blood Bank module).
    PERMISSIONS.BLOODBANK_READ,
    PERMISSIONS.BLOODBANK_TRANSFUSE,
    // Keep the deceased register and release bodies (Mortuary module).
    PERMISSIONS.MORTUARY_READ,
    PERMISSIONS.MORTUARY_MANAGE,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST,
    // Read the full patient chart (Medical Records module).
    PERMISSIONS.RECORDS_CHART_READ
  ],
  [UserRole.PHARMACIST]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.PHARMACY_FORMULARY_READ,
    PERMISSIONS.PHARMACY_DRUGS_MANAGE,
    PERMISSIONS.PHARMACY_STOCK_MANAGE,
    PERMISSIONS.PHARMACY_DISPENSE,
    PERMISSIONS.PATIENT_ALLERGIES_MANAGE,
    PERMISSIONS.NOTIFICATIONS_READ,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST
  ],
  [UserRole.RECEPTIONIST]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.PATIENTS_CREATE,
    PERMISSIONS.PATIENTS_UPDATE,
    PERMISSIONS.PATIENTS_DUPLICATES_MANAGE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.RECEPTION_ORDERS_READ,
    PERMISSIONS.RECEPTION_ORDERS_CONFIRM,
    PERMISSIONS.RECEPTION_CHECK_IN,
    PERMISSIONS.RECEPTION_WALK_INS_CREATE,
    PERMISSIONS.RECEPTION_APPOINTMENTS_MANAGE,
    PERMISSIONS.RECEPTION_RESULTS_READ,
    PERMISSIONS.RECEPTION_NOTICES_SEND,
    PERMISSIONS.RESULTS_DELIVERY_READ,
    PERMISSIONS.RESULTS_REPORT_DOWNLOAD,
    // Start and cancel OPD visits (OPD module).
    PERMISSIONS.ENCOUNTERS_READ,
    PERMISSIONS.ENCOUNTERS_CREATE,
    PERMISSIONS.ENCOUNTERS_CANCEL,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.PRICING_READ,
    // Record patients' NHIS / scheme cards at registration (Claims module).
    PERMISSIONS.CLAIMS_MEMBERSHIPS,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST,
    // The records office: log and release record requests (Medical Records module).
    PERMISSIONS.RECORDS_CHART_READ,
    PERMISSIONS.RECORDS_RELEASE
  ],
  [UserRole.LAB_STAFF]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.PATIENTS_TRENDS_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.LAB_QUEUE_READ,
    PERMISSIONS.LAB_SAMPLES_ACCEPT,
    PERMISSIONS.LAB_SAMPLES_REJECT,
    PERMISSIONS.LAB_RESULTS_CREATE,
    PERMISSIONS.LAB_RESULTS_SUBMIT_REVIEW,
    PERMISSIONS.LAB_RESULTS_SIGN_OFF,
    // A wrong result already sent out (signed off) can be pulled back for correction.
    PERMISSIONS.LAB_RESULTS_REVERSE,
    PERMISSIONS.LAB_REVIEW_QUEUE_READ,
    PERMISSIONS.LAB_TRENDS_READ,
    PERMISSIONS.LAB_QC_MANAGE,
    PERMISSIONS.LAB_INVENTORY_MANAGE,
    // The bench sets up its own analyzers and fixes their test-code mapping.
    PERMISSIONS.LAB_ANALYZERS_READ,
    PERMISSIONS.LAB_ANALYZERS_MANAGE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.FILES_UPLOAD,
    PERMISSIONS.FILES_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // Run the blood bank: donors, screening, crossmatch and issue (Blood Bank module).
    PERMISSIONS.BLOODBANK_READ,
    PERMISSIONS.BLOODBANK_MANAGE,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST
  ],
  [UserRole.SCAN_STAFF]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.SCAN_QUEUE_READ,
    PERMISSIONS.SCAN_ACCEPT,
    PERMISSIONS.SCAN_BOOKINGS_MANAGE,
    PERMISSIONS.SCAN_RESULTS_CREATE,
    PERMISSIONS.SCAN_RESULTS_SUBMIT_REVIEW,
    PERMISSIONS.SCAN_RESULTS_SIGN_OFF,
    // A wrong report already sent out (signed off) can be pulled back for correction.
    PERMISSIONS.SCAN_RESULTS_REVERSE,
    PERMISSIONS.SCAN_REVIEW_QUEUE_READ,
    PERMISSIONS.SCAN_RETAKE_MANAGE,
    PERMISSIONS.SCAN_FILES_UPLOAD,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.FILES_UPLOAD,
    PERMISSIONS.FILES_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    // Ask the store for supplies (Stores module).
    PERMISSIONS.STORES_REQUEST,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST
  ],
  [UserRole.BILLING_STAFF]: [
    PERMISSIONS.SYSTEM_READ,
    PERMISSIONS.MESSAGES_READ,
    PERMISSIONS.MESSAGES_SEND,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.BILLING_INVOICES_READ,
    PERMISSIONS.BILLING_INVOICES_MANAGE,
    PERMISSIONS.BILLING_PAYMENTS_CREATE,
    PERMISSIONS.BILLING_REFUNDS_MANAGE,
    PERMISSIONS.FINANCE_SHIFTS_MANAGE,
    PERMISSIONS.FINANCE_FLOAT_MANAGE,
    PERMISSIONS.FINANCE_EXPENSES_MANAGE,
    PERMISSIONS.FINANCE_LEDGER_READ,
    PERMISSIONS.FINANCE_ANALYTICS_READ,
    PERMISSIONS.REPORTS_FINANCE_READ,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.RESULTS_DELIVERY_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.PRICING_READ,
    // The claims office (Claims module).
    PERMISSIONS.CLAIMS_READ,
    PERMISSIONS.CLAIMS_MANAGE,
    PERMISSIONS.CLAIMS_ADJUDICATE,
    PERMISSIONS.CLAIMS_MEMBERSHIPS,
    // Stores office: stock, orders, deliveries and issues (Stores module).
    PERMISSIONS.STORES_READ,
    PERMISSIONS.STORES_MANAGE,
    PERMISSIONS.STORES_ORDER,
    PERMISSIONS.STORES_RECEIVE,
    PERMISSIONS.STORES_ISSUE,
    PERMISSIONS.STORES_REQUEST,
    // See the duty rota and ask for leave (HR module).
    PERMISSIONS.HR_ROTA_READ,
    PERMISSIONS.HR_LEAVE_REQUEST
  ]
};

export const PRICE_VISIBLE_ROLES = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.BILLING_STAFF] as const;

export const ORDER_ITEM_TYPE_BY_ROLE: Partial<Record<UserRole, CatalogItemType>> = {
  [UserRole.LAB_STAFF]: CatalogItemType.LAB,
  [UserRole.SCAN_STAFF]: CatalogItemType.SCAN
};

export function roleCanViewPrices(role: UserRole) {
  return PRICE_VISIBLE_ROLES.includes(role as (typeof PRICE_VISIBLE_ROLES)[number]);
}

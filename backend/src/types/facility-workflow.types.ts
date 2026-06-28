export const FACILITY_TYPES = {
  DIAGNOSTIC_CENTER: 'DIAGNOSTIC_CENTER',
  HOSPITAL_LAB: 'HOSPITAL_LAB',
  IMAGING_CENTER: 'IMAGING_CENTER',
  PARTNER_FACILITY: 'PARTNER_FACILITY',
} as const;

export const FACILITY_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export const FACILITY_FEATURES = {
  LABORATORY: 'laboratory',
  SCAN_IMAGING: 'scanImaging',
  BILLING: 'billing',
  CLINICIAN_PORTAL: 'clinicianPortal',
  RECEPTION: 'reception',
  WALK_IN_REQUESTS: 'walkInRequests',
  FILE_UPLOAD: 'fileUpload',
  RESULT_DELIVERY: 'resultDelivery',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
} as const;

export const FACILITY_DEPARTMENTS = {
  LABORATORY: 'laboratory',
  RADIOLOGY: 'radiology',
  ULTRASOUND: 'ultrasound',
  CT_SCAN: 'ctScan',
  MRI: 'mri',
  RECEPTION: 'reception',
  FINANCE: 'finance',
  ADMIN: 'admin',
} as const;

export const SERVICE_TYPES = {
  LAB: 'LAB',
  SCAN: 'SCAN',
  OTHER: 'OTHER',
} as const;

export const REQUEST_PRIORITY = {
  ROUTINE: 'ROUTINE',
  URGENT: 'URGENT',
  STAT: 'STAT',
} as const;

export const LAB_SAMPLE_STATUS = {
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
  CANCELLED: 'CANCELLED',
} as const;

export const LAB_TEST_RESULT_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  AMENDED: 'AMENDED',
} as const;

export const SCAN_REQUEST_STATUS = {
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
  CANCELLED: 'CANCELLED',
} as const;

export const RESULT_DELIVERY_STATUS = {
  SENT: 'SENT',
  READ: 'READ',
  ARCHIVED: 'ARCHIVED',
} as const;

export const RESULT_TYPES = {
  LAB: 'LAB',
  SCAN: 'SCAN',
} as const;

export const ALLOWED_RESULT_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[keyof typeof FACILITY_TYPES];
export type FacilityStatus = (typeof FACILITY_STATUS)[keyof typeof FACILITY_STATUS];
export type FacilityFeature = (typeof FACILITY_FEATURES)[keyof typeof FACILITY_FEATURES];
export type FacilityDepartment = (typeof FACILITY_DEPARTMENTS)[keyof typeof FACILITY_DEPARTMENTS];
export type ServiceType = (typeof SERVICE_TYPES)[keyof typeof SERVICE_TYPES];
export type RequestPriority = (typeof REQUEST_PRIORITY)[keyof typeof REQUEST_PRIORITY];
export type LabSampleStatus = (typeof LAB_SAMPLE_STATUS)[keyof typeof LAB_SAMPLE_STATUS];
export type LabTestResultStatus = (typeof LAB_TEST_RESULT_STATUS)[keyof typeof LAB_TEST_RESULT_STATUS];
export type ScanRequestStatus = (typeof SCAN_REQUEST_STATUS)[keyof typeof SCAN_REQUEST_STATUS];
export type ResultDeliveryStatus = (typeof RESULT_DELIVERY_STATUS)[keyof typeof RESULT_DELIVERY_STATUS];
export type ResultType = (typeof RESULT_TYPES)[keyof typeof RESULT_TYPES];

export interface CreateFacilityInput {
  name: string;
  code: string;
  type?: FacilityType;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  logoName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  notes?: string;
  features?: Partial<Record<FacilityFeature, boolean>>;
  departments?: Array<{
    departmentKey: FacilityDepartment | string;
    departmentName: string;
    isEnabled?: boolean;
    config?: unknown;
  }>;
  catalog?: Array<{
    serviceType: ServiceType;
    serviceCode: string;
    serviceName: string;
    departmentKey?: string;
    price?: number;
    turnaroundHours?: number;
    isActive?: boolean;
    config?: unknown;
  }>;
  limits?: Partial<Record<string, number>>;
}

export interface AcceptLabTestsInput {
  orderId: string;
  patientId: string;
  clinicianId?: string;
  priority?: RequestPriority;
  selectedTests: Array<{
    orderItemId?: string;
    testId?: string;
    testCode?: string;
    testName: string;
    referenceRange?: string;
    unit?: string;
  }>;
  notes?: string;
}

export interface EnterLabTestResultInput {
  resultValue: string;
  unit?: string;
  resultFlag?: string;
  resultNotes?: string;
  equipmentNotes?: string;
  markCompleted?: boolean;
}

export interface ResultDocumentMetadataInput {
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
}

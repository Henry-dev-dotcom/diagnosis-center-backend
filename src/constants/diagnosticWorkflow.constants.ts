export const REQUEST_TYPES = {
  LAB: 'LAB',
  SCAN: 'SCAN',
} as const;

export const ORDER_STATUS = {
  REQUESTED: 'REQUESTED',
  QUEUED: 'QUEUED',
  PARTIALLY_ACCEPTED: 'PARTIALLY_ACCEPTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
  ARCHIVED: 'ARCHIVED',
  CANCELLED: 'CANCELLED',
} as const;

export const LAB_SAMPLE_STATUS = {
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
} as const;

export const LAB_TEST_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export const RESULT_DELIVERY_STATUS = {
  SENT: 'SENT',
  READ: 'READ',
  ARCHIVED: 'ARCHIVED',
} as const;

export const SCAN_STATUS = {
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
} as const;

export const DEFAULT_FACILITY_FEATURES = {
  LABORATORY: 'laboratory',
  SCAN: 'scan',
  RECEPTION: 'reception',
  CLINICIAN_PORTAL: 'clinicianPortal',
  RESULT_DELIVERY: 'resultDelivery',
  FILE_UPLOAD: 'fileUpload',
} as const;

export const DEFAULT_DEPARTMENTS = {
  LABORATORY: 'laboratory',
  RADIOLOGY: 'radiology',
  RECEPTION: 'reception',
} as const;

export const DOCUMENT_UPLOAD = {
  MAX_FILE_SIZE_BYTES: 20 * 1024 * 1024,
  ALLOWED_MIME_TYPES: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
  ]),
};

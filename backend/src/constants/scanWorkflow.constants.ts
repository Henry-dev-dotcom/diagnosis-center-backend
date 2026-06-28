export const SCAN_QUEUE_STATUS = {
  QUEUED: 'QUEUED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
  CANCELLED: 'CANCELLED',
} as const;

export const SCAN_RESULT_STATUS = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
} as const;

export const SCAN_PRIORITY = {
  ROUTINE: 'ROUTINE',
  URGENT: 'URGENT',
  STAT: 'STAT',
} as const;

export const SCAN_MODALITIES = {
  XRAY: 'XRAY',
  ULTRASOUND: 'ULTRASOUND',
  CT: 'CT',
  MRI: 'MRI',
  MAMMOGRAPHY: 'MAMMOGRAPHY',
  ECG: 'ECG',
  OTHER: 'OTHER',
} as const;

export const SCAN_RESULT_DOCUMENT = {
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  ALLOWED_MIME_TYPES: new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ]),
};

export const SCAN_NOTIFICATION_EVENTS = {
  REQUEST_ACCEPTED: 'SCAN_REQUEST_ACCEPTED',
  RESULT_SAVED: 'SCAN_RESULT_SAVED',
  DOCUMENT_UPLOADED: 'SCAN_DOCUMENT_UPLOADED',
  RESULT_SENT_TO_CLINICIAN: 'SCAN_RESULT_SENT_TO_CLINICIAN',
} as const;

export const SCAN_AUDIT_EVENTS = {
  QUEUE_VIEWED: 'SCAN_QUEUE_VIEWED',
  REQUEST_ACCEPTED: 'SCAN_REQUEST_ACCEPTED',
  RESULT_SAVED: 'SCAN_RESULT_SAVED',
  DOCUMENT_UPLOADED: 'SCAN_DOCUMENT_UPLOADED',
  DOCUMENT_REMOVED: 'SCAN_DOCUMENT_REMOVED',
  RESULT_PUSHED: 'SCAN_RESULT_PUSHED_TO_CLINICIAN',
} as const;

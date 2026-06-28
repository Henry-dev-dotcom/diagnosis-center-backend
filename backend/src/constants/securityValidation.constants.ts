export const MAX_RESULT_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;

export const RESULT_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
] as const;

export const RESULT_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
] as const;

export const FACILITY_ACCESS_ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  DELIVER: 'deliver',
  UPLOAD: 'upload',
} as const;

export const SECURE_WORKFLOW_EVENT_TYPES = {
  FACILITY_ACCESS_DENIED: 'FACILITY_ACCESS_DENIED',
  INVALID_TEST_SELECTION: 'INVALID_TEST_SELECTION',
  DUPLICATE_SAMPLE_ACCEPTANCE: 'DUPLICATE_SAMPLE_ACCEPTANCE',
  INCOMPLETE_RESULT_DELIVERY_BLOCKED: 'INCOMPLETE_RESULT_DELIVERY_BLOCKED',
  UNSAFE_FILE_UPLOAD_BLOCKED: 'UNSAFE_FILE_UPLOAD_BLOCKED',
  POST_DELIVERY_EDIT_BLOCKED: 'POST_DELIVERY_EDIT_BLOCKED',
  UNAUTHORIZED_DOCUMENT_REMOVAL_BLOCKED: 'UNAUTHORIZED_DOCUMENT_REMOVAL_BLOCKED',
} as const;

export const LAB_SAMPLE_LOCKED_STATUSES = [
  'SENT_TO_CLINICIAN',
  'ARCHIVED',
  'CANCELLED',
] as const;

export const SCAN_LOCKED_STATUSES = [
  'SENT_TO_CLINICIAN',
  'ARCHIVED',
  'CANCELLED',
] as const;

export const RESULT_COMPLETION_STATUSES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SENT_TO_CLINICIAN: 'SENT_TO_CLINICIAN',
} as const;

export const RESULT_DOCUMENT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  MAX_FILES_PER_TEST: 10,
  MAX_FILES_PER_SCAN: 20,
} as const;

export const RESULT_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

export const RESULT_DOCUMENT_ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
]);

export const RESULT_DOCUMENT_TYPES = {
  LAB_RESULT_ATTACHMENT: 'LAB_RESULT_ATTACHMENT',
  SCAN_RESULT_ATTACHMENT: 'SCAN_RESULT_ATTACHMENT',
} as const;

export const RESULT_DOCUMENT_STORAGE = {
  LOCAL: 'LOCAL',
  EXTERNAL: 'EXTERNAL',
} as const;

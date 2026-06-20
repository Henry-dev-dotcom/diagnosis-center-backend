import { z } from 'zod';
import { paginationQuerySchema } from './common.validators.js';

const uploadFileRecordSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required').max(255).optional(),
  name: z.string().trim().min(1, 'File name is required').max(255).optional(),
  fileType: z.string().trim().min(1, 'File type is required').max(120).optional(),
  type: z.string().trim().min(1).max(120).optional(),
  fileSize: z.coerce.number().int().nonnegative('File size cannot be negative').optional(),
  size: z.coerce.number().int().nonnegative('File size cannot be negative').optional(),
  storageKey: z.string().trim().max(500).optional(),
  contentBase64: z.string().trim().optional(),
  base64: z.string().trim().optional(),
  dataUrl: z.string().trim().optional(),
  isDicom: z.boolean().optional(),
  studyUid: z.string().trim().max(160).optional(),
  seriesUid: z.string().trim().max(160).optional(),
  instanceUid: z.string().trim().max(160).optional(),
  modality: z.string().trim().max(40).optional(),
  metadata: z.record(z.unknown()).optional()
}).refine((value) => Boolean(value.fileName || value.name), {
  message: 'fileName or name is required',
  path: ['fileName']
});

export const fileUploadSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required').max(255).optional(),
  fileType: z.string().trim().min(1, 'File type is required').max(120).optional(),
  fileSize: z.coerce.number().int().nonnegative('File size cannot be negative').optional(),
  storageKey: z.string().trim().max(500).optional(),
  contentBase64: z.string().trim().optional(),
  base64: z.string().trim().optional(),
  dataUrl: z.string().trim().optional(),
  module: z.enum(['LAB', 'SCAN', 'RESULTS', 'ADMIN', 'OTHER']).default('OTHER'),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(120).optional(),
  resultId: z.string().trim().max(120).optional(),
  isDicom: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
  files: z.array(uploadFileRecordSchema).max(30, 'A single upload request cannot exceed 30 files').optional()
}).refine((value) => Boolean(value.files?.length || value.fileName), {
  message: 'Provide files[] or a single fileName upload record',
  path: ['files']
});

export const fileQuerySchema = paginationQuerySchema.extend({
  isDicom: z.enum(['true', 'false']).optional(),
  studyUid: z.string().trim().optional(),
  modality: z.string().trim().optional(),
  scanResultId: z.string().trim().optional()
});

export const dicomStudyParamSchema = z.object({
  studyUid: z.string().trim().min(1, 'Study UID is required').max(160)
});

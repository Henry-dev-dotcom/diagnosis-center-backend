import { z } from 'zod';
import { dateRangeQueryBaseSchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

const scanFileMetadataSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required'),
  fileType: z.string().trim().min(1, 'File type is required').optional(),
  fileSize: z.coerce.number().int().nonnegative('File size cannot be negative').optional(),
  storageKey: z.string().trim().min(1, 'Storage key is required').optional(),
  contentBase64: z.string().trim().optional(),
  base64: z.string().trim().optional(),
  dataUrl: z.string().trim().optional(),
  isDicom: z.boolean().default(false),
  studyUid: z.string().trim().max(160).optional(),
  seriesUid: z.string().trim().max(160).optional(),
  instanceUid: z.string().trim().max(160).optional(),
  modality: z.string().trim().max(40).optional()
});

const acceptScanBaseSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required').optional(),
  orderItemIds: z.array(z.string().min(1)).min(1, 'At least one scan order item is required').optional(),
  patientId: z.string().min(1, 'Patient ID is required').optional(),
  notes: optionalNotesSchema
});

export const acceptScanSchema = acceptScanBaseSchema.refine((value) => Boolean(value.orderId || value.orderItemIds?.length), {
  message: 'Provide orderId or orderItemIds to accept a scan request',
  path: ['orderId']
});

export const acceptScanFromOrderSchema = acceptScanBaseSchema.partial();

export const scanBookingSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  orderItemId: z.string().min(1, 'Order item ID is required').optional(),
  equipmentId: z.string().min(1, 'Equipment ID is required'),
  scheduledAt: z.coerce.date({ required_error: 'Scheduled date/time is required' }),
  durationMinutes: z.coerce.number().int().positive().max(480).default(30),
  notes: optionalNotesSchema
});

export const scanResultSchema = z.object({
  scanAcceptanceId: z.string().min(1, 'Scan acceptance ID is required').optional(),
  orderItemId: z.string().min(1, 'Order item ID is required').optional(),
  resultId: z.string().min(1, 'Result ID is required').optional(),
  findings: z.string().trim().min(5, 'Findings are required').max(5000, 'Findings cannot exceed 5000 characters'),
  impression: z.string().trim().min(5, 'Impression is required').max(2000, 'Impression cannot exceed 2000 characters'),
  recommendation: z.string().trim().max(2000, 'Recommendation cannot exceed 2000 characters').optional(),
  comparison: z.string().trim().max(2000, 'Comparison cannot exceed 2000 characters').optional(),
  technicianNotes: z.string().trim().max(2000, 'Technician notes cannot exceed 2000 characters').optional(),
  modality: z.string().trim().max(40).optional(),
  files: z.array(scanFileMetadataSchema).optional()
}).refine((value) => Boolean(value.scanAcceptanceId || value.orderItemId || value.resultId), {
  message: 'Provide scanAcceptanceId, orderItemId, or resultId',
  path: ['scanAcceptanceId']
});

export const submitScanResultReviewSchema = z.object({
  resultId: z.string().min(1, 'Result ID is required'),
  notes: optionalNotesSchema
});

export const signOffScanResultSchema = z.object({
  decision: z.enum(['SIGNED_OFF', 'REJECTED']),
  reviewerComment: z.string().trim().max(1000, 'Reviewer comment cannot exceed 1000 characters').optional()
}).refine((value) => value.decision === 'SIGNED_OFF' || Boolean(value.reviewerComment), {
  message: 'Reviewer comment is required when rejecting a scan report',
  path: ['reviewerComment']
});

export const scanRetakeSchema = z.object({
  resultId: z.string().min(1, 'Result ID is required'),
  reason: requiredReasonSchema,
  notes: optionalNotesSchema
});


export const scanResultFilesSchema = z.object({
  files: z.array(scanFileMetadataSchema).min(1, 'At least one scan file or DICOM metadata record is required')
});

export const scanWorkflowQuerySchema = dateRangeQueryBaseSchema
  .extend({
    status: z.string().trim().optional(),
    equipmentId: z.string().trim().optional()
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From date cannot be after to date',
    path: ['from']
  });

import { z } from 'zod';
import { CLINICIAN_RESULT_SOURCE } from '../constants/clinicianResultDelivery.constants';

const id = z.string().trim().min(1);

export const deliverResultToClinicianSchema = z.object({
  body: z.object({
    clinicianId: id,
    patientId: id.optional().nullable(),
    orderId: id.optional().nullable(),
    acceptedSampleId: id.optional().nullable(),
    scanAcceptedRequestId: id.optional().nullable(),
    resultId: id.optional().nullable(),
    source: z.enum([CLINICIAN_RESULT_SOURCE.LAB, CLINICIAN_RESULT_SOURCE.SCAN, CLINICIAN_RESULT_SOURCE.MANUAL] as [string, string, string]),
    priority: z.string().trim().optional().nullable(),
    title: z.string().trim().max(180).optional().nullable(),
    summary: z.string().trim().max(2000).optional().nullable(),
    payload: z.record(z.any()).optional().nullable(),
  }).refine((data) => data.acceptedSampleId || data.scanAcceptedRequestId || data.resultId, {
    message: 'acceptedSampleId, scanAcceptedRequestId, or resultId is required.',
  }),
});

export const clinicianInboxQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    source: z.string().optional(),
    priority: z.string().optional(),
    patientId: z.string().optional(),
    orderId: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    take: z.string().optional(),
    skip: z.string().optional(),
  }),
});

export const inboxIdParamSchema = z.object({
  params: z.object({
    inboxId: id.optional(),
    resultId: id.optional(),
  }).refine((params) => params.inboxId || params.resultId, {
    message: 'Result inbox id is required.',
  }),
});

export const archiveResultSchema = z.object({
  params: z.object({ inboxId: id.optional(), resultId: id.optional() }),
  body: z.object({ archived: z.boolean().optional() }).optional().default({}),
});

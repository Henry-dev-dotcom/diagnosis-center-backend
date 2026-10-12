import { Router, type Request, type Response } from 'express';
import { ChartAccessPurpose, PatientDocumentCategory, RecordRequestStatus, RecordRequesterType, UserRole } from '@prisma/client';
import { z } from 'zod';
import { PERMISSIONS } from '../config/permissions.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { requireModule } from '../middleware/requireModule.js';
import { validateRequest } from '../middleware/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import * as records from '../services/records.service.js';
import { listDirectory, getVisitRecord } from '../services/patientDirectory.service.js';
import { downloadDocument, listDocuments, uploadDocument } from '../services/patientDocuments.service.js';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
// The purpose is required: every chart view is logged with why it was opened.
const chartQuerySchema = z.object({ purpose: z.nativeEnum(ChartAccessPurpose), note: optionalText(200) });
const searchQuerySchema = z.object({ search: z.string().trim().min(2, 'Type at least two characters').max(80) });
const directoryQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  cohort: z.enum(['chronic', 'paediatric', 'older', 'admitted', 'recent']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
const visitParamsSchema = z.object({ id: z.string().min(1), encounterId: z.string().min(1) });
// A 5 MB file is about 6.7 million characters of base64; a little over that is the most a request may carry.
const documentSchema = z.object({
  title: z.string().trim().min(2, 'Give the document a title').max(120),
  category: z.nativeEnum(PatientDocumentCategory).default(PatientDocumentCategory.OTHER),
  fileName: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1, 'Choose a file').max(7_200_000)
});
const requestQuerySchema = z.object({ status: z.nativeEnum(RecordRequestStatus).optional(), patientId: z.string().min(1).optional() });
const requestSchema = z.object({
  patientId: z.string().min(1, 'Choose the patient'),
  requesterName: z.string().trim().min(2, 'Who is asking?').max(160),
  requesterType: z.nativeEnum(RecordRequesterType),
  purpose: z.string().trim().min(3, 'Why do they need the records?').max(500),
  scope: z.string().trim().min(3, 'Say which records').max(500),
  consentObtained: z.boolean().default(false),
  consentReference: optionalText(120)
});
const decisionSchema = z.object({ decision: z.enum(['APPROVE', 'REFUSE']), note: optionalText(500), consentReference: optionalText(120) });
const releaseSchema = z.object({ method: z.string().trim().min(2, 'How were the records released?').max(120) });

const P = PERMISSIONS;
const ok = (message: string, fn: (req: Request) => Promise<unknown>) => asyncHandler(async (req: Request, res: Response) => sendSuccess(res, message, await fn(req)));

// Clinicians read charts; the records office logs and releases; the administrator approves and audits.
export const recordsRoutes = Router();
recordsRoutes.use('/records', requireAuth, requireModule('medical_records'), requireRole(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST));
recordsRoutes.get('/records/patients', requirePermission(P.RECORDS_CHART_READ), validateRequest({ query: searchQuerySchema }), ok('Patients found', (req) => records.searchPatients(req.query as never)));
recordsRoutes.get('/records/patients/:id/chart', requirePermission(P.RECORDS_CHART_READ), validateRequest({ params: idParamSchema, query: chartQuerySchema }), ok('Chart loaded', (req) => records.patientChart(req.params.id, req.query as never, req)));
recordsRoutes.get('/records/patients/:id/access-log', requirePermission(P.RECORDS_AUDIT), validateRequest({ params: idParamSchema }), ok('Access log loaded', (req) => records.accessLog(req.params.id)));
recordsRoutes.get('/records/requests', requirePermission(P.RECORDS_RELEASE), validateRequest({ query: requestQuerySchema }), ok('Requests loaded', (req) => records.listRequests(req.query as never)));
recordsRoutes.post('/records/requests', requirePermission(P.RECORDS_RELEASE), validateRequest({ body: requestSchema }), asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Request logged', await records.logRequest(req.body, req))));
recordsRoutes.post('/records/requests/:id/decision', requirePermission(P.RECORDS_APPROVE), validateRequest({ params: idParamSchema, body: decisionSchema }), ok('Decision recorded', (req) => records.decideRequest(req.params.id, req.body, req)));
recordsRoutes.post('/records/requests/:id/release', requirePermission(P.RECORDS_RELEASE), validateRequest({ params: idParamSchema, body: releaseSchema }), ok('Release recorded', (req) => records.releaseRequest(req.params.id, req.body, req)));

// The directory: finding a patient. Reading what is in their record goes through the chart, which logs it.
recordsRoutes.get('/records/directory', requirePermission(P.RECORDS_CHART_READ), validateRequest({ query: directoryQuerySchema }), ok('Directory loaded', (req) => listDirectory(req.query as never)));
recordsRoutes.get('/records/patients/:id/encounters/:encounterId', requirePermission(P.RECORDS_CHART_READ), validateRequest({ params: visitParamsSchema, query: chartQuerySchema }), ok('Visit loaded', (req) => getVisitRecord(req.params.id, req.params.encounterId, req.query as never, req)));

// The document vault.
recordsRoutes.get('/records/patients/:id/documents', requirePermission(P.RECORDS_CHART_READ), validateRequest({ params: idParamSchema }), ok('Documents loaded', (req) => listDocuments(req.params.id)));
recordsRoutes.post('/records/patients/:id/documents', requirePermission(P.RECORDS_DOCUMENTS_WRITE), validateRequest({ params: idParamSchema, body: documentSchema }), asyncHandler(async (req: Request, res: Response) => sendCreated(res, 'Document filed', await uploadDocument(req.params.id, req.body, req))));
recordsRoutes.get('/records/documents/:id/download', requirePermission(P.RECORDS_CHART_READ), validateRequest({ params: idParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const doc = await downloadDocument(req.params.id, req);
  // Served as a download of a file whose type was read from its bytes, and told never to be guessed at or run.
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName.replace(/"/g, '')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(Buffer.from(doc.content));
}));

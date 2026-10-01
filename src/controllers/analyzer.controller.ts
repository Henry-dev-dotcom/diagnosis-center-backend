import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import {
  createAnalyzerDevice,
  deleteAnalyzerTestMap,
  getAnalyzerDevice,
  getAnalyzerMessage,
  listAnalyzerDevices,
  listAnalyzerMessages,
  listAnalyzerTestMaps,
  listUnmappedAnalyzerCodes,
  discardAnalyzerMessage,
  replayAnalyzerMessage,
  rotateAnalyzerDeviceKey,
  updateAnalyzerDevice,
  uploadAnalyzerFile,
  upsertAnalyzerTestMap
} from '../services/analyzer/device.service.js';
import { ingestAnalyzerPayload } from '../services/analyzer/ingest.service.js';

/* ---------------------------------------------------------------- devices -- */

export const listAnalyzerDevicesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAnalyzerDevices(req.query);
  return sendSuccess(res, 'Analyzers loaded successfully', result);
});

export const getAnalyzerDeviceController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAnalyzerDevice(req.params.id);
  return sendSuccess(res, 'Analyzer loaded successfully', result);
});

export const createAnalyzerDeviceController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createAnalyzerDevice(req.body, req);
  // The key is in this response and nowhere else, ever again.
  return sendSuccess(res, 'Analyzer registered. Copy its key now — it cannot be shown again.', result, 201);
});

export const updateAnalyzerDeviceController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateAnalyzerDevice(req.params.id, req.body, req);
  return sendSuccess(res, 'Analyzer updated successfully', result);
});

export const rotateAnalyzerDeviceKeyController = asyncHandler(async (req: Request, res: Response) => {
  const result = await rotateAnalyzerDeviceKey(req.params.id, req);
  return sendSuccess(res, 'A new key was issued. The old one stopped working immediately.', result);
});

/* ------------------------------------------------------------- test maps -- */

export const listAnalyzerTestMapsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAnalyzerTestMaps(req.query);
  return sendSuccess(res, 'Test mapping loaded successfully', result);
});

export const upsertAnalyzerTestMapController = asyncHandler(async (req: Request, res: Response) => {
  const result = await upsertAnalyzerTestMap(req.body, req);
  return sendSuccess(res, 'Test mapping saved successfully', result, 201);
});

export const deleteAnalyzerTestMapController = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteAnalyzerTestMap(req.params.id, req);
  return sendSuccess(res, 'Test mapping removed successfully', result);
});

export const listUnmappedAnalyzerCodesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listUnmappedAnalyzerCodes(req.query);
  return sendSuccess(res, 'Unmapped analyzer codes loaded successfully', result);
});

/* --------------------------------------------------------------- messages -- */

export const listAnalyzerMessagesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listAnalyzerMessages(req.query);
  return sendSuccess(res, 'Analyzer messages loaded successfully', result);
});

export const getAnalyzerMessageController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAnalyzerMessage(req.params.id);
  return sendSuccess(res, 'Analyzer message loaded successfully', result);
});

export const replayAnalyzerMessageController = asyncHandler(async (req: Request, res: Response) => {
  const result = await replayAnalyzerMessage(req.params.id, req);
  return sendSuccess(res, 'Analyzer message processed again', result);
});

export const discardAnalyzerMessageController = asyncHandler(async (req: Request, res: Response) => {
  const result = await discardAnalyzerMessage(req.params.id, req.body, req);
  return sendSuccess(res, 'Analyzer message discarded', result);
});

export const uploadAnalyzerFileController = asyncHandler(async (req: Request, res: Response) => {
  const result = await uploadAnalyzerFile(req.body, req);
  return sendSuccess(res, describeOutcome(result.outcome.applied, result.outcome.skipped), result, 201);
});

/* -------------------------------------------------------------- ingestion -- */

/**
 * What the analyzer itself (or its bridge) posts to. The body is the instrument's
 * own payload, taken as text, so an HL7 or ASTM message needs no wrapping.
 */
export const ingestAnalyzerResultsController = asyncHandler(async (req: Request, res: Response) => {
  const device = req.analyzerDevice;
  if (!device) throw new AppError('Analyzer authentication is required', 401, 'ANALYZER_KEY_REQUIRED');

  const payload = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  const outcome = await ingestAnalyzerPayload({
    device,
    rawPayload: payload,
    contentType: req.header('content-type') ?? null
  });

  /*
    A 202 is deliberate. Storing the payload always succeeds; applying it may not,
    and a bridge must not retry forever over a mapping gap a person has to fix.
    The body says exactly what happened so the bridge can log it.
  */
  return sendSuccess(
    res,
    describeOutcome(outcome.applied, outcome.skipped),
    { messageId: outcome.messageId, status: outcome.status, applied: outcome.applied, skipped: outcome.skipped, notes: outcome.notes, error: outcome.error },
    202
  );
});

function describeOutcome(applied: number, skipped: number) {
  if (applied > 0 && skipped === 0) return `${applied} value(s) stored as a draft result awaiting your check.`;
  if (applied > 0) return `${applied} value(s) stored; ${skipped} need attention.`;
  return 'Nothing could be stored from this message. See the reasons on it.';
}

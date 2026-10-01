import type { NextFunction, Request, Response } from 'express';
import { AnalyzerDeviceStatus, FacilityStatus, type AnalyzerDevice } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../services/prisma.service.js';
import { runAsSystem, runWithFacility } from '../services/tenantContext.js';
import { modulesForFacility } from '../services/facilityAccess.service.js';
import { readKeyPrefix } from '../services/analyzer/device.service.js';
import { auditAccessFailure } from './audit.js';
import { AppError } from '../utils/appError.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAnalyzerDevice: the instrument that authenticated this request. */
    analyzerDevice?: AnalyzerDevice;
  }
}

/*
  How an analyzer proves who it is.

  A device presents its own key, not a staff login, so nothing it sends is ever
  attributed to a person. The key's prefix is public and indexed; the whole key is
  verified against a hash. Because the prefix identifies the device globally, the
  one lookup that must run before any facility is known runs as the system, and
  everything afterwards runs inside that device's facility.
*/

function presentedKey(req: Request) {
  const header = req.header('x-analyzer-key');
  if (header && header.trim() !== '') return header.trim();
  const authorization = req.header('authorization');
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export async function requireAnalyzerDevice(req: Request, _res: Response, next: NextFunction) {
  try {
    const key = presentedKey(req);
    if (!key) {
      auditAccessFailure(req, 401, 'ANALYZER_KEY_REQUIRED', 'An analyzer key is required');
      throw new AppError('An analyzer key is required. Send it in the X-Analyzer-Key header.', 401, 'ANALYZER_KEY_REQUIRED');
    }

    const prefix = readKeyPrefix(key);
    if (!prefix) {
      auditAccessFailure(req, 401, 'ANALYZER_KEY_INVALID', 'Analyzer key is malformed');
      throw new AppError('That analyzer key is not valid', 401, 'ANALYZER_KEY_INVALID');
    }

    // The prefix is unique across the platform, so this is one row or none.
    const device = await runAsSystem('analyzer.auth', () => prisma.analyzerDevice.findUnique({ where: { apiKeyPrefix: prefix }, include: { facility: true } }));
    // Verify even when there is no such device, so a wrong prefix and a wrong
    // secret take the same time to answer.
    const matches = await bcrypt.compare(key, device?.apiKeyHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!device || !matches) {
      auditAccessFailure(req, 401, 'ANALYZER_KEY_INVALID', 'Analyzer key did not match any device', { prefix });
      throw new AppError('That analyzer key is not valid', 401, 'ANALYZER_KEY_INVALID');
    }

    if (device.status !== AnalyzerDeviceStatus.ACTIVE) {
      auditAccessFailure(req, 403, 'ANALYZER_DEVICE_DISABLED', 'Analyzer is disabled', { deviceId: device.id });
      throw new AppError('This analyzer has been disabled', 403, 'ANALYZER_DEVICE_DISABLED');
    }
    if (device.facility.status !== FacilityStatus.ACTIVE) {
      auditAccessFailure(req, 403, 'FACILITY_NOT_ACTIVE', 'Facility is not active', { facilityId: device.facilityId });
      throw new AppError('This facility account is not active', 403, 'FACILITY_NOT_ACTIVE');
    }

    const modules = await modulesForFacility(device.facilityId);
    if (!modules.includes('laboratory')) {
      auditAccessFailure(req, 403, 'MODULE_NOT_ENABLED', 'Laboratory module is not enabled', { facilityId: device.facilityId });
      throw new AppError('The Laboratory module is not switched on for this facility', 403, 'MODULE_NOT_ENABLED');
    }

    /*
      An unpaid facility is read-only for its staff, but an analyzer is still
      allowed to file what it measured. Refusing would throw away a run that
      cannot be repeated on a sample that may no longer be viable, and nothing
      filed here reaches a patient without a person signing it off — which the
      read-only rule does already prevent.
    */

    req.analyzerDevice = device;
    runWithFacility(device.facilityId, () => next());
  } catch (error) {
    next(error);
  }
}

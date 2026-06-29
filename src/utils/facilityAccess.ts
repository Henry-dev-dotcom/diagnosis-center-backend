import type { FacilityScopedRequest } from '../types/facility-request.types';

export function getUserId(req: FacilityScopedRequest): string | undefined {
  return req.user?.id || req.user?.userId || req.user?.sub;
}

export function getRequestedFacilityId(req: FacilityScopedRequest): string | undefined {
  const fromParams = req.params?.facilityId || req.params?.facilityID;
  const fromQuery = typeof req.query?.facilityId === 'string' ? req.query.facilityId : undefined;
  const fromBody = typeof req.body?.facilityId === 'string' ? req.body.facilityId : undefined;
  const fromHeader = typeof req.headers['x-facility-id'] === 'string' ? req.headers['x-facility-id'] : undefined;
  return fromParams || fromBody || fromQuery || fromHeader || req.user?.facilityId || undefined;
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))];
}

export function applyFacilityScope<T extends Record<string, unknown>>(
  where: T = {} as T,
  req: FacilityScopedRequest,
  facilityField = 'facilityId'
): T {
  if (req.isSuperAdmin && !req.facilityId) {
    return where;
  }

  if (req.facilityId) {
    return {
      ...where,
      [facilityField]: req.facilityId,
    } as T;
  }

  const ids = req.facilityIds || [];
  if (ids.length > 0) {
    return {
      ...where,
      [facilityField]: { in: ids },
    } as T;
  }

  return {
    ...where,
    [facilityField]: '__NO_FACILITY_ACCESS__',
  } as T;
}

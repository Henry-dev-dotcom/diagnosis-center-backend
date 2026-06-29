import type { Request } from 'express';

export interface AuthUserPayload {
  id?: string;
  userId?: string;
  sub?: string;
  email?: string;
  role?: string;
  facilityId?: string | null;
  facilityIds?: string[];
  [key: string]: unknown;
}

export interface FacilityScopedRequest extends Request {
  user?: AuthUserPayload;
  facilityId?: string;
  facilityIds?: string[];
  isSuperAdmin?: boolean;
  facilityScope?: {
    requestedFacilityId?: string;
    allowedFacilityIds: string[];
    isSuperAdmin: boolean;
    role?: string;
  };
}

export interface FacilityAssignmentDTO {
  id: string;
  facilityId: string;
  userId: string;
  roleKey: string;
  isPrimary?: boolean;
  status?: string;
}

export interface FacilityScopedWhereOptions {
  facilityId?: string;
  allowedFacilityIds?: string[];
  isSuperAdmin?: boolean;
}

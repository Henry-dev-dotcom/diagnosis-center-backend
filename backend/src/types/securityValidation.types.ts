import type { Request } from 'express';

export type AuthenticatedUserLike = {
  id?: string;
  userId?: string;
  role?: string;
  facilityId?: string;
  facilityIds?: string[];
  permissions?: string[];
};

export type SecureFacilityRequest = Request & {
  user?: AuthenticatedUserLike;
  facilityId?: string;
  facilityIds?: string[];
  isSuperAdmin?: boolean;
  facilityScope?: {
    requestedFacilityId?: string;
    allowedFacilityIds?: string[];
    isSuperAdmin?: boolean;
    role?: string;
  };
};

export type FileSecurityValidationInput = {
  originalname?: string;
  mimetype?: string;
  size?: number;
};

export type LabSelectedTestInput = {
  orderItemId?: string | null;
  testId?: string | null;
  testName?: string | null;
  testCode?: string | null;
};

export type WorkflowSecurityEventInput = {
  facilityId?: string | null;
  actorId?: string | null;
  eventType: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  patientId?: string | null;
  orderId?: string | null;
  resultId?: string | null;
  documentId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
};

export type RouteGuardOptions = {
  allowedRoles?: string[];
  requiredFeature?: string;
  requiredDepartment?: string;
  requireFacility?: boolean;
};

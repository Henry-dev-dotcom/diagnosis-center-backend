import type { Request } from 'express';

export type AnyRecord = Record<string, any>;

export type FacilityActor = {
  actorId: string;
  actorRole?: string | null;
  actorName?: string | null;
};

export type CreateFacilityDTO = {
  name: string;
  code?: string;
  type?: string;
  status?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  logoName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  notes?: string | null;
  features?: FacilityFeatureDTO[];
  departments?: FacilityDepartmentDTO[];
  catalog?: FacilityCatalogItemDTO[];
  routingRules?: FacilityRoutingRuleDTO[];
  limits?: FacilityLimitDTO[];
};

export type UpdateFacilityDTO = Partial<CreateFacilityDTO>;

export type FacilityFeatureDTO = {
  featureKey: string;
  isEnabled?: boolean;
  config?: AnyRecord | null;
};

export type FacilityDepartmentDTO = {
  departmentKey: string;
  departmentName?: string;
  isEnabled?: boolean;
  config?: AnyRecord | null;
};

export type FacilityCatalogItemDTO = {
  serviceType: 'LAB' | 'SCAN' | 'OTHER' | string;
  serviceCode: string;
  serviceName: string;
  departmentKey?: string | null;
  price?: number | string | null;
  turnaroundHours?: number | string | null;
  isActive?: boolean;
  config?: AnyRecord | null;
};

export type FacilityRoutingRuleDTO = {
  sourceRole: string;
  requestType: 'LAB' | 'SCAN' | string;
  targetDepartment: string;
  resultRecipient?: string;
  requiresReceptionPush?: boolean;
  isEnabled?: boolean;
  config?: AnyRecord | null;
};

export type FacilityLimitDTO = {
  limitKey: string;
  limitValue: number | string;
};

export type AssignFacilityUserDTO = {
  userId: string;
  roleKey: string;
  isPrimary?: boolean;
  status?: string;
};

export type FacilitySearchOptions = {
  q?: string;
  search?: string;
  status?: string;
  type?: string;
  take?: number | string;
  skip?: number | string;
};

export type FacilityManagementRequest = Request & {
  user?: any;
  facilityContext?: {
    facilityId?: string | null;
    accessibleFacilityIds?: string[];
    isSuperAdmin?: boolean;
  };
};

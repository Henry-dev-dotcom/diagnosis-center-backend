import { prisma } from './facilityScope.service';
import {
  DEFAULT_FACILITY_DEPARTMENTS,
  DEFAULT_FACILITY_FEATURES,
  FACILITY_AUDIT_EVENTS,
  FACILITY_STATUS,
  FACILITY_TYPES,
} from '../constants/facilityManagement.constants';
import type {
  AssignFacilityUserDTO,
  CreateFacilityDTO,
  FacilityCatalogItemDTO,
  FacilityDepartmentDTO,
  FacilityFeatureDTO,
  FacilityLimitDTO,
  FacilityRoutingRuleDTO,
  FacilitySearchOptions,
  UpdateFacilityDTO,
} from '../types/facilityManagement.types';
import {
  badRequest,
  conflict,
  makeFacilityCode,
  normalizeCode,
  normalizeText,
  notFound,
  nullableText,
  safeJson,
  toBool,
  toInt,
  toSafeSkip,
  toSafeTake,
} from '../utils/facilityManagement.utils';

async function writeAudit(eventType: string, actorId: string, facilityId: string, metadata: Record<string, any> = {}) {
  const auditClient = (prisma as any).auditLog;
  if (!auditClient?.create) return;
  await auditClient.create({
    data: {
      eventType,
      action: eventType,
      actorId,
      userId: actorId,
      facilityId,
      entityType: 'DiagnosticFacility',
      entityId: facilityId,
      metadata,
      createdAt: new Date(),
    },
  }).catch(() => undefined);
}

function facilityInclude() {
  return {
    features: true,
    departments: true,
    catalog: true,
    routingRules: true,
    limits: true,
    users: true,
  };
}

export class FacilityManagementService {
  async listFacilities(options: FacilitySearchOptions = {}) {
    const q = normalizeText(options.q || options.search);
    const where: any = {};

    if (options.status) where.status = String(options.status).toUpperCase();
    if (options.type) where.type = String(options.type).toUpperCase();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { region: { contains: q, mode: 'insensitive' } },
      ];
    }

    return (prisma as any).diagnosticFacility.findMany({
      where,
      include: facilityInclude(),
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: toSafeTake(options.take),
      skip: toSafeSkip(options.skip),
    });
  }

  async getFacility(facilityId: string) {
    const facility = await (prisma as any).diagnosticFacility.findUnique({
      where: { id: facilityId },
      include: facilityInclude(),
    });
    if (!facility) throw notFound('Diagnostic facility not found.');
    return facility;
  }

  async createFacility(payload: CreateFacilityDTO, actorId: string) {
    const name = normalizeText(payload.name);
    if (!name) throw badRequest('Facility name is required.');

    const code = normalizeCode(payload.code || makeFacilityCode(name));
    if (!code) throw badRequest('Facility code is required.');

    const existing = await (prisma as any).diagnosticFacility.findUnique({ where: { code } });
    if (existing) throw conflict('A diagnostic facility with this code already exists.');

    const facility = await (prisma as any).diagnosticFacility.create({
      data: {
        name,
        code,
        type: payload.type || FACILITY_TYPES.DIAGNOSTIC_CENTER,
        status: payload.status || FACILITY_STATUS.ACTIVE,
        phone: nullableText(payload.phone),
        email: nullableText(payload.email),
        address: nullableText(payload.address),
        city: nullableText(payload.city),
        region: nullableText(payload.region),
        country: nullableText(payload.country) || 'Ghana',
        logoName: nullableText(payload.logoName),
        primaryColor: payload.primaryColor || '#2f2925',
        secondaryColor: payload.secondaryColor || '#efe5d5',
        notes: nullableText(payload.notes),
        features: {
          create: (payload.features?.length ? payload.features : DEFAULT_FACILITY_FEATURES.map(featureKey => ({ featureKey }))).map((item: FacilityFeatureDTO | string) => {
            if (typeof item === 'string') return { featureKey: item, isEnabled: true };
            return { featureKey: item.featureKey, isEnabled: toBool(item.isEnabled, true), config: safeJson(item.config) };
          }),
        },
        departments: {
          create: (payload.departments?.length ? payload.departments : DEFAULT_FACILITY_DEPARTMENTS).map((item: FacilityDepartmentDTO) => ({
            departmentKey: item.departmentKey,
            departmentName: item.departmentName || item.departmentKey,
            isEnabled: toBool(item.isEnabled, true),
            config: safeJson(item.config),
          })),
        },
        catalog: payload.catalog?.length ? { create: payload.catalog.map(this.mapCatalogItem) } : undefined,
        routingRules: payload.routingRules?.length ? { create: payload.routingRules.map(this.mapRoutingRule) } : undefined,
        limits: payload.limits?.length ? { create: payload.limits.map(this.mapLimit) } : undefined,
      },
      include: facilityInclude(),
    });

    await writeAudit(FACILITY_AUDIT_EVENTS.CREATED, actorId, facility.id, { name, code });
    return facility;
  }

  async updateFacility(facilityId: string, payload: UpdateFacilityDTO, actorId: string) {
    await this.getFacility(facilityId);

    const data: any = {};
    if (payload.name !== undefined) data.name = normalizeText(payload.name);
    if (payload.code !== undefined) data.code = normalizeCode(payload.code);
    if (payload.type !== undefined) data.type = payload.type;
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.phone !== undefined) data.phone = nullableText(payload.phone);
    if (payload.email !== undefined) data.email = nullableText(payload.email);
    if (payload.address !== undefined) data.address = nullableText(payload.address);
    if (payload.city !== undefined) data.city = nullableText(payload.city);
    if (payload.region !== undefined) data.region = nullableText(payload.region);
    if (payload.country !== undefined) data.country = nullableText(payload.country) || 'Ghana';
    if (payload.logoName !== undefined) data.logoName = nullableText(payload.logoName);
    if (payload.primaryColor !== undefined) data.primaryColor = payload.primaryColor;
    if (payload.secondaryColor !== undefined) data.secondaryColor = payload.secondaryColor;
    if (payload.notes !== undefined) data.notes = nullableText(payload.notes);

    const facility = await (prisma as any).diagnosticFacility.update({
      where: { id: facilityId },
      data,
      include: facilityInclude(),
    });

    await writeAudit(FACILITY_AUDIT_EVENTS.UPDATED, actorId, facilityId, { updatedFields: Object.keys(data) });
    return facility;
  }

  async setFacilityStatus(facilityId: string, status: string, actorId: string) {
    if (!status) throw badRequest('Facility status is required.');
    const facility = await (prisma as any).diagnosticFacility.update({
      where: { id: facilityId },
      data: { status: String(status).toUpperCase() },
      include: facilityInclude(),
    });
    await writeAudit(FACILITY_AUDIT_EVENTS.STATUS_CHANGED, actorId, facilityId, { status });
    return facility;
  }

  async updateFeatures(facilityId: string, features: FacilityFeatureDTO[], actorId: string) {
    await this.getFacility(facilityId);
    if (!Array.isArray(features)) throw badRequest('features must be an array.');

    await (prisma as any).$transaction(features.map(item => (prisma as any).facilityFeature.upsert({
      where: { facilityId_featureKey: { facilityId, featureKey: item.featureKey } },
      update: { isEnabled: toBool(item.isEnabled, true), config: safeJson(item.config) },
      create: { facilityId, featureKey: item.featureKey, isEnabled: toBool(item.isEnabled, true), config: safeJson(item.config) },
    })));

    await writeAudit(FACILITY_AUDIT_EVENTS.FEATURES_UPDATED, actorId, facilityId, { count: features.length });
    return this.getFacility(facilityId);
  }

  async updateDepartments(facilityId: string, departments: FacilityDepartmentDTO[], actorId: string) {
    await this.getFacility(facilityId);
    if (!Array.isArray(departments)) throw badRequest('departments must be an array.');

    await (prisma as any).$transaction(departments.map(item => (prisma as any).facilityDepartment.upsert({
      where: { facilityId_departmentKey: { facilityId, departmentKey: item.departmentKey } },
      update: {
        departmentName: item.departmentName || item.departmentKey,
        isEnabled: toBool(item.isEnabled, true),
        config: safeJson(item.config),
      },
      create: {
        facilityId,
        departmentKey: item.departmentKey,
        departmentName: item.departmentName || item.departmentKey,
        isEnabled: toBool(item.isEnabled, true),
        config: safeJson(item.config),
      },
    })));

    await writeAudit(FACILITY_AUDIT_EVENTS.DEPARTMENTS_UPDATED, actorId, facilityId, { count: departments.length });
    return this.getFacility(facilityId);
  }

  async replaceCatalog(facilityId: string, catalog: FacilityCatalogItemDTO[], actorId: string) {
    await this.getFacility(facilityId);
    if (!Array.isArray(catalog)) throw badRequest('catalog must be an array.');

    await (prisma as any).$transaction([
      (prisma as any).facilityServiceCatalog.deleteMany({ where: { facilityId } }),
      ...(catalog.map(item => (prisma as any).facilityServiceCatalog.create({ data: { facilityId, ...this.mapCatalogItem(item) } }))),
    ]);

    await writeAudit(FACILITY_AUDIT_EVENTS.CATALOG_UPDATED, actorId, facilityId, { count: catalog.length });
    return this.getFacility(facilityId);
  }

  async updateRoutingRules(facilityId: string, routingRules: FacilityRoutingRuleDTO[], actorId: string) {
    await this.getFacility(facilityId);
    if (!Array.isArray(routingRules)) throw badRequest('routingRules must be an array.');

    await (prisma as any).$transaction([
      (prisma as any).facilityRoutingRule.deleteMany({ where: { facilityId } }),
      ...(routingRules.map(rule => (prisma as any).facilityRoutingRule.create({ data: { facilityId, ...this.mapRoutingRule(rule) } }))),
    ]);

    await writeAudit(FACILITY_AUDIT_EVENTS.ROUTING_UPDATED, actorId, facilityId, { count: routingRules.length });
    return this.getFacility(facilityId);
  }

  async updateBranding(facilityId: string, payload: UpdateFacilityDTO, actorId: string) {
    const facility = await (prisma as any).diagnosticFacility.update({
      where: { id: facilityId },
      data: {
        logoName: payload.logoName === undefined ? undefined : nullableText(payload.logoName),
        primaryColor: payload.primaryColor,
        secondaryColor: payload.secondaryColor,
      },
      include: facilityInclude(),
    });
    await writeAudit(FACILITY_AUDIT_EVENTS.BRANDING_UPDATED, actorId, facilityId, {
      logoName: payload.logoName,
      primaryColor: payload.primaryColor,
      secondaryColor: payload.secondaryColor,
    });
    return facility;
  }

  async updateLimits(facilityId: string, limits: FacilityLimitDTO[], actorId: string) {
    await this.getFacility(facilityId);
    if (!Array.isArray(limits)) throw badRequest('limits must be an array.');

    await (prisma as any).$transaction(limits.map(limit => (prisma as any).facilityLimit.upsert({
      where: { facilityId_limitKey: { facilityId, limitKey: limit.limitKey } },
      update: { limitValue: toInt(limit.limitValue) },
      create: { facilityId, limitKey: limit.limitKey, limitValue: toInt(limit.limitValue) },
    })));

    await writeAudit(FACILITY_AUDIT_EVENTS.LIMITS_UPDATED, actorId, facilityId, { count: limits.length });
    return this.getFacility(facilityId);
  }

  async assignUser(facilityId: string, payload: AssignFacilityUserDTO, actorId: string) {
    await this.getFacility(facilityId);
    if (!payload.userId) throw badRequest('userId is required.');
    if (!payload.roleKey) throw badRequest('roleKey is required.');

    const assignment = await (prisma as any).facilityUserAssignment.upsert({
      where: { facilityId_userId_roleKey: { facilityId, userId: payload.userId, roleKey: payload.roleKey } },
      update: { isPrimary: Boolean(payload.isPrimary), status: payload.status || 'ACTIVE' },
      create: {
        facilityId,
        userId: payload.userId,
        roleKey: payload.roleKey,
        isPrimary: Boolean(payload.isPrimary),
        status: payload.status || 'ACTIVE',
      },
    });

    await writeAudit(FACILITY_AUDIT_EVENTS.USER_ASSIGNED, actorId, facilityId, { userId: payload.userId, roleKey: payload.roleKey });
    return assignment;
  }

  async removeUser(facilityId: string, assignmentId: string, actorId: string) {
    const assignment = await (prisma as any).facilityUserAssignment.delete({ where: { id: assignmentId } });
    await writeAudit(FACILITY_AUDIT_EVENTS.USER_REMOVED, actorId, facilityId, { assignmentId });
    return assignment;
  }

  private mapCatalogItem(item: FacilityCatalogItemDTO) {
    if (!item.serviceType) throw badRequest('Catalog serviceType is required.');
    if (!item.serviceCode) throw badRequest('Catalog serviceCode is required.');
    if (!item.serviceName) throw badRequest('Catalog serviceName is required.');

    return {
      serviceType: String(item.serviceType).toUpperCase(),
      serviceCode: normalizeCode(item.serviceCode),
      serviceName: normalizeText(item.serviceName),
      departmentKey: nullableText(item.departmentKey),
      price: item.price === undefined || item.price === null || item.price === '' ? null : item.price as any,
      turnaroundHours: item.turnaroundHours === undefined || item.turnaroundHours === null || item.turnaroundHours === '' ? null : toInt(item.turnaroundHours),
      isActive: toBool(item.isActive, true),
      config: safeJson(item.config),
    };
  }

  private mapRoutingRule(rule: FacilityRoutingRuleDTO) {
    if (!rule.sourceRole) throw badRequest('sourceRole is required for routing rule.');
    if (!rule.requestType) throw badRequest('requestType is required for routing rule.');
    if (!rule.targetDepartment) throw badRequest('targetDepartment is required for routing rule.');

    return {
      sourceRole: rule.sourceRole,
      requestType: String(rule.requestType).toUpperCase(),
      targetDepartment: rule.targetDepartment,
      resultRecipient: rule.resultRecipient || 'CLINICIAN',
      requiresReceptionPush: Boolean(rule.requiresReceptionPush),
      isEnabled: toBool(rule.isEnabled, true),
      config: safeJson(rule.config),
    };
  }

  private mapLimit(limit: FacilityLimitDTO) {
    if (!limit.limitKey) throw badRequest('limitKey is required.');
    return { limitKey: limit.limitKey, limitValue: toInt(limit.limitValue) };
  }
}

export const facilityManagementService = new FacilityManagementService();

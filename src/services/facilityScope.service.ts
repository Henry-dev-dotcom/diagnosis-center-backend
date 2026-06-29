import { PrismaClient } from '@prisma/client';
import { isSuperAdminRole, normalizeRole } from '../constants/roles';
import type { AuthUserPayload, FacilityAssignmentDTO } from '../types/facility-request.types';

const globalForPrisma = globalThis as unknown as { __phase3Prisma?: PrismaClient };
export const prisma = globalForPrisma.__phase3Prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__phase3Prisma = prisma;

function getUserIdFromPayload(user?: AuthUserPayload): string | undefined {
  return user?.id || user?.userId || user?.sub;
}

async function modelExists(modelName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    modelName
  );
  return Boolean(result?.[0]?.exists);
}

export class FacilityScopeService {
  static isSuperAdmin(user?: AuthUserPayload): boolean {
    return isSuperAdminRole(user?.role);
  }

  static async getUserFacilityAssignments(user?: AuthUserPayload): Promise<FacilityAssignmentDTO[]> {
    const userId = getUserIdFromPayload(user);
    if (!userId) return [];

    const directIds = Array.isArray(user?.facilityIds) ? user.facilityIds : [];
    if (directIds.length > 0) {
      return directIds.map((facilityId, index) => ({
        id: `${userId}:${facilityId}`,
        facilityId,
        userId,
        roleKey: normalizeRole(user?.role),
        isPrimary: index === 0,
        status: 'ACTIVE',
      }));
    }

    if (user?.facilityId) {
      return [{
        id: `${userId}:${user.facilityId}`,
        facilityId: user.facilityId,
        userId,
        roleKey: normalizeRole(user.role),
        isPrimary: true,
        status: 'ACTIVE',
      }];
    }

    try {
      const hasAssignmentTable = await modelExists('FacilityUserAssignment');
      if (!hasAssignmentTable) return [];

      return await prisma.facilityUserAssignment.findMany({
        where: { userId, status: 'ACTIVE' },
        select: {
          id: true,
          facilityId: true,
          userId: true,
          roleKey: true,
          isPrimary: true,
          status: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }) as FacilityAssignmentDTO[];
    } catch (_error) {
      return [];
    }
  }

  static async getAllowedFacilityIds(user?: AuthUserPayload): Promise<string[]> {
    if (this.isSuperAdmin(user)) return [];
    const assignments = await this.getUserFacilityAssignments(user);
    return [...new Set(assignments.map((item) => item.facilityId))];
  }

  static async canAccessFacility(user: AuthUserPayload | undefined, facilityId?: string): Promise<boolean> {
    if (!facilityId) return false;
    if (this.isSuperAdmin(user)) return true;
    const allowed = await this.getAllowedFacilityIds(user);
    return allowed.includes(facilityId);
  }

  static async getPrimaryFacilityId(user?: AuthUserPayload): Promise<string | undefined> {
    if (user?.facilityId) return user.facilityId;
    const assignments = await this.getUserFacilityAssignments(user);
    const primary = assignments.find((item) => item.isPrimary) || assignments[0];
    return primary?.facilityId;
  }

  static async isFeatureEnabled(facilityId: string, featureKey: string): Promise<boolean> {
    try {
      const hasFeatureTable = await modelExists('FacilityFeature');
      if (!hasFeatureTable) return true;

      const feature = await prisma.facilityFeature.findUnique({
        where: { facilityId_featureKey: { facilityId, featureKey } },
        select: { isEnabled: true },
      });
      return feature ? feature.isEnabled : true;
    } catch (_error) {
      return true;
    }
  }

  static async isDepartmentEnabled(facilityId: string, departmentKey: string): Promise<boolean> {
    try {
      const hasDepartmentTable = await modelExists('FacilityDepartment');
      if (!hasDepartmentTable) return true;

      const department = await prisma.facilityDepartment.findUnique({
        where: { facilityId_departmentKey: { facilityId, departmentKey } },
        select: { isEnabled: true },
      });
      return department ? department.isEnabled : true;
    } catch (_error) {
      return true;
    }
  }
}

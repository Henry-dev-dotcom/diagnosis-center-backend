import type { Request } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../config/permissions.js';
import { prisma } from './prisma.service.js';
import { ASSIGNABLE_PERMISSIONS, sanitizePermissions } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';
import type { CreateFacilityRoleInput, UpdateFacilityRoleInput } from '../validators/roles.validators.js';

// Facility-defined staff roles. All queries run in the admin's facility context,
// so a facility only ever sees and edits its own roles.

const roleSelect = {
  id: true,
  name: true,
  description: true,
  baseRole: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true } }
} as const;

/** The permission catalogue, grouped by its first segment ('lab:queue:read' -> 'lab'). */
export function listAssignablePermissions() {
  return ASSIGNABLE_PERMISSIONS.map((key) => {
    const [group, ...rest] = key.split(':');
    return { key, group, action: rest.join(' ').replace(/-/g, ' ') };
  });
}

export async function listFacilityRoles() {
  const custom = await prisma.facilityRole.findMany({ select: roleSelect, orderBy: { name: 'asc' } });
  const system = (Object.keys(ROLE_PERMISSIONS) as UserRole[])
    .filter((role) => role !== UserRole.PLATFORM_ADMIN)
    .map((role) => ({ role, permissions: [...ROLE_PERMISSIONS[role]] }));
  return { system, custom };
}

async function audit(req: Request, action: string, roleId: string, details: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Roles', entityType: 'FacilityRole', entityId: roleId, details });
}

function rejectUnknownPermissions(permissions: readonly string[]) {
  const unknown = permissions.filter((p) => !ASSIGNABLE_PERMISSIONS.includes(p));
  if (unknown.length) throw new AppError('Some permissions cannot be assigned to a facility role', 400, 'INVALID_PERMISSIONS', { unknown });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function createFacilityRole(input: CreateFacilityRoleInput, req: Request) {
  rejectUnknownPermissions(input.permissions);
  try {
    const role = await prisma.facilityRole.create({
      data: {
        name: input.name,
        description: input.description || null,
        baseRole: input.baseRole,
        permissions: sanitizePermissions(input.permissions)
      },
      select: roleSelect
    });
    await audit(req, 'ROLE_CREATED', role.id, { name: role.name, baseRole: role.baseRole, permissions: role.permissions });
    return role;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('A role with that name already exists', 409, 'ROLE_NAME_TAKEN');
    throw error;
  }
}

export async function updateFacilityRole(id: string, input: UpdateFacilityRoleInput, req: Request) {
  const before = await prisma.facilityRole.findUnique({ where: { id }, select: roleSelect });
  if (!before) throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  if (input.permissions) rejectUnknownPermissions(input.permissions);
  try {
    const role = await prisma.facilityRole.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description || null,
        permissions: input.permissions ? sanitizePermissions(input.permissions) : undefined
      },
      select: roleSelect
    });
    await audit(req, 'ROLE_UPDATED', id, {
      before: { name: before.name, permissions: before.permissions },
      after: { name: role.name, permissions: role.permissions }
    });
    return role;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('A role with that name already exists', 409, 'ROLE_NAME_TAKEN');
    throw error;
  }
}

export async function deleteFacilityRole(id: string, req: Request) {
  const role = await prisma.facilityRole.findUnique({ where: { id }, select: roleSelect });
  if (!role) throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  if (role._count.users > 0) {
    throw new AppError(`Move the ${role._count.users} user(s) on this role to another role first`, 409, 'ROLE_IN_USE');
  }
  await prisma.facilityRole.delete({ where: { id } });
  await audit(req, 'ROLE_DELETED', id, { name: role.name });
  return { deleted: true };
}

/**
 * Resolves the role fields for a user write. A custom role dictates the base
 * role; picking a base role on its own clears any custom role.
 */
export async function resolveUserRoleAssignment(body: { role?: UserRole; customRoleId?: string | null }) {
  if (body.customRoleId) {
    const custom = await prisma.facilityRole.findUnique({ where: { id: body.customRoleId }, select: { id: true, baseRole: true } });
    if (!custom) throw new AppError('Custom role not found', 404, 'ROLE_NOT_FOUND');
    if (body.role && body.role !== custom.baseRole) {
      throw new AppError('The selected role does not match the custom role\'s workspace', 400, 'ROLE_MISMATCH');
    }
    return { role: custom.baseRole, customRoleId: custom.id };
  }
  if (body.customRoleId === null || body.role) return { role: body.role, customRoleId: null };
  return {};
}

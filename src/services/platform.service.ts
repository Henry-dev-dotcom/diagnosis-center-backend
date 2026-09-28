import type { Request } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { runWithFacility } from './tenantContext.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/appError.js';
import type { CreateFacilityInput, UpdateFacilityInput } from '../validators/platform.validators.js';

// Platform administration works on Facility rows, which are not tenant-owned.
// The only tenant write here, the first administrator, runs inside the new
// facility's context so it is stamped and guarded like any other.

const facilitySelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  phone: true,
  email: true,
  address: true,
  timezone: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true, patients: true } }
} as const;

function emptyToNull(value: string | undefined) {
  return value ? value : null;
}

async function auditPlatform(req: Request, action: string, facilityId: string, details: unknown) {
  await createAuditLog({
    ...getRequestAuditContext(req),
    facilityId: null,
    action,
    module: 'Platform',
    entityType: 'Facility',
    entityId: facilityId,
    details
  });
}

export async function listFacilities() {
  return prisma.facility.findMany({ select: facilitySelect, orderBy: { createdAt: 'desc' } });
}

export async function getFacility(id: string) {
  const facility = await prisma.facility.findUnique({ where: { id }, select: facilitySelect });
  if (!facility) throw new AppError('Facility not found', 404, 'FACILITY_NOT_FOUND');
  return facility;
}

export async function createFacility(input: CreateFacilityInput, req: Request) {
  const existing = await prisma.facility.findUnique({ where: { code: input.code } });
  if (existing) throw new AppError('That facility code is already in use', 409, 'FACILITY_CODE_TAKEN');

  const passwordHash = await hashPassword(input.admin.password);
  const created = await prisma.$transaction(async (tx) => {
    const facility = await tx.facility.create({
      data: {
        code: input.code,
        name: input.name,
        phone: emptyToNull(input.phone),
        email: emptyToNull(input.email),
        address: emptyToNull(input.address)
      }
    });
    const admin = await runWithFacility(facility.id, () =>
      tx.user.create({
        data: {
          name: input.admin.name,
          username: input.admin.username,
          email: emptyToNull(input.admin.email),
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          passwordHash
        },
        select: { id: true, username: true, name: true }
      })
    );
    return { facility, admin };
  });

  await auditPlatform(req, 'FACILITY_CREATED', created.facility.id, {
    code: created.facility.code,
    name: created.facility.name,
    adminUsername: created.admin.username
  });
  return { facility: await getFacility(created.facility.id), admin: created.admin };
}

export async function updateFacility(id: string, input: UpdateFacilityInput, req: Request) {
  const before = await getFacility(id);
  await prisma.facility.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone === undefined ? undefined : emptyToNull(input.phone),
      email: input.email === undefined ? undefined : emptyToNull(input.email),
      address: input.address === undefined ? undefined : emptyToNull(input.address),
      status: input.status
    }
  });
  const after = await getFacility(id);
  const action = input.status && input.status !== before.status ? 'FACILITY_STATUS_CHANGED' : 'FACILITY_UPDATED';
  await auditPlatform(req, action, id, { before: { status: before.status, name: before.name }, after: { status: after.status, name: after.name } });
  return after;
}

import type { Request } from 'express';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { MODULES, MODULE_KEYS, isModuleKey, type ModuleKey } from '../config/modules.js';
import { prisma } from './prisma.service.js';
import { runWithFacility } from './tenantContext.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/appError.js';
import { startTrial } from './subscription.service.js';
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
  modules: { where: { enabled: true }, select: { moduleKey: true } },
  _count: { select: { users: true, patients: true } }
} as const;

type FacilityRow = Prisma.FacilityGetPayload<{ select: typeof facilitySelect }>;

/** Facility as the platform console sees it, with modules as a list of keys. */
function toFacilityView({ modules, ...facility }: FacilityRow) {
  return { ...facility, modules: modules.map((m) => m.moduleKey).filter(isModuleKey).sort() };
}

function emptyToNull(value: string | undefined) {
  return value ? value : null;
}

/** Makes exactly `enabled` the facility's switched-on modules. Runs in that facility's context. */
async function writeModules(tx: Prisma.TransactionClient, facilityId: string, enabled: readonly ModuleKey[]) {
  await runWithFacility(facilityId, async () => {
    for (const moduleKey of MODULE_KEYS) {
      const on = enabled.includes(moduleKey);
      await tx.facilityModule.upsert({
        where: { facilityId_moduleKey: { facilityId, moduleKey } },
        update: { enabled: on },
        create: { moduleKey, enabled: on }
      });
    }
  });
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

export function listModules() {
  return MODULES;
}

export async function listFacilities() {
  const rows = await prisma.facility.findMany({ select: facilitySelect, orderBy: { createdAt: 'desc' } });
  return rows.map(toFacilityView);
}

export async function getFacility(id: string) {
  const facility = await prisma.facility.findUnique({ where: { id }, select: facilitySelect });
  if (!facility) throw new AppError('Facility not found', 404, 'FACILITY_NOT_FOUND');
  return toFacilityView(facility);
}

export async function setFacilityModules(id: string, modules: ModuleKey[], req: Request) {
  const before = await getFacility(id);
  await prisma.$transaction((tx) => writeModules(tx, id, modules));
  const after = await getFacility(id);
  await auditPlatform(req, 'FACILITY_MODULES_UPDATED', id, { before: before.modules, after: after.modules });
  return after;
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
    if (input.planId) await runWithFacility(facility.id, () => startTrial(tx, { planId: input.planId as string, interval: input.interval, billingEmail: emptyToNull(input.email) }));
    else await writeModules(tx, facility.id, input.modules ?? MODULE_KEYS);
    return { facility, admin };
  });

  await auditPlatform(req, 'FACILITY_CREATED', created.facility.id, {
    code: created.facility.code,
    name: created.facility.name,
    adminUsername: created.admin.username,
    modules: input.planId ? `plan ${input.planId}` : input.modules ?? MODULE_KEYS
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

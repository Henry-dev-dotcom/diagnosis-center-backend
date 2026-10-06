import type { Request } from 'express';
import { BillingInterval, CatalogItemType, DemoRequestStatus, DepartmentType, FacilityKind, Prisma, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './prisma.service.js';
import { currentFacilityId, runAsSystem, runWithFacility } from './tenantContext.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { loginWithPassword, type RequestContext } from './auth.service.js';
import { startTrial } from './subscription.service.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/appError.js';

/*
  Phase 6: self-service onboarding. A hospital signs up on the website, gets
  its own facility with a free trial of the chosen plan, and is signed in as
  its first administrator. A short setup checklist (facility details, staff,
  price list) follows; nothing in it is required to start working.
*/

/* ---------------------------------------------------------------- sign-up */

const STOP_WORDS = new Set(['THE', 'OF', 'AND', 'FOR', 'AT', 'IN']);

/**
 * A sign-in code from the facility name: its initials (St Mary's Clinic ->
 * SMC), with a number added when taken. Codes are generated, never chosen,
 * so the sign-up form cannot be used to probe which facilities exist.
 */
export async function generateFacilityCode(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP_WORDS.has(w));
  let base = words.map((w) => w[0]).join('').slice(0, 6);
  if (base.length < 3) base = words.join('').slice(0, 6);
  base = base.padEnd(3, 'X');
  for (let i = 1; i <= 200; i += 1) {
    const code = i === 1 ? base : `${base}${i}`;
    if (!(await prisma.facility.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  return `${base}${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export type SignupInput = {
  facility: { name: string; phone: string; email: string; address?: string; facilityType?: string };
  admin: { name: string; username: string; email?: string; password: string };
  planId: string;
  interval: BillingInterval;
  addOns: string[];
};

export async function signup(input: SignupInput, context: RequestContext) {
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive || !plan.isPublic) throw new AppError('Choose one of the plans on the pricing page', 400, 'PLAN_NOT_FOUND');

  const code = await generateFacilityCode(input.facility.name);
  const passwordHash = await hashPassword(input.admin.password);
  let facility: { id: string; code: string; name: string };
  try {
    facility = await prisma.$transaction(async (tx) => {
      const created = await tx.facility.create({
        data: {
          code,
          name: input.facility.name,
          phone: input.facility.phone,
          email: input.facility.email,
          address: input.facility.address || null,
          signupSource: 'SELF_SERVICE',
          // A diagnostic centre takes its work in from clinicians elsewhere, so
          // reception receives and routes it. Everyone else sends a clinician's
          // order straight to the bench.
          receptionConfirmsOrders: plan.facilityKind === FacilityKind.DIAGNOSTIC_CENTRE
        },
        select: { id: true, code: true, name: true }
      });
      await runWithFacility(created.id, async () => {
        await tx.user.create({
          data: {
            name: input.admin.name,
            username: input.admin.username,
            email: input.admin.email || input.facility.email,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            passwordHash
          }
        });
        await startTrial(tx, { planId: plan.id, interval: input.interval, addOns: input.addOns, billingEmail: input.facility.email });
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('Someone signed up with the same name at the same moment. Please try again.', 409, 'SIGNUP_CONFLICT');
    }
    throw error;
  }

  await runWithFacility(facility.id, () =>
    createAuditLog({
      action: 'FACILITY_SIGNED_UP',
      module: 'Onboarding',
      entityType: 'Facility',
      entityId: facility.id,
      details: { code: facility.code, plan: plan.code, interval: input.interval, addOns: input.addOns, facilityType: input.facility.facilityType ?? null },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    })
  );

  // Signed straight in: the new administrator lands in their own hospital.
  const session = await loginWithPassword(facility.code, input.admin.username, input.admin.password, context);
  return { facility, ...session };
}

/* -------------------------------------------------------- setup checklist */

function facilityId() {
  const id = currentFacilityId();
  if (!id) throw new AppError('A facility is required', 400, 'FACILITY_REQUIRED');
  return id;
}

const profileSelect = { id: true, code: true, name: true, phone: true, email: true, address: true, logoDataUrl: true, allowSupportAccess: true, receptionConfirmsOrders: true, onboardingCompletedAt: true, signupSource: true } as const;

export async function onboardingStatus() {
  const facility = await prisma.facility.findUniqueOrThrow({ where: { id: facilityId() }, select: profileSelect });
  const [users, prices, patients, subscription] = await Promise.all([
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.catalogItem.count({ where: { isActive: true } }),
    prisma.patient.count(),
    prisma.subscription.findFirst({ select: { status: true, trialEndsAt: true, plan: { select: { name: true } } } })
  ]);
  const steps = [
    { key: 'profile', title: 'Facility details', done: Boolean(facility.phone && facility.address), optional: false },
    { key: 'departments', title: 'Departments and plan', done: true, optional: true },
    { key: 'staff', title: 'Staff accounts', done: users > 1, optional: true },
    { key: 'prices', title: 'Price list', done: prices > 0, optional: true },
    { key: 'first-patient', title: 'Register your first patient', done: patients > 0, optional: true }
  ];
  return { facility, steps, counts: { users, prices, patients }, subscription, completed: Boolean(facility.onboardingCompletedAt) };
}

const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_LOGO_LENGTH = 280_000; // about 200 KB of image

export async function updateProfile(body: { name?: string; phone?: string; email?: string; address?: string; logoDataUrl?: string | null; allowSupportAccess?: boolean; receptionConfirmsOrders?: boolean }, req: Request) {
  if (body.logoDataUrl && (!LOGO_PATTERN.test(body.logoDataUrl) || body.logoDataUrl.length > MAX_LOGO_LENGTH)) {
    throw new AppError('The logo must be a PNG, JPEG or WebP image of at most 200 KB', 400, 'INVALID_LOGO');
  }
  const id = facilityId();
  const after = await prisma.facility.update({
    where: { id },
    data: {
      name: body.name,
      phone: body.phone === undefined ? undefined : body.phone || null,
      email: body.email === undefined ? undefined : body.email || null,
      address: body.address === undefined ? undefined : body.address || null,
      logoDataUrl: body.logoDataUrl === undefined ? undefined : body.logoDataUrl,
      allowSupportAccess: body.allowSupportAccess,
      receptionConfirmsOrders: body.receptionConfirmsOrders
    },
    select: profileSelect
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'FACILITY_PROFILE_UPDATED', module: 'Onboarding', entityType: 'Facility', entityId: id, details: { changed: Object.keys(body), allowSupportAccess: after.allowSupportAccess } });
  return after;
}

export async function completeOnboarding(req: Request) {
  const id = facilityId();
  const facility = await prisma.facility.update({ where: { id }, data: { onboardingCompletedAt: new Date() }, select: profileSelect });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'ONBOARDING_COMPLETED', module: 'Onboarding', entityType: 'Facility', entityId: id });
  return facility;
}

/* ---------------------------------------------------- price list import */

export type PriceRow = { code: string; name: string; type: CatalogItemType; price: number; sampleType?: string; modality?: string; tariffCode?: string };

const DEFAULT_DEPARTMENTS: Partial<Record<CatalogItemType, { type: DepartmentType; name: string; code: string }>> = {
  LAB: { type: DepartmentType.LABORATORY, name: 'Laboratory', code: 'LAB' },
  SCAN: { type: DepartmentType.IMAGING, name: 'Imaging', code: 'IMG' }
};

/**
 * Adds or updates price list items by code. Lab tests and scans are filed
 * under the facility's laboratory / imaging department, created if missing.
 * All rows are applied together or not at all.
 */
export async function importPriceList(rows: PriceRow[], req: Request) {
  const seen = new Set<string>();
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, i) => {
    const code = row.code.trim().toUpperCase();
    if (seen.has(code)) errors.push({ row: i + 1, message: `Code ${code} appears more than once` });
    seen.add(code);
  });
  if (errors.length) throw new AppError('Some rows need fixing before the price list can be imported', 400, 'PRICE_LIST_INVALID', { errors });

  const result = await prisma.$transaction(async (tx) => {
    const departmentFor = new Map<CatalogItemType, string>();
    for (const type of new Set(rows.map((r) => r.type))) {
      const wanted = DEFAULT_DEPARTMENTS[type];
      if (!wanted) continue;
      const existing = await tx.department.findFirst({ where: { type: wanted.type, isActive: true }, orderBy: { createdAt: 'asc' } });
      const department = existing ?? (await tx.department.findFirst({ where: { code: wanted.code } })) ?? (await tx.department.create({ data: { name: wanted.name, code: wanted.code, type: wanted.type } }));
      departmentFor.set(type, department.id);
    }
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const catalogCode = row.code.trim().toUpperCase();
      const data = {
        name: row.name.trim(),
        type: row.type,
        price: row.price,
        sampleType: row.sampleType || null,
        modality: row.modality || null,
        tariffCode: row.tariffCode || null,
        departmentId: departmentFor.get(row.type) ?? null,
        isActive: true
      };
      const existing = await tx.catalogItem.findFirst({ where: { catalogCode }, select: { id: true } });
      if (existing) {
        await tx.catalogItem.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await tx.catalogItem.create({ data: { catalogCode, ...data } });
        created += 1;
      }
    }
    return { created, updated };
  });
  await createAuditLog({ ...getRequestAuditContext(req), action: 'PRICE_LIST_IMPORTED', module: 'Onboarding', entityType: 'CatalogItem', details: result });
  return result;
}

/* ---------------------------------------------------------- demo requests */

export async function createDemoRequest(body: { name: string; organisation: string; email: string; phone?: string; facilityType?: string; message?: string }, context: RequestContext) {
  const request = await runAsSystem('public.demo-request', () =>
    prisma.demoRequest.create({ data: { ...body, phone: body.phone || null, facilityType: body.facilityType || null, message: body.message || null }, select: { id: true, createdAt: true } })
  );
  await runAsSystem('public.demo-request', () =>
    createAuditLog({ facilityId: null, action: 'DEMO_REQUESTED', module: 'Platform', entityType: 'DemoRequest', entityId: request.id, ipAddress: context.ipAddress, userAgent: context.userAgent })
  );
  return request;
}

export async function listDemoRequests(query: { status?: DemoRequestStatus }) {
  return prisma.demoRequest.findMany({ where: query.status ? { status: query.status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function updateDemoRequest(id: string, body: { status?: DemoRequestStatus; notes?: string }, req: Request) {
  if (!(await prisma.demoRequest.findUnique({ where: { id } }))) throw new AppError('Request not found', 404, 'DEMO_REQUEST_NOT_FOUND');
  const updated = await prisma.demoRequest.update({ where: { id }, data: { status: body.status, notes: body.notes } });
  await createAuditLog({ ...getRequestAuditContext(req), facilityId: null, action: 'DEMO_REQUEST_UPDATED', module: 'Platform', entityType: 'DemoRequest', entityId: id, details: body });
  return updated;
}

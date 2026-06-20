import {
  CatalogItemType,
  Prisma,
  UserRole,
  UserStatus
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/appError.js';

function clean(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

async function auditMutation(req: Request, action: string, entityType: string, entityId: string, beforeData: unknown, afterData: unknown) {
  await createAuditLog({
    ...getRequestAuditContext(req),
    action,
    module: 'Admin',
    entityType,
    entityId,
    beforeData,
    afterData
  });
}

const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  doctorProfile: {
    select: {
      id: true,
      specialty: true,
      licenseNumber: true,
      status: true,
      hospital: { select: { id: true, name: true, code: true } }
    }
  }
} satisfies Prisma.UserSelect;

const doctorInclude = {
  user: { select: { id: true, name: true, username: true, email: true, role: true, status: true } },
  hospital: { select: { id: true, name: true, code: true, accountStatus: true } },
  _count: { select: { orders: true, referredPatients: true, appointments: true } }
} satisfies Prisma.DoctorProfileInclude;

const catalogInclude = {
  department: { select: { id: true, name: true, code: true, type: true } },
  parameters: {
    include: { ranges: { orderBy: [{ gender: 'asc' as const }, { ageMin: 'asc' as const }] } },
    orderBy: { sortOrder: 'asc' as const }
  },
  _count: { select: { orderItems: true, invoiceItems: true } }
} satisfies Prisma.CatalogItemInclude;

export async function listUsers(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }
    : {};

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'name', 'username', 'role', 'status'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.user.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createUser(body: { name: string; username: string; email?: string | null; role: UserRole; password: string }, req: Request) {
  const user = await prisma.user.create({
    data: {
      name: body.name.trim(),
      username: body.username.trim().toLowerCase(),
      email: clean(body.email) as string | null,
      role: body.role,
      status: UserStatus.ACTIVE,
      passwordHash: await hashPassword(body.password)
    },
    select: userSelect
  });

  await auditMutation(req, 'USER_CREATED', 'User', user.id, null, user);
  return user;
}

export async function updateUser(userId: string, body: { name?: string; email?: string | null; role?: UserRole; status?: UserStatus; password?: string }, req: Request) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  const data: Prisma.UserUpdateInput = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.email !== undefined) data.email = clean(body.email) as string | null;
  if (body.role !== undefined) data.role = body.role;
  if (body.status !== undefined) data.status = body.status;
  if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

  const user = await prisma.user.update({ where: { id: userId }, data, select: userSelect });
  await auditMutation(req, 'USER_UPDATED', 'User', user.id, before, user);
  return user;
}

export async function deactivateUser(userId: string, req: Request) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  const nextStatus = before.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
  const user = await prisma.user.update({ where: { id: userId }, data: { status: nextStatus }, select: userSelect });
  await auditMutation(req, 'USER_STATUS_TOGGLED', 'User', user.id, before, user);
  return user;
}

export async function listHospitals(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.HospitalWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }
    : {};

  const [items, total] = await prisma.$transaction([
    prisma.hospital.findMany({
      where,
      include: { _count: { select: { doctors: true, patients: true, orders: true, invoices: true, appointments: true } } },
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'name', 'code', 'accountStatus'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.hospital.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createHospital(body: Record<string, unknown>, req: Request) {
  const hospital = await prisma.hospital.create({
    data: {
      name: String(body.name).trim(),
      code: String(body.code).trim().toUpperCase(),
      phone: clean(body.phone) as string | null,
      email: clean(body.email) as string | null,
      address: clean(body.address) as string | null,
      billingContact: clean(body.billingContact) as string | null,
      accountStatus: String(body.accountStatus ?? 'Active').trim()
    }
  });
  await auditMutation(req, 'HOSPITAL_CREATED', 'Hospital', hospital.id, null, hospital);
  return hospital;
}

export async function updateHospital(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.hospital.findUniqueOrThrow({ where: { id } });
  const data: Prisma.HospitalUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.code !== undefined) data.code = String(body.code).trim().toUpperCase();
  if (body.phone !== undefined) data.phone = clean(body.phone) as string | null;
  if (body.email !== undefined) data.email = clean(body.email) as string | null;
  if (body.address !== undefined) data.address = clean(body.address) as string | null;
  if (body.billingContact !== undefined) data.billingContact = clean(body.billingContact) as string | null;
  if (body.accountStatus !== undefined) data.accountStatus = String(body.accountStatus).trim();
  const hospital = await prisma.hospital.update({ where: { id }, data });
  await auditMutation(req, 'HOSPITAL_UPDATED', 'Hospital', hospital.id, before, hospital);
  return hospital;
}

export async function listDoctors(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.DoctorProfileWhereInput = search
    ? {
        OR: [
          { specialty: { contains: search, mode: 'insensitive' } },
          { licenseNumber: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { hospital: { name: { contains: search, mode: 'insensitive' } } }
        ]
      }
    : {};

  const [items, total] = await prisma.$transaction([
    prisma.doctorProfile.findMany({
      where,
      include: doctorInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'specialty', 'licenseNumber', 'status'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.doctorProfile.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createDoctor(body: Record<string, unknown>, req: Request) {
  const user = await prisma.user.findUnique({ where: { id: String(body.userId) } });
  if (!user) throw new AppError('Selected doctor user was not found', 404, 'USER_NOT_FOUND');
  if (user.role !== UserRole.DOCTOR) throw new AppError('Doctor profile can only be linked to a DOCTOR user', 400, 'USER_ROLE_NOT_DOCTOR');

  const doctor = await prisma.doctorProfile.create({
    data: {
      user: { connect: { id: String(body.userId) } },
      hospital: body.hospitalId ? { connect: { id: String(body.hospitalId) } } : undefined,
      title: String(body.title ?? 'Dr.').trim(),
      specialty: String(body.specialty).trim(),
      licenseNumber: String(body.licenseNumber).trim(),
      council: clean(body.council) as string | null,
      phone: clean(body.phone) as string | null,
      email: clean(body.email) as string | null,
      status: String(body.status ?? 'Active').trim(),
      notificationEmail: Boolean(body.notificationEmail ?? true),
      notificationSms: Boolean(body.notificationSms ?? false)
    },
    include: doctorInclude
  });
  await auditMutation(req, 'DOCTOR_PROFILE_CREATED', 'DoctorProfile', doctor.id, null, doctor);
  return doctor;
}

export async function updateDoctor(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.doctorProfile.findUniqueOrThrow({ where: { id }, include: doctorInclude });
  if (body.userId) {
    const user = await prisma.user.findUnique({ where: { id: String(body.userId) } });
    if (!user) throw new AppError('Selected doctor user was not found', 404, 'USER_NOT_FOUND');
    if (user.role !== UserRole.DOCTOR) throw new AppError('Doctor profile can only be linked to a DOCTOR user', 400, 'USER_ROLE_NOT_DOCTOR');
  }

  const data: Prisma.DoctorProfileUpdateInput = {};
  if (body.userId !== undefined) data.user = { connect: { id: String(body.userId) } };
  if (body.hospitalId !== undefined) data.hospital = body.hospitalId ? { connect: { id: String(body.hospitalId) } } : { disconnect: true };
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.specialty !== undefined) data.specialty = String(body.specialty).trim();
  if (body.licenseNumber !== undefined) data.licenseNumber = String(body.licenseNumber).trim();
  if (body.council !== undefined) data.council = clean(body.council) as string | null;
  if (body.phone !== undefined) data.phone = clean(body.phone) as string | null;
  if (body.email !== undefined) data.email = clean(body.email) as string | null;
  if (body.status !== undefined) data.status = String(body.status).trim();
  if (body.notificationEmail !== undefined) data.notificationEmail = Boolean(body.notificationEmail);
  if (body.notificationSms !== undefined) data.notificationSms = Boolean(body.notificationSms);

  const doctor = await prisma.doctorProfile.update({ where: { id }, data, include: doctorInclude });
  await auditMutation(req, 'DOCTOR_PROFILE_UPDATED', 'DoctorProfile', doctor.id, before, doctor);
  return doctor;
}

export async function listCatalog(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.CatalogItemWhereInput = {
    ...(search
      ? {
          OR: [
            { catalogCode: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { aliases: { has: search } }
          ]
        }
      : {}),
    ...(query.type ? { type: String(query.type).toUpperCase() as CatalogItemType } : {}),
    ...(query.isActive !== undefined ? { isActive: String(query.isActive) === 'true' } : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.catalogItem.findMany({
      where,
      include: catalogInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'name', 'catalogCode', 'price'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.catalogItem.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createCatalogItem(body: Record<string, unknown>, req: Request) {
  const item = await prisma.catalogItem.create({
    data: {
      catalogCode: String(body.catalogCode).trim().toUpperCase(),
      name: String(body.name).trim(),
      type: String(body.type).toUpperCase() as CatalogItemType,
      department: body.departmentId ? { connect: { id: String(body.departmentId) } } : undefined,
      price: Number(body.price),
      expectedCompletionHours: Number(body.expectedCompletionHours ?? 24),
      sampleType: clean(body.sampleType) as string | null,
      modality: clean(body.modality) as string | null,
      aliases: Array.isArray(body.aliases) ? body.aliases.map(String) : [],
      isActive: Boolean(body.isActive ?? true)
    },
    include: catalogInclude
  });
  await auditMutation(req, 'CATALOG_ITEM_CREATED', 'CatalogItem', item.id, null, item);
  return item;
}

export async function updateCatalogItem(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.catalogItem.findUniqueOrThrow({ where: { id }, include: catalogInclude });
  const data: Prisma.CatalogItemUpdateInput = {};
  if (body.catalogCode !== undefined) data.catalogCode = String(body.catalogCode).trim().toUpperCase();
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.type !== undefined) data.type = String(body.type).toUpperCase() as CatalogItemType;
  if (body.departmentId !== undefined) data.department = body.departmentId ? { connect: { id: String(body.departmentId) } } : { disconnect: true };
  if (body.price !== undefined) data.price = Number(body.price);
  if (body.expectedCompletionHours !== undefined) data.expectedCompletionHours = Number(body.expectedCompletionHours);
  if (body.sampleType !== undefined) data.sampleType = clean(body.sampleType) as string | null;
  if (body.modality !== undefined) data.modality = clean(body.modality) as string | null;
  if (body.aliases !== undefined) data.aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : [];
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const item = await prisma.catalogItem.update({ where: { id }, data, include: catalogInclude });
  await auditMutation(req, 'CATALOG_ITEM_UPDATED', 'CatalogItem', item.id, before, item);
  return item;
}

async function upsertReferenceParameter(body: Record<string, unknown>, fallback?: { catalogItemId: string; name: string }) {
  const catalogItemId = body.catalogItemId ? String(body.catalogItemId) : fallback?.catalogItemId;
  const parameterName = body.parameterName ? String(body.parameterName).trim() : fallback?.name;
  if (!catalogItemId || !parameterName) throw new AppError('Catalog item and parameter name are required', 400, 'REFERENCE_PARAMETER_REQUIRED');

  return prisma.referenceParameter.upsert({
    where: { catalogItemId_name: { catalogItemId, name: parameterName } },
    create: {
      catalogItemId,
      name: parameterName,
      unit: clean(body.unit) as string | null,
      methodNote: clean(body.analyzerMethodNote) as string | null
    },
    update: {
      ...(body.unit !== undefined ? { unit: clean(body.unit) as string | null } : {}),
      ...(body.analyzerMethodNote !== undefined ? { methodNote: clean(body.analyzerMethodNote) as string | null } : {})
    }
  });
}

export async function listReferenceRanges(query: Request['query']) {
  const { page, limit, skip, take, search } = getPagination(query);
  const where: Prisma.ReferenceRangeWhereInput = {
    ...(query.catalogItemId ? { parameter: { catalogItemId: String(query.catalogItemId) } } : {}),
    ...(search ? { parameter: { name: { contains: search, mode: 'insensitive' } } } : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.referenceRange.findMany({
      where,
      include: { parameter: { include: { catalogItem: { select: { id: true, catalogCode: true, name: true, type: true } } } } },
      orderBy: [{ parameter: { name: 'asc' } }, { gender: 'asc' }, { ageMin: 'asc' }],
      skip,
      take
    }),
    prisma.referenceRange.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createReferenceRange(body: Record<string, unknown>, req: Request) {
  const parameter = await upsertReferenceParameter(body);
  const range = await prisma.referenceRange.create({
    data: {
      parameterId: parameter.id,
      gender: String(body.genderRule ?? 'ALL') as never,
      ageMin: Number(body.ageMin ?? 0),
      ageMax: Number(body.ageMax ?? 200),
      low: body.low !== undefined ? Number(body.low) : null,
      high: body.high !== undefined ? Number(body.high) : null,
      criticalLow: body.criticalLow !== undefined ? Number(body.criticalLow) : null,
      criticalHigh: body.criticalHigh !== undefined ? Number(body.criticalHigh) : null,
      displayRange: clean(body.displayRange) as string | null
    },
    include: { parameter: { include: { catalogItem: true } } }
  });
  await auditMutation(req, 'REFERENCE_RANGE_CREATED', 'ReferenceRange', range.id, null, range);
  return range;
}

export async function updateReferenceRange(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.referenceRange.findUniqueOrThrow({ where: { id }, include: { parameter: true } });
  const parameter = body.catalogItemId || body.parameterName || body.unit !== undefined || body.analyzerMethodNote !== undefined
    ? await upsertReferenceParameter(body, { catalogItemId: before.parameter.catalogItemId, name: before.parameter.name })
    : before.parameter;

  const data: Prisma.ReferenceRangeUpdateInput = { parameter: { connect: { id: parameter.id } } };
  if (body.genderRule !== undefined) data.gender = String(body.genderRule) as never;
  if (body.ageMin !== undefined) data.ageMin = Number(body.ageMin);
  if (body.ageMax !== undefined) data.ageMax = Number(body.ageMax);
  if (body.low !== undefined) data.low = body.low === null ? null : Number(body.low);
  if (body.high !== undefined) data.high = body.high === null ? null : Number(body.high);
  if (body.criticalLow !== undefined) data.criticalLow = body.criticalLow === null ? null : Number(body.criticalLow);
  if (body.criticalHigh !== undefined) data.criticalHigh = body.criticalHigh === null ? null : Number(body.criticalHigh);
  if (body.displayRange !== undefined) data.displayRange = clean(body.displayRange) as string | null;

  const range = await prisma.referenceRange.update({ where: { id }, data, include: { parameter: { include: { catalogItem: true } } } });
  await auditMutation(req, 'REFERENCE_RANGE_UPDATED', 'ReferenceRange', range.id, before, range);
  return range;
}

export async function listDepartments(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.DepartmentWhereInput = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }, { leadName: { contains: search, mode: 'insensitive' } }] }
    : {};
  const [items, total] = await prisma.$transaction([
    prisma.department.findMany({ where, include: { _count: { select: { equipment: true, catalogItems: true } } }, orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'name', 'code', 'type'] as const, 'createdAt'), skip, take }),
    prisma.department.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createDepartment(body: Record<string, unknown>, req: Request) {
  const department = await prisma.department.create({
    data: {
      name: String(body.name).trim(),
      code: String(body.code).trim().toUpperCase(),
      type: String(body.type) as never,
      leadName: clean(body.leadName) as string | null,
      isActive: Boolean(body.isActive ?? true)
    }
  });
  await auditMutation(req, 'DEPARTMENT_CREATED', 'Department', department.id, null, department);
  return department;
}

export async function updateDepartment(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.department.findUniqueOrThrow({ where: { id } });
  const data: Prisma.DepartmentUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.code !== undefined) data.code = String(body.code).trim().toUpperCase();
  if (body.type !== undefined) data.type = String(body.type) as never;
  if (body.leadName !== undefined) data.leadName = clean(body.leadName) as string | null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  const department = await prisma.department.update({ where: { id }, data });
  await auditMutation(req, 'DEPARTMENT_UPDATED', 'Department', department.id, before, department);
  return department;
}

export async function listEquipment(query: Request['query']) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.EquipmentWhereInput = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { room: { contains: search, mode: 'insensitive' } }, { modality: { contains: search, mode: 'insensitive' } }, { serialNumber: { contains: search, mode: 'insensitive' } }] }
    : {};
  const [items, total] = await prisma.$transaction([
    prisma.equipment.findMany({ where, include: { department: { select: { id: true, name: true, code: true, type: true } }, _count: { select: { scanBookings: true } } }, orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'name', 'status', 'modality'] as const, 'createdAt'), skip, take }),
    prisma.equipment.count({ where })
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createEquipment(body: Record<string, unknown>, req: Request) {
  const equipment = await prisma.equipment.create({
    data: {
      department: { connect: { id: String(body.departmentId) } },
      name: String(body.name).trim(),
      room: clean(body.room) as string | null,
      modality: clean(body.modality) as string | null,
      serialNumber: clean(body.serialNumber) as string | null,
      status: String(body.status ?? 'AVAILABLE') as never,
      serviceDueDate: dateOrNull(body.serviceDueDate),
      notes: clean(body.notes) as string | null
    },
    include: { department: true }
  });
  await auditMutation(req, 'EQUIPMENT_CREATED', 'Equipment', equipment.id, null, equipment);
  return equipment;
}

export async function updateEquipment(id: string, body: Record<string, unknown>, req: Request) {
  const before = await prisma.equipment.findUniqueOrThrow({ where: { id } });
  const data: Prisma.EquipmentUpdateInput = {};
  if (body.departmentId !== undefined) data.department = { connect: { id: String(body.departmentId) } };
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.room !== undefined) data.room = clean(body.room) as string | null;
  if (body.modality !== undefined) data.modality = clean(body.modality) as string | null;
  if (body.serialNumber !== undefined) data.serialNumber = clean(body.serialNumber) as string | null;
  if (body.status !== undefined) data.status = String(body.status) as never;
  if (body.serviceDueDate !== undefined) data.serviceDueDate = dateOrNull(body.serviceDueDate);
  if (body.notes !== undefined) data.notes = clean(body.notes) as string | null;
  const equipment = await prisma.equipment.update({ where: { id }, data, include: { department: true } });
  await auditMutation(req, 'EQUIPMENT_UPDATED', 'Equipment', equipment.id, before, equipment);
  return equipment;
}

export async function exportAdminConfiguration() {
  const [hospitals, doctors, departments, equipment, catalog, referenceRanges] = await prisma.$transaction([
    prisma.hospital.findMany({ orderBy: { name: 'asc' } }),
    prisma.doctorProfile.findMany({ include: doctorInclude, orderBy: { createdAt: 'asc' } }),
    prisma.department.findMany({ orderBy: { code: 'asc' } }),
    prisma.equipment.findMany({ include: { department: true }, orderBy: { name: 'asc' } }),
    prisma.catalogItem.findMany({ include: catalogInclude, orderBy: { catalogCode: 'asc' } }),
    prisma.referenceRange.findMany({ include: { parameter: { include: { catalogItem: true } } }, orderBy: [{ parameter: { name: 'asc' } }, { ageMin: 'asc' }] })
  ]);

  return {
    exportedAt: new Date().toISOString(),
    counts: {
      hospitals: hospitals.length,
      doctors: doctors.length,
      departments: departments.length,
      equipment: equipment.length,
      catalogItems: catalog.length,
      referenceRanges: referenceRanges.length
    },
    hospitals,
    doctors,
    departments,
    equipment,
    catalog,
    referenceRanges
  };
}

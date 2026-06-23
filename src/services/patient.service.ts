import { Prisma, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { getPagination, paginationMeta, safeOrderBy } from './query.service.js';
import { AppError } from '../utils/appError.js';
import type { AuthUser } from '../types/auth.js';

const patientInclude = {
  hospital: { select: { id: true, name: true, code: true } },
  referringDoctor: {
    select: {
      id: true,
      title: true,
      specialty: true,
      user: { select: { id: true, name: true, email: true } },
      hospital: { select: { id: true, name: true, code: true } }
    }
  },
  contacts: true,
  insuranceRecords: true,
  _count: { select: { orders: true, invoices: true, labResults: true, scanBookings: true } }
} satisfies Prisma.PatientInclude;

const patientOrderInclude = {
  hospital: { select: { id: true, name: true, code: true } },
  doctor: { select: { id: true, title: true, specialty: true, user: { select: { id: true, name: true } } } },
  items: {
    include: {
      catalogItem: {
        select: {
          id: true,
          catalogCode: true,
          name: true,
          type: true,
          price: true,
          sampleType: true,
          modality: true,
          expectedCompletionHours: true
        }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  },
  invoice: { select: { id: true, invoiceCode: true, status: true, total: true, amountPaid: true, balance: true } },
  statusHistory: { orderBy: { createdAt: 'desc' as const }, take: 10 }
} satisfies Prisma.OrderInclude;

type PatientPayload = {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationalId?: string | null;
  insuranceProvider?: string | null;
  policyNumber?: string | null;
  emergencyContact?: string | null;
  allergiesAndConditions?: string | null;
  hospitalId?: string | null;
  referringDoctorId?: string | null;
};

type PatientDuplicatePayload = Partial<Pick<PatientPayload, 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'email' | 'nationalId' | 'policyNumber'>>;

function clean(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateOrNull(value?: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

async function getDoctorProfileForUser(user?: AuthUser) {
  if (!user || user.role !== UserRole.DOCTOR) return null;
  return prisma.doctorProfile.findUnique({ where: { userId: user.id } });
}

async function buildDoctorPatientScope(user?: AuthUser) {
  if (!user || user.role !== UserRole.DOCTOR) return {} satisfies Prisma.PatientWhereInput;
  const doctorProfile = await getDoctorProfileForUser(user);
  if (!doctorProfile) return { id: '__no_access__' } satisfies Prisma.PatientWhereInput;
  return { referringDoctorId: doctorProfile.id } satisfies Prisma.PatientWhereInput;
}

async function assertPatientAccess(patientId: string, user?: AuthUser) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { referringDoctor: { select: { userId: true } } }
  });

  if (!patient) throw new AppError('Patient was not found', 404, 'PATIENT_NOT_FOUND');

  if (user && user.role === UserRole.DOCTOR && patient.referringDoctor?.userId !== user.id) {
    throw new AppError('You can only access patients referred to you', 403, 'PATIENT_SCOPE_DENIED');
  }

  return patient;
}

async function nextPatientCode() {
  const count = await prisma.patient.count();
  return `PAT-${String(count + 1).padStart(4, '0')}`;
}

function patientCreateData(body: PatientPayload, actorId?: string | null): Prisma.PatientCreateInput {
  const phone = normalizeOptionalString(body.phone) as string | null;
  const email = normalizeOptionalString(body.email) as string | null;
  const insuranceProvider = normalizeOptionalString(body.insuranceProvider) as string | null;
  const policyNumber = normalizeOptionalString(body.policyNumber) as string | null;

  const contacts: Prisma.PatientContactCreateWithoutPatientInput[] = [];
  if (phone) contacts.push({ type: 'PHONE', value: phone, isPrimary: true });
  if (email) contacts.push({ type: 'EMAIL', value: email, isPrimary: contacts.length === 0 });

  return {
    patientCode: '',
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    dateOfBirth: toDateOrNull(body.dateOfBirth),
    gender: normalizeOptionalString(body.gender) as string | null,
    phone,
    email,
    address: normalizeOptionalString(body.address) as string | null,
    nationalId: normalizeOptionalString(body.nationalId) as string | null,
    insuranceProvider,
    policyNumber,
    emergencyContact: normalizeOptionalString(body.emergencyContact) as string | null,
    allergiesAndConditions: normalizeOptionalString(body.allergiesAndConditions) as string | null,
    hospital: body.hospitalId ? { connect: { id: body.hospitalId } } : undefined,
    referringDoctor: body.referringDoctorId ? { connect: { id: body.referringDoctorId } } : undefined,
    createdBy: actorId ? { connect: { id: actorId } } : undefined,
    updatedBy: actorId ? { connect: { id: actorId } } : undefined,
    contacts: contacts.length > 0 ? { create: contacts } : undefined,
    insuranceRecords: insuranceProvider && policyNumber ? { create: [{ provider: insuranceProvider, policyNumber }] } : undefined
  };
}

function patientUpdateData(body: Partial<PatientPayload>, actorId?: string | null): Prisma.PatientUpdateInput {
  const data: Prisma.PatientUpdateInput = {};

  if ('firstName' in body && body.firstName !== undefined) data.firstName = body.firstName.trim();
  if ('lastName' in body && body.lastName !== undefined) data.lastName = body.lastName.trim();
  if ('gender' in body) data.gender = clean(body.gender) as string | null;
  if ('phone' in body) data.phone = clean(body.phone) as string | null;
  if ('email' in body) data.email = clean(body.email) as string | null;
  if ('address' in body) data.address = clean(body.address) as string | null;
  if ('nationalId' in body) data.nationalId = clean(body.nationalId) as string | null;
  if ('insuranceProvider' in body) data.insuranceProvider = clean(body.insuranceProvider) as string | null;
  if ('policyNumber' in body) data.policyNumber = clean(body.policyNumber) as string | null;
  if ('emergencyContact' in body) data.emergencyContact = clean(body.emergencyContact) as string | null;
  if ('allergiesAndConditions' in body) data.allergiesAndConditions = clean(body.allergiesAndConditions) as string | null;
  if ('dateOfBirth' in body) data.dateOfBirth = toDateOrNull(body.dateOfBirth);
  if ('hospitalId' in body) data.hospital = body.hospitalId ? { connect: { id: body.hospitalId } } : { disconnect: true };
  if ('referringDoctorId' in body) data.referringDoctor = body.referringDoctorId ? { connect: { id: body.referringDoctorId } } : { disconnect: true };
  if (actorId) data.updatedBy = { connect: { id: actorId } };

  return data;
}

export async function listPatients(query: Request['query'], user?: AuthUser) {
  const { page, limit, skip, take, search, sortBy, sortOrder } = getPagination(query);
  const scope = await buildDoctorPatientScope(user);
  const where: Prisma.PatientWhereInput = {
    ...scope,
    ...(search
      ? {
          OR: [
            { patientCode: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { nationalId: { contains: search, mode: 'insensitive' } },
            { policyNumber: { contains: search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.patient.findMany({
      where,
      include: patientInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['createdAt', 'updatedAt', 'firstName', 'lastName', 'patientCode'] as const, 'createdAt'),
      skip,
      take
    }),
    prisma.patient.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function createPatient(body: PatientPayload, req: Request) {
  const data = patientCreateData(body, req.user?.id);
  data.patientCode = await nextPatientCode();

  const patient = await prisma.patient.create({ data, include: patientInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'PATIENT_CREATED',
    module: 'Patients',
    entityType: 'Patient',
    entityId: patient.id,
    afterData: patient
  });

  return patient;
}

export async function getPatient(patientId: string, user?: AuthUser) {
  await assertPatientAccess(patientId, user);
  return prisma.patient.findUniqueOrThrow({ where: { id: patientId }, include: patientInclude });
}

export async function updatePatient(patientId: string, body: Partial<PatientPayload>, req: Request) {
  await assertPatientAccess(patientId, req.user);
  const before = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
  const patient = await prisma.patient.update({ where: { id: patientId }, data: patientUpdateData(body, req.user?.id), include: patientInclude });

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'PATIENT_UPDATED',
    module: 'Patients',
    entityType: 'Patient',
    entityId: patient.id,
    beforeData: before,
    afterData: patient
  });

  return patient;
}

export async function getPatientOrders(patientId: string, query: Request['query'], user?: AuthUser) {
  await assertPatientAccess(patientId, user);
  const { page, limit, skip, take, sortBy, sortOrder } = getPagination(query);
  const where: Prisma.OrderWhereInput = {
    patientId,
    ...(query.status ? { status: String(query.status) as never } : {}),
    ...(query.from || query.to
      ? {
          submittedAt: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {})
          }
        }
      : {})
  };

  if (user?.role === UserRole.DOCTOR) {
    const doctorProfile = await getDoctorProfileForUser(user);
    where.doctorId = doctorProfile?.id ?? '__no_access__';
  }

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: patientOrderInclude,
      orderBy: safeOrderBy(sortBy, sortOrder, ['submittedAt', 'createdAt', 'updatedAt', 'orderCode'] as const, 'submittedAt'),
      skip,
      take
    }),
    prisma.order.count({ where })
  ]);

  return { items, meta: paginationMeta(total, page, limit) };
}

export async function getPatientTrends(patientId: string, query: Request['query'], user?: AuthUser) {
  await assertPatientAccess(patientId, user);
  const from = query.from ? new Date(String(query.from)) : undefined;
  const to = query.to ? new Date(String(query.to)) : undefined;

  const [labParameters, labSummary, scanSummary, orderSummary] = await prisma.$transaction([
    prisma.labResultParameter.findMany({
      where: {
        labResult: {
          patientId,
          ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
        }
      },
      include: { labResult: { select: { resultCode: true, createdAt: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    }),
    prisma.labResult.groupBy({ by: ['status'], orderBy: { status: 'asc' }, where: { patientId }, _count: { _all: true } }),
    prisma.scanResult.groupBy({ by: ['status'], orderBy: { status: 'asc' }, where: { orderItem: { order: { patientId } } }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['status'], orderBy: { status: 'asc' }, where: { patientId }, _count: { _all: true } })
  ]);

  return {
    patientId,
    filters: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    summaries: {
      orders: orderSummary.map((item) => ({ status: item.status, count: (item._count as { _all: number } | undefined)?._all ?? 0 })),
      labResults: labSummary.map((item) => ({ status: item.status, count: (item._count as { _all: number } | undefined)?._all ?? 0 })),
      scanResults: scanSummary.map((item) => ({ status: item.status, count: (item._count as { _all: number } | undefined)?._all ?? 0 }))
    },
    labParameters: labParameters.map((item: { id: string; name: string; value: string | null; numericValue: unknown; unit: string | null; referenceRange: string | null; flag: unknown; createdAt: Date; labResult: { resultCode: string; status: unknown } }) => ({
      id: item.id,
      name: item.name,
      value: item.value,
      numericValue: item.numericValue,
      unit: item.unit,
      referenceRange: item.referenceRange,
      flag: item.flag,
      resultCode: item.labResult.resultCode,
      resultStatus: item.labResult.status,
      createdAt: item.createdAt
    }))
  };
}

export async function checkPatientDuplicates(body: PatientDuplicatePayload) {
  const or: Prisma.PatientWhereInput[] = [];
  if (body.phone) or.push({ phone: body.phone });
  if (body.email) or.push({ email: body.email });
  if (body.nationalId) or.push({ nationalId: body.nationalId });
  if (body.policyNumber) or.push({ policyNumber: body.policyNumber });
  if (body.firstName && body.lastName) {
    or.push({
      firstName: { equals: body.firstName, mode: 'insensitive' },
      lastName: { equals: body.lastName, mode: 'insensitive' },
      ...(body.dateOfBirth ? { dateOfBirth: toDateOrNull(body.dateOfBirth) } : {})
    });
  }

  if (or.length === 0) return { possibleDuplicates: [], count: 0 };

  const possibleDuplicates = await prisma.patient.findMany({
    where: { OR: or },
    include: patientInclude,
    orderBy: { updatedAt: 'desc' },
    take: 20
  });

  return { possibleDuplicates, count: possibleDuplicates.length };
}

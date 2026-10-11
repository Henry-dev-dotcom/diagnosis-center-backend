import { GustavBiomedRequestType, GustavRequestStatus, type Prisma } from '@prisma/client';
import type { Request } from 'express';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { nextCode } from './codeSequence.service.js';
import { prisma } from './prisma.service.js';
import { AppError } from '../utils/appError.js';

const requestInclude = {
  requestedBy: { select: { id: true, name: true, role: true } },
  statusUpdatedBy: { select: { id: true, name: true, role: true } },
  statusUpdatedByVendorUser: { select: { id: true, fullName: true, email: true } },
  supplierPartner: { select: { id: true, code: true, name: true, contactPhone: true } },
  analyzerDevice: { select: { id: true, name: true, deviceCode: true, make: true, model: true } }
} satisfies Prisma.GustavBiomedRequestInclude;

const GUSTAV_BIOMED_PARTNER_ID = 'gustav-biomed-limited';

async function audit(req: Request, action: string, requestId: string, details?: unknown) {
  await createAuditLog({
    ...getRequestAuditContext(req),
    action,
    module: 'Stores',
    entityType: 'GustavBiomedRequest',
    entityId: requestId,
    details
  });
}

export async function listStoreGustavRequests() {
  return {
    items: await prisma.gustavBiomedRequest.findMany({
      include: requestInclude,
      orderBy: [{ createdAt: 'desc' }, { requestCode: 'desc' }],
      take: 200
    })
  };
}

export async function listLabMaintenanceRequests() {
  return {
    items: await prisma.gustavBiomedRequest.findMany({
      where: { type: GustavBiomedRequestType.ANALYZER_MAINTENANCE },
      include: requestInclude,
      orderBy: [{ createdAt: 'desc' }, { requestCode: 'desc' }],
      take: 200
    })
  };
}

type SupplyRequestInput = {
  requestingUnit: string;
  supplyCategory: Prisma.GustavBiomedRequestCreateInput['supplyCategory'];
  itemDescription: string;
  quantity: number;
  quantityUnit: string;
  notes?: string;
};

export async function createSupplyRequest(body: SupplyRequestInput, req: Request) {
  const request = await prisma.$transaction(async (tx) => tx.gustavBiomedRequest.create({
    data: {
      supplierPartnerId: GUSTAV_BIOMED_PARTNER_ID,
      requestCode: await nextCode(tx, 'GBR'),
      type: GustavBiomedRequestType.SUPPLY,
      requestingUnit: body.requestingUnit,
      supplyCategory: body.supplyCategory,
      itemDescription: body.itemDescription,
      quantity: body.quantity,
      quantityUnit: body.quantityUnit,
      notes: body.notes,
      requestedById: req.user?.id ?? null
    },
    include: requestInclude
  }));
  await audit(req, 'GUSTAV_SUPPLY_REQUEST_CREATED', request.id, { requestCode: request.requestCode, category: request.supplyCategory });
  return request;
}

type MaintenanceRequestInput = {
  requestingUnit: string;
  analyzerDeviceId?: string;
  analyzerName?: string;
  serviceDescription: string;
  preferredServiceDate?: Date;
  notes?: string;
};

export async function createMaintenanceRequest(body: MaintenanceRequestInput, req: Request) {
  const device = body.analyzerDeviceId
    ? await prisma.analyzerDevice.findUnique({ where: { id: body.analyzerDeviceId }, select: { id: true, name: true } })
    : null;
  if (body.analyzerDeviceId && !device) throw new AppError('That analyzer is not available in this facility', 404, 'ANALYZER_NOT_FOUND');
  const analyzerName = device?.name ?? body.analyzerName?.trim();
  if (!analyzerName) throw new AppError('Choose a registered analyzer or enter its name', 400, 'ANALYZER_REQUIRED');

  const request = await prisma.$transaction(async (tx) => tx.gustavBiomedRequest.create({
    data: {
      supplierPartnerId: GUSTAV_BIOMED_PARTNER_ID,
      requestCode: await nextCode(tx, 'GBR'),
      type: GustavBiomedRequestType.ANALYZER_MAINTENANCE,
      requestingUnit: body.requestingUnit,
      analyzerDeviceId: device?.id,
      analyzerName,
      serviceDescription: body.serviceDescription,
      preferredServiceDate: body.preferredServiceDate,
      notes: body.notes,
      requestedById: req.user?.id ?? null
    },
    include: requestInclude
  }));
  await audit(req, 'GUSTAV_ANALYZER_MAINTENANCE_REQUEST_CREATED', request.id, { requestCode: request.requestCode, analyzerName });
  return request;
}

const STATUS_TRANSITIONS: Record<GustavRequestStatus, GustavRequestStatus[]> = {
  [GustavRequestStatus.PENDING]: [GustavRequestStatus.ACKNOWLEDGED, GustavRequestStatus.SCHEDULED, GustavRequestStatus.DECLINED, GustavRequestStatus.CANCELLED],
  [GustavRequestStatus.ACKNOWLEDGED]: [GustavRequestStatus.SCHEDULED, GustavRequestStatus.COMPLETED, GustavRequestStatus.DECLINED, GustavRequestStatus.CANCELLED],
  [GustavRequestStatus.SCHEDULED]: [GustavRequestStatus.COMPLETED, GustavRequestStatus.DECLINED, GustavRequestStatus.CANCELLED],
  [GustavRequestStatus.COMPLETED]: [],
  [GustavRequestStatus.DECLINED]: [],
  [GustavRequestStatus.CANCELLED]: []
};

type StatusInput = { status: GustavRequestStatus; statusNote?: string };
export async function updateGustavRequestStatus(id: string, body: StatusInput, req: Request) {
  const current = await prisma.gustavBiomedRequest.findUnique({ where: { id }, select: { id: true, status: true, requestCode: true } });
  if (!current) throw new AppError('Gustav Biomed request not found', 404, 'GUSTAV_REQUEST_NOT_FOUND');
  if (!STATUS_TRANSITIONS[current.status].includes(body.status)) {
    throw new AppError(`A ${current.status.toLowerCase()} request cannot be changed to ${body.status.toLowerCase()}`, 409, 'INVALID_GUSTAV_REQUEST_TRANSITION');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.gustavBiomedRequest.updateMany({
      where: { id, status: current.status },
      data: {
        status: body.status,
        ...(body.statusNote !== undefined ? { statusNote: body.statusNote } : {}),
        statusUpdatedById: req.user?.id ?? null,
        statusUpdatedByVendorUserId: null,
        statusUpdatedAt: new Date()
      }
    });
    if (changed.count !== 1) throw new AppError('This request changed while you were updating it. Refresh and try again.', 409, 'GUSTAV_REQUEST_CHANGED');
    return tx.gustavBiomedRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  await audit(req, 'GUSTAV_REQUEST_STATUS_UPDATED', id, { requestCode: current.requestCode, from: current.status, to: body.status });
  return updated;
}

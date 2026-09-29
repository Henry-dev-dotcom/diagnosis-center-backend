import type { Request } from 'express';
import { Prisma, PurchaseOrderStatus, RequisitionStatus, StoreMovementType, type StoreCategory } from '@prisma/client';
import { PERMISSIONS } from '../config/permissions.js';
import { prisma } from './prisma.service.js';
import { nextCode } from './codeSequence.service.js';
import { permissionsInclude } from './facilityAccess.service.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { AppError } from '../utils/appError.js';

/*
  General stores and procurement (Phase 4D). Stock only changes through
  moveStock, which takes stock out with a conditional update (so two issues
  cannot both take the last box) and writes a StoreMovement for every change.
  A purchase order is approved by someone other than the person who raised
  it, and is received against goods received notes up to what was ordered.
*/

const staff = { select: { id: true, name: true } } as const;

async function audit(req: Request, action: string, entityType: string, entityId: string, details?: unknown) {
  await createAuditLog({ ...getRequestAuditContext(req), action, module: 'Stores', entityType, entityId, details });
}

function uniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The only way stock changes. Negative quantities take stock out and fail rather than go below zero. */
async function moveStock(tx: Prisma.TransactionClient, itemId: string, quantity: number, type: StoreMovementType, reference: string, actorId: string | null) {
  const changed = await tx.storeItem.updateMany({
    where: { id: itemId, ...(quantity < 0 ? { quantityOnHand: { gte: -quantity } } : {}) },
    data: { quantityOnHand: { increment: quantity } }
  });
  if (changed.count !== 1) {
    const item = await tx.storeItem.findUnique({ where: { id: itemId }, select: { name: true, quantityOnHand: true, unit: true } });
    if (!item) throw new AppError('Store item not found', 404, 'STORE_ITEM_NOT_FOUND');
    throw new AppError(`Only ${item.quantityOnHand} ${item.unit} of ${item.name} in stock`, 409, 'INSUFFICIENT_STOCK');
  }
  const { quantityOnHand } = await tx.storeItem.findUniqueOrThrow({ where: { id: itemId }, select: { quantityOnHand: true } });
  await tx.storeMovement.create({ data: { storeItemId: itemId, type, quantity, balanceAfter: quantityOnHand, reference, actorId } });
}

/* --------------------------------------------------------------- suppliers */

export async function listSuppliers() {
  return { items: await prisma.supplier.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }) };
}

export async function createSupplier(body: { code: string; name: string; phone?: string; email?: string; address?: string }, req: Request) {
  try {
    const supplier = await prisma.supplier.create({ data: body });
    await audit(req, 'SUPPLIER_CREATED', 'Supplier', supplier.id, { code: body.code });
    return supplier;
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError('A supplier with that code already exists', 409, 'SUPPLIER_CODE_TAKEN');
    throw error;
  }
}

export async function updateSupplier(id: string, body: Prisma.SupplierUpdateInput, req: Request) {
  if (!(await prisma.supplier.findUnique({ where: { id } }))) throw new AppError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
  const supplier = await prisma.supplier.update({ where: { id }, data: body });
  await audit(req, 'SUPPLIER_UPDATED', 'Supplier', id, body);
  return supplier;
}

/* ------------------------------------------------------------------- items */

export async function listItems(query: { search?: string; lowStock?: boolean; includeInactive?: boolean }) {
  const rows = await prisma.storeItem.findMany({
    where: {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search, mode: 'insensitive' } }] } : {})
    },
    orderBy: { name: 'asc' },
    take: 500
  });
  const items = rows.map((item) => ({ ...item, lowStock: item.quantityOnHand <= item.reorderLevel }));
  return { items: query.lowStock ? items.filter((i) => i.lowStock) : items };
}

export async function createItem(body: { code: string; name: string; unit: string; category: StoreCategory; reorderLevel: number }, req: Request) {
  try {
    const item = await prisma.storeItem.create({ data: body });
    await audit(req, 'STORE_ITEM_CREATED', 'StoreItem', item.id, { code: body.code });
    return item;
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError('An item with that code already exists', 409, 'ITEM_CODE_TAKEN');
    throw error;
  }
}

export async function updateItem(id: string, body: { name?: string; unit?: string; category?: StoreCategory; reorderLevel?: number; isActive?: boolean }, req: Request) {
  if (!(await prisma.storeItem.findUnique({ where: { id } }))) throw new AppError('Store item not found', 404, 'STORE_ITEM_NOT_FOUND');
  const item = await prisma.storeItem.update({ where: { id }, data: body });
  await audit(req, 'STORE_ITEM_UPDATED', 'StoreItem', id, body);
  return item;
}

/** Stock counts, damage and expiry write-offs. Always with a reason. */
export async function adjustStock(id: string, body: { quantity: number; reason: string }, req: Request) {
  if (body.quantity === 0) throw new AppError('An adjustment must change the quantity', 400, 'ZERO_ADJUSTMENT');
  await prisma.$transaction((tx) => moveStock(tx, id, body.quantity, StoreMovementType.ADJUSTMENT, body.reason, req.user?.id ?? null));
  await audit(req, 'STOCK_ADJUSTED', 'StoreItem', id, body);
  return getItem(id);
}

export async function getItem(id: string) {
  const item = await prisma.storeItem.findUnique({
    where: { id },
    include: { movements: { orderBy: { createdAt: 'desc' }, take: 100, include: { actor: staff } } }
  });
  if (!item) throw new AppError('Store item not found', 404, 'STORE_ITEM_NOT_FOUND');
  return { ...item, lowStock: item.quantityOnHand <= item.reorderLevel };
}

/* ---------------------------------------------------------- purchase orders */

const poInclude = {
  supplier: true,
  raisedBy: staff,
  approvedBy: staff,
  lines: { include: { storeItem: { select: { id: true, code: true, name: true, unit: true } } } },
  receipts: { orderBy: { receivedAt: 'asc' as const }, include: { receivedBy: staff, lines: true } }
} satisfies Prisma.PurchaseOrderInclude;

const withTotal = <T extends { lines: Array<{ quantityOrdered: number; unitCost: Prisma.Decimal }> }>(po: T) => ({
  ...po,
  total: Math.round(po.lines.reduce((s, l) => s + l.quantityOrdered * Number(l.unitCost), 0) * 100) / 100
});

export async function listPurchaseOrders(query: { status?: PurchaseOrderStatus }) {
  const rows = await prisma.purchaseOrder.findMany({ where: query.status ? { status: query.status } : {}, orderBy: { createdAt: 'desc' }, take: 200, include: poInclude });
  return { items: rows.map(withTotal) };
}

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po) throw new AppError('Purchase order not found', 404, 'PO_NOT_FOUND');
  return withTotal(po);
}

export async function createPurchaseOrder(body: { supplierId: string; notes?: string; lines: Array<{ storeItemId: string; quantity: number; unitCost: number }> }, req: Request) {
  const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
  if (!supplier || !supplier.isActive) throw new AppError('Choose an active supplier', 400, 'SUPPLIER_NOT_FOUND');
  const ids = body.lines.map((l) => l.storeItemId);
  if (new Set(ids).size !== ids.length) throw new AppError('Each item can appear once on an order', 400, 'DUPLICATE_LINE');
  const items = await prisma.storeItem.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (items.length !== ids.length) throw new AppError('One of the items is not an active store item', 400, 'STORE_ITEM_NOT_FOUND');
  const id = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poCode: await nextCode(tx, 'PO'),
        supplierId: supplier.id,
        notes: body.notes ?? null,
        raisedById: req.user?.id ?? null,
        lines: { create: body.lines.map((l) => ({ storeItemId: l.storeItemId, quantityOrdered: l.quantity, unitCost: l.unitCost })) }
      }
    });
    return po.id;
  });
  await audit(req, 'PO_RAISED', 'PurchaseOrder', id, { supplier: supplier.code, lines: body.lines.length });
  return getPurchaseOrder(id);
}

async function loadPo(id: string, allowed: PurchaseOrderStatus[]) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) throw new AppError('Purchase order not found', 404, 'PO_NOT_FOUND');
  if (!allowed.includes(po.status)) throw new AppError(`This order is ${po.status.toLowerCase().replace(/_/g, ' ')}`, 409, 'PO_WRONG_STATUS');
  return po;
}

/** Separation of duties: whoever raised an order cannot approve it. */
export async function approvePurchaseOrder(id: string, req: Request) {
  const po = await loadPo(id, [PurchaseOrderStatus.DRAFT]);
  if (po.raisedById && po.raisedById === req.user?.id) throw new AppError('Another person must approve an order you raised', 403, 'PO_SELF_APPROVAL');
  const changed = await prisma.purchaseOrder.updateMany({ where: { id, status: PurchaseOrderStatus.DRAFT }, data: { status: PurchaseOrderStatus.APPROVED, approvedById: req.user?.id ?? null, approvedAt: new Date() } });
  if (changed.count !== 1) throw new AppError('This order was just changed; refresh', 409, 'PO_WRONG_STATUS');
  await audit(req, 'PO_APPROVED', 'PurchaseOrder', id);
  return getPurchaseOrder(id);
}

export async function cancelPurchaseOrder(id: string, body: { reason: string }, req: Request) {
  await loadPo(id, [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.APPROVED]);
  await prisma.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CANCELLED, cancelReason: body.reason } });
  await audit(req, 'PO_CANCELLED', 'PurchaseOrder', id, { reason: body.reason });
  return getPurchaseOrder(id);
}

export async function receiveGoods(
  id: string,
  body: { deliveryNote?: string; lines: Array<{ poLineId: string; quantity: number; batchNumber?: string; expiryDate?: Date }> },
  req: Request
) {
  const po = await loadPo(id, [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED]);
  const lineIds = body.lines.map((l) => l.poLineId);
  if (new Set(lineIds).size !== lineIds.length) throw new AppError('Each order line can appear once on a receipt', 400, 'DUPLICATE_LINE');

  await prisma.$transaction(async (tx) => {
    const grnCode = await nextCode(tx, 'GRN');
    const receipt = await tx.goodsReceipt.create({ data: { grnCode, purchaseOrderId: id, deliveryNote: body.deliveryNote ?? null, receivedById: req.user?.id ?? null } });
    for (const line of body.lines) {
      const poLine = po.lines.find((l) => l.id === line.poLineId);
      if (!poLine) throw new AppError('That line is not on this order', 400, 'LINE_NOT_ON_ORDER');
      // Conditional update: two receipts at once cannot together exceed the order.
      const updated = await tx.purchaseOrderLine.updateMany({
        where: { id: poLine.id, quantityReceived: { lte: poLine.quantityOrdered - line.quantity } },
        data: { quantityReceived: { increment: line.quantity } }
      });
      if (updated.count !== 1) {
        const current = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: poLine.id }, include: { storeItem: true } });
        throw new AppError(`Only ${current.quantityOrdered - current.quantityReceived} ${current.storeItem.unit} of ${current.storeItem.name} are still due on this order`, 409, 'OVER_RECEIPT');
      }
      await tx.goodsReceiptLine.create({ data: { goodsReceiptId: receipt.id, poLineId: poLine.id, storeItemId: poLine.storeItemId, quantity: line.quantity, batchNumber: line.batchNumber ?? null, expiryDate: line.expiryDate ?? null } });
      await moveStock(tx, poLine.storeItemId, line.quantity, StoreMovementType.RECEIPT, grnCode, req.user?.id ?? null);
      await tx.storeItem.update({ where: { id: poLine.storeItemId }, data: { lastUnitCost: poLine.unitCost } });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    const complete = lines.every((l) => l.quantityReceived >= l.quantityOrdered);
    await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED } });
  });
  await audit(req, 'GOODS_RECEIVED', 'PurchaseOrder', id, { lines: body.lines.length });
  return getPurchaseOrder(id);
}

/* ------------------------------------------------------------ requisitions */

const reqInclude = {
  requestedBy: staff,
  issuedBy: staff,
  lines: { include: { storeItem: { select: { id: true, code: true, name: true, unit: true, quantityOnHand: true } } } }
} satisfies Prisma.RequisitionInclude;

/** Store staff see every requisition; everyone else sees their own. */
export async function listRequisitions(query: { status?: RequisitionStatus }, req: Request) {
  const storeStaff = permissionsInclude(req.user?.permissions ?? [], PERMISSIONS.STORES_ISSUE);
  const items = await prisma.requisition.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(storeStaff ? {} : { requestedById: req.user?.id ?? '__none__' }) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: reqInclude
  });
  return { items };
}

export async function getRequisition(id: string, req: Request) {
  const requisition = await prisma.requisition.findUnique({ where: { id }, include: reqInclude });
  const storeStaff = permissionsInclude(req.user?.permissions ?? [], PERMISSIONS.STORES_ISSUE);
  if (!requisition || (!storeStaff && requisition.requestedById !== req.user?.id)) throw new AppError('Requisition not found', 404, 'REQUISITION_NOT_FOUND');
  return requisition;
}

export async function createRequisition(body: { requestingUnit: string; notes?: string; lines: Array<{ storeItemId: string; quantity: number }> }, req: Request) {
  const ids = body.lines.map((l) => l.storeItemId);
  if (new Set(ids).size !== ids.length) throw new AppError('Each item can appear once on a requisition', 400, 'DUPLICATE_LINE');
  const items = await prisma.storeItem.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (items.length !== ids.length) throw new AppError('One of the items is not an active store item', 400, 'STORE_ITEM_NOT_FOUND');
  const id = await prisma.$transaction(async (tx) =>
    (await tx.requisition.create({
      data: {
        reqCode: await nextCode(tx, 'REQ'),
        requestingUnit: body.requestingUnit,
        notes: body.notes ?? null,
        requestedById: req.user?.id ?? null,
        lines: { create: body.lines.map((l) => ({ storeItemId: l.storeItemId, quantityRequested: l.quantity })) }
      }
    })).id
  );
  await audit(req, 'REQUISITION_RAISED', 'Requisition', id, { unit: body.requestingUnit });
  return getRequisition(id, req);
}

/** One-time issue: each line up to what was asked for and what is in stock. */
export async function issueRequisition(id: string, body: { lines: Array<{ lineId: string; quantity: number }> }, req: Request) {
  const requisition = await prisma.requisition.findUnique({ where: { id }, include: { lines: true } });
  if (!requisition) throw new AppError('Requisition not found', 404, 'REQUISITION_NOT_FOUND');
  if (requisition.status !== RequisitionStatus.PENDING) throw new AppError(`This requisition is ${requisition.status.toLowerCase().replace(/_/g, ' ')}`, 409, 'REQUISITION_CLOSED');
  const byId = new Map(body.lines.map((l) => [l.lineId, l.quantity]));
  for (const lineId of byId.keys()) if (!requisition.lines.find((l) => l.id === lineId)) throw new AppError('That line is not on this requisition', 400, 'LINE_NOT_ON_REQUISITION');

  await prisma.$transaction(async (tx) => {
    let full = true;
    let any = false;
    for (const line of requisition.lines) {
      const quantity = byId.get(line.id) ?? 0;
      if (quantity > line.quantityRequested) throw new AppError('You cannot issue more than was asked for', 400, 'OVER_ISSUE');
      if (quantity < line.quantityRequested) full = false;
      if (quantity > 0) {
        any = true;
        await moveStock(tx, line.storeItemId, -quantity, StoreMovementType.ISSUE, `${requisition.reqCode} (${requisition.requestingUnit})`, req.user?.id ?? null);
        await tx.requisitionLine.update({ where: { id: line.id }, data: { quantityIssued: quantity } });
      }
    }
    if (!any) throw new AppError('Issue at least one item, or reject the requisition', 400, 'NOTHING_ISSUED');
    const closed = await tx.requisition.updateMany({
      where: { id, status: RequisitionStatus.PENDING },
      data: { status: full ? RequisitionStatus.ISSUED : RequisitionStatus.PARTIALLY_ISSUED, issuedById: req.user?.id ?? null, issuedAt: new Date() }
    });
    if (closed.count !== 1) throw new AppError('This requisition was just issued by someone else', 409, 'REQUISITION_CLOSED');
  });
  await audit(req, 'REQUISITION_ISSUED', 'Requisition', id);
  return getRequisition(id, req);
}

export async function rejectRequisition(id: string, body: { reason: string }, req: Request) {
  const changed = await prisma.requisition.updateMany({ where: { id, status: RequisitionStatus.PENDING }, data: { status: RequisitionStatus.REJECTED, rejectReason: body.reason, issuedById: req.user?.id ?? null, issuedAt: new Date() } });
  if (changed.count !== 1) {
    if (!(await prisma.requisition.findUnique({ where: { id } }))) throw new AppError('Requisition not found', 404, 'REQUISITION_NOT_FOUND');
    throw new AppError('This requisition has already been dealt with', 409, 'REQUISITION_CLOSED');
  }
  await audit(req, 'REQUISITION_REJECTED', 'Requisition', id, { reason: body.reason });
  return getRequisition(id, req);
}

/** The stores dashboard: what needs attention. */
export async function storesSummary() {
  const [items, pendingRequisitions, awaitingApproval, awaitingDelivery] = await Promise.all([
    prisma.storeItem.findMany({ where: { isActive: true }, select: { quantityOnHand: true, reorderLevel: true } }),
    prisma.requisition.count({ where: { status: RequisitionStatus.PENDING } }),
    prisma.purchaseOrder.count({ where: { status: PurchaseOrderStatus.DRAFT } }),
    prisma.purchaseOrder.count({ where: { status: { in: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED] } } })
  ]);
  return { lowStock: items.filter((i) => i.quantityOnHand <= i.reorderLevel).length, pendingRequisitions, awaitingApproval, awaitingDelivery };
}

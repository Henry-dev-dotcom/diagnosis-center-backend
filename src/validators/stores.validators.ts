import { PurchaseOrderStatus, RequisitionStatus, StoreCategory } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const code = z.string().trim().min(2).max(30).transform((v) => v.toUpperCase());
const qty = z.coerce.number().int().min(1, 'Quantities are whole numbers from 1').max(1_000_000);
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

export const supplierSchema = z.object({
  code,
  name: z.string().trim().min(2, 'Supplier name is required').max(160),
  phone: optionalText(40),
  email: z.string().trim().email().max(160).optional(),
  address: optionalText(300)
});
export const updateSupplierSchema = z
  .object({ name: z.string().trim().min(2).max(160).optional(), phone: optionalText(40), email: z.string().trim().email().max(160).optional(), address: optionalText(300), isActive: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export const itemQuerySchema = z.object({ search: optionalText(80), lowStock: bool.optional(), includeInactive: bool.optional() });
export const itemSchema = z.object({
  code,
  name: z.string().trim().min(2, 'Item name is required').max(160),
  unit: z.string().trim().min(1, 'Unit is required').max(30),
  category: z.nativeEnum(StoreCategory).default(StoreCategory.CONSUMABLE),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0)
});
export const updateItemSchema = z
  .object({ name: z.string().trim().min(2).max(160).optional(), unit: z.string().trim().min(1).max(30).optional(), category: z.nativeEnum(StoreCategory).optional(), reorderLevel: z.coerce.number().int().min(0).max(1_000_000).optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });
export const adjustSchema = z.object({
  // Signed: a count that finds 3 fewer boxes is -3.
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(3, 'Give the reason for the adjustment').max(300)
});

export const poQuerySchema = z.object({ status: z.nativeEnum(PurchaseOrderStatus).optional() });
export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  notes: optionalText(1000),
  lines: z.array(z.object({ storeItemId: z.string().min(1), quantity: qty, unitCost: z.coerce.number().min(0).max(10_000_000) })).min(1, 'Add at least one item').max(200)
});
export const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
export const receiveSchema = z.object({
  deliveryNote: optionalText(80),
  lines: z.array(z.object({ poLineId: z.string().min(1), quantity: qty, batchNumber: optionalText(60), expiryDate: z.coerce.date().optional() })).min(1, 'Receive at least one line').max(200)
});

export const requisitionQuerySchema = z.object({ status: z.nativeEnum(RequisitionStatus).optional() });
export const requisitionSchema = z.object({
  requestingUnit: z.string().trim().min(2, 'Say which ward or unit needs the items').max(120),
  notes: optionalText(1000),
  lines: z.array(z.object({ storeItemId: z.string().min(1), quantity: qty })).min(1, 'Ask for at least one item').max(100)
});
export const issueSchema = z.object({ lines: z.array(z.object({ lineId: z.string().min(1), quantity: z.coerce.number().int().min(0).max(1_000_000) })).min(1).max(100) });

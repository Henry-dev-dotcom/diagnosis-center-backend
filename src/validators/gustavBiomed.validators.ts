import { GustavRequestStatus, GustavSupplyCategory } from '@prisma/client';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => (value ? value : undefined));
const requestingUnit = z.string().trim().min(2, 'Enter the requesting unit').max(120);
const notes = optionalText(1000);

export const supplyRequestSchema = z.object({
  requestingUnit,
  confirmNoPatientData: z.literal(true),
  supplyCategory: z.nativeEnum(GustavSupplyCategory),
  itemDescription: z.string().trim().min(2, 'Describe the item needed').max(500),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  quantityUnit: z.string().trim().min(1, 'Enter the unit of measure').max(30),
  notes
});

export const maintenanceRequestSchema = z.object({
  requestingUnit,
  confirmNoPatientData: z.literal(true),
  analyzerDeviceId: optionalText(100),
  analyzerName: optionalText(160),
  serviceDescription: z.string().trim().min(3, 'Describe the routine service needed').max(1000),
  preferredServiceDate: z.coerce.date().optional(),
  notes
}).refine((value) => Boolean(value.analyzerDeviceId || value.analyzerName), {
  message: 'Choose a registered analyzer or enter its name',
  path: ['analyzerName']
});

export const updateGustavRequestStatusSchema = z.object({
  status: z.nativeEnum(GustavRequestStatus),
  statusNote: optionalText(500)
});

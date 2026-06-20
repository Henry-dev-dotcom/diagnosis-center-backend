import { OrderStatus, OrderUrgency } from '@prisma/client';
import { z } from 'zod';
import { dateRangeQueryBaseSchema, optionalNotesSchema, requiredReasonSchema } from './common.validators.js';

export const createOrderSchema = z.object({
  patientId: z.string().min(1, 'Patient is required'),
  hospitalId: z.string().min(1, 'Hospital is required').optional(),
  referringDoctorId: z.string().min(1, 'Referring doctor is required').optional(),
  clinicalNotes: z.string().trim().max(2000, 'Clinical notes cannot exceed 2000 characters').optional(),
  diagnosis: z.string().trim().max(500, 'Diagnosis cannot exceed 500 characters').optional(),
  urgency: z.nativeEnum(OrderUrgency).default(OrderUrgency.ROUTINE),
  items: z.array(
    z.object({
      catalogItemId: z.string().min(1, 'Catalog item is required'),
      notes: z.string().trim().max(500, 'Item notes cannot exceed 500 characters').optional(),
      preferredDate: z.coerce.date().optional()
    })
  ).min(1, 'At least one lab test or scan item is required')
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
  notes: optionalNotesSchema
});

export const orderTransitionSchema = z.object({
  nextStatus: z.nativeEnum(OrderStatus),
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional(),
  notes: optionalNotesSchema
});

export const cancelOrderSchema = z.object({
  reason: requiredReasonSchema,
  supervisorApprovalId: z.string().min(1, 'Supervisor approval ID is required').optional()
});

export const orderListQuerySchema = dateRangeQueryBaseSchema.extend({
  urgency: z.nativeEnum(OrderUrgency).optional(),
  patientId: z.string().min(1).optional(),
  doctorId: z.string().min(1).optional(),
  hospitalId: z.string().min(1).optional()
});

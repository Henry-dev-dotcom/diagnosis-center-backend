import { DeliveryChannel } from '@prisma/client';
import { z } from 'zod';
import { optionalNotesSchema } from './common.validators.js';

export const releaseResultSchema = z.object({
  releaseNote: z.string().trim().max(1000).optional(),
  notifyDoctor: z.boolean().default(true),
  notifyReception: z.boolean().default(true)
});

export const resultDeliverySchema = z.object({
  channel: z.nativeEnum(DeliveryChannel).optional(),
  recipient: z.string().trim().min(3, 'Recipient is required').max(160),
  note: z.string().trim().max(500).optional()
}).refine((value) => !value.channel || ['EMAIL', 'SMS', 'WHATSAPP'].includes(String(value.channel)), {
  message: 'This endpoint only supports EMAIL, SMS, or WHATSAPP delivery',
  path: ['channel']
});

export const retryDeliverySchema = z.object({
  reason: z.string().trim().max(500).optional(),
  notes: optionalNotesSchema
});

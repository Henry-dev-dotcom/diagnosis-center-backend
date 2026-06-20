import { z } from 'zod';

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  resultReleased: z.boolean().optional(),
  paymentUpdate: z.boolean().optional(),
  orderUpdate: z.boolean().optional(),
  systemAlert: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one notification setting must be provided'
});

export const createNotificationSchema = z.object({
  type: z.enum(['RESULT_RELEASED', 'ORDER_UPDATE', 'PAYMENT_UPDATE', 'SYSTEM_ALERT', 'DELIVERY_EVENT']).default('SYSTEM_ALERT'),
  title: z.string().trim().min(2, 'Title is required').max(180),
  body: z.string().trim().min(2, 'Message body is required').max(2000),
  orderId: z.string().trim().optional(),
  recipientUserId: z.string().trim().optional(),
  recipientEmail: z.string().trim().email().optional(),
  recipientPhone: z.string().trim().max(40).optional(),
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'])).min(1).max(4).optional()
});

export const deliverNotificationSchema = z.object({
  channels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'])).min(1).max(4).optional(),
  target: z.string().trim().max(255).optional(),
  safeMessage: z.boolean().optional()
});

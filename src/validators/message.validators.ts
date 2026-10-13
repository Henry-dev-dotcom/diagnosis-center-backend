import { MessageChannel } from '@prisma/client';
import { z } from 'zod';
import { DIRECT_MESSAGE_DEPARTMENT_KEYS } from '../config/messageChannels.js';

export const messageChannelParamSchema = z.object({
  channel: z.nativeEnum(MessageChannel, { message: 'That message channel does not exist' })
});

export const messageDepartmentParamSchema = z.object({
  department: z.enum(DIRECT_MESSAGE_DEPARTMENT_KEYS, { message: 'That department does not exist' })
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const sendMessageSchema = z.object({
  channel: z.nativeEnum(MessageChannel, { message: 'That message channel does not exist' }).optional(),
  recipientDepartment: z.enum(DIRECT_MESSAGE_DEPARTMENT_KEYS, { message: 'That department does not exist' }).optional(),
  // Long enough for anything worth saying across a corridor, short enough that
  // nobody mistakes this for the patient's chart.
  body: z.string().trim().min(1, 'Type a message before sending it').max(2000, 'A message cannot exceed 2000 characters')
}).refine((message) => Boolean(message.channel) !== Boolean(message.recipientDepartment), {
  path: ['channel'],
  message: 'Choose exactly one channel or recipient department'
});

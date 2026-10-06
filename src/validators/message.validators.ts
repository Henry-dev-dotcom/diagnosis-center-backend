import { MessageChannel } from '@prisma/client';
import { z } from 'zod';

export const messageChannelParamSchema = z.object({
  channel: z.nativeEnum(MessageChannel, { message: 'That message channel does not exist' })
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const sendMessageSchema = z.object({
  channel: z.nativeEnum(MessageChannel, { message: 'That message channel does not exist' }),
  // Long enough for anything worth saying across a corridor, short enough that
  // nobody mistakes this for the patient's chart.
  body: z.string().trim().min(1, 'Type a message before sending it').max(2000, 'A message cannot exceed 2000 characters')
});

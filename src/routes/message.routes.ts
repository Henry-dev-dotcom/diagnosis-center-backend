import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { messageChannelParamSchema, messageListQuerySchema, sendMessageSchema } from '../validators/message.validators.js';
import { listMessageChannelsController, listMessagesController, sendMessageController } from '../controllers/message.controller.js';

/*
  Staff messaging, open to every department.

  Which channels a person sees is decided by their role in the service, not here,
  because the same question has to be answered again when they post - being able
  to name a channel is not the same as being in it.
*/
export const messageRoutes = Router();
messageRoutes.use('/messages', requireAuth);
messageRoutes.get('/messages/channels', requirePermission(PERMISSIONS.MESSAGES_READ), listMessageChannelsController);
messageRoutes.get('/messages/:channel', requirePermission(PERMISSIONS.MESSAGES_READ), validateRequest({ params: messageChannelParamSchema, query: messageListQuerySchema }), listMessagesController);
messageRoutes.post('/messages', requirePermission(PERMISSIONS.MESSAGES_SEND), validateRequest({ body: sendMessageSchema }), sendMessageController);

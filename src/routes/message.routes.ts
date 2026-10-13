import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { messageChannelParamSchema, messageDepartmentParamSchema, messageListQuerySchema, sendMessageSchema } from '../validators/message.validators.js';
import { listDepartmentMessagesController, listMessageChannelsController, listMessagesController, sendMessageController } from '../controllers/message.controller.js';

/*
  Staff messaging, open to every department.

  Group channel access remains role-aware. Department-to-department threads
  expose only the two participating departments' conversation.
*/
export const messageRoutes = Router();
messageRoutes.use('/messages', requireAuth);
messageRoutes.get('/messages/channels', requirePermission(PERMISSIONS.MESSAGES_READ), listMessageChannelsController);
messageRoutes.get('/messages/departments/:department', requirePermission(PERMISSIONS.MESSAGES_READ), validateRequest({ params: messageDepartmentParamSchema, query: messageListQuerySchema }), listDepartmentMessagesController);
messageRoutes.get('/messages/:channel', requirePermission(PERMISSIONS.MESSAGES_READ), validateRequest({ params: messageChannelParamSchema, query: messageListQuerySchema }), listMessagesController);
messageRoutes.post('/messages', requirePermission(PERMISSIONS.MESSAGES_SEND), validateRequest({ body: sendMessageSchema }), sendMessageController);

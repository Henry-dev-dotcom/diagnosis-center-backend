import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { listChannels, listMessages, sendMessage } from '../services/message.service.js';

export const listMessageChannelsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listChannels(req);
  return sendSuccess(res, 'Message channels loaded successfully', result);
});

export const listMessagesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listMessages(req.params.channel, req.query, req);
  return sendSuccess(res, 'Messages loaded successfully', result);
});

export const sendMessageController = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendMessage(req.body, req);
  return sendSuccess(res, 'Message sent successfully', result, 201);
});

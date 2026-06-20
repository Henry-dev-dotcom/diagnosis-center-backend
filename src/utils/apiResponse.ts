import type { Response } from 'express';
import type { ApiSuccess } from '../types/api.js';

export function sendSuccess<T>(res: Response, message: string, data: T, status = 200) {
  const payload: ApiSuccess<T> = {
    success: true,
    message,
    data
  };
  return res.status(status).json(payload);
}

export function sendCreated<T>(res: Response, message: string, data: T) {
  return sendSuccess(res, message, data, 201);
}

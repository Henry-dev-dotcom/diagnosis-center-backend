import { CatalogItemType } from '@prisma/client';
import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  cancelOrder,
  confirmReceptionOrder,
  createDoctorOrder,
  getOrder,
  getOrderItemQueue,
  getOrderTimeline,
  listOrders,
  updateOrderStatus
} from '../services/order.service.js';

export const createDoctorOrderController = asyncHandler(async (req: Request, res: Response) => {
  const order = await createDoctorOrder(req.body, req);
  return sendCreated(res, 'Doctor order created successfully', order);
});

export const listOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listOrders(req.query, req.user);
  return sendSuccess(res, 'Orders loaded successfully', result);
});

export const listDoctorActiveOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listOrders(req.query, req.user, { doctorOnly: true, active: true });
  return sendSuccess(res, 'Doctor active orders loaded successfully', result);
});

export const listDoctorCompletedOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listOrders(req.query, req.user, { doctorOnly: true, completed: true });
  return sendSuccess(res, 'Doctor completed orders loaded successfully', result);
});

export const listReceptionIncomingOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await listOrders(req.query, req.user, { incomingOnly: true });
  return sendSuccess(res, 'Incoming orders loaded successfully', result);
});

export const getOrderController = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOrder(req.params.id, req.user);
  return sendSuccess(res, 'Order loaded successfully', order);
});

export const updateOrderStatusController = asyncHandler(async (req: Request, res: Response) => {
  const order = await updateOrderStatus(req.params.id, req.body, req);
  return sendSuccess(res, 'Order status updated successfully', order);
});

export const transitionOrderController = asyncHandler(async (req: Request, res: Response) => {
  const order = await updateOrderStatus(req.params.id, req.body, req);
  return sendSuccess(res, 'Order transition completed successfully', order);
});

export const cancelOrderController = asyncHandler(async (req: Request, res: Response) => {
  const order = await cancelOrder(req.params.id, req.body, req);
  return sendSuccess(res, 'Order cancelled successfully', order);
});

export const getOrderTimelineController = asyncHandler(async (req: Request, res: Response) => {
  const timeline = await getOrderTimeline(req.params.id, req.user);
  return sendSuccess(res, 'Order timeline loaded successfully', timeline);
});

export const confirmReceptionOrderController = asyncHandler(async (req: Request, res: Response) => {
  const result = await confirmReceptionOrder(req.params.id, req.body, req);
  return sendSuccess(res, 'Order confirmed successfully', result);
});

export const labOrderQueueController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getOrderItemQueue(CatalogItemType.LAB, req.query);
  return sendSuccess(res, 'Lab order queue loaded successfully', result);
});

export const scanOrderQueueController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getOrderItemQueue(CatalogItemType.SCAN, req.query);
  return sendSuccess(res, 'Scan order queue loaded successfully', result);
});

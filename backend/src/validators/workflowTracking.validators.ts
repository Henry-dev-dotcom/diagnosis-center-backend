import { Request, Response, NextFunction } from 'express';
import { MAX_WORKFLOW_PAGE_SIZE } from '../constants/workflowTracking.constants';

export function validateWorkflowEventQuery(req: Request, res: Response, next: NextFunction) {
  const { page, limit, startDate, endDate } = req.query;

  if (page !== undefined && Number.isNaN(Number(page))) {
    return res.status(400).json({ message: 'page must be a number' });
  }

  if (limit !== undefined && (Number.isNaN(Number(limit)) || Number(limit) > MAX_WORKFLOW_PAGE_SIZE)) {
    return res.status(400).json({ message: `limit must be a number up to ${MAX_WORKFLOW_PAGE_SIZE}` });
  }

  if (startDate && Number.isNaN(Date.parse(String(startDate)))) {
    return res.status(400).json({ message: 'startDate must be a valid date' });
  }

  if (endDate && Number.isNaN(Date.parse(String(endDate)))) {
    return res.status(400).json({ message: 'endDate must be a valid date' });
  }

  return next();
}

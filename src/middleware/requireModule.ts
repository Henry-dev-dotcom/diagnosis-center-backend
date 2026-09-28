import type { NextFunction, Request, Response } from 'express';
import { MODULES, type ModuleKey } from '../config/modules.js';
import { AppError } from '../utils/appError.js';
import { auditAccessFailure } from './audit.js';

/** Blocks a department's routes when the facility has not switched that module on. Use after requireAuth. */
export function requireModule(key: ModuleKey) {
  const name = MODULES.find((module) => module.key === key)?.name ?? key;
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication is required', 401, 'AUTH_REQUIRED'));
    if (!req.user.modules.includes(key)) {
      auditAccessFailure(req, 403, 'MODULE_DISABLED', `${name} is not enabled for this facility`, { module: key });
      return next(new AppError(`${name} is not enabled for your facility.`, 403, 'MODULE_DISABLED', { module: key }));
    }
    return next();
  };
}

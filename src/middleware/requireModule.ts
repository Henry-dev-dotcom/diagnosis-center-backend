import type { NextFunction, Request, Response } from 'express';
import { MODULES, type ModuleKey } from '../config/modules.js';
import { AppError } from '../utils/appError.js';
import { auditAccessFailure } from './audit.js';

/** For routes shared by several departments (e.g. visits serve OPD and Emergency): any one of them switched on is enough. */
export function requireAnyModule(...keys: ModuleKey[]) {
  const names = keys.map((key) => MODULES.find((module) => module.key === key)?.name ?? key).join(' or ');
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication is required', 401, 'AUTH_REQUIRED'));
    if (!keys.some((key) => req.user!.modules.includes(key))) {
      auditAccessFailure(req, 403, 'MODULE_DISABLED', `${names} is not enabled for this facility`, { modules: keys });
      return next(new AppError(`${names} is not enabled for your facility.`, 403, 'MODULE_DISABLED', { modules: keys }));
    }
    return next();
  };
}

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

import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

export type RequestValidationSchemas = {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
};

function assignParsedQuery(req: Request, parsedQuery: unknown) {
  Object.defineProperty(req, 'query', {
    value: parsedQuery,
    writable: true,
    configurable: true,
    enumerable: true
  });
}

export function validateRequest(schemas: RequestValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    if (schemas.query) assignParsedQuery(req, schemas.query.parse(req.query));
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
}

export function validateBody(schema: ZodSchema) {
  return validateRequest({ body: schema });
}

export function validateQuery(schema: ZodSchema) {
  return validateRequest({ query: schema });
}

export function validateParams(schema: ZodSchema) {
  return validateRequest({ params: schema });
}

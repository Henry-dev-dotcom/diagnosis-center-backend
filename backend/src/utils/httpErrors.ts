export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const forbidden = (message = 'You do not have permission to access this resource.') =>
  new HttpError(403, message);

export const unauthorized = (message = 'Authentication is required.') =>
  new HttpError(401, message);

export const badRequest = (message = 'Invalid request.', details?: unknown) =>
  new HttpError(400, message, details);

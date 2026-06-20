export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiValidationError = {
  field?: string;
  message: string;
  code?: string;
};

export type ApiError = {
  success: false;
  message: string;
  code?: string;
  requestId?: string;
  method?: string;
  path?: string;
  timestamp?: string;
  errors?: ApiValidationError[];
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * @fileoverview API Response Utilities with Discriminated Unions
 *
 * Provides type-safe API response handling:
 * - Discriminated union responses
 * - Error categorization and handling
 * - Pagination utilities
 * - HTTP status code mapping
 * - Response builders
 *
 * @module @medicalcor/types/api
 * @version 2.0.0
 */

import { z } from 'zod';

// =============================================================================
// HTTP STATUS CODES
// =============================================================================

/**
 * Success status codes
 */
export const SuccessStatusCodes = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
} as const;

/**
 * Client error status codes
 */
export const ClientErrorStatusCodes = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
} as const;

/**
 * Server error status codes
 */
export const ServerErrorStatusCodes = {
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * All HTTP status codes
 */
export const HttpStatusCodes = {
  ...SuccessStatusCodes,
  ...ClientErrorStatusCodes,
  ...ServerErrorStatusCodes,
} as const;

export type HttpStatusCode = (typeof HttpStatusCodes)[keyof typeof HttpStatusCodes];
export type SuccessStatusCode = (typeof SuccessStatusCodes)[keyof typeof SuccessStatusCodes];
export type ClientErrorStatusCode = (typeof ClientErrorStatusCodes)[keyof typeof ClientErrorStatusCodes];
export type ServerErrorStatusCode = (typeof ServerErrorStatusCodes)[keyof typeof ServerErrorStatusCodes];

// =============================================================================
// ERROR CODES - Domain-Specific
// =============================================================================

/**
 * Application error codes with categories
 */
export const ErrorCodes = {
  // Validation errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Authentication errors (401)
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization errors (403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_ACCESS_DENIED: 'RESOURCE_ACCESS_DENIED',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  LEAD_NOT_FOUND: 'LEAD_NOT_FOUND',
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  OPTIMISTIC_LOCK_FAILURE: 'OPTIMISTIC_LOCK_FAILURE',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Business logic errors
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',

  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  HUBSPOT_ERROR: 'HUBSPOT_ERROR',
  STRIPE_ERROR: 'STRIPE_ERROR',
  WHATSAPP_ERROR: 'WHATSAPP_ERROR',
  TWILIO_ERROR: 'TWILIO_ERROR',

  // Internal errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// API ERROR STRUCTURE
// =============================================================================

/**
 * Structured API error
 */
export interface ApiError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Field-level validation errors */
  fieldErrors?: Record<string, string[]>;
  /** Request trace ID for debugging */
  traceId?: string;
  /** Timestamp of the error */
  timestamp: string;
  /** HTTP status code */
  statusCode: HttpStatusCode;
  /** Stack trace (only in development) */
  stack?: string;
}

/**
 * Creates an API error
 */
export function createApiError(
  code: ErrorCode,
  message: string,
  options: {
    statusCode?: HttpStatusCode;
    details?: Record<string, unknown>;
    fieldErrors?: Record<string, string[]>;
    traceId?: string;
  } = {}
): ApiError {
  const error: ApiError = {
    code,
    message,
    statusCode: options.statusCode ?? mapErrorCodeToStatus(code),
    timestamp: new Date().toISOString(),
  };
  if (options.details !== undefined) error.details = options.details;
  if (options.fieldErrors !== undefined) error.fieldErrors = options.fieldErrors;
  if (options.traceId !== undefined) error.traceId = options.traceId;
  return error;
}

/**
 * Maps error code to HTTP status
 */
export function mapErrorCodeToStatus(code: ErrorCode): HttpStatusCode {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_INPUT':
    case 'MISSING_FIELD':
    case 'INVALID_FORMAT':
      return 400;
    case 'UNAUTHENTICATED':
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 401;
    case 'UNAUTHORIZED':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'RESOURCE_ACCESS_DENIED':
      return 403;
    case 'NOT_FOUND':
    case 'LEAD_NOT_FOUND':
    case 'PATIENT_NOT_FOUND':
    case 'APPOINTMENT_NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'DUPLICATE_ENTRY':
    case 'RESOURCE_ALREADY_EXISTS':
    case 'OPTIMISTIC_LOCK_FAILURE':
      return 409;
    case 'RATE_LIMIT_EXCEEDED':
    case 'QUOTA_EXCEEDED':
      return 429;
    case 'EXTERNAL_SERVICE_ERROR':
    case 'HUBSPOT_ERROR':
    case 'STRIPE_ERROR':
    case 'WHATSAPP_ERROR':
    case 'TWILIO_ERROR':
      return 502;
    default:
      return 500;
  }
}

// =============================================================================
// API RESPONSE DISCRIMINATED UNION
// =============================================================================

/**
 * Successful API response
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: ResponseMeta;
}

/**
 * Failed API response
 */
export interface ApiErrorResponse {
  readonly success: false;
  readonly error: ApiError;
}

/**
 * Discriminated union API response
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Response metadata
 */
export interface ResponseMeta {
  /** Request trace ID */
  traceId?: string;
  /** Response timestamp */
  timestamp: string;
  /** Request duration in ms */
  durationMs?: number;
  /** API version */
  version?: string;
  /** Pagination info */
  pagination?: PaginationMeta;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  /** Current page (1-indexed) */
  page?: number;
  /** Items per page */
  limit: number;
  /** Total items */
  total?: number;
  /** Total pages */
  totalPages?: number;
  /** Has more items */
  hasMore: boolean;
  /** Cursor for next page */
  nextCursor?: string | null;
  /** Cursor for previous page */
  prevCursor?: string | null;
}

// =============================================================================
// RESPONSE TYPE GUARDS
// =============================================================================

/**
 * Type guard for successful response
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard for error response
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return response.success === false;
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

/**
 * Creates a successful response
 */
export function success<T>(data: T, meta?: Partial<ResponseMeta>): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Creates an error response
 */
export function error(apiError: ApiError): ApiErrorResponse {
  return {
    success: false,
    error: apiError,
  };
}

/**
 * Creates a validation error response
 */
export function validationError(
  fieldErrors: Record<string, string[]>,
  message = 'Validation failed',
  traceId?: string
): ApiErrorResponse {
  const opts: { statusCode: HttpStatusCode; fieldErrors: Record<string, string[]>; traceId?: string } = {
    statusCode: 400,
    fieldErrors,
  };
  if (traceId !== undefined) opts.traceId = traceId;
  return error(createApiError('VALIDATION_ERROR', message, opts));
}

/**
 * Creates a not found error response
 */
export function notFoundError(
  resource: string,
  id?: string,
  traceId?: string
): ApiErrorResponse {
  const message = id
    ? `${resource} with ID '${id}' not found`
    : `${resource} not found`;
  const details: Record<string, unknown> = { resource };
  if (id !== undefined) details.id = id;
  const opts: { statusCode: HttpStatusCode; details: Record<string, unknown>; traceId?: string } = {
    statusCode: 404,
    details,
  };
  if (traceId !== undefined) opts.traceId = traceId;
  return error(createApiError('NOT_FOUND', message, opts));
}

/**
 * Creates an unauthorized error response
 */
export function unauthorizedError(
  message = 'Unauthorized',
  traceId?: string
): ApiErrorResponse {
  const opts: { statusCode: HttpStatusCode; traceId?: string } = { statusCode: 401 };
  if (traceId !== undefined) opts.traceId = traceId;
  return error(createApiError('UNAUTHENTICATED', message, opts));
}

/**
 * Creates a forbidden error response
 */
export function forbiddenError(
  message = 'Access denied',
  traceId?: string
): ApiErrorResponse {
  const opts: { statusCode: HttpStatusCode; traceId?: string } = { statusCode: 403 };
  if (traceId !== undefined) opts.traceId = traceId;
  return error(createApiError('UNAUTHORIZED', message, opts));
}

/**
 * Creates an internal error response
 */
export function internalError(
  message = 'Internal server error',
  traceId?: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  const opts: { statusCode: HttpStatusCode; traceId?: string; details?: Record<string, unknown> } = { statusCode: 500 };
  if (traceId !== undefined) opts.traceId = traceId;
  if (details !== undefined) opts.details = details;
  return error(createApiError('INTERNAL_ERROR', message, opts));
}

// =============================================================================
// PAGINATED RESPONSE
// =============================================================================

/**
 * Paginated data container
 */
export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Paginated API response
 */
export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

/**
 * Creates a paginated success response
 */
export function paginatedSuccess<T>(
  items: T[],
  pagination: PaginationMeta,
  meta?: Partial<ResponseMeta>
): ApiSuccessResponse<PaginatedData<T>> {
  return success({ items, pagination }, { ...meta, pagination });
}

/**
 * Creates pagination metadata from query params
 */
export function createPaginationMeta(options: {
  page?: number;
  limit: number;
  total?: number;
  hasMore: boolean;
  nextCursor?: string | null;
}): PaginationMeta {
  const { page, limit, total, hasMore, nextCursor } = options;
  const meta: PaginationMeta = { limit, hasMore };
  if (page !== undefined) meta.page = page;
  if (total !== undefined) {
    meta.total = total;
    meta.totalPages = Math.ceil(total / limit);
  }
  if (nextCursor !== undefined) meta.nextCursor = nextCursor;
  return meta;
}

// =============================================================================
// ZOD SCHEMAS FOR API TYPES
// =============================================================================

/**
 * API error schema
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  fieldErrors: z.record(z.array(z.string())).optional(),
  traceId: z.string().optional(),
  timestamp: z.string(),
  statusCode: z.number(),
  stack: z.string().optional(),
});

/**
 * Response meta schema
 */
export const ResponseMetaSchema = z.object({
  traceId: z.string().optional(),
  timestamp: z.string(),
  durationMs: z.number().optional(),
  version: z.string().optional(),
});

/**
 * Creates an API response schema for a data type
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T
): z.ZodDiscriminatedUnion<'success', [
  z.ZodObject<{ success: z.ZodLiteral<true>; data: T; meta: z.ZodOptional<typeof ResponseMetaSchema> }>,
  z.ZodObject<{ success: z.ZodLiteral<false>; error: typeof ApiErrorSchema }>
]> {
  return z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
      meta: ResponseMetaSchema.optional(),
    }),
    z.object({
      success: z.literal(false),
      error: ApiErrorSchema,
    }),
  ]);
}

/**
 * Pagination meta schema
 */
export const PaginationMetaSchema = z.object({
  page: z.number().optional(),
  limit: z.number(),
  total: z.number().optional(),
  totalPages: z.number().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable().optional(),
  prevCursor: z.string().nullable().optional(),
});

/**
 * Creates a paginated response schema
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T
) {
  return createApiResponseSchema(
    z.object({
      items: z.array(itemSchema),
      pagination: PaginationMetaSchema,
    })
  );
}

// =============================================================================
// RESPONSE TRANSFORMATION
// =============================================================================

/**
 * Maps a successful response's data
 */
export function mapResponse<T, U>(
  response: ApiResponse<T>,
  fn: (data: T) => U
): ApiResponse<U> {
  if (isSuccessResponse(response)) {
    return success(fn(response.data), response.meta);
  }
  return response;
}

/**
 * Chains response transformations
 */
export function flatMapResponse<T, U>(
  response: ApiResponse<T>,
  fn: (data: T) => ApiResponse<U>
): ApiResponse<U> {
  if (isSuccessResponse(response)) {
    return fn(response.data);
  }
  return response;
}

/**
 * Combines multiple responses
 */
export function combineResponses<T extends readonly ApiResponse<unknown>[]>(
  responses: T
): ApiResponse<{ [K in keyof T]: T[K] extends ApiResponse<infer U> ? U : never }> {
  const data: unknown[] = [];

  for (const response of responses) {
    if (isErrorResponse(response)) {
      return response;
    }
    data.push(response.data);
  }

  return success(data as never);
}

/**
 * Extracts data from response or throws
 */
export function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (isSuccessResponse(response)) {
    return response.data;
  }
  throw new Error(`API Error: ${response.error.message}`);
}

/**
 * Extracts data from response or returns default
 */
export function unwrapResponseOr<T>(response: ApiResponse<T>, defaultValue: T): T {
  if (isSuccessResponse(response)) {
    return response.data;
  }
  return defaultValue;
}

// =============================================================================
// ERROR RECOVERY
// =============================================================================

/**
 * Recovers from specific error codes
 */
export function recoverResponse<T>(
  response: ApiResponse<T>,
  handlers: Partial<Record<ErrorCode, (error: ApiError) => ApiResponse<T>>>
): ApiResponse<T> {
  if (isErrorResponse(response)) {
    const handler = handlers[response.error.code];
    if (handler) {
      return handler(response.error);
    }
  }
  return response;
}

/**
 * Wraps a Promise into an API response
 */
export async function wrapAsync<T>(
  promise: Promise<T>,
  traceId?: string
): Promise<ApiResponse<T>> {
  try {
    const data = await promise;
    const meta: Partial<ResponseMeta> = {};
    if (traceId !== undefined) meta.traceId = traceId;
    return success(data, meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return error(createApiError('INTERNAL_ERROR', message, traceId ? { traceId } : {}));
  }
}

/**
 * Wraps a function that might throw into an API response
 */
export function wrapSync<T>(
  fn: () => T,
  traceId?: string
): ApiResponse<T> {
  try {
    const meta: Partial<ResponseMeta> = {};
    if (traceId !== undefined) meta.traceId = traceId;
    return success(fn(), meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return error(createApiError('INTERNAL_ERROR', message, traceId ? { traceId } : {}));
  }
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Result of a batch operation item
 */
export interface BatchItemResult<T> {
  index: number;
  id?: string;
  result: ApiResponse<T>;
}

/**
 * Batch operation response
 */
export interface BatchResponse<T> {
  succeeded: BatchItemResult<T>[];
  failed: BatchItemResult<T>[];
  total: number;
  successCount: number;
  failureCount: number;
}

/**
 * Creates a batch response
 */
export function batchSuccess<T>(
  results: BatchItemResult<T>[]
): ApiSuccessResponse<BatchResponse<T>> {
  const succeeded = results.filter(r => isSuccessResponse(r.result));
  const failed = results.filter(r => isErrorResponse(r.result));

  return success({
    succeeded,
    failed,
    total: results.length,
    successCount: succeeded.length,
    failureCount: failed.length,
  });
}

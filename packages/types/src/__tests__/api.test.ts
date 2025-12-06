/**
 * API Response Utilities Unit Tests
 *
 * Tests for API response handling including:
 * - HTTP status codes mapping
 * - Error creation and handling
 * - Response builders (success, error, validation, etc.)
 * - Type guards for discriminated unions
 * - Response transformations
 * - Pagination utilities
 * - Batch operations
 * - Error recovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Status codes
  HttpStatusCodes,
  SuccessStatusCodes,
  ClientErrorStatusCodes,
  ServerErrorStatusCodes,
  ErrorCodes,
  // Error handling
  createApiError,
  mapErrorCodeToStatus,
  // Response builders
  success,
  error,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  internalError,
  // Type guards
  isSuccessResponse,
  isErrorResponse,
  // Pagination
  paginatedSuccess,
  createPaginationMeta,
  // Response transformation
  mapResponse,
  flatMapResponse,
  combineResponses,
  unwrapResponse,
  unwrapResponseOr,
  recoverResponse,
  // Async wrappers
  wrapAsync,
  wrapSync,
  // Batch operations
  batchSuccess,
  // Schemas
  createApiResponseSchema,
  createPaginatedResponseSchema,
  type ApiError,
  type ApiResponse,
  type PaginationMeta,
  type BatchItemResult,
} from '../lib/api.js';
import { z } from 'zod';

describe('HTTP Status Codes', () => {
  it('should define success status codes', () => {
    expect(SuccessStatusCodes.OK).toBe(200);
    expect(SuccessStatusCodes.CREATED).toBe(201);
    expect(SuccessStatusCodes.ACCEPTED).toBe(202);
    expect(SuccessStatusCodes.NO_CONTENT).toBe(204);
  });

  it('should define client error status codes', () => {
    expect(ClientErrorStatusCodes.BAD_REQUEST).toBe(400);
    expect(ClientErrorStatusCodes.UNAUTHORIZED).toBe(401);
    expect(ClientErrorStatusCodes.FORBIDDEN).toBe(403);
    expect(ClientErrorStatusCodes.NOT_FOUND).toBe(404);
    expect(ClientErrorStatusCodes.CONFLICT).toBe(409);
    expect(ClientErrorStatusCodes.UNPROCESSABLE_ENTITY).toBe(422);
    expect(ClientErrorStatusCodes.TOO_MANY_REQUESTS).toBe(429);
  });

  it('should define server error status codes', () => {
    expect(ServerErrorStatusCodes.INTERNAL_SERVER_ERROR).toBe(500);
    expect(ServerErrorStatusCodes.NOT_IMPLEMENTED).toBe(501);
    expect(ServerErrorStatusCodes.BAD_GATEWAY).toBe(502);
    expect(ServerErrorStatusCodes.SERVICE_UNAVAILABLE).toBe(503);
    expect(ServerErrorStatusCodes.GATEWAY_TIMEOUT).toBe(504);
  });

  it('should combine all status codes', () => {
    expect(HttpStatusCodes.OK).toBe(200);
    expect(HttpStatusCodes.BAD_REQUEST).toBe(400);
    expect(HttpStatusCodes.INTERNAL_SERVER_ERROR).toBe(500);
  });
});

describe('Error Codes', () => {
  it('should define validation error codes', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCodes.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCodes.MISSING_FIELD).toBe('MISSING_FIELD');
    expect(ErrorCodes.INVALID_FORMAT).toBe('INVALID_FORMAT');
  });

  it('should define authentication error codes', () => {
    expect(ErrorCodes.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
    expect(ErrorCodes.INVALID_TOKEN).toBe('INVALID_TOKEN');
    expect(ErrorCodes.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
  });

  it('should define authorization error codes', () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCodes.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    expect(ErrorCodes.RESOURCE_ACCESS_DENIED).toBe('RESOURCE_ACCESS_DENIED');
  });

  it('should define not found error codes', () => {
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCodes.LEAD_NOT_FOUND).toBe('LEAD_NOT_FOUND');
    expect(ErrorCodes.PATIENT_NOT_FOUND).toBe('PATIENT_NOT_FOUND');
  });

  it('should define conflict error codes', () => {
    expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
    expect(ErrorCodes.DUPLICATE_ENTRY).toBe('DUPLICATE_ENTRY');
    expect(ErrorCodes.RESOURCE_ALREADY_EXISTS).toBe('RESOURCE_ALREADY_EXISTS');
  });
});

describe('createApiError', () => {
  it('should create basic error with code and message', () => {
    const err = createApiError('INVALID_INPUT', 'Invalid phone number');

    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toBe('Invalid phone number');
    expect(err.statusCode).toBe(400);
    expect(err.timestamp).toBeDefined();
  });

  it('should use custom status code when provided', () => {
    const err = createApiError('UNKNOWN_ERROR', 'Custom error', { statusCode: 503 });

    expect(err.statusCode).toBe(503);
  });

  it('should include details when provided', () => {
    const err = createApiError('NOT_FOUND', 'Lead not found', {
      details: { leadId: '123', source: 'whatsapp' },
    });

    expect(err.details).toEqual({ leadId: '123', source: 'whatsapp' });
  });

  it('should include field errors when provided', () => {
    const err = createApiError('VALIDATION_ERROR', 'Validation failed', {
      fieldErrors: {
        email: ['Invalid email format'],
        phone: ['Required field', 'Invalid E.164 format'],
      },
    });

    expect(err.fieldErrors).toEqual({
      email: ['Invalid email format'],
      phone: ['Required field', 'Invalid E.164 format'],
    });
  });

  it('should include trace ID when provided', () => {
    const err = createApiError('INTERNAL_ERROR', 'Server error', {
      traceId: 'trace-123',
    });

    expect(err.traceId).toBe('trace-123');
  });

  it('should not include undefined optional fields', () => {
    const err = createApiError('NOT_FOUND', 'Not found');

    expect(err.details).toBeUndefined();
    expect(err.fieldErrors).toBeUndefined();
    expect(err.traceId).toBeUndefined();
    expect(err.stack).toBeUndefined();
  });
});

describe('mapErrorCodeToStatus', () => {
  it('should map validation errors to 400', () => {
    expect(mapErrorCodeToStatus('VALIDATION_ERROR')).toBe(400);
    expect(mapErrorCodeToStatus('INVALID_INPUT')).toBe(400);
    expect(mapErrorCodeToStatus('MISSING_FIELD')).toBe(400);
  });

  it('should map authentication errors to 401', () => {
    expect(mapErrorCodeToStatus('UNAUTHENTICATED')).toBe(401);
    expect(mapErrorCodeToStatus('INVALID_TOKEN')).toBe(401);
    expect(mapErrorCodeToStatus('TOKEN_EXPIRED')).toBe(401);
  });

  it('should map authorization errors to 403', () => {
    expect(mapErrorCodeToStatus('UNAUTHORIZED')).toBe(403);
    expect(mapErrorCodeToStatus('INSUFFICIENT_PERMISSIONS')).toBe(403);
  });

  it('should map not found errors to 404', () => {
    expect(mapErrorCodeToStatus('NOT_FOUND')).toBe(404);
    expect(mapErrorCodeToStatus('LEAD_NOT_FOUND')).toBe(404);
    expect(mapErrorCodeToStatus('PATIENT_NOT_FOUND')).toBe(404);
  });

  it('should map conflict errors to 409', () => {
    expect(mapErrorCodeToStatus('CONFLICT')).toBe(409);
    expect(mapErrorCodeToStatus('DUPLICATE_ENTRY')).toBe(409);
  });

  it('should map rate limit errors to 429', () => {
    expect(mapErrorCodeToStatus('RATE_LIMIT_EXCEEDED')).toBe(429);
    expect(mapErrorCodeToStatus('QUOTA_EXCEEDED')).toBe(429);
  });

  it('should map internal errors to 500', () => {
    expect(mapErrorCodeToStatus('INTERNAL_ERROR')).toBe(500);
    expect(mapErrorCodeToStatus('DATABASE_ERROR')).toBe(500);
  });

  it('should map external service errors to 502', () => {
    expect(mapErrorCodeToStatus('EXTERNAL_SERVICE_ERROR')).toBe(502);
    expect(mapErrorCodeToStatus('HUBSPOT_ERROR')).toBe(502);
    expect(mapErrorCodeToStatus('STRIPE_ERROR')).toBe(502);
  });
});

describe('Response Type Guards', () => {
  it('should identify success responses', () => {
    const response = success({ id: '123' });

    expect(isSuccessResponse(response)).toBe(true);
    expect(isErrorResponse(response)).toBe(false);
  });

  it('should identify error responses', () => {
    const response = error(createApiError('NOT_FOUND', 'Not found'));

    expect(isSuccessResponse(response)).toBe(false);
    expect(isErrorResponse(response)).toBe(true);
  });

  it('should narrow types correctly', () => {
    const response: ApiResponse<{ id: string }> = success({ id: '123' });

    if (isSuccessResponse(response)) {
      // TypeScript should know response.data exists
      expect(response.data.id).toBe('123');
    } else {
      // TypeScript should know response.error exists
      expect.fail('Should be success response');
    }
  });
});

describe('success', () => {
  it('should create success response with data', () => {
    const response = success({ id: '123', name: 'Test' });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: '123', name: 'Test' });
    expect(response.meta?.timestamp).toBeDefined();
  });

  it('should include custom metadata', () => {
    const response = success({ id: '123' }, { traceId: 'trace-123', version: '1.0' });

    expect(response.meta?.traceId).toBe('trace-123');
    expect(response.meta?.version).toBe('1.0');
    expect(response.meta?.timestamp).toBeDefined();
  });

  it('should work with primitive values', () => {
    const numberResponse = success(42);
    const stringResponse = success('hello');
    const boolResponse = success(true);

    expect(numberResponse.data).toBe(42);
    expect(stringResponse.data).toBe('hello');
    expect(boolResponse.data).toBe(true);
  });
});

describe('error', () => {
  it('should create error response', () => {
    const apiError = createApiError('NOT_FOUND', 'Resource not found');
    const response = error(apiError);

    expect(response.success).toBe(false);
    expect(response.error).toBe(apiError);
  });
});

describe('validationError', () => {
  it('should create validation error response', () => {
    const response = validationError({
      email: ['Invalid format'],
      phone: ['Required'],
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('VALIDATION_ERROR');
    expect(response.error.message).toBe('Validation failed');
    expect(response.error.statusCode).toBe(400);
    expect(response.error.fieldErrors).toEqual({
      email: ['Invalid format'],
      phone: ['Required'],
    });
  });

  it('should accept custom message', () => {
    const response = validationError({}, 'Custom validation message');

    expect(response.error.message).toBe('Custom validation message');
  });

  it('should include trace ID when provided', () => {
    const response = validationError({}, 'Validation failed', 'trace-123');

    expect(response.error.traceId).toBe('trace-123');
  });
});

describe('notFoundError', () => {
  it('should create not found error with resource name', () => {
    const response = notFoundError('Lead');

    expect(response.error.code).toBe('NOT_FOUND');
    expect(response.error.message).toBe('Lead not found');
    expect(response.error.statusCode).toBe(404);
  });

  it('should include resource ID in message and details', () => {
    const response = notFoundError('Patient', '123');

    expect(response.error.message).toBe("Patient with ID '123' not found");
    expect(response.error.details?.resource).toBe('Patient');
    expect(response.error.details?.id).toBe('123');
  });

  it('should include trace ID when provided', () => {
    const response = notFoundError('Lead', '123', 'trace-123');

    expect(response.error.traceId).toBe('trace-123');
  });
});

describe('unauthorizedError', () => {
  it('should create unauthorized error with default message', () => {
    const response = unauthorizedError();

    expect(response.error.code).toBe('UNAUTHENTICATED');
    expect(response.error.message).toBe('Unauthorized');
    expect(response.error.statusCode).toBe(401);
  });

  it('should accept custom message', () => {
    const response = unauthorizedError('Invalid token');

    expect(response.error.message).toBe('Invalid token');
  });

  it('should include trace ID when provided', () => {
    const response = unauthorizedError('Unauthorized', 'trace-123');

    expect(response.error.traceId).toBe('trace-123');
  });
});

describe('forbiddenError', () => {
  it('should create forbidden error with default message', () => {
    const response = forbiddenError();

    expect(response.error.code).toBe('UNAUTHORIZED');
    expect(response.error.message).toBe('Access denied');
    expect(response.error.statusCode).toBe(403);
  });

  it('should accept custom message', () => {
    const response = forbiddenError('Insufficient permissions');

    expect(response.error.message).toBe('Insufficient permissions');
  });
});

describe('internalError', () => {
  it('should create internal error with default message', () => {
    const response = internalError();

    expect(response.error.code).toBe('INTERNAL_ERROR');
    expect(response.error.message).toBe('Internal server error');
    expect(response.error.statusCode).toBe(500);
  });

  it('should accept custom message and details', () => {
    const response = internalError('Database connection failed', 'trace-123', { db: 'postgres' });

    expect(response.error.message).toBe('Database connection failed');
    expect(response.error.traceId).toBe('trace-123');
    expect(response.error.details?.db).toBe('postgres');
  });
});

describe('Pagination', () => {
  describe('createPaginationMeta', () => {
    it('should create pagination meta with required fields', () => {
      const meta = createPaginationMeta({
        limit: 20,
        hasMore: true,
      });

      expect(meta.limit).toBe(20);
      expect(meta.hasMore).toBe(true);
    });

    it('should include page and calculate total pages', () => {
      const meta = createPaginationMeta({
        page: 2,
        limit: 20,
        total: 100,
        hasMore: true,
      });

      expect(meta.page).toBe(2);
      expect(meta.total).toBe(100);
      expect(meta.totalPages).toBe(5);
    });

    it('should include cursor when provided', () => {
      const meta = createPaginationMeta({
        limit: 20,
        hasMore: true,
        nextCursor: 'cursor-123',
      });

      expect(meta.nextCursor).toBe('cursor-123');
    });

    it('should handle null cursor', () => {
      const meta = createPaginationMeta({
        limit: 20,
        hasMore: false,
        nextCursor: null,
      });

      expect(meta.nextCursor).toBeNull();
    });

    it('should calculate total pages correctly', () => {
      expect(createPaginationMeta({ limit: 20, total: 100, hasMore: false }).totalPages).toBe(5);
      expect(createPaginationMeta({ limit: 20, total: 99, hasMore: false }).totalPages).toBe(5);
      expect(createPaginationMeta({ limit: 20, total: 101, hasMore: false }).totalPages).toBe(6);
    });
  });

  describe('paginatedSuccess', () => {
    it('should create paginated success response', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const pagination = createPaginationMeta({ limit: 20, hasMore: false });
      const response = paginatedSuccess(items, pagination);

      expect(response.success).toBe(true);
      expect(response.data.items).toEqual(items);
      expect(response.data.pagination).toBe(pagination);
      expect(response.meta?.pagination).toBe(pagination);
    });

    it('should include custom metadata', () => {
      const response = paginatedSuccess([], createPaginationMeta({ limit: 20, hasMore: false }), {
        traceId: 'trace-123',
      });

      expect(response.meta?.traceId).toBe('trace-123');
    });
  });
});

describe('Response Transformation', () => {
  describe('mapResponse', () => {
    it('should transform success response data', () => {
      const response = success({ value: 10 });
      const mapped = mapResponse(response, (data) => data.value * 2);

      expect(isSuccessResponse(mapped)).toBe(true);
      if (isSuccessResponse(mapped)) {
        expect(mapped.data).toBe(20);
      }
    });

    it('should pass through error responses unchanged', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const mapped = mapResponse(errorResp, (data: never) => data);

      expect(mapped).toBe(errorResp);
    });

    it('should preserve metadata', () => {
      const response = success({ value: 10 }, { traceId: 'trace-123' });
      const mapped = mapResponse(response, (data) => data.value * 2);

      if (isSuccessResponse(mapped)) {
        expect(mapped.meta?.traceId).toBe('trace-123');
      }
    });
  });

  describe('flatMapResponse', () => {
    it('should chain success responses', () => {
      const response = success(10);
      const chained = flatMapResponse(response, (value) => success(value * 2));

      expect(isSuccessResponse(chained)).toBe(true);
      if (isSuccessResponse(chained)) {
        expect(chained.data).toBe(20);
      }
    });

    it('should short-circuit on error', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const chained = flatMapResponse(errorResp, () => success(42));

      expect(chained).toBe(errorResp);
    });

    it('should allow transformation to error', () => {
      const response = success(0);
      const chained = flatMapResponse(response, (value) =>
        value === 0 ? error(createApiError('INVALID_INPUT', 'Cannot be zero')) : success(10 / value)
      );

      expect(isErrorResponse(chained)).toBe(true);
    });
  });

  describe('combineResponses', () => {
    it('should combine multiple success responses', () => {
      const responses = [success(1), success('two'), success(true)];
      const combined = combineResponses(responses);

      expect(isSuccessResponse(combined)).toBe(true);
      if (isSuccessResponse(combined)) {
        expect(combined.data).toEqual([1, 'two', true]);
      }
    });

    it('should return first error when any fails', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const responses = [success(1), errorResp, success(3)];
      const combined = combineResponses(responses);

      expect(combined).toBe(errorResp);
    });

    it('should work with empty array', () => {
      const combined = combineResponses([]);

      expect(isSuccessResponse(combined)).toBe(true);
      if (isSuccessResponse(combined)) {
        expect(combined.data).toEqual([]);
      }
    });
  });

  describe('unwrapResponse', () => {
    it('should extract data from success response', () => {
      const response = success({ id: '123' });
      const data = unwrapResponse(response);

      expect(data).toEqual({ id: '123' });
    });

    it('should throw error for error response', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));

      expect(() => unwrapResponse(errorResp)).toThrow('API Error: Not found');
    });
  });

  describe('unwrapResponseOr', () => {
    it('should extract data from success response', () => {
      const response = success({ id: '123' });
      const data = unwrapResponseOr(response, { id: 'default' });

      expect(data).toEqual({ id: '123' });
    });

    it('should return default for error response', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const data = unwrapResponseOr(errorResp, { id: 'default' });

      expect(data).toEqual({ id: 'default' });
    });
  });

  describe('recoverResponse', () => {
    it('should pass through success response', () => {
      const response = success({ id: '123' });
      const recovered = recoverResponse(response, {});

      expect(recovered).toBe(response);
    });

    it('should recover from specific error codes', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const recovered = recoverResponse(errorResp, {
        NOT_FOUND: () => success({ id: 'default' }),
      });

      expect(isSuccessResponse(recovered)).toBe(true);
      if (isSuccessResponse(recovered)) {
        expect(recovered.data).toEqual({ id: 'default' });
      }
    });

    it('should pass through unhandled errors', () => {
      const errorResp = error(createApiError('NOT_FOUND', 'Not found'));
      const recovered = recoverResponse(errorResp, {
        VALIDATION_ERROR: () => success({ id: 'default' }),
      });

      expect(recovered).toBe(errorResp);
    });
  });
});

describe('Async Wrappers', () => {
  describe('wrapAsync', () => {
    it('should wrap successful promise', async () => {
      const promise = Promise.resolve({ id: '123' });
      const response = await wrapAsync(promise);

      expect(isSuccessResponse(response)).toBe(true);
      if (isSuccessResponse(response)) {
        expect(response.data).toEqual({ id: '123' });
      }
    });

    it('should wrap rejected promise', async () => {
      const promise = Promise.reject(new Error('Failed'));
      const response = await wrapAsync(promise);

      expect(isErrorResponse(response)).toBe(true);
      if (isErrorResponse(response)) {
        expect(response.error.code).toBe('INTERNAL_ERROR');
        expect(response.error.message).toBe('Failed');
      }
    });

    it('should include trace ID when provided', async () => {
      const promise = Promise.resolve({ id: '123' });
      const response = await wrapAsync(promise, 'trace-123');

      if (isSuccessResponse(response)) {
        expect(response.meta?.traceId).toBe('trace-123');
      }
    });

    it('should handle non-Error rejections', async () => {
      const promise = Promise.reject('string error');
      const response = await wrapAsync(promise);

      if (isErrorResponse(response)) {
        expect(response.error.message).toBe('Unknown error');
      }
    });
  });

  describe('wrapSync', () => {
    it('should wrap successful function', () => {
      const response = wrapSync(() => ({ id: '123' }));

      expect(isSuccessResponse(response)).toBe(true);
      if (isSuccessResponse(response)) {
        expect(response.data).toEqual({ id: '123' });
      }
    });

    it('should wrap throwing function', () => {
      const response = wrapSync(() => {
        throw new Error('Failed');
      });

      expect(isErrorResponse(response)).toBe(true);
      if (isErrorResponse(response)) {
        expect(response.error.code).toBe('INTERNAL_ERROR');
        expect(response.error.message).toBe('Failed');
      }
    });

    it('should include trace ID when provided', () => {
      const response = wrapSync(() => ({ id: '123' }), 'trace-123');

      if (isSuccessResponse(response)) {
        expect(response.meta?.traceId).toBe('trace-123');
      }
    });
  });
});

describe('Batch Operations', () => {
  describe('batchSuccess', () => {
    it('should categorize batch results', () => {
      const results: BatchItemResult<string>[] = [
        { index: 0, id: '1', result: success('ok') },
        { index: 1, id: '2', result: error(createApiError('NOT_FOUND', 'Not found')) },
        { index: 2, id: '3', result: success('ok') },
      ];

      const response = batchSuccess(results);

      expect(response.success).toBe(true);
      expect(response.data.total).toBe(3);
      expect(response.data.successCount).toBe(2);
      expect(response.data.failureCount).toBe(1);
      expect(response.data.succeeded).toHaveLength(2);
      expect(response.data.failed).toHaveLength(1);
    });

    it('should handle all successes', () => {
      const results: BatchItemResult<string>[] = [
        { index: 0, result: success('ok') },
        { index: 1, result: success('ok') },
      ];

      const response = batchSuccess(results);

      expect(response.data.successCount).toBe(2);
      expect(response.data.failureCount).toBe(0);
    });

    it('should handle all failures', () => {
      const results: BatchItemResult<string>[] = [
        { index: 0, result: error(createApiError('NOT_FOUND', 'Not found')) },
        { index: 1, result: error(createApiError('VALIDATION_ERROR', 'Invalid')) },
      ];

      const response = batchSuccess(results);

      expect(response.data.successCount).toBe(0);
      expect(response.data.failureCount).toBe(2);
    });
  });
});

describe('Zod Schemas', () => {
  describe('createApiResponseSchema', () => {
    it('should validate success response', () => {
      const schema = createApiResponseSchema(z.object({ id: z.string() }));
      const response = success({ id: '123' });

      const result = schema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const schema = createApiResponseSchema(z.object({ id: z.string() }));
      const response = error(createApiError('NOT_FOUND', 'Not found'));

      const result = schema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid responses', () => {
      const schema = createApiResponseSchema(z.object({ id: z.string() }));
      const invalid = { invalid: 'response' };

      const result = schema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createPaginatedResponseSchema', () => {
    it('should validate paginated response', () => {
      const schema = createPaginatedResponseSchema(z.object({ id: z.string() }));
      const pagination = createPaginationMeta({ limit: 20, hasMore: false });
      const response = paginatedSuccess([{ id: '1' }, { id: '2' }], pagination);

      const result = schema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid paginated responses', () => {
      const schema = createPaginatedResponseSchema(z.object({ id: z.string() }));
      const invalid = { data: { items: [{ wrong: 'field' }] } };

      const result = schema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

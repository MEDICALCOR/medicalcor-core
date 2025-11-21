import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  WebhookSignatureError,
  RateLimitError,
  ExternalServiceError,
  NotFoundError,
  isOperationalError,
  toSafeErrorResponse,
} from '../errors.js';

describe('AppError', () => {
  it('should create error with correct properties', () => {
    const error = new AppError('Test error', 'TEST_CODE', 400);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
  });

  it('should default to 500 status code', () => {
    const error = new AppError('Test', 'CODE');
    expect(error.statusCode).toBe(500);
  });

  it('should produce safe error details', () => {
    const error = new AppError('Sensitive info here', 'CODE', 400);
    const safe = error.toSafeError();

    expect(safe.code).toBe('CODE');
    expect(safe.message).toBe('Sensitive info here');
    expect(safe.statusCode).toBe(400);
  });
});

describe('ValidationError', () => {
  it('should have 400 status code', () => {
    const error = new ValidationError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should store validation details', () => {
    const details = { field: 'email', message: 'invalid' };
    const error = new ValidationError('Invalid', details);
    expect(error.details).toBe(details);
  });
});

describe('AuthenticationError', () => {
  it('should have 401 status code', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should have default message', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Authentication required');
  });
});

describe('WebhookSignatureError', () => {
  it('should have 401 status code', () => {
    const error = new WebhookSignatureError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('WEBHOOK_SIGNATURE_ERROR');
  });
});

describe('RateLimitError', () => {
  it('should have 429 status code', () => {
    const error = new RateLimitError(120);
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(120);
  });

  it('should default retryAfter to 60', () => {
    const error = new RateLimitError();
    expect(error.retryAfter).toBe(60);
  });
});

describe('ExternalServiceError', () => {
  it('should have 502 status code', () => {
    const error = new ExternalServiceError('HubSpot', 'Connection failed');
    expect(error.statusCode).toBe(502);
    expect(error.service).toBe('HubSpot');
  });

  it('should store original error', () => {
    const original = new Error('Network error');
    const error = new ExternalServiceError('API', 'Failed', original);
    expect(error.originalError).toBe(original);
  });
});

describe('NotFoundError', () => {
  it('should have 404 status code', () => {
    const error = new NotFoundError('Contact');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Contact not found');
  });
});

describe('isOperationalError', () => {
  it('should return true for AppError instances', () => {
    expect(isOperationalError(new AppError('test', 'CODE'))).toBe(true);
    expect(isOperationalError(new ValidationError('test'))).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isOperationalError(new Error('test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isOperationalError('string')).toBe(false);
    expect(isOperationalError(null)).toBe(false);
  });
});

describe('toSafeErrorResponse', () => {
  it('should return safe response for operational errors', () => {
    const error = new ValidationError('Bad input');
    const response = toSafeErrorResponse(error);

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.statusCode).toBe(400);
  });

  it('should return generic response for unknown errors', () => {
    const response = toSafeErrorResponse(new Error('Sensitive'));

    expect(response.code).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('An unexpected error occurred');
    expect(response.statusCode).toBe(500);
  });
});

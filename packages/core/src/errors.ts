/**
 * Custom error classes for the application
 * These errors provide safe, non-PII error messages for API responses
 */

export interface SafeErrorDetails {
  code: string;
  message: string;
  statusCode: number;
}

/**
 * Base application error with safe error details
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get safe error details for API response (no sensitive info)
   */
  toSafeError(): SafeErrorDetails {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Webhook signature verification error
 */
export class WebhookSignatureError extends AppError {
  constructor(message: string = 'Invalid webhook signature') {
    super(message, 'WEBHOOK_SIGNATURE_ERROR', 401);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * External service error (HubSpot, WhatsApp, etc.)
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(service: string, message: string, originalError?: Error) {
    super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Check if an error is an operational error (expected) vs programming error
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Convert unknown error to safe error response
 */
export function toSafeErrorResponse(error: unknown): SafeErrorDetails {
  if (isOperationalError(error)) {
    return error.toSafeError();
  }

  // For unexpected errors, return a generic message
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    statusCode: 500,
  };
}

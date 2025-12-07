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

  constructor(message: string, code: string, statusCode = 500) {
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
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Webhook signature verification error
 */
export class WebhookSignatureError extends AppError {
  constructor(message = 'Invalid webhook signature') {
    super(message, 'WEBHOOK_SIGNATURE_ERROR', 401);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter = 60) {
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
  public readonly originalError: Error | undefined;

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
 * Database connection error
 */
export class DatabaseConnectionError extends AppError {
  constructor(message = 'Database connection failed') {
    super(message, 'DATABASE_CONNECTION_ERROR', 503);
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Database operation error (query failed, constraint violation, etc.)
 */
export class DatabaseOperationError extends AppError {
  public readonly operation: string;
  public readonly originalError: Error | undefined;

  constructor(operation: string, message: string, originalError?: Error) {
    super(`Database ${operation} failed: ${message}`, 'DATABASE_OPERATION_ERROR', 500);
    this.name = 'DatabaseOperationError';
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Lead not found error
 */
export class LeadNotFoundError extends AppError {
  public readonly externalSource: string;
  public readonly externalId: string;

  constructor(externalSource: string, externalId: string) {
    super(`Lead not found: source=${externalSource}, id=${externalId}`, 'LEAD_NOT_FOUND', 404);
    this.name = 'LeadNotFoundError';
    this.externalSource = externalSource;
    this.externalId = externalId;
  }
}

/**
 * Lead upsert failed error
 */
export class LeadUpsertError extends AppError {
  public readonly externalSource: string;
  public readonly externalId: string;
  public readonly originalError: Error | undefined;

  constructor(externalSource: string, externalId: string, originalError?: Error) {
    super(
      `Lead upsert failed: source=${externalSource}, id=${externalId}`,
      'LEAD_UPSERT_FAILED',
      500
    );
    this.name = 'LeadUpsertError';
    this.externalSource = externalSource;
    this.externalId = externalId;
    this.originalError = originalError;
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

// ============================================================================
// REPOSITORY ERRORS - Standardized error types for data access layer
// ============================================================================

/**
 * Base repository error
 * All repository-specific errors extend this class
 */
export class RepositoryError extends AppError {
  public readonly repository: string;
  public readonly operation: string;
  public readonly originalError: Error | undefined;

  constructor(repository: string, operation: string, message: string, originalError?: Error) {
    super(message, 'REPOSITORY_ERROR', 500);
    this.name = 'RepositoryError';
    this.repository = repository;
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Record not found error
 * Thrown when a requested record does not exist
 */
export class RecordNotFoundError extends AppError {
  public readonly repository: string;
  public readonly operation: string = 'find';
  public readonly recordType: string;
  public readonly recordId: string;

  constructor(repository: string, recordType: string, recordId: string) {
    super(`${recordType} not found: ${recordId}`, 'RECORD_NOT_FOUND', 404);
    this.name = 'RecordNotFoundError';
    this.repository = repository;
    this.recordType = recordType;
    this.recordId = recordId;
  }
}

/**
 * Record creation error
 * Thrown when a record cannot be created
 */
export class RecordCreateError extends AppError {
  public readonly repository: string;
  public readonly operation: string = 'create';
  public readonly recordType: string;
  public readonly originalError: Error | undefined;

  constructor(repository: string, recordType: string, message?: string, originalError?: Error) {
    super(message ?? `Failed to create ${recordType}`, 'RECORD_CREATE_FAILED', 500);
    this.name = 'RecordCreateError';
    this.repository = repository;
    this.recordType = recordType;
    this.originalError = originalError;
  }
}

/**
 * Record update error
 * Thrown when a record cannot be updated
 */
export class RecordUpdateError extends AppError {
  public readonly repository: string;
  public readonly operation: string = 'update';
  public readonly recordType: string;
  public readonly recordId: string;
  public readonly originalError: Error | undefined;

  constructor(
    repository: string,
    recordType: string,
    recordId: string,
    message?: string,
    originalError?: Error
  ) {
    super(message ?? `Failed to update ${recordType}: ${recordId}`, 'RECORD_UPDATE_FAILED', 500);
    this.name = 'RecordUpdateError';
    this.repository = repository;
    this.recordType = recordType;
    this.recordId = recordId;
    this.originalError = originalError;
  }
}

/**
 * Record delete error
 * Thrown when a record cannot be deleted
 */
export class RecordDeleteError extends AppError {
  public readonly repository: string;
  public readonly operation: string = 'delete';
  public readonly recordType: string;
  public readonly recordId: string;
  public readonly originalError: Error | undefined;

  constructor(
    repository: string,
    recordType: string,
    recordId: string,
    message?: string,
    originalError?: Error
  ) {
    super(message ?? `Failed to delete ${recordType}: ${recordId}`, 'RECORD_DELETE_FAILED', 500);
    this.name = 'RecordDeleteError';
    this.repository = repository;
    this.recordType = recordType;
    this.recordId = recordId;
    this.originalError = originalError;
  }
}

/**
 * Concurrency error (optimistic locking failure)
 * Thrown when a concurrent modification is detected
 */
export class ConcurrencyError extends AppError {
  public readonly repository: string;
  public readonly operation: string = 'update';
  public readonly recordType: string;
  public readonly recordId: string;

  constructor(repository: string, recordType: string, recordId: string) {
    super(
      `Concurrent modification detected for ${recordType}: ${recordId}. Please retry.`,
      'CONCURRENCY_ERROR',
      409
    );
    this.name = 'ConcurrencyError';
    this.repository = repository;
    this.recordType = recordType;
    this.recordId = recordId;
  }
}

/**
 * Consent required error
 * Thrown when patient consent is required but not present (GDPR/HIPAA)
 */
export class ConsentRequiredError extends AppError {
  public readonly contactId: string;
  public readonly missingConsents: string[];

  constructor(contactId: string, missingConsents: string[]) {
    super(
      `Patient consent required before scheduling. Missing consents: ${missingConsents.join(', ')}`,
      'CONSENT_REQUIRED',
      403
    );
    this.name = 'ConsentRequiredError';
    this.contactId = contactId;
    this.missingConsents = missingConsents;
  }
}

/**
 * Database configuration error
 * Thrown when database is not properly configured
 */
export class DatabaseConfigError extends AppError {
  public readonly repository: string;

  constructor(repository: string, message?: string) {
    super(message ?? 'Database connection not configured', 'DATABASE_CONFIG_ERROR', 503);
    this.name = 'DatabaseConfigError';
    this.repository = repository;
  }
}

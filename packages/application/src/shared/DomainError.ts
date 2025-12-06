/**
 * @fileoverview Domain Error Types for Application Layer
 *
 * Provides structured error handling with severity levels and
 * correlation tracking for distributed systems.
 *
 * @module application/shared/DomainError
 */

/**
 * Error severity levels for operational monitoring
 */
export enum ErrorSeverity {
  /** Informational - no action needed */
  LOW = 'LOW',
  /** Warning - should be monitored */
  MEDIUM = 'MEDIUM',
  /** Error - needs attention */
  HIGH = 'HIGH',
  /** Critical - immediate action required */
  CRITICAL = 'CRITICAL',
}

/**
 * Domain Error with rich context
 *
 * Provides structured error information for:
 * - Logging and monitoring
 * - Error reporting to clients
 * - Correlation tracking
 * - Severity-based alerting
 */
export class DomainError extends Error {
  /**
   * Create a new domain error
   *
   * @param code - Machine-readable error code (e.g., ''case.not_found')
   * @param message - Human-readable error message
   * @param details - Additional context for debugging
   * @param severity - Error severity level
   * @param correlationId - Request correlation ID for tracing
   */
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public readonly correlationId?: string
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      severity: this.severity,
      correlationId: this.correlationId,
      stack: this.stack,
    };
  }

  /**
   * Create a safe version for client responses (no stack trace)
   */
  toClientJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
    };
  }

  /**
   * Check if error is critical
   */
  isCritical(): boolean {
    return this.severity === ErrorSeverity.CRITICAL;
  }

  /**
   * Create a NOT_FOUND error
   */
  static notFound(
    resourceType: string,
    resourceId: string,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      `${resourceType.toLowerCase()}.not_found`,
      `${resourceType} with ID '${resourceId}' not found`,
      { resourceType, resourceId },
      ErrorSeverity.MEDIUM,
      correlationId
    );
  }

  /**
   * Create a VALIDATION error
   */
  static validation(
    message: string,
    fieldErrors: Record<string, string[]>,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'validation.failed',
      message,
      { fieldErrors },
      ErrorSeverity.LOW,
      correlationId
    );
  }

  /**
   * Create an UNAUTHORIZED error
   */
  static unauthorized(
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'security.unauthorized',
      message,
      details,
      ErrorSeverity.HIGH,
      correlationId
    );
  }

  /**
   * Create a PERMISSION_DENIED error
   */
  static permissionDenied(
    permission: string,
    principalId: string,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'security.permission_denied',
      `Permission denied: ${permission}`,
      { permission, principalId },
      ErrorSeverity.HIGH,
      correlationId
    );
  }

  /**
   * Create a CONFLICT error
   */
  static conflict(
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'conflict',
      message,
      details,
      ErrorSeverity.MEDIUM,
      correlationId
    );
  }

  /**
   * Create an INTERNAL error
   */
  static internal(
    message: string,
    cause?: Error,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'internal.error',
      message,
      { cause: cause?.message, stack: cause?.stack },
      ErrorSeverity.CRITICAL,
      correlationId
    );
  }
}

/**
 * Optimistic locking error
 */
export class OptimisticLockError extends DomainError {
  constructor(
    resourceType: string,
    resourceId: string,
    expectedVersion: number,
    actualVersion: number,
    correlationId?: string
  ) {
    super(
      'concurrency.optimistic_lock_failed',
      `Optimistic lock failed for ${resourceType} '${resourceId}': expected version ${expectedVersion}, actual ${actualVersion}`,
      { resourceType, resourceId, expectedVersion, actualVersion },
      ErrorSeverity.MEDIUM,
      correlationId
    );
    this.name = 'OptimisticLockError';
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends DomainError {
  constructor(
    rule: string,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(
      `business_rule.${rule}`,
      message,
      details,
      ErrorSeverity.MEDIUM,
      correlationId
    );
    this.name = 'BusinessRuleError';
  }
}

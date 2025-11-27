/**
 * Base Adapter Interfaces
 *
 * Common types and utilities shared across all adapter interfaces.
 * These form the foundation of the Plug & Play architecture.
 */

/**
 * Base configuration for all adapters
 */
export interface IAdapterConfig {
  /** Provider identifier (e.g., 'stripe', 'hubspot', 'openai') */
  providerName: string;

  /** Request timeout in milliseconds */
  timeoutMs?: number | undefined;

  /** Retry configuration */
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

/**
 * Health check result for adapter services
 */
export interface IHealthCheckResult {
  healthy: boolean;
  provider: string;
  latencyMs: number;
  message?: string | undefined;
  timestamp: Date;
}

/**
 * Standard adapter response wrapper
 */
export interface IAdapterResponse<T> {
  success: boolean;
  data?: T | undefined;
  error?:
    | {
        code: string;
        message: string;
        retryable: boolean;
      }
    | undefined;
  metadata?:
    | {
        requestId?: string | undefined;
        processingTimeMs?: number | undefined;
        provider: string;
      }
    | undefined;
}

/**
 * Webhook verification result
 */
export interface IWebhookVerification {
  valid: boolean;
  payload?: unknown;
  error?: string | undefined;
}

/**
 * Pagination parameters for list operations
 */
export interface IPaginationParams {
  limit?: number | undefined;
  offset?: number | undefined;
  cursor?: string | undefined;
}

/**
 * Paginated response wrapper
 */
export interface IPaginatedResponse<T> {
  items: T[];
  total?: number | undefined;
  hasMore: boolean;
  nextCursor?: string | undefined;
}

/**
 * Base adapter interface that all adapters must implement
 */
export interface IBaseAdapter {
  /** Returns the provider name (e.g., 'stripe', 'hubspot') */
  readonly providerName: string;

  /** Health check for the adapter */
  healthCheck(): Promise<IHealthCheckResult>;
}

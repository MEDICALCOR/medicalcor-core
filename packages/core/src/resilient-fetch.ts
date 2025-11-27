/**
 * Resilient Networking Utilities
 *
 * Provides robust HTTP client wrappers with:
 * - Exponential backoff retry logic
 * - Circuit breaker integration
 * - Timeout handling
 * - Request/Response logging
 *
 * IMPORTANT: Use these utilities for ALL external API calls to ensure
 * resilient networking and prevent cascading failures.
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';
import {
  type CircuitBreaker,
  CircuitBreakerError,
  globalCircuitBreakerRegistry,
  type CircuitBreakerConfig,
} from './circuit-breaker.js';

const logger = createLogger({ name: 'resilient-fetch' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff (default: 200) */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter: boolean;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatuses: number[];
  /** Error codes that should trigger a retry */
  retryableErrors: string[];
}

/**
 * Options for resilient fetch
 */
export interface ResilientFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker name (enables circuit breaker if provided) */
  circuitBreakerName?: string;
  /** Circuit breaker configuration overrides */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Custom logger context */
  logContext?: Record<string, unknown>;
  /** Skip logging for this request */
  skipLogging?: boolean;
}

/**
 * Result of a resilient fetch operation
 */
export interface ResilientFetchResult<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (if success) */
  data?: T;
  /** HTTP status code (if response received) */
  status?: number;
  /** HTTP status text */
  statusText?: string;
  /** Response headers */
  headers?: Headers;
  /** Error message (if failed) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
  /** Number of attempts made */
  attempts: number;
  /** Total time taken in milliseconds */
  durationMs: number;
  /** Whether circuit breaker prevented the request */
  circuitBreakerTripped?: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'FETCH_ERROR'],
};

const DEFAULT_TIMEOUT_MS = 30000;

// =============================================================================
// INTERNAL UTILITIES
// =============================================================================

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  delay = Math.min(delay, config.maxDelayMs);

  // SECURITY: Use crypto-secure randomness for jitter
  if (config.jitter) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const jitterFactor = 0.5 + (randomBytes[0]! / 0xffffffff);
    delay = delay * jitterFactor;
  }

  return Math.round(delay);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof Error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && config.retryableErrors.includes(errorCode)) {
      return true;
    }

    // Check for fetch-specific errors
    if (error.name === 'AbortError') {
      return false; // Timeout - could retry
    }
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true; // Network errors
    }
  }

  return false;
}

/**
 * Check if a response status is retryable
 */
function isRetryableStatus(status: number, config: RetryConfig): boolean {
  return config.retryableStatuses.includes(status);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Make an HTTP request with automatic retry and circuit breaker support
 *
 * Features:
 * - Exponential backoff retry on transient failures
 * - Configurable timeout
 * - Circuit breaker integration
 * - Detailed logging
 * - Type-safe response handling
 *
 * @param url - URL to fetch
 * @param options - Fetch options with retry configuration
 * @returns Result object with success/failure details
 *
 * @example
 * ```typescript
 * // Simple GET request with defaults
 * const result = await resilientFetch<{ data: string }>('https://api.example.com/data');
 * if (result.success) {
 *   console.log(result.data);
 * }
 *
 * // POST with custom retry config
 * const result = await resilientFetch<ResponseType>('https://api.example.com/submit', {
 *   method: 'POST',
 *   body: JSON.stringify({ key: 'value' }),
 *   headers: { 'Content-Type': 'application/json' },
 *   timeoutMs: 10000,
 *   retry: { maxAttempts: 5, baseDelayMs: 500 },
 *   circuitBreakerName: 'example-api',
 * });
 * ```
 */
export async function resilientFetch<T = unknown>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const startTime = Date.now();
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry: retryOptions,
    circuitBreakerName,
    circuitBreakerConfig,
    logContext = {},
    skipLogging = false,
    ...fetchOptions
  } = options;

  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryOptions,
  };

  let attempt = 0;
  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  // Get circuit breaker if configured
  let circuitBreaker: CircuitBreaker | null = null;
  if (circuitBreakerName) {
    circuitBreaker = globalCircuitBreakerRegistry.get(circuitBreakerName, circuitBreakerConfig);

    // Check if circuit is open
    if (!circuitBreaker.isAllowingRequests()) {
      if (!skipLogging) {
        logger.warn(
          { url, circuitBreakerName, ...logContext },
          'Circuit breaker is open, request blocked'
        );
      }

      return {
        success: false,
        error: `Circuit breaker '${circuitBreakerName}' is open`,
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        attempts: 0,
        durationMs: Date.now() - startTime,
        circuitBreakerTripped: true,
      };
    }
  }

  while (attempt < retryConfig.maxAttempts) {
    attempt++;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      if (!skipLogging && attempt > 1) {
        logger.debug(
          { url, attempt, maxAttempts: retryConfig.maxAttempts, ...logContext },
          'Retrying request'
        );
      }

      // Make the actual request
      const makeRequest = async (): Promise<Response> => {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });
        return response;
      };

      // Execute through circuit breaker if configured
      let response: Response;
      if (circuitBreaker) {
        response = await circuitBreaker.execute(makeRequest);
      } else {
        response = await makeRequest();
      }

      clearTimeout(timeoutId);
      lastStatus = response.status;

      // Check for retryable status codes
      if (!response.ok && isRetryableStatus(response.status, retryConfig)) {
        if (attempt < retryConfig.maxAttempts) {
          const delay = calculateBackoffDelay(attempt - 1, retryConfig);

          if (!skipLogging) {
            logger.warn(
              {
                url,
                status: response.status,
                attempt,
                nextDelay: delay,
                ...logContext,
              },
              'Received retryable status, will retry'
            );
          }

          await sleep(delay);
          continue;
        }
      }

      // Handle non-retryable errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');

        if (!skipLogging) {
          logger.error(
            {
              url,
              status: response.status,
              statusText: response.statusText,
              attempt,
              ...logContext,
            },
            'Request failed with non-retryable status'
          );
        }

        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          error: errorText,
          errorCode: `HTTP_${response.status}`,
          attempts: attempt,
          durationMs: Date.now() - startTime,
        };
      }

      // Success - parse response
      const contentType = response.headers.get('content-type');
      let data: T;

      if (contentType?.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      if (!skipLogging) {
        logger.debug(
          {
            url,
            status: response.status,
            attempts: attempt,
            durationMs: Date.now() - startTime,
            ...logContext,
          },
          'Request successful'
        );
      }

      return {
        success: true,
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        attempts: attempt,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle circuit breaker errors
      if (error instanceof CircuitBreakerError) {
        return {
          success: false,
          error: error.message,
          errorCode: 'CIRCUIT_BREAKER_OPEN',
          attempts: attempt,
          durationMs: Date.now() - startTime,
          circuitBreakerTripped: true,
        };
      }

      // Check if error is retryable
      if (isRetryableError(error, retryConfig) && attempt < retryConfig.maxAttempts) {
        const delay = calculateBackoffDelay(attempt - 1, retryConfig);

        if (!skipLogging) {
          logger.warn(
            {
              url,
              error: lastError.message,
              attempt,
              nextDelay: delay,
              ...logContext,
            },
            'Request failed with retryable error, will retry'
          );
        }

        await sleep(delay);
        continue;
      }

      // Non-retryable error or max attempts reached
      if (!skipLogging) {
        logger.error(
          {
            url,
            error: lastError.message,
            attempts: attempt,
            ...logContext,
          },
          'Request failed after all attempts'
        );
      }

      return {
        success: false,
        ...(lastStatus !== undefined ? { status: lastStatus } : {}),
        error: lastError.message,
        errorCode: (lastError as NodeJS.ErrnoException).code ?? 'FETCH_ERROR',
        attempts: attempt,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Should not reach here, but handle it
  return {
    success: false,
    ...(lastStatus !== undefined ? { status: lastStatus } : {}),
    error: lastError?.message ?? 'Max retries exceeded',
    errorCode: 'MAX_RETRIES_EXCEEDED',
    attempts: attempt,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Simplified wrapper for JSON API requests
 *
 * Automatically sets Content-Type and Accept headers for JSON
 */
export async function resilientJsonFetch<TResponse = unknown>(
  url: string,
  options: Omit<ResilientFetchOptions, 'body'> & { body?: unknown } = {}
): Promise<ResilientFetchResult<TResponse>> {
  const { body, headers = {}, ...rest } = options;

  const jsonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  return resilientFetch<TResponse>(url, {
    ...rest,
    headers: jsonHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Create a pre-configured resilient fetch function for a specific service
 *
 * Useful for creating API clients with consistent configuration
 *
 * @example
 * ```typescript
 * const stripeApi = createServiceClient('https://api.stripe.com', {
 *   circuitBreakerName: 'stripe',
 *   timeoutMs: 10000,
 *   retry: { maxAttempts: 3 },
 *   headers: { Authorization: `Bearer ${apiKey}` },
 * });
 *
 * const result = await stripeApi<Customer>('/v1/customers/cus_xxx');
 * ```
 */
export function createServiceClient(
  baseUrl: string,
  defaultOptions: ResilientFetchOptions = {}
): <T = unknown>(
  path: string,
  options?: ResilientFetchOptions
) => Promise<ResilientFetchResult<T>> {
  return async <T = unknown>(
    path: string,
    options: ResilientFetchOptions = {}
  ): Promise<ResilientFetchResult<T>> => {
    const url = new URL(path, baseUrl).toString();

    // Merge headers
    const mergedHeaders: Record<string, string> = {
      ...(defaultOptions.headers as Record<string, string>),
      ...(options.headers as Record<string, string>),
    };

    // Merge retry configs
    const mergedRetry = {
      ...defaultOptions.retry,
      ...options.retry,
    };

    return resilientFetch<T>(url, {
      ...defaultOptions,
      ...options,
      headers: mergedHeaders,
      retry: mergedRetry,
    });
  };
}

/**
 * Retry a function with exponential backoff
 *
 * Generic utility for retrying any async operation, not just HTTP requests
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     const response = await someAsyncOperation();
 *     if (!response.success) throw new Error('Operation failed');
 *     return response.data;
 *   },
 *   {
 *     maxAttempts: 3,
 *     baseDelayMs: 100,
 *     shouldRetry: (error) => error.message !== 'Fatal error',
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitter?: boolean;
    shouldRetry?: (error: Error, attempt: number) => boolean;
    onRetry?: (error: Error, attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    jitter = true,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      const lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < maxAttempts && shouldRetry(lastError, attempt)) {
        // Calculate delay
        let delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        delay = Math.min(delay, maxDelayMs);
        // SECURITY: Use crypto-secure randomness for jitter
        if (jitter) {
          const randomBytes = new Uint32Array(1);
          crypto.getRandomValues(randomBytes);
          const jitterFactor = 0.5 + (randomBytes[0]! / 0xffffffff);
          delay = delay * jitterFactor;
        }
        delay = Math.round(delay);

        onRetry?.(lastError, attempt, delay);

        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  // This point is technically unreachable if maxAttempts >= 1
  // because every iteration either returns or throws
  throw new Error('Max retry attempts exhausted');
}

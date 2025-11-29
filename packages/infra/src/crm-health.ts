/**
 * CRM Health Check Service
 *
 * Provides comprehensive health monitoring for CRM integrations.
 * Supports multiple CRM providers with unified health check interface.
 *
 * Features:
 * - Zod-validated configuration
 * - Typed error responses
 * - Detailed health metrics
 * - Logging integration
 * - Circuit breaker awareness
 * - Latency monitoring
 *
 * @module @medicalcor/infra/crm-health
 */

import { z } from 'zod';
import type { HealthChecker, DependencyCheck, HealthStatus } from './health.js';

// =============================================================================
// Configuration Schema
// =============================================================================

/**
 * CRM health check configuration schema
 */
export const CrmHealthConfigSchema = z.object({
  /** Timeout for health check in milliseconds */
  timeoutMs: z.number().int().min(100).max(30000).default(5000),

  /** Threshold for degraded status (ms) */
  degradedThresholdMs: z.number().int().min(100).max(15000).default(2000),

  /** Threshold for unhealthy status (ms) */
  unhealthyThresholdMs: z.number().int().min(500).max(30000).default(5000),

  /** Enable detailed logging */
  verbose: z.boolean().default(false),

  /** CRM provider name for identification */
  providerName: z.string().min(1).default('crm'),

  /** Whether CRM is a critical dependency */
  critical: z.boolean().default(false),
});

export type CrmHealthConfig = z.infer<typeof CrmHealthConfigSchema>;

// =============================================================================
// Health Check Result Types
// =============================================================================

/**
 * Detailed CRM health check result
 */
export interface CrmHealthResult {
  /** Overall health status */
  status: HealthStatus;

  /** Provider name (e.g., 'pipedrive', 'mock') */
  provider: string;

  /** Time taken for health check in ms */
  latencyMs: number;

  /** Human-readable status message */
  message?: string;

  /** Detailed health information */
  details: CrmHealthDetails;

  /** Timestamp of the check */
  timestamp: Date;
}

/**
 * Detailed CRM health information
 */
export interface CrmHealthDetails {
  /** Whether the provider is configured */
  configured: boolean;

  /** API connectivity status */
  apiConnected: boolean;

  /** Authentication status */
  authenticated: boolean;

  /** Rate limit information */
  rateLimit?: {
    remaining: number;
    limit: number;
    resetAt?: Date;
  };

  /** API version information */
  apiVersion?: string;

  /** Last successful API call */
  lastSuccessfulCall?: Date;

  /** Error details if unhealthy */
  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
  };
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * CRM health check error
 */
export class CrmHealthCheckError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    isRetryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CrmHealthCheckError';
    this.code = code;
    this.isRetryable = isRetryable;
    // Only set details if provided (exactOptionalPropertyTypes compliance)
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace(this, this.constructor);
  }
}

// =============================================================================
// Health Check Interfaces
// =============================================================================

/**
 * Interface for CRM providers that support health checks
 */
export interface CrmWithHealthCheck {
  readonly sourceName: string;
  checkHealth(): Promise<{
    status: HealthStatus;
    latencyMs: number;
    message?: string;
    details: {
      scenario?: string;
      connectionStatus: string;
      apiVersion?: string;
      rateLimitRemaining?: number;
      lastSuccessfulCall?: Date;
    };
  }>;
}

/**
 * Type guard to check if a CRM provider supports health checks
 */
export function hasCrmHealthCheck(provider: unknown): provider is CrmWithHealthCheck {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'sourceName' in provider &&
    'checkHealth' in provider &&
    typeof (provider as CrmWithHealthCheck).checkHealth === 'function'
  );
}

// =============================================================================
// CRM Health Check Service
// =============================================================================

/**
 * CRM Health Check Service
 *
 * Monitors CRM provider health and provides standardized health check results.
 */
export class CrmHealthCheckService {
  private readonly config: CrmHealthConfig;
  private lastResult?: CrmHealthResult;
  private consecutiveFailures = 0;

  constructor(config: Partial<CrmHealthConfig> = {}) {
    this.config = CrmHealthConfigSchema.parse(config);
  }

  /**
   * Check CRM health using the provided CRM provider
   *
   * @param crmProvider - The CRM provider to check (must support checkHealth)
   * @returns Health check result
   */
  async check(crmProvider: unknown): Promise<CrmHealthResult> {
    const startTime = Date.now();

    // Check if provider exists
    if (!crmProvider) {
      return this.createResult('unhealthy', startTime, {
        configured: false,
        apiConnected: false,
        authenticated: false,
        error: {
          code: 'CRM_NOT_CONFIGURED',
          message: 'CRM provider is not configured',
          isRetryable: false,
        },
      });
    }

    // Check if provider supports health checks
    if (!hasCrmHealthCheck(crmProvider)) {
      // Provider doesn't support health checks - assume healthy if configured
      return this.createResult(
        'healthy',
        startTime,
        {
          configured: true,
          apiConnected: true,
          authenticated: true,
        },
        crmProvider as { sourceName?: string }
      );
    }

    try {
      // Execute health check with timeout
      const result = await this.executeWithTimeout(
        () => crmProvider.checkHealth(),
        this.config.timeoutMs
      );

      const latencyMs = Date.now() - startTime;

      // Determine status based on latency thresholds
      let status: HealthStatus = result.status;
      if (status === 'healthy' && latencyMs > this.config.degradedThresholdMs) {
        status = 'degraded';
      }

      // Reset consecutive failures on success
      if (status !== 'unhealthy') {
        this.consecutiveFailures = 0;
      }

      // Build health details, only adding optional fields if present
      const healthDetails: CrmHealthDetails = {
        configured: true,
        apiConnected: result.details.connectionStatus === 'connected',
        authenticated: true,
      };
      if (result.details.apiVersion !== undefined) {
        healthDetails.apiVersion = result.details.apiVersion;
      }
      if (result.details.rateLimitRemaining !== undefined) {
        healthDetails.rateLimit = { remaining: result.details.rateLimitRemaining, limit: 1000 };
      }
      if (result.details.lastSuccessfulCall !== undefined) {
        healthDetails.lastSuccessfulCall = result.details.lastSuccessfulCall;
      }

      const healthResult = this.createResult(
        status,
        startTime,
        healthDetails,
        crmProvider,
        result.message
      );

      this.lastResult = healthResult;
      return healthResult;
    } catch (error) {
      this.consecutiveFailures++;

      const errorDetails = this.parseError(error);
      const healthResult = this.createResult(
        'unhealthy',
        startTime,
        {
          configured: true,
          apiConnected: false,
          authenticated: errorDetails.code !== 'AUTH_ERROR',
          error: errorDetails,
        },
        crmProvider as { sourceName?: string },
        errorDetails.message
      );

      this.lastResult = healthResult;
      return healthResult;
    }
  }

  /**
   * Create a health checker function compatible with the health check infrastructure
   *
   * @param getCrmProvider - Function to get the CRM provider
   * @returns Health checker function
   */
  createChecker(getCrmProvider: () => unknown): HealthChecker {
    return async (): Promise<DependencyCheck> => {
      const result = await this.check(getCrmProvider());

      // Build dependency check with required fields first
      const check: DependencyCheck = {
        name: this.config.providerName,
        status: result.status,
        latencyMs: result.latencyMs,
        lastChecked: result.timestamp,
      };

      // Only add message if provided (exactOptionalPropertyTypes compliance)
      if (result.message !== undefined) {
        check.message = result.message;
      }

      return check;
    };
  }

  /**
   * Get the last health check result
   */
  getLastResult(): CrmHealthResult | undefined {
    return this.lastResult;
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Reset the service state
   */
  reset(): void {
    // Cast through unknown to reset the optional property
    (this as unknown as { lastResult: CrmHealthResult | undefined }).lastResult = undefined;
    this.consecutiveFailures = 0;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new CrmHealthCheckError(`Health check timed out after ${timeoutMs}ms`, 'TIMEOUT', true)
        );
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          // Wrap non-Error values in CrmHealthCheckError
          if (error instanceof Error) {
            reject(error);
          } else {
            reject(new CrmHealthCheckError(String(error), 'UNKNOWN_ERROR', true));
          }
        });
    });
  }

  /**
   * Create a health result object
   */
  private createResult(
    status: HealthStatus,
    startTime: number,
    details: CrmHealthDetails,
    provider?: { sourceName?: string },
    message?: string
  ): CrmHealthResult {
    // Build result with required fields first
    const result: CrmHealthResult = {
      status,
      provider: provider?.sourceName ?? 'unknown',
      latencyMs: Date.now() - startTime,
      details,
      timestamp: new Date(),
    };

    // Only add message if provided (exactOptionalPropertyTypes compliance)
    if (message !== undefined) {
      result.message = message;
    }

    return result;
  }

  /**
   * Parse an error into error details
   */
  private parseError(error: unknown): {
    code: string;
    message: string;
    isRetryable: boolean;
  } {
    if (error instanceof CrmHealthCheckError) {
      return {
        code: error.code,
        message: error.message,
        isRetryable: error.isRetryable,
      };
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Determine error type
      if (message.includes('timeout')) {
        return { code: 'TIMEOUT', message: error.message, isRetryable: true };
      }
      if (message.includes('auth') || message.includes('401') || message.includes('403')) {
        return { code: 'AUTH_ERROR', message: error.message, isRetryable: false };
      }
      if (message.includes('rate') || message.includes('429')) {
        return { code: 'RATE_LIMIT', message: error.message, isRetryable: true };
      }
      if (message.includes('network') || message.includes('econnrefused')) {
        return { code: 'NETWORK_ERROR', message: error.message, isRetryable: true };
      }

      return { code: 'UNKNOWN_ERROR', message: error.message, isRetryable: true };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
      isRetryable: true,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a CRM health check service
 */
export function createCrmHealthCheckService(
  config: Partial<CrmHealthConfig> = {}
): CrmHealthCheckService {
  return new CrmHealthCheckService(config);
}

/**
 * Create a CRM health checker for use with the health check infrastructure
 *
 * @param getCrmProvider - Function to get the CRM provider
 * @param config - Health check configuration
 * @returns Health checker function
 */
export function createCrmHealthChecker(
  getCrmProvider: () => unknown,
  config: Partial<CrmHealthConfig> = {}
): HealthChecker {
  const service = new CrmHealthCheckService(config);
  return service.createChecker(getCrmProvider);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Quick health check for a CRM provider
 *
 * @param crmProvider - The CRM provider to check
 * @param timeoutMs - Timeout in milliseconds
 * @returns Health status
 */
export async function quickCrmHealthCheck(
  crmProvider: unknown,
  timeoutMs = 5000
): Promise<HealthStatus> {
  const service = new CrmHealthCheckService({ timeoutMs });
  const result = await service.check(crmProvider);
  return result.status;
}

/**
 * Format health check result for logging
 */
export function formatCrmHealthResult(result: CrmHealthResult): string {
  const statusEmoji = {
    healthy: '✓',
    degraded: '⚠',
    unhealthy: '✗',
  }[result.status];

  const parts = [
    `${statusEmoji} CRM Health: ${result.status.toUpperCase()}`,
    `Provider: ${result.provider}`,
    `Latency: ${result.latencyMs}ms`,
  ];

  if (result.message) {
    parts.push(`Message: ${result.message}`);
  }

  if (result.details.error) {
    parts.push(`Error: [${result.details.error.code}] ${result.details.error.message}`);
  }

  return parts.join(' | ');
}

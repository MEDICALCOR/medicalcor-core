/**
 * @module architecture/ports/adapters
 *
 * Adapter Base Classes and Utilities
 * ==================================
 *
 * Base classes for implementing adapters that connect to ports.
 * Provides common functionality like health checks, circuit breakers, and metrics.
 */

import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';
import type { HealthCheckResult } from '../layers/contracts.js';

// ============================================================================
// ADAPTER BASE CLASS
// ============================================================================

/**
 * Base class for all adapters
 */
export abstract class BaseAdapter {
  readonly __layer = 'infrastructure' as const;
  abstract readonly adapterName: string;
  abstract readonly adapterType: 'inbound' | 'outbound';

  protected initialized = false;
  protected healthy = true;
  protected lastHealthCheck?: Date;

  /**
   * Initialize the adapter (connect to external resources)
   */
  abstract initialize(): Promise<void>;

  /**
   * Shutdown the adapter (cleanup resources)
   */
  abstract shutdown(): Promise<void>;

  /**
   * Perform a health check
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Check if adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if adapter is healthy
   */
  isHealthy(): boolean {
    return this.healthy;
  }
}

// ============================================================================
// RESILIENT ADAPTER (with Circuit Breaker)
// ============================================================================

/**
 * Adapter with built-in resilience patterns
 */
export abstract class ResilientAdapter extends BaseAdapter {
  protected circuitBreaker: CircuitBreakerState;
  protected retryConfig: RetryConfig;

  constructor(options: ResilientAdapterOptions = {}) {
    super();
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailure: undefined,
      lastSuccess: undefined,
    };
    this.retryConfig = {
      maxRetries: options.maxRetries ?? 3,
      baseDelayMs: options.baseDelayMs ?? 100,
      maxDelayMs: options.maxDelayMs ?? 5000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
    };
  }

  /**
   * Execute with circuit breaker and retry logic
   */
  protected async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<Result<T, AdapterError>> {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.circuitBreaker.state = 'half-open';
      } else {
        return Err({
          code: 'CIRCUIT_OPEN',
          message: `Circuit breaker is open for ${this.adapterName}`,
          adapterName: this.adapterName,
          operation: operationName,
          retryable: false,
        });
      }
    }

    // Execute with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess();
        return Ok(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.recordFailure();

        if (attempt < this.retryConfig.maxRetries && this.isRetryable(lastError)) {
          await this.delay(this.calculateDelay(attempt));
        }
      }
    }

    return Err({
      code: 'OPERATION_FAILED',
      message: lastError?.message ?? 'Unknown error',
      adapterName: this.adapterName,
      operation: operationName,
      retryable: false,
      cause: lastError,
    });
  }

  private recordSuccess(): void {
    this.circuitBreaker.state = 'closed';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastSuccess = new Date();
    this.healthy = true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = new Date();

    if (this.circuitBreaker.failures >= 5) {
      this.circuitBreaker.state = 'open';
      this.healthy = false;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.circuitBreaker.lastFailure) return true;
    const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure.getTime();
    return timeSinceFailure > 30000; // 30 seconds
  }

  private isRetryable(error: Error): boolean {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
    const message = error.message.toLowerCase();
    return (
      retryableCodes.some((code) => message.includes(code.toLowerCase())) ||
      message.includes('timeout') ||
      message.includes('temporarily unavailable')
    );
  }

  private calculateDelay(attempt: number): number {
    const delay =
      this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    const jitter = Math.random() * 0.3 * delay;
    return Math.min(delay + jitter, this.retryConfig.maxDelayMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface ResilientAdapterOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export interface AdapterError {
  code: string;
  message: string;
  adapterName: string;
  operation: string;
  retryable: boolean;
  cause?: Error;
}

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/**
 * Registry for managing adapters
 */
export class AdapterRegistry {
  private adapters = new Map<string, BaseAdapter>();

  /**
   * Register an adapter
   */
  register(adapter: BaseAdapter): void {
    this.adapters.set(adapter.adapterName, adapter);
  }

  /**
   * Get an adapter by name
   */
  get<T extends BaseAdapter>(name: string): T | undefined {
    return this.adapters.get(name) as T | undefined;
  }

  /**
   * Initialize all adapters
   */
  async initializeAll(): Promise<Map<string, Result<void, Error>>> {
    const results = new Map<string, Result<void, Error>>();

    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.initialize();
        results.set(name, Ok(undefined));
      } catch (error) {
        results.set(name, Err(error instanceof Error ? error : new Error(String(error))));
      }
    }

    return results;
  }

  /**
   * Shutdown all adapters
   */
  async shutdownAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.shutdown();
      } catch (error) {
        console.error(`Failed to shutdown adapter ${adapter.adapterName}:`, error);
      }
    }
  }

  /**
   * Health check all adapters
   */
  async healthCheckAll(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();

    for (const [name, adapter] of this.adapters) {
      try {
        const result = await adapter.healthCheck();
        results.set(name, result);
      } catch (error) {
        results.set(name, {
          healthy: false,
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get all adapter names
   */
  getNames(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Singleton registry
export const adapterRegistry = new AdapterRegistry();

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

/**
 * Factory for creating adapters based on configuration
 */
export interface AdapterFactory<TConfig, TAdapter extends BaseAdapter> {
  create(config: TConfig): TAdapter;
}

/**
 * Adapter configuration base
 */
export interface AdapterConfig {
  readonly enabled: boolean;
  readonly name: string;
  readonly options?: Record<string, unknown>;
}

// ============================================================================
// ADAPTER DECORATORS
// ============================================================================

/**
 * Decorator to add metrics to adapter methods
 */
export function WithMetrics(metricName: string) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (this: BaseAdapter, ...args: unknown[]) {
      const startTime = Date.now();
      const labels = {
        adapter: this.adapterName,
        operation: String(propertyKey),
      };

      try {
        const result = await original.apply(this, args);
        // Would emit success metric here
        return result;
      } catch (error) {
        // Would emit failure metric here
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        // Would emit duration metric here
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to add logging to adapter methods
 */
export function WithLogging() {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (this: BaseAdapter, ...args: unknown[]) {
      const operation = String(propertyKey);

      try {
        const result = await original.apply(this, args);
        return result;
      } catch (error) {
        console.error(`[${this.adapterName}] ${operation} failed:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to add timeout to adapter methods
 */
export function WithTimeout(timeoutMs: number) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (this: BaseAdapter, ...args: unknown[]) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error(`Operation ${String(propertyKey)} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      return Promise.race([original.apply(this, args), timeoutPromise]);
    };

    return descriptor;
  };
}

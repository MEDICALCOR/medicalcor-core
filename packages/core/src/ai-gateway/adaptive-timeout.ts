/**
 * Adaptive Timeout Configuration
 *
 * Operation-specific timeouts with instant fallback for critical paths.
 * Scoring operations use 5s timeout (not 60s) to ensure fast user response.
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive checks for config handling */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable -- catch handler type is constrained by Promise API */
/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- rejection values are properly typed */

import { z } from 'zod';

/**
 * AI operation types with their characteristics
 */
export type AIOperationType =
  | 'scoring' // Lead scoring - must be fast (5s)
  | 'reply_generation' // Generate AI reply (10s)
  | 'sentiment' // Sentiment analysis (5s)
  | 'language_detection' // Language detection (3s)
  | 'summarization' // Text summarization (15s)
  | 'embedding' // Vector embeddings (10s)
  | 'function_call' // Generic function call (30s)
  | 'workflow' // Multi-step workflow (60s)
  | 'batch' // Batch processing (120s)
  | 'default'; // Default fallback (30s)

/**
 * Timeout configuration for each operation type
 */
export interface TimeoutConfig {
  /** Primary timeout in milliseconds */
  timeoutMs: number;
  /** Whether to use instant fallback on timeout */
  instantFallback: boolean;
  /** Fallback timeout (for retry attempts) */
  fallbackTimeoutMs?: number | undefined;
  /** Maximum retries before giving up */
  maxRetries: number;
  /** Priority level (lower = higher priority for resources) */
  priority: 'critical' | 'high' | 'normal' | 'low';
}

/**
 * Default adaptive timeout configuration
 * IMPORTANT: Scoring uses 5s timeout for instant response
 */
export const DEFAULT_TIMEOUT_CONFIG: Record<AIOperationType, TimeoutConfig> = {
  scoring: {
    timeoutMs: 5000, // 5 seconds - CRITICAL: Must be fast
    instantFallback: true,
    fallbackTimeoutMs: 2000,
    maxRetries: 1,
    priority: 'critical',
  },
  reply_generation: {
    timeoutMs: 10000, // 10 seconds
    instantFallback: true,
    fallbackTimeoutMs: 5000,
    maxRetries: 2,
    priority: 'high',
  },
  sentiment: {
    timeoutMs: 5000, // 5 seconds
    instantFallback: true,
    fallbackTimeoutMs: 3000,
    maxRetries: 1,
    priority: 'high',
  },
  language_detection: {
    timeoutMs: 3000, // 3 seconds
    instantFallback: true,
    fallbackTimeoutMs: 2000,
    maxRetries: 1,
    priority: 'critical',
  },
  summarization: {
    timeoutMs: 15000, // 15 seconds
    instantFallback: false,
    maxRetries: 2,
    priority: 'normal',
  },
  embedding: {
    timeoutMs: 10000, // 10 seconds
    instantFallback: false,
    maxRetries: 2,
    priority: 'normal',
  },
  function_call: {
    timeoutMs: 30000, // 30 seconds
    instantFallback: false,
    maxRetries: 2,
    priority: 'normal',
  },
  workflow: {
    timeoutMs: 60000, // 60 seconds
    instantFallback: false,
    maxRetries: 1,
    priority: 'low',
  },
  batch: {
    timeoutMs: 120000, // 2 minutes
    instantFallback: false,
    maxRetries: 1,
    priority: 'low',
  },
  default: {
    timeoutMs: 30000, // 30 seconds
    instantFallback: false,
    maxRetries: 2,
    priority: 'normal',
  },
};

/**
 * Schema for timeout configuration validation
 */
export const TimeoutConfigSchema = z.object({
  timeoutMs: z.number().int().min(1000).max(300000),
  instantFallback: z.boolean(),
  fallbackTimeoutMs: z.number().int().min(500).max(60000).optional(),
  maxRetries: z.number().int().min(0).max(5),
  priority: z.enum(['critical', 'high', 'normal', 'low']),
});

export const AdaptiveTimeoutConfigSchema = z.object({
  /** Override default timeouts */
  overrides: z.record(TimeoutConfigSchema).optional(),
  /** Global timeout multiplier (e.g., 0.5 for faster, 2.0 for slower) */
  globalMultiplier: z.number().min(0.1).max(10).default(1.0),
  /** Enable adaptive timeout based on historical performance */
  enableAdaptive: z.boolean().default(true),
  /** Minimum timeout even with adaptive (safety floor) */
  minTimeoutMs: z.number().int().min(1000).default(2000),
  /** Maximum timeout even with adaptive (safety ceiling) */
  maxTimeoutMs: z.number().int().max(300000).default(120000),
});

export type AdaptiveTimeoutConfig = z.infer<typeof AdaptiveTimeoutConfigSchema>;

/**
 * Fallback result for instant fallback operations
 */
export interface FallbackResult<T> {
  /** Whether fallback was used */
  usedFallback: boolean;
  /** The result (either from primary or fallback) */
  result: T;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Provider that was used */
  provider: string;
  /** Error if primary failed */
  primaryError?: Error;
}

/**
 * Performance metrics for adaptive timeout calculation
 */
interface PerformanceMetrics {
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** 95th percentile response time */
  p95ResponseTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Sample count */
  sampleCount: number;
  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Adaptive Timeout Manager
 *
 * Manages operation-specific timeouts with:
 * - Configurable timeouts per operation type
 * - Instant fallback for critical operations
 * - Adaptive timeout adjustment based on performance
 */
export class AdaptiveTimeoutManager {
  private config: AdaptiveTimeoutConfig;
  private timeoutConfigs: Record<AIOperationType, TimeoutConfig>;
  private performanceMetrics = new Map<AIOperationType, PerformanceMetrics>();
  private adaptedTimeouts = new Map<AIOperationType, number>();

  constructor(config: Partial<AdaptiveTimeoutConfig> = {}) {
    this.config = AdaptiveTimeoutConfigSchema.parse(config);

    // Merge default configs with overrides
    this.timeoutConfigs = { ...DEFAULT_TIMEOUT_CONFIG };
    if (this.config.overrides) {
      for (const [op, override] of Object.entries(this.config.overrides)) {
        if (op in this.timeoutConfigs) {
          this.timeoutConfigs[op as AIOperationType] = {
            ...this.timeoutConfigs[op as AIOperationType],
            ...override,
          };
        }
      }
    }
  }

  /**
   * Get timeout configuration for an operation
   */
  getTimeoutConfig(operation: AIOperationType): TimeoutConfig {
    const config = this.timeoutConfigs[operation] ?? this.timeoutConfigs.default;

    // Apply global multiplier
    const adjustedTimeout = Math.round(config.timeoutMs * this.config.globalMultiplier);

    // Apply adaptive adjustment if enabled
    const adaptedTimeout = this.config.enableAdaptive
      ? (this.adaptedTimeouts.get(operation) ?? adjustedTimeout)
      : adjustedTimeout;

    // Clamp to safety bounds
    const finalTimeout = Math.max(
      this.config.minTimeoutMs,
      Math.min(this.config.maxTimeoutMs, adaptedTimeout)
    );

    return {
      ...config,
      timeoutMs: finalTimeout,
      fallbackTimeoutMs: config.fallbackTimeoutMs
        ? Math.round(config.fallbackTimeoutMs * this.config.globalMultiplier)
        : undefined,
    };
  }

  /**
   * Get timeout in milliseconds for an operation
   */
  getTimeout(operation: AIOperationType): number {
    return this.getTimeoutConfig(operation).timeoutMs;
  }

  /**
   * Check if operation should use instant fallback
   */
  shouldUseFallback(operation: AIOperationType): boolean {
    return this.getTimeoutConfig(operation).instantFallback;
  }

  /**
   * Record operation performance for adaptive timeout
   */
  recordPerformance(operation: AIOperationType, responseTimeMs: number, success: boolean): void {
    if (!this.config.enableAdaptive) return;

    const existing = this.performanceMetrics.get(operation);
    const now = new Date();

    if (existing) {
      // Update rolling average (exponential moving average)
      const alpha = 0.1; // Smoothing factor
      const newAvg = alpha * responseTimeMs + (1 - alpha) * existing.avgResponseTimeMs;
      const newP95 = Math.max(existing.p95ResponseTimeMs, responseTimeMs * 0.95);
      const newSuccessRate = alpha * (success ? 1 : 0) + (1 - alpha) * existing.successRate;

      this.performanceMetrics.set(operation, {
        avgResponseTimeMs: newAvg,
        p95ResponseTimeMs: newP95,
        successRate: newSuccessRate,
        sampleCount: existing.sampleCount + 1,
        lastUpdated: now,
      });
    } else {
      this.performanceMetrics.set(operation, {
        avgResponseTimeMs: responseTimeMs,
        p95ResponseTimeMs: responseTimeMs,
        successRate: success ? 1 : 0,
        sampleCount: 1,
        lastUpdated: now,
      });
    }

    // Recalculate adapted timeout
    this.recalculateAdaptedTimeout(operation);
  }

  /**
   * Recalculate adapted timeout based on performance metrics
   */
  private recalculateAdaptedTimeout(operation: AIOperationType): void {
    const metrics = this.performanceMetrics.get(operation);
    if (!metrics || metrics.sampleCount < 10) return;

    const baseConfig = this.timeoutConfigs[operation] ?? this.timeoutConfigs.default;

    // Use p95 as base, add 50% buffer for safety
    let adaptedTimeout = Math.round(metrics.p95ResponseTimeMs * 1.5);

    // If success rate is low, increase timeout
    if (metrics.successRate < 0.9) {
      adaptedTimeout = Math.round(adaptedTimeout * 1.5);
    }

    // Never go below base timeout for critical operations
    if (baseConfig.priority === 'critical') {
      adaptedTimeout = Math.max(adaptedTimeout, baseConfig.timeoutMs);
    }

    // Clamp to reasonable bounds
    adaptedTimeout = Math.max(
      this.config.minTimeoutMs,
      Math.min(this.config.maxTimeoutMs, adaptedTimeout)
    );

    this.adaptedTimeouts.set(operation, adaptedTimeout);
  }

  /**
   * Execute with timeout and optional fallback
   */
  async executeWithTimeout<T>(
    operation: AIOperationType,
    primaryFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>,
    fallbackValue?: T
  ): Promise<FallbackResult<T>> {
    const config = this.getTimeoutConfig(operation);
    const startTime = Date.now();

    try {
      const result = await this.withTimeout(primaryFn(), config.timeoutMs);
      const executionTime = Date.now() - startTime;

      this.recordPerformance(operation, executionTime, true);

      return {
        usedFallback: false,
        result,
        executionTimeMs: executionTime,
        provider: 'primary',
      };
    } catch (error) {
      const primaryExecutionTime = Date.now() - startTime;
      this.recordPerformance(operation, primaryExecutionTime, false);

      // If instant fallback is enabled and we have a fallback
      if (config.instantFallback) {
        if (fallbackFn) {
          try {
            const timeout = config.fallbackTimeoutMs ?? Math.round(config.timeoutMs * 0.5);
            const result = await this.withTimeout(fallbackFn(), timeout);

            return {
              usedFallback: true,
              result,
              executionTimeMs: Date.now() - startTime,
              provider: 'fallback',
              primaryError: error instanceof Error ? error : new Error(String(error)),
            };
          } catch {
            // Fallback also failed
          }
        }

        // Use fallback value if provided
        if (fallbackValue !== undefined) {
          return {
            usedFallback: true,
            result: fallbackValue,
            executionTimeMs: Date.now() - startTime,
            provider: 'fallback_value',
            primaryError: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }

      // No fallback available, rethrow
      throw error;
    }
  }

  /**
   * Wrap a promise with a timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get performance metrics for an operation
   */
  getPerformanceMetrics(operation: AIOperationType): PerformanceMetrics | undefined {
    return this.performanceMetrics.get(operation);
  }

  /**
   * Get all performance metrics
   */
  getAllPerformanceMetrics(): Partial<Record<AIOperationType, PerformanceMetrics>> {
    const result: Partial<Record<AIOperationType, PerformanceMetrics>> = {};
    for (const [key, value] of this.performanceMetrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics.clear();
    this.adaptedTimeouts.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): AdaptiveTimeoutConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AdaptiveTimeoutConfig>): void {
    this.config = AdaptiveTimeoutConfigSchema.parse({ ...this.config, ...updates });
  }
}

/**
 * Factory function
 */
export function createAdaptiveTimeoutManager(
  config?: Partial<AdaptiveTimeoutConfig>
): AdaptiveTimeoutManager {
  return new AdaptiveTimeoutManager(config);
}

/**
 * Default singleton instance
 */
export const adaptiveTimeout = createAdaptiveTimeoutManager();

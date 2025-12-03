/**
 * Enhanced Dead Letter Queue with Circuit Breaker Integration
 *
 * Extends the base DLQ service to prevent retry storms when downstream
 * services are unavailable. Uses circuit breakers to:
 * - Skip retries when services are known to be down
 * - Prevent cascading failures across the system
 * - Automatically resume retries when services recover
 *
 * @module @medicalcor/core/enhanced-dead-letter-queue
 */

import { createLogger, type Logger } from './logger.js';
import type { DatabasePool } from './database.js';
import {
  DeadLetterQueueService,
  type DlqRetryOptions,
  type RetryHandler,
  type WebhookType,
} from './dead-letter-queue.js';
import {
  CircuitBreakerRegistry,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
  CircuitState,
} from './circuit-breaker.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the enhanced DLQ
 */
export interface EnhancedDLQConfig {
  /** Circuit breaker settings per webhook type */
  circuitBreakerDefaults?: Omit<CircuitBreakerConfig, 'name'>;
  /** Custom circuit breaker settings for specific webhook types */
  circuitBreakerOverrides?: Partial<Record<WebhookType, Partial<CircuitBreakerConfig>>>;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Log skipped entries due to open circuit */
  logCircuitSkips?: boolean;
}

/**
 * Enhanced retry result with circuit breaker info
 */
export interface EnhancedRetryResult {
  processed: number;
  skippedDueToCircuit: number;
  circuitStats: Record<WebhookType, CircuitBreakerStats>;
}

/**
 * DLQ health status
 */
export interface DLQHealthStatus {
  healthy: boolean;
  openCircuits: WebhookType[];
  pendingCount: number;
  failedCount: number;
  circuitStats: CircuitBreakerStats[];
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  successThreshold: 2,
  failureWindowMs: 120000, // 2 minutes
};

const DEFAULT_CONFIG: EnhancedDLQConfig = {
  circuitBreakerDefaults: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  enableMetrics: true,
  logCircuitSkips: true,
};

// ============================================================================
// ENHANCED DLQ SERVICE
// ============================================================================

/**
 * Enhanced Dead Letter Queue with Circuit Breaker Protection
 *
 * @example
 * ```typescript
 * const dlq = new EnhancedDeadLetterQueueService(db);
 *
 * // Process retries with circuit breaker protection
 * const result = await dlq.processRetriesWithCircuitBreaker(
 *   async (entry) => {
 *     return await processWebhook(entry.webhookType, entry.payload);
 *   }
 * );
 *
 * console.log(`Processed: ${result.processed}, Skipped: ${result.skippedDueToCircuit}`);
 * ```
 */
export class EnhancedDeadLetterQueueService extends DeadLetterQueueService {
  private readonly circuitBreakerRegistry: CircuitBreakerRegistry;
  private readonly config: Required<EnhancedDLQConfig>;
  private readonly logger: Logger;

  constructor(db: DatabasePool, config: EnhancedDLQConfig = {}) {
    super(db);
    this.config = {
      circuitBreakerDefaults: {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...config.circuitBreakerDefaults,
      },
      circuitBreakerOverrides: config.circuitBreakerOverrides ?? {},
      enableMetrics: config.enableMetrics ?? DEFAULT_CONFIG.enableMetrics ?? true,
      logCircuitSkips: config.logCircuitSkips ?? DEFAULT_CONFIG.logCircuitSkips ?? true,
    };

    this.circuitBreakerRegistry = new CircuitBreakerRegistry(this.config.circuitBreakerDefaults);

    this.logger = createLogger({ name: 'enhanced-dlq' });

    // Pre-initialize circuit breakers for known webhook types
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize circuit breakers for known webhook types
   */
  private initializeCircuitBreakers(): void {
    const webhookTypes: WebhookType[] = [
      'whatsapp',
      'voice',
      'vapi',
      'stripe',
      'booking',
      'crm',
      'hubspot',
      'scheduling',
    ];

    for (const type of webhookTypes) {
      const override = this.config.circuitBreakerOverrides[type];
      this.circuitBreakerRegistry.get(`dlq-${type}`, {
        ...this.config.circuitBreakerDefaults,
        ...override,
        name: `dlq-${type}`,
        onOpen: (name, error) => {
          this.logger.warn(
            { circuitName: name, error: error.message },
            'DLQ circuit breaker opened - suspending retries'
          );
        },
        onClose: (name) => {
          this.logger.info({ circuitName: name }, 'DLQ circuit breaker closed - resuming retries');
        },
      });
    }
  }

  /**
   * Get circuit breaker for a webhook type
   */
  getCircuitBreaker(webhookType: WebhookType) {
    return this.circuitBreakerRegistry.get(`dlq-${webhookType}`);
  }

  /**
   * Check if a webhook type's circuit is open
   */
  isCircuitOpen(webhookType: WebhookType): boolean {
    const breaker = this.getCircuitBreaker(webhookType);
    return breaker.getState() === CircuitState.OPEN;
  }

  /**
   * Process DLQ entries with circuit breaker protection
   *
   * Entries for webhook types with open circuits are skipped.
   * Circuit breakers are updated based on handler success/failure.
   */
  async processRetriesWithCircuitBreaker(
    handler: RetryHandler,
    options: DlqRetryOptions = {}
  ): Promise<EnhancedRetryResult> {
    const { batchSize = 10, webhookTypes } = options;

    // Filter out webhook types with open circuits
    const allowedTypes = this.getWebhookTypesWithClosedCircuits(webhookTypes);

    if (allowedTypes.length === 0) {
      this.logger.debug('All circuits open, skipping DLQ processing');
      return {
        processed: 0,
        skippedDueToCircuit: 0,
        circuitStats: this.getCircuitStatsForTypes(
          webhookTypes ?? (['whatsapp', 'voice', 'vapi', 'stripe'] as WebhookType[])
        ),
      };
    }

    let skippedDueToCircuit = 0;

    // Create a wrapped handler that uses circuit breakers
    const circuitProtectedHandler: RetryHandler = async (entry) => {
      const breaker = this.getCircuitBreaker(entry.webhookType);

      if (!breaker.isAllowingRequests()) {
        if (this.config.logCircuitSkips) {
          this.logger.debug(
            {
              entryId: entry.id,
              webhookType: entry.webhookType,
              circuitState: breaker.getState(),
            },
            'Skipping DLQ entry due to open circuit'
          );
        }
        skippedDueToCircuit++;
        return false; // Signal to not mark as processed but don't increment retry
      }

      // Execute through circuit breaker - failures are automatically recorded
      return breaker.execute(() => handler(entry));
    };

    // Process with the base class method
    const processed = await super.processRetries(circuitProtectedHandler, {
      batchSize,
      webhookTypes: allowedTypes,
    });

    const requestedTypes =
      webhookTypes ??
      ([
        'whatsapp',
        'voice',
        'vapi',
        'stripe',
        'booking',
        'crm',
        'hubspot',
        'scheduling',
      ] as WebhookType[]);

    return {
      processed,
      skippedDueToCircuit,
      circuitStats: this.getCircuitStatsForTypes(requestedTypes),
    };
  }

  /**
   * Get webhook types that have closed/half-open circuits (allowing requests)
   */
  private getWebhookTypesWithClosedCircuits(requestedTypes?: WebhookType[]): WebhookType[] {
    const types: WebhookType[] = requestedTypes ?? [
      'whatsapp',
      'voice',
      'vapi',
      'stripe',
      'booking',
      'crm',
      'hubspot',
      'scheduling',
    ];

    return types.filter((type) => {
      const breaker = this.getCircuitBreaker(type);
      return breaker.isAllowingRequests();
    });
  }

  /**
   * Get circuit breaker stats for specific webhook types
   */
  private getCircuitStatsForTypes(types: WebhookType[]): Record<WebhookType, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const type of types) {
      stats[type] = this.getCircuitBreaker(type).getStats();
    }

    return stats as Record<WebhookType, CircuitBreakerStats>;
  }

  /**
   * Get health status of the enhanced DLQ
   */
  async getHealthStatus(): Promise<DLQHealthStatus> {
    const stats = await this.getStats();
    const allStats = this.circuitBreakerRegistry.getAllStats();
    const openCircuits = this.circuitBreakerRegistry
      .getOpenCircuits()
      .map((name) => name.replace('dlq-', '') as WebhookType);

    return {
      healthy: openCircuits.length === 0 && stats.failed < 100,
      openCircuits,
      pendingCount: stats.pending + stats.retrying,
      failedCount: stats.failed,
      circuitStats: allStats,
    };
  }

  /**
   * Manually reset a circuit breaker for a webhook type
   */
  resetCircuit(webhookType: WebhookType): void {
    this.circuitBreakerRegistry.reset(`dlq-${webhookType}`);
    this.logger.info({ webhookType }, 'Circuit breaker manually reset');
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuitBreakerRegistry.resetAll();
    this.logger.info('All circuit breakers manually reset');
  }

  /**
   * Get the circuit breaker registry (for monitoring/metrics)
   */
  getCircuitBreakerRegistry(): CircuitBreakerRegistry {
    return this.circuitBreakerRegistry;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an enhanced dead letter queue service with circuit breaker protection
 */
export function createEnhancedDeadLetterQueueService(
  db: DatabasePool,
  config?: EnhancedDLQConfig
): EnhancedDeadLetterQueueService {
  return new EnhancedDeadLetterQueueService(db, config);
}

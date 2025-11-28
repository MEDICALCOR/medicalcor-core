/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ADVANCED RESILIENCE PATTERNS                               ║
 * ║                                                                               ║
 * ║  Enterprise-grade fault tolerance: Bulkhead isolation, request deduplication, ║
 * ║  graceful degradation, and adaptive strategies for rock-solid integrations.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { type Result, ok, err } from './result.js';
import { incrementCounter, observeHistogram, setGauge } from './telemetry.js';

// =============================================================================
// Bulkhead Pattern - Isolate Failures
// =============================================================================

/**
 * Bulkhead configuration
 */
export interface BulkheadConfig {
  /** Maximum concurrent executions */
  readonly maxConcurrent: number;
  /** Maximum queue size for waiting requests */
  readonly maxQueue: number;
  /** Queue timeout in milliseconds */
  readonly queueTimeoutMs: number;
  /** Name for metrics/logging */
  readonly name: string;
}

/**
 * Bulkhead rejection error
 */
export class BulkheadRejectedError extends Error {
  constructor(
    public readonly bulkheadName: string,
    public readonly reason: 'full' | 'timeout'
  ) {
    super(
      reason === 'full'
        ? `Bulkhead '${bulkheadName}' is full - request rejected`
        : `Bulkhead '${bulkheadName}' queue timeout - request rejected`
    );
    this.name = 'BulkheadRejectedError';
  }
}

/**
 * Bulkhead statistics
 */
export interface BulkheadStats {
  readonly name: string;
  readonly maxConcurrent: number;
  readonly maxQueue: number;
  readonly currentActive: number;
  readonly currentQueued: number;
  readonly totalExecuted: number;
  readonly totalRejected: number;
  readonly totalTimedOut: number;
}

/**
 * Bulkhead - Isolate failures and limit concurrent access
 *
 * Prevents a failing service from consuming all resources and affecting other services.
 *
 * @example
 * ```typescript
 * const bulkhead = new Bulkhead({
 *   name: 'hubspot',
 *   maxConcurrent: 10,
 *   maxQueue: 50,
 *   queueTimeoutMs: 5000
 * });
 *
 * const result = await bulkhead.execute(() => hubspot.syncContact(data));
 * ```
 */
export class Bulkhead {
  private readonly config: BulkheadConfig;
  private activeCount = 0;
  private queue: {
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }[] = [];
  private stats = {
    totalExecuted: 0,
    totalRejected: 0,
    totalTimedOut: 0,
  };

  constructor(config: BulkheadConfig) {
    this.config = config;
  }

  /**
   * Execute an operation with bulkhead protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Try to acquire a slot
    if (this.activeCount < this.config.maxConcurrent) {
      return this.runOperation(operation);
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueue) {
      this.stats.totalRejected++;
      incrementCounter('bulkhead_rejected_total', {
        name: this.config.name,
        reason: 'full',
      });
      throw new BulkheadRejectedError(this.config.name, 'full');
    }

    // Wait in queue
    await this.waitInQueue();
    return this.runOperation(operation);
  }

  /**
   * Try to execute - returns null if bulkhead is full (no queueing)
   */
  async tryExecute<T>(operation: () => Promise<T>): Promise<T | null> {
    if (this.activeCount >= this.config.maxConcurrent) {
      return null;
    }
    return this.runOperation(operation);
  }

  /**
   * Run the actual operation
   */
  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCount++;
    setGauge('bulkhead_active', this.activeCount, { name: this.config.name });

    try {
      const result = await operation();
      this.stats.totalExecuted++;
      return result;
    } finally {
      this.activeCount--;
      setGauge('bulkhead_active', this.activeCount, { name: this.config.name });
      this.releaseFromQueue();
    }
  }

  /**
   * Wait in queue for a slot
   */
  private waitInQueue(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue on timeout
        const index = this.queue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        this.stats.totalTimedOut++;
        incrementCounter('bulkhead_rejected_total', {
          name: this.config.name,
          reason: 'timeout',
        });
        reject(new BulkheadRejectedError(this.config.name, 'timeout'));
      }, this.config.queueTimeoutMs);

      this.queue.push({ resolve, reject, timeoutId });
      setGauge('bulkhead_queued', this.queue.length, { name: this.config.name });
    });
  }

  /**
   * Release a waiting request from the queue
   */
  private releaseFromQueue(): void {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timeoutId);
      setGauge('bulkhead_queued', this.queue.length, { name: this.config.name });
      next.resolve();
    }
  }

  /**
   * Get bulkhead statistics
   */
  getStats(): BulkheadStats {
    return {
      name: this.config.name,
      maxConcurrent: this.config.maxConcurrent,
      maxQueue: this.config.maxQueue,
      currentActive: this.activeCount,
      currentQueued: this.queue.length,
      ...this.stats,
    };
  }

  /**
   * Check if bulkhead has capacity
   */
  hasCapacity(): boolean {
    return this.activeCount < this.config.maxConcurrent;
  }

  /**
   * Check if queue has space
   */
  hasQueueSpace(): boolean {
    return this.queue.length < this.config.maxQueue;
  }
}

// =============================================================================
// Request Deduplication
// =============================================================================

/**
 * Deduplication configuration
 */
export interface DeduplicationConfig {
  /** TTL for cached results in milliseconds */
  readonly ttlMs: number;
  /** Maximum cache size */
  readonly maxSize: number;
  /** Key generator function */
  readonly keyGenerator?: (args: unknown[]) => string;
}

/**
 * Cached entry
 */
interface CachedEntry<T> {
  readonly promise: Promise<T>;
  readonly expiresAt: number;
}

/**
 * Request Deduplicator - Coalesce identical concurrent requests
 *
 * Prevents multiple identical requests from being sent simultaneously.
 * Only one request is made; all callers receive the same result.
 *
 * @example
 * ```typescript
 * const dedup = new RequestDeduplicator({ ttlMs: 5000 });
 *
 * // These two calls will only make ONE API request
 * const [result1, result2] = await Promise.all([
 *   dedup.execute('getUser:123', () => api.getUser('123')),
 *   dedup.execute('getUser:123', () => api.getUser('123'))
 * ]);
 * ```
 */
export class RequestDeduplicator<T = unknown> {
  private readonly cache = new Map<string, CachedEntry<T>>();
  private readonly config: DeduplicationConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<DeduplicationConfig> = {}) {
    this.config = {
      ttlMs: 5000,
      maxSize: 1000,
      ...config,
    };

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.ttlMs);
    this.cleanupTimer.unref();
  }

  /**
   * Execute with deduplication
   */
  async execute(key: string, operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check for existing in-flight or cached request
    const existing = this.cache.get(key);
    if (existing && existing.expiresAt > now) {
      incrementCounter('dedup_hit_total', { status: 'hit' });
      return existing.promise;
    }

    incrementCounter('dedup_hit_total', { status: 'miss' });

    // Enforce max size
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    // Create new entry
    const promise = operation();
    const entry: CachedEntry<T> = {
      promise,
      expiresAt: now + this.config.ttlMs,
    };

    this.cache.set(key, entry);

    // Remove entry on error (allow retry)
    promise.catch(() => {
      if (this.cache.get(key) === entry) {
        this.cache.delete(key);
      }
    });

    return promise;
  }

  /**
   * Generate a deduplication key from arguments
   */
  generateKey(prefix: string, ...args: unknown[]): string {
    if (this.config.keyGenerator) {
      return `${prefix}:${this.config.keyGenerator(args)}`;
    }
    return `${prefix}:${JSON.stringify(args)}`;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  /**
   * Stop cleanup timer and clear cache
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}

// =============================================================================
// Graceful Degradation
// =============================================================================

/**
 * Degradation level
 */
export type DegradationLevel = 'normal' | 'degraded' | 'minimal' | 'offline';

/**
 * Degradation strategy configuration
 */
export interface DegradationConfig<T> {
  /** Normal operation */
  readonly normal: () => Promise<T>;
  /** Degraded operation (e.g., cached data, reduced features) */
  readonly degraded?: () => Promise<T>;
  /** Minimal operation (e.g., static fallback) */
  readonly minimal?: () => Promise<T>;
  /** Offline operation (e.g., queue for later) */
  readonly offline?: () => Promise<T>;
  /** Error classifier - determines degradation level based on error */
  readonly classifyError?: (error: unknown) => DegradationLevel;
}

/**
 * Graceful Degradation Handler
 *
 * Automatically falls back to degraded modes when services fail.
 *
 * @example
 * ```typescript
 * const degradation = new GracefulDegradation({
 *   normal: () => api.fetchLiveData(),
 *   degraded: () => cache.get('data'),
 *   minimal: () => Promise.resolve(DEFAULT_DATA),
 *   offline: () => queue.add('fetchData')
 * });
 *
 * const result = await degradation.execute();
 * ```
 */
export class GracefulDegradation<T> {
  private readonly config: DegradationConfig<T>;
  private currentLevel: DegradationLevel = 'normal';
  private consecutiveFailures = 0;
  private lastSuccessTime = Date.now();

  constructor(config: DegradationConfig<T>) {
    this.config = config;
  }

  /**
   * Execute with graceful degradation
   */
  async execute(): Promise<Result<T, Error>> {
    const levels: DegradationLevel[] = ['normal', 'degraded', 'minimal', 'offline'];
    const startIndex = levels.indexOf(this.currentLevel);

    for (let i = startIndex; i < levels.length; i++) {
      const level = levels[i]!;
      const operation = this.getOperationForLevel(level);

      if (!operation) continue;

      try {
        const result = await operation();
        this.onSuccess(level);
        return ok(result);
      } catch (error) {
        this.onFailure(error);
        const classifiedLevel = this.config.classifyError?.(error) ?? this.classifyError(error);

        // If error indicates we should skip to a specific level
        if (levels.indexOf(classifiedLevel) > i) {
          continue;
        }
      }
    }

    return err(new Error('All degradation levels exhausted'));
  }

  /**
   * Get the operation for a specific level
   */
  private getOperationForLevel(level: DegradationLevel): (() => Promise<T>) | undefined {
    switch (level) {
      case 'normal':
        return this.config.normal;
      case 'degraded':
        return this.config.degraded;
      case 'minimal':
        return this.config.minimal;
      case 'offline':
        return this.config.offline;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(level: DegradationLevel): void {
    this.lastSuccessTime = Date.now();

    if (level === 'normal') {
      this.consecutiveFailures = 0;
      this.currentLevel = 'normal';
    } else {
      // Gradually recover after some time
      if (Date.now() - this.lastSuccessTime > 60000) {
        this.tryUpgrade();
      }
    }

    setGauge('degradation_level', this.getLevelValue(this.currentLevel));
  }

  /**
   * Handle failed execution
   */
  private onFailure(_error: unknown): void {
    this.consecutiveFailures++;
    incrementCounter('degradation_failure_total');

    // Auto-degrade after consecutive failures
    if (this.consecutiveFailures >= 3 && this.currentLevel === 'normal') {
      this.currentLevel = 'degraded';
    } else if (this.consecutiveFailures >= 5 && this.currentLevel === 'degraded') {
      this.currentLevel = 'minimal';
    }

    setGauge('degradation_level', this.getLevelValue(this.currentLevel));
  }

  /**
   * Try to upgrade to a better level
   */
  private tryUpgrade(): void {
    const levels: DegradationLevel[] = ['offline', 'minimal', 'degraded', 'normal'];
    const currentIndex = levels.indexOf(this.currentLevel);
    if (currentIndex < levels.length - 1) {
      this.currentLevel = levels[currentIndex + 1]!;
    }
  }

  /**
   * Default error classifier
   */
  private classifyError(error: unknown): DegradationLevel {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors -> go to degraded/offline
      if (
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('timeout')
      ) {
        return 'degraded';
      }

      // Rate limiting -> try degraded first
      if (message.includes('rate') || message.includes('429')) {
        return 'degraded';
      }

      // Server errors -> try degraded
      if (message.includes('500') || message.includes('503')) {
        return 'degraded';
      }
    }

    return 'normal';
  }

  /**
   * Get numeric value for level (for metrics)
   */
  private getLevelValue(level: DegradationLevel): number {
    switch (level) {
      case 'normal':
        return 0;
      case 'degraded':
        return 1;
      case 'minimal':
        return 2;
      case 'offline':
        return 3;
    }
  }

  /**
   * Get current degradation level
   */
  getCurrentLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Force a specific degradation level
   */
  setLevel(level: DegradationLevel): void {
    this.currentLevel = level;
    setGauge('degradation_level', this.getLevelValue(level));
  }

  /**
   * Reset to normal operation
   */
  reset(): void {
    this.currentLevel = 'normal';
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
  }
}

// =============================================================================
// Adaptive Timeout
// =============================================================================

/**
 * Adaptive timeout configuration
 */
export interface AdaptiveTimeoutConfig {
  /** Initial timeout in milliseconds */
  readonly initialTimeoutMs?: number;
  /** Minimum timeout in milliseconds */
  readonly minTimeoutMs?: number;
  /** Maximum timeout in milliseconds */
  readonly maxTimeoutMs?: number;
  /** Factor to increase timeout on success */
  readonly successFactor?: number;
  /** Factor to decrease timeout on timeout */
  readonly timeoutFactor?: number;
  /** Window size for averaging */
  readonly windowSize?: number;
}

/**
 * Adaptive Timeout - Automatically adjusts timeouts based on response times
 *
 * @example
 * ```typescript
 * const adaptiveTimeout = new AdaptiveTimeout({ initialTimeoutMs: 5000 });
 *
 * const result = await adaptiveTimeout.execute(() => api.call());
 * console.log('Current timeout:', adaptiveTimeout.getCurrentTimeout());
 * ```
 */
export class AdaptiveTimeout {
  private readonly config: Required<AdaptiveTimeoutConfig>;
  private currentTimeoutMs: number;
  private responseTimes: number[] = [];
  private timeoutCount = 0;
  private successCount = 0;

  constructor(config: Partial<AdaptiveTimeoutConfig> = {}) {
    this.config = {
      initialTimeoutMs: config.initialTimeoutMs ?? 5000,
      minTimeoutMs: config.minTimeoutMs ?? 1000,
      maxTimeoutMs: config.maxTimeoutMs ?? 60000,
      successFactor: config.successFactor ?? 0.9,
      timeoutFactor: config.timeoutFactor ?? 1.5,
      windowSize: config.windowSize ?? 10,
    };
    this.currentTimeoutMs = this.config.initialTimeoutMs;
  }

  /**
   * Execute with adaptive timeout
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.currentTimeoutMs);

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Adaptive timeout after ${this.currentTimeoutMs}ms`));
          });
        }),
      ]);

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      this.recordSuccess(responseTime);

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.message.includes('Adaptive timeout')) {
        this.recordTimeout();
      }

      throw error;
    }
  }

  /**
   * Record successful response
   */
  private recordSuccess(responseTimeMs: number): void {
    this.successCount++;
    this.responseTimes.push(responseTimeMs);

    // Maintain window size
    if (this.responseTimes.length > this.config.windowSize) {
      this.responseTimes.shift();
    }

    // Calculate P99 response time
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const p99Index = Math.floor(sorted.length * 0.99);
    const p99 = sorted[p99Index] ?? this.currentTimeoutMs;

    // Set timeout to 2x P99 (with bounds)
    const newTimeout = Math.min(
      this.config.maxTimeoutMs,
      Math.max(this.config.minTimeoutMs, p99 * 2)
    );

    // Gradually adjust toward new timeout
    this.currentTimeoutMs = Math.round(
      this.currentTimeoutMs * this.config.successFactor +
        newTimeout * (1 - this.config.successFactor)
    );

    observeHistogram('adaptive_timeout_ms', this.currentTimeoutMs);
  }

  /**
   * Record timeout occurrence
   */
  private recordTimeout(): void {
    this.timeoutCount++;

    // Increase timeout
    this.currentTimeoutMs = Math.min(
      this.config.maxTimeoutMs,
      Math.round(this.currentTimeoutMs * this.config.timeoutFactor)
    );

    incrementCounter('adaptive_timeout_hit_total');
    observeHistogram('adaptive_timeout_ms', this.currentTimeoutMs);
  }

  /**
   * Get current timeout value
   */
  getCurrentTimeout(): number {
    return this.currentTimeoutMs;
  }

  /**
   * Get statistics
   */
  getStats(): {
    currentTimeoutMs: number;
    successCount: number;
    timeoutCount: number;
    avgResponseTimeMs: number;
  } {
    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

    return {
      currentTimeoutMs: this.currentTimeoutMs,
      successCount: this.successCount,
      timeoutCount: this.timeoutCount,
      avgResponseTimeMs: Math.round(avgResponseTime),
    };
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.currentTimeoutMs = this.config.initialTimeoutMs;
    this.responseTimes = [];
    this.timeoutCount = 0;
    this.successCount = 0;
  }
}

// =============================================================================
// Rate Limiter (Token Bucket)
// =============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum tokens (burst capacity) */
  readonly maxTokens: number;
  /** Token refill rate per second */
  readonly refillRate: number;
  /** Name for metrics */
  readonly name: string;
}

/**
 * Token Bucket Rate Limiter
 *
 * @example
 * ```typescript
 * const limiter = new TokenBucketRateLimiter({
 *   name: 'hubspot',
 *   maxTokens: 100,
 *   refillRate: 10 // 10 tokens per second
 * });
 *
 * if (await limiter.tryAcquire()) {
 *   await api.call();
 * }
 * ```
 */
export class TokenBucketRateLimiter {
  private readonly config: RateLimiterConfig;
  private tokens: number;
  private lastRefillTime: number;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to acquire a token
   */
  tryAcquire(count = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      setGauge('rate_limiter_tokens', this.tokens, { name: this.config.name });
      return true;
    }

    incrementCounter('rate_limiter_rejected_total', { name: this.config.name });
    return false;
  }

  /**
   * Wait until a token is available
   */
  async acquire(count = 1): Promise<void> {
    while (!this.tryAcquire(count)) {
      const tokensNeeded = count - this.tokens;
      const waitTimeMs = (tokensNeeded / this.config.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.max(10, waitTimeMs)));
    }
  }

  /**
   * Execute with rate limiting
   */
  async execute<T>(operation: () => Promise<T>, tokens = 1): Promise<T> {
    await this.acquire(tokens);
    return operation();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = elapsedSeconds * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Reset to full capacity
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefillTime = Date.now();
  }
}

// =============================================================================
// Composite Resilience (Combines Multiple Patterns)
// =============================================================================

/**
 * Composite resilience configuration
 */
export interface CompositeResilienceConfig {
  readonly name: string;
  readonly bulkhead?: BulkheadConfig;
  readonly rateLimiter?: RateLimiterConfig;
  readonly deduplication?: DeduplicationConfig;
  readonly adaptiveTimeout?: AdaptiveTimeoutConfig;
}

/**
 * Composite Resilience - Combines multiple resilience patterns
 *
 * Applies patterns in optimal order: rate limit -> dedup -> bulkhead -> timeout
 *
 * @example
 * ```typescript
 * const resilience = new CompositeResilience({
 *   name: 'hubspot',
 *   bulkhead: { maxConcurrent: 10, maxQueue: 50, queueTimeoutMs: 5000 },
 *   rateLimiter: { maxTokens: 100, refillRate: 10 },
 *   deduplication: { ttlMs: 5000 },
 *   adaptiveTimeout: { initialTimeoutMs: 5000 }
 * });
 *
 * const result = await resilience.execute('syncContact:123', () => api.syncContact(data));
 * ```
 */
export class CompositeResilience {
  private readonly config: CompositeResilienceConfig;
  private readonly bulkhead?: Bulkhead;
  private readonly rateLimiter?: TokenBucketRateLimiter;
  private readonly deduplicator?: RequestDeduplicator;
  private readonly adaptiveTimeout?: AdaptiveTimeout;

  constructor(config: CompositeResilienceConfig) {
    this.config = config;

    if (config.bulkhead) {
      this.bulkhead = new Bulkhead({ ...config.bulkhead, name: config.name });
    }

    if (config.rateLimiter) {
      this.rateLimiter = new TokenBucketRateLimiter({ ...config.rateLimiter, name: config.name });
    }

    if (config.deduplication) {
      this.deduplicator = new RequestDeduplicator(config.deduplication);
    }

    if (config.adaptiveTimeout) {
      this.adaptiveTimeout = new AdaptiveTimeout(config.adaptiveTimeout);
    }
  }

  /**
   * Execute with all configured resilience patterns
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: { skipDedup?: boolean; skipRateLimit?: boolean } = {}
  ): Promise<T> {
    // 1. Rate limiting (if enabled)
    if (this.rateLimiter && !options.skipRateLimit) {
      await this.rateLimiter.acquire();
    }

    // 2. Deduplication (if enabled)
    if (this.deduplicator && !options.skipDedup) {
      return this.deduplicator.execute(key, () =>
        this.executeWithBulkheadAndTimeout(operation)
      ) as Promise<T>;
    }

    // 3. Bulkhead & Timeout
    return this.executeWithBulkheadAndTimeout(operation);
  }

  /**
   * Execute with bulkhead and adaptive timeout
   */
  private async executeWithBulkheadAndTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const withTimeout = this.adaptiveTimeout
      ? () => this.adaptiveTimeout!.execute(operation)
      : operation;

    if (this.bulkhead) {
      return this.bulkhead.execute(withTimeout);
    }

    return withTimeout();
  }

  /**
   * Get combined statistics
   */
  getStats(): {
    bulkhead?: BulkheadStats;
    rateLimiter?: { availableTokens: number };
    deduplicator?: { size: number; maxSize: number };
    adaptiveTimeout?: ReturnType<AdaptiveTimeout['getStats']>;
  } {
    return {
      bulkhead: this.bulkhead?.getStats(),
      rateLimiter: this.rateLimiter
        ? { availableTokens: this.rateLimiter.getAvailableTokens() }
        : undefined,
      deduplicator: this.deduplicator?.getStats(),
      adaptiveTimeout: this.adaptiveTimeout?.getStats(),
    };
  }

  /**
   * Invalidate deduplication cache for a key
   */
  invalidateDedup(key: string): boolean {
    return this.deduplicator?.invalidate(key) ?? false;
  }

  /**
   * Destroy and cleanup resources
   */
  destroy(): void {
    this.deduplicator?.destroy();
  }
}

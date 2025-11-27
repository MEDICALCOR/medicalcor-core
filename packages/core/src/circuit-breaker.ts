/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures when external services are unavailable.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service unavailable, requests fail immediately
 * - HALF_OPEN: Testing recovery, allow limited requests through
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Name identifier for logging/metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery (transition to HALF_OPEN) */
  resetTimeoutMs: number;
  /** Number of successful calls in HALF_OPEN before closing circuit */
  successThreshold: number;
  /** Time window in ms to count failures (sliding window) */
  failureWindowMs?: number;
  /** Maximum failure timestamps to track (prevents memory growth) - default: 1000 */
  maxFailureTimestamps?: number;
  /** Optional callback when state changes */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
  /** Optional callback when circuit opens */
  onOpen?: (name: string, error: Error) => void;
  /** Optional callback when circuit closes (recovers) */
  onClose?: (name: string) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly state: CircuitState
  ) {
    super(`Circuit breaker '${serviceName}' is ${state}. Service unavailable.`);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime = 0;
  private failureTimestamps: number[] = [];

  // Stats tracking
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private readonly config: Required<
    Pick<CircuitBreakerConfig, 'name' | 'failureThreshold' | 'resetTimeoutMs' | 'successThreshold'>
  > &
    Omit<CircuitBreakerConfig, 'name' | 'failureThreshold' | 'resetTimeoutMs' | 'successThreshold'>;

  /** Maximum number of failure timestamps to retain (prevents unbounded memory growth) */
  private static readonly DEFAULT_MAX_FAILURE_TIMESTAMPS = 1000;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureWindowMs: 60000, // 1 minute default
      maxFailureTimestamps: CircuitBreaker.DEFAULT_MAX_FAILURE_TIMESTAMPS,
      ...config,
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(this.config.name, this.state);
      }
    }

    // In HALF_OPEN, only allow limited requests
    if (this.state === CircuitState.HALF_OPEN && this.successes >= this.config.successThreshold) {
      // Already enough successes, transition will happen after next success
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
      this.cleanupFailureTimestamps();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(Date.now());

    // Cleanup old failures outside the window
    this.cleanupFailureTimestamps();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN reopens the circuit
      this.transitionTo(CircuitState.OPEN);
      this.config.onOpen?.(this.config.name, error);
    } else if (this.state === CircuitState.CLOSED) {
      // Count failures within the window
      const recentFailures = this.failureTimestamps.length;
      if (recentFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
        this.config.onOpen?.(this.config.name, error);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;

    // Reset counters based on new state
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.failureTimestamps = [];
      this.config.onClose?.(this.config.name);
    } else if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      this.successes = 0;
    } else {
      // HALF_OPEN state
      this.successes = 0;
      this.failures = 0;
    }

    this.config.onStateChange?.(this.config.name, oldState, newState);
  }

  /**
   * Remove failure timestamps outside the window and enforce maximum size
   *
   * This implements a bounded sliding window to prevent unbounded memory growth
   * during sustained failures. Uses efficient array slicing for O(n) cleanup.
   */
  private cleanupFailureTimestamps(): void {
    const windowStart = Date.now() - (this.config.failureWindowMs ?? 60000);
    const maxTimestamps =
      this.config.maxFailureTimestamps ?? CircuitBreaker.DEFAULT_MAX_FAILURE_TIMESTAMPS;

    // Filter out timestamps outside the window
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > windowStart);

    // CRITICAL: Enforce maximum array size to prevent memory growth
    // Keep only the most recent timestamps if we exceed the limit
    if (this.failureTimestamps.length > maxTimestamps) {
      this.failureTimestamps = this.failureTimestamps.slice(-maxTimestamps);
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Manually reset the circuit breaker (e.g., for testing)
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  /**
   * Check if the circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.HALF_OPEN) return true;
    // state must be OPEN at this point
    return Date.now() >= this.nextAttemptTime;
  }
}

/**
 * Circuit Breaker Registry - manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: Omit<CircuitBreakerConfig, 'name'>;

  constructor(
    defaultConfig: Omit<CircuitBreakerConfig, 'name'> = {
      failureThreshold: 5,
      resetTimeoutMs: 30000, // 30 seconds
      successThreshold: 2,
      failureWindowMs: 60000, // 1 minute
    }
  ) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker by name
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name,
        ...this.defaultConfig,
        ...config,
      });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map((b) => b.getStats());
  }

  /**
   * Get all open circuits
   */
  getOpenCircuits(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([, b]) => b.getState() === CircuitState.OPEN)
      .map(([name]) => name);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach((b) => b.reset());
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(name: string): void {
    this.breakers.get(name)?.reset();
  }
}

/**
 * Global circuit breaker registry instance
 */
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Decorator-style wrapper for circuit breaker
 */
export function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  registry: CircuitBreakerRegistry = globalCircuitBreakerRegistry
): Promise<T> {
  const breaker = registry.get(name);
  return breaker.execute(fn);
}

/**
 * Create a wrapped function that uses circuit breaker
 */
export function createCircuitBreakerWrapper<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
  config?: Partial<CircuitBreakerConfig>,
  registry: CircuitBreakerRegistry = globalCircuitBreakerRegistry
): (...args: TArgs) => Promise<TResult> {
  const breaker = registry.get(name, config);

  return async (...args: TArgs): Promise<TResult> => {
    return breaker.execute(() => fn(...args));
  };
}

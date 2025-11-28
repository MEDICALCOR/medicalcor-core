/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    TYPE-SAFE BUILDER PATTERNS                                 ║
 * ║                                                                               ║
 * ║  Fluent APIs with compile-time validation. Builders that won't let you       ║
 * ║  create invalid configurations - errors caught at compile time, not runtime.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { SecretApiKey, CorrelationId } from './branded-types.js';
import { unsafe } from './branded-types.js';

// =============================================================================
// Type-Level Boolean Logic
// =============================================================================

interface True {
  readonly _true: unique symbol;
}
interface False {
  readonly _false: unique symbol;
}
type Bool = True | False;

// Type-level boolean operations (available for advanced type compositions)
type _And<A extends Bool, B extends Bool> = A extends True ? B : False;
type _Or<A extends Bool, B extends Bool> = A extends True ? True : B;
type _Not<A extends Bool> = A extends True ? False : True;

// Export for external use if needed
export type { _And as And, _Or as Or, _Not as Not };

// =============================================================================
// Phantom Type State Markers
// =============================================================================

/**
 * Builder state tracking using phantom types
 * These types exist only at compile time to track what has been configured
 */
interface BuilderState {
  readonly apiKey: Bool;
  readonly retryConfig: Bool;
  readonly timeout: Bool;
  readonly circuitBreaker: Bool;
}

interface EmptyState {
  apiKey: False;
  retryConfig: False;
  timeout: False;
  circuitBreaker: False;
}

type WithApiKey<S extends BuilderState> = Omit<S, 'apiKey'> & { apiKey: True };
type WithRetryConfig<S extends BuilderState> = Omit<S, 'retryConfig'> & { retryConfig: True };
type WithTimeout<S extends BuilderState> = Omit<S, 'timeout'> & { timeout: True };
type WithCircuitBreaker<S extends BuilderState> = Omit<S, 'circuitBreaker'> & {
  circuitBreaker: True;
};

// =============================================================================
// Retry Configuration Builder
// =============================================================================

/**
 * Retry strategy types
 */
export type RetryStrategy = 'exponential' | 'linear' | 'constant' | 'fibonacci';

/**
 * Built retry configuration
 */
export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly strategy: RetryStrategy;
  readonly jitter: boolean;
  readonly retryOn: readonly number[];
}

/**
 * Retry config builder state
 */
interface RetryBuilderState {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  strategy: RetryStrategy;
  jitter: boolean;
  retryOn: number[];
}

/**
 * Fluent builder for retry configuration
 *
 * @example
 * ```typescript
 * const retry = RetryConfigBuilder.create()
 *   .maxRetries(5)
 *   .exponentialBackoff(1000)
 *   .withJitter()
 *   .retryOnStatusCodes([429, 502, 503])
 *   .build();
 * ```
 */
export class RetryConfigBuilder {
  private state: RetryBuilderState;

  private constructor(state?: Partial<RetryBuilderState>) {
    this.state = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      strategy: 'exponential',
      jitter: true,
      retryOn: [429, 502, 503, 504],
      ...state,
    };
  }

  static create(): RetryConfigBuilder {
    return new RetryConfigBuilder();
  }

  /**
   * Set maximum retry attempts
   */
  maxRetries(count: number): this {
    if (count < 0 || count > 10) {
      throw new RangeError('maxRetries must be between 0 and 10');
    }
    this.state.maxRetries = count;
    return this;
  }

  /**
   * Set base delay for backoff calculation
   */
  baseDelay(ms: number): this {
    if (ms < 100 || ms > 60000) {
      throw new RangeError('baseDelayMs must be between 100 and 60000');
    }
    this.state.baseDelayMs = ms;
    return this;
  }

  /**
   * Set maximum delay cap
   */
  maxDelay(ms: number): this {
    if (ms < this.state.baseDelayMs) {
      throw new RangeError('maxDelayMs must be >= baseDelayMs');
    }
    this.state.maxDelayMs = ms;
    return this;
  }

  /**
   * Use exponential backoff strategy
   */
  exponentialBackoff(baseMs?: number): this {
    this.state.strategy = 'exponential';
    if (baseMs !== undefined) {
      this.state.baseDelayMs = baseMs;
    }
    return this;
  }

  /**
   * Use linear backoff strategy
   */
  linearBackoff(baseMs?: number): this {
    this.state.strategy = 'linear';
    if (baseMs !== undefined) {
      this.state.baseDelayMs = baseMs;
    }
    return this;
  }

  /**
   * Use constant delay strategy
   */
  constantDelay(ms?: number): this {
    this.state.strategy = 'constant';
    if (ms !== undefined) {
      this.state.baseDelayMs = ms;
    }
    return this;
  }

  /**
   * Use Fibonacci backoff strategy
   */
  fibonacciBackoff(baseMs?: number): this {
    this.state.strategy = 'fibonacci';
    if (baseMs !== undefined) {
      this.state.baseDelayMs = baseMs;
    }
    return this;
  }

  /**
   * Enable jitter for delay randomization
   */
  withJitter(): this {
    this.state.jitter = true;
    return this;
  }

  /**
   * Disable jitter
   */
  withoutJitter(): this {
    this.state.jitter = false;
    return this;
  }

  /**
   * Set status codes to retry on
   */
  retryOnStatusCodes(codes: readonly number[]): this {
    this.state.retryOn = [...codes];
    return this;
  }

  /**
   * Add additional status codes to retry on
   */
  alsoRetryOn(...codes: number[]): this {
    this.state.retryOn = [...new Set([...this.state.retryOn, ...codes])];
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): RetryConfig {
    return Object.freeze({ ...this.state }) as RetryConfig;
  }

  /**
   * Create standard config for API calls
   */
  static standard(): RetryConfig {
    return RetryConfigBuilder.create()
      .maxRetries(3)
      .exponentialBackoff(1000)
      .maxDelay(30000)
      .withJitter()
      .retryOnStatusCodes([429, 502, 503, 504])
      .build();
  }

  /**
   * Create aggressive retry config
   */
  static aggressive(): RetryConfig {
    return RetryConfigBuilder.create()
      .maxRetries(5)
      .exponentialBackoff(500)
      .maxDelay(60000)
      .withJitter()
      .retryOnStatusCodes([408, 429, 500, 502, 503, 504])
      .build();
  }

  /**
   * Create conservative retry config for sensitive operations
   */
  static conservative(): RetryConfig {
    return RetryConfigBuilder.create()
      .maxRetries(2)
      .exponentialBackoff(2000)
      .maxDelay(10000)
      .withJitter()
      .retryOnStatusCodes([429, 503])
      .build();
  }

  /**
   * No retry config
   */
  static none(): RetryConfig {
    return RetryConfigBuilder.create().maxRetries(0).build();
  }
}

// =============================================================================
// Circuit Breaker Configuration Builder
// =============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Built circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  readonly enabled: boolean;
  readonly failureThreshold: number;
  readonly successThreshold: number;
  readonly resetTimeoutMs: number;
  readonly failureWindowMs: number;
  readonly volumeThreshold: number;
  readonly errorFilter?: (error: unknown) => boolean;
}

/**
 * Circuit breaker builder state
 */
interface CircuitBreakerBuilderState {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
  failureWindowMs: number;
  volumeThreshold: number;
  errorFilter?: (error: unknown) => boolean;
}

/**
 * Fluent builder for circuit breaker configuration
 *
 * @example
 * ```typescript
 * const circuitBreaker = CircuitBreakerBuilder.create()
 *   .failureThreshold(5)
 *   .resetTimeout(30000)
 *   .halfOpenSuccessThreshold(2)
 *   .filterErrors(e => !(e instanceof ValidationError))
 *   .build();
 * ```
 */
export class CircuitBreakerBuilder {
  private state: CircuitBreakerBuilderState;

  private constructor(state?: Partial<CircuitBreakerBuilderState>) {
    this.state = {
      enabled: true,
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 30000,
      failureWindowMs: 60000,
      volumeThreshold: 10,
      ...state,
    };
  }

  static create(): CircuitBreakerBuilder {
    return new CircuitBreakerBuilder();
  }

  /**
   * Enable the circuit breaker
   */
  enable(): this {
    this.state.enabled = true;
    return this;
  }

  /**
   * Disable the circuit breaker
   */
  disable(): this {
    this.state.enabled = false;
    return this;
  }

  /**
   * Set failure threshold to open circuit
   */
  failureThreshold(count: number): this {
    if (count < 1 || count > 100) {
      throw new RangeError('failureThreshold must be between 1 and 100');
    }
    this.state.failureThreshold = count;
    return this;
  }

  /**
   * Set success threshold to close circuit from half-open
   */
  halfOpenSuccessThreshold(count: number): this {
    if (count < 1 || count > 20) {
      throw new RangeError('successThreshold must be between 1 and 20');
    }
    this.state.successThreshold = count;
    return this;
  }

  /**
   * Set reset timeout (time in open state before trying half-open)
   */
  resetTimeout(ms: number): this {
    if (ms < 1000 || ms > 300000) {
      throw new RangeError('resetTimeoutMs must be between 1000 and 300000');
    }
    this.state.resetTimeoutMs = ms;
    return this;
  }

  /**
   * Set failure window (rolling window for counting failures)
   */
  failureWindow(ms: number): this {
    if (ms < 1000 || ms > 600000) {
      throw new RangeError('failureWindowMs must be between 1000 and 600000');
    }
    this.state.failureWindowMs = ms;
    return this;
  }

  /**
   * Set minimum request volume before circuit can open
   */
  volumeThreshold(count: number): this {
    if (count < 1 || count > 1000) {
      throw new RangeError('volumeThreshold must be between 1 and 1000');
    }
    this.state.volumeThreshold = count;
    return this;
  }

  /**
   * Filter which errors should count toward circuit breaking
   */
  filterErrors(filter: (error: unknown) => boolean): this {
    this.state.errorFilter = filter;
    return this;
  }

  /**
   * Only count specific error types
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- E enables type-safe error class filtering
  onlyCountErrors<E extends new (...args: unknown[]) => Error>(...errorTypes: E[]): this {
    this.state.errorFilter = (error) => errorTypes.some((ErrorType) => error instanceof ErrorType);
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): CircuitBreakerConfig {
    return Object.freeze({ ...this.state });
  }

  /**
   * Standard configuration for most services
   */
  static standard(): CircuitBreakerConfig {
    return CircuitBreakerBuilder.create()
      .failureThreshold(5)
      .halfOpenSuccessThreshold(2)
      .resetTimeout(30000)
      .failureWindow(60000)
      .volumeThreshold(10)
      .build();
  }

  /**
   * Sensitive configuration for payment services
   */
  static forPayments(): CircuitBreakerConfig {
    return CircuitBreakerBuilder.create()
      .failureThreshold(3)
      .halfOpenSuccessThreshold(3)
      .resetTimeout(60000) // Longer reset for payment services
      .failureWindow(60000)
      .volumeThreshold(5)
      .build();
  }

  /**
   * Lenient configuration for non-critical services
   */
  static lenient(): CircuitBreakerConfig {
    return CircuitBreakerBuilder.create()
      .failureThreshold(10)
      .halfOpenSuccessThreshold(1)
      .resetTimeout(15000)
      .failureWindow(120000)
      .volumeThreshold(20)
      .build();
  }
}

// =============================================================================
// Timeout Configuration Builder
// =============================================================================

/**
 * Built timeout configuration
 */
export interface TimeoutConfig {
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly totalTimeoutMs: number;
}

/**
 * Fluent builder for timeout configuration
 */
export class TimeoutBuilder {
  private state: {
    connectTimeoutMs: number;
    requestTimeoutMs: number;
    idleTimeoutMs: number;
    totalTimeoutMs: number;
  };

  private constructor() {
    this.state = {
      connectTimeoutMs: 5000,
      requestTimeoutMs: 30000,
      idleTimeoutMs: 60000,
      totalTimeoutMs: 120000,
    };
  }

  static create(): TimeoutBuilder {
    return new TimeoutBuilder();
  }

  /**
   * Set connection timeout
   */
  connect(ms: number): this {
    if (ms < 100 || ms > 60000) {
      throw new RangeError('connectTimeoutMs must be between 100 and 60000');
    }
    this.state.connectTimeoutMs = ms;
    return this;
  }

  /**
   * Set per-request timeout
   */
  request(ms: number): this {
    if (ms < 1000 || ms > 300000) {
      throw new RangeError('requestTimeoutMs must be between 1000 and 300000');
    }
    this.state.requestTimeoutMs = ms;
    return this;
  }

  /**
   * Set idle connection timeout
   */
  idle(ms: number): this {
    if (ms < 1000 || ms > 600000) {
      throw new RangeError('idleTimeoutMs must be between 1000 and 600000');
    }
    this.state.idleTimeoutMs = ms;
    return this;
  }

  /**
   * Set total operation timeout
   */
  total(ms: number): this {
    if (ms < 1000 || ms > 600000) {
      throw new RangeError('totalTimeoutMs must be between 1000 and 600000');
    }
    this.state.totalTimeoutMs = ms;
    return this;
  }

  /**
   * Apply all timeouts at once
   */
  all(ms: number): this {
    return this.connect(Math.min(ms, 60000))
      .request(ms)
      .idle(ms * 2)
      .total(ms * 4);
  }

  build(): TimeoutConfig {
    return Object.freeze({ ...this.state });
  }

  /**
   * Fast timeout config for real-time operations
   */
  static fast(): TimeoutConfig {
    return TimeoutBuilder.create().connect(2000).request(10000).idle(30000).total(30000).build();
  }

  /**
   * Standard timeout config
   */
  static standard(): TimeoutConfig {
    return TimeoutBuilder.create().connect(5000).request(30000).idle(60000).total(120000).build();
  }

  /**
   * Patient timeout config for slow operations
   */
  static patient(): TimeoutConfig {
    return TimeoutBuilder.create().connect(10000).request(60000).idle(120000).total(300000).build();
  }
}

// =============================================================================
// Integration Client Builder Base
// =============================================================================

/**
 * Base configuration common to all integration clients
 */
export interface BaseClientConfig {
  readonly apiKey: SecretApiKey;
  readonly baseUrl?: string;
  readonly retryConfig: RetryConfig;
  readonly timeoutConfig: TimeoutConfig;
  readonly circuitBreakerConfig: CircuitBreakerConfig;
  readonly correlationId?: CorrelationId;
  readonly headers?: Record<string, string>;
}

/**
 * Mutable version of config for builder pattern
 */
type MutableConfig<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Abstract base builder for integration clients
 */
export abstract class BaseClientBuilder<
  TConfig extends BaseClientConfig,
  TClient,
  TState extends BuilderState = EmptyState,
> {
  protected config: Partial<MutableConfig<TConfig>>;

  protected constructor(config: Partial<MutableConfig<TConfig>> = {}) {
    this.config = {
      retryConfig: RetryConfigBuilder.standard(),
      timeoutConfig: TimeoutBuilder.standard(),
      circuitBreakerConfig: CircuitBreakerBuilder.standard(),
      ...config,
    } as Partial<MutableConfig<TConfig>>;
  }

  /**
   * Set API key
   */
  withApiKey(apiKey: string): BaseClientBuilder<TConfig, TClient, WithApiKey<TState>> {
    (this.config as MutableConfig<BaseClientConfig>).apiKey = unsafe.secretApiKey(apiKey);
    return this as unknown as BaseClientBuilder<TConfig, TClient, WithApiKey<TState>>;
  }

  /**
   * Set base URL
   */
  withBaseUrl(url: string): this {
    (this.config as { baseUrl?: string }).baseUrl = url;
    return this;
  }

  /**
   * Configure retry behavior
   */
  withRetry(
    configOrBuilder: RetryConfig | ((builder: RetryConfigBuilder) => RetryConfigBuilder)
  ): BaseClientBuilder<TConfig, TClient, WithRetryConfig<TState>> {
    const cfg = this.config as MutableConfig<BaseClientConfig>;
    if (typeof configOrBuilder === 'function') {
      cfg.retryConfig = configOrBuilder(RetryConfigBuilder.create()).build();
    } else {
      cfg.retryConfig = configOrBuilder;
    }
    return this as unknown as BaseClientBuilder<TConfig, TClient, WithRetryConfig<TState>>;
  }

  /**
   * Configure timeouts
   */
  withTimeout(
    configOrBuilder: TimeoutConfig | ((builder: TimeoutBuilder) => TimeoutBuilder)
  ): BaseClientBuilder<TConfig, TClient, WithTimeout<TState>> {
    const cfg = this.config as MutableConfig<BaseClientConfig>;
    if (typeof configOrBuilder === 'function') {
      cfg.timeoutConfig = configOrBuilder(TimeoutBuilder.create()).build();
    } else {
      cfg.timeoutConfig = configOrBuilder;
    }
    return this as unknown as BaseClientBuilder<TConfig, TClient, WithTimeout<TState>>;
  }

  /**
   * Configure circuit breaker
   */
  withCircuitBreaker(
    configOrBuilder:
      | CircuitBreakerConfig
      | ((builder: CircuitBreakerBuilder) => CircuitBreakerBuilder)
  ): BaseClientBuilder<TConfig, TClient, WithCircuitBreaker<TState>> {
    const cfg = this.config as MutableConfig<BaseClientConfig>;
    if (typeof configOrBuilder === 'function') {
      cfg.circuitBreakerConfig = configOrBuilder(CircuitBreakerBuilder.create()).build();
    } else {
      cfg.circuitBreakerConfig = configOrBuilder;
    }
    return this as unknown as BaseClientBuilder<TConfig, TClient, WithCircuitBreaker<TState>>;
  }

  /**
   * Disable circuit breaker
   */
  withoutCircuitBreaker(): this {
    (this.config as MutableConfig<BaseClientConfig>).circuitBreakerConfig =
      CircuitBreakerBuilder.create().disable().build();
    return this;
  }

  /**
   * Add correlation ID for request tracing
   */
  withCorrelationId(id: CorrelationId): this {
    (this.config as { correlationId?: CorrelationId }).correlationId = id;
    return this;
  }

  /**
   * Add custom headers
   */
  withHeaders(headers: Record<string, string>): this {
    (this.config as { headers?: Record<string, string> }).headers = {
      ...(this.config as { headers?: Record<string, string> }).headers,
      ...headers,
    };
    return this;
  }

  /**
   * Build the client - must be implemented by subclasses
   */
  abstract build(): TClient;

  /**
   * Validate configuration before building
   */
  protected validate(): void {
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }
  }
}

// =============================================================================
// Request Builder
// =============================================================================

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request configuration
 */
export interface RequestConfig<TBody = unknown> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly query: Record<string, string>;
  readonly body?: TBody;
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/**
 * Fluent request builder
 *
 * @example
 * ```typescript
 * const request = RequestBuilder.get('/contacts')
 *   .query('limit', '10')
 *   .header('X-Custom', 'value')
 *   .timeout(5000)
 *   .build();
 * ```
 */
export class RequestBuilder<TBody = unknown> {
  private config: {
    method: HttpMethod;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: TBody;
    timeout?: number;
    signal?: AbortSignal;
  };

  private constructor(method: HttpMethod, path: string) {
    this.config = {
      method,
      path,
      headers: {},
      query: {},
    };
  }

  static get(path: string): RequestBuilder<never> {
    return new RequestBuilder('GET', path);
  }

  static post<T>(path: string): RequestBuilder<T> {
    return new RequestBuilder<T>('POST', path);
  }

  static put<T>(path: string): RequestBuilder<T> {
    return new RequestBuilder<T>('PUT', path);
  }

  static patch<T>(path: string): RequestBuilder<T> {
    return new RequestBuilder<T>('PATCH', path);
  }

  static delete(path: string): RequestBuilder<never> {
    return new RequestBuilder('DELETE', path);
  }

  /**
   * Set request body
   */
  body(data: TBody): this {
    this.config.body = data;
    return this;
  }

  /**
   * Set JSON body
   */
  json(data: TBody): this {
    this.config.body = data;
    this.config.headers['Content-Type'] = 'application/json';
    return this;
  }

  /**
   * Add query parameter
   */
  query(key: string, value: string | number | boolean): this {
    this.config.query[key] = String(value);
    return this;
  }

  /**
   * Add multiple query parameters
   */
  queries(params: Record<string, string | number | boolean | undefined>): this {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        this.config.query[key] = String(value);
      }
    }
    return this;
  }

  /**
   * Add header
   */
  header(key: string, value: string): this {
    this.config.headers[key] = value;
    return this;
  }

  /**
   * Add multiple headers
   */
  headers(headers: Record<string, string>): this {
    Object.assign(this.config.headers, headers);
    return this;
  }

  /**
   * Set bearer token
   */
  bearerToken(token: string): this {
    this.config.headers.Authorization = `Bearer ${token}`;
    return this;
  }

  /**
   * Set request timeout
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Set abort signal
   */
  abort(signal: AbortSignal): this {
    this.config.signal = signal;
    return this;
  }

  /**
   * Build the request configuration
   */
  build(): RequestConfig<TBody> {
    return Object.freeze({ ...this.config }) as RequestConfig<TBody>;
  }

  /**
   * Get the full URL with query parameters
   */
  getUrl(baseUrl: string): string {
    const params = new URLSearchParams(this.config.query);
    const queryString = params.toString();
    return queryString
      ? `${baseUrl}${this.config.path}?${queryString}`
      : `${baseUrl}${this.config.path}`;
  }
}

// =============================================================================
// Exports
// =============================================================================

export type {
  BuilderState,
  EmptyState,
  WithApiKey,
  WithRetryConfig,
  WithTimeout,
  WithCircuitBreaker,
};

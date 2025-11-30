/**
 * @module architecture/application/query-handler
 *
 * Query Handler Pattern
 * =====================
 *
 * Query Handlers process queries (read operations) in CQRS.
 * They return data without side effects.
 */

import type {
  Query,
  QueryHandler as IQueryHandler,
  QueryError,
  QueryMetadata,
  ApplicationComponent,
} from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// QUERY BASE
// ============================================================================

/**
 * Create a query with proper structure
 */
export function createQuery<TPayload>(
  type: string,
  payload: TPayload,
  metadata: Partial<QueryMetadata> = {}
): Query<TPayload> {
  return {
    __layer: 'application',
    queryId: crypto.randomUUID(),
    queryType: type,
    payload,
    metadata: {
      correlationId: metadata.correlationId ?? crypto.randomUUID(),
      userId: metadata.userId,
      tenantId: metadata.tenantId,
      timestamp: metadata.timestamp ?? new Date().toISOString(),
      cacheKey: metadata.cacheKey,
      cacheTTL: metadata.cacheTTL,
    },
  };
}

// ============================================================================
// QUERY HANDLER BASE CLASS
// ============================================================================

/**
 * Abstract base class for query handlers
 */
export abstract class QueryHandler<TPayload, TResult>
  implements IQueryHandler<Query<TPayload>, TResult>, ApplicationComponent
{
  readonly __layer = 'application' as const;
  abstract readonly queryType: string;

  /**
   * Handle the query
   */
  abstract handle(query: Query<TPayload>): Promise<Result<TResult, QueryError>>;

  /**
   * Validate the query payload
   */
  protected validate(payload: TPayload): QueryError | null {
    return null; // Override in subclasses
  }

  /**
   * Create a success result
   */
  protected success(result: TResult): Result<TResult, QueryError> {
    return Ok(result);
  }

  /**
   * Create an error result
   */
  protected failure(error: QueryError): Result<TResult, QueryError> {
    return Err(error);
  }

  /**
   * Create a validation error
   */
  protected validationError(message: string, details?: Record<string, unknown>): QueryError {
    return {
      code: 'VALIDATION_ERROR',
      message,
      details,
    };
  }

  /**
   * Create a not found error
   */
  protected notFoundError(entityType: string, entityId: string): QueryError {
    return {
      code: 'NOT_FOUND',
      message: `${entityType} with ID ${entityId} not found`,
      details: { entityType, entityId },
    };
  }
}

// ============================================================================
// QUERY BUS
// ============================================================================

/**
 * Query Bus - Dispatches queries to their handlers
 */
export class QueryBus {
  private handlers = new Map<string, QueryHandler<unknown, unknown>>();
  private middlewares: QueryMiddleware[] = [];
  private cache?: QueryCache;

  /**
   * Set the cache implementation
   */
  setCache(cache: QueryCache): void {
    this.cache = cache;
  }

  /**
   * Register a query handler
   */
  register<TPayload, TResult>(handler: QueryHandler<TPayload, TResult>): void {
    this.handlers.set(handler.queryType, handler as QueryHandler<unknown, unknown>);
  }

  /**
   * Add middleware to the bus
   */
  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Execute a query
   */
  async execute<TPayload, TResult>(query: Query<TPayload>): Promise<Result<TResult, QueryError>> {
    const handler = this.handlers.get(query.queryType);
    if (!handler) {
      return Err({
        code: 'HANDLER_NOT_FOUND',
        message: `No handler registered for query type: ${query.queryType}`,
      });
    }

    // Check cache
    if (this.cache && query.metadata.cacheKey) {
      const cached = await this.cache.get<TResult>(query.metadata.cacheKey);
      if (cached !== null) {
        return Ok(cached);
      }
    }

    // Execute middleware chain
    const execute = async (): Promise<Result<TResult, QueryError>> => {
      return handler.handle(query) as Promise<Result<TResult, QueryError>>;
    };

    let next = execute;
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      if (!middleware) continue;
      const currentNext = next;
      next = () => middleware.execute(query, currentNext);
    }

    const result = await next();

    // Cache successful results
    if (result.isOk && this.cache && query.metadata.cacheKey) {
      await this.cache.set(query.metadata.cacheKey, result.value, query.metadata.cacheTTL ?? 300);
    }

    return result;
  }

  /**
   * Get all registered query types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Query middleware interface
 */
export interface QueryMiddleware {
  execute<TPayload, TResult>(
    query: Query<TPayload>,
    next: () => Promise<Result<TResult, QueryError>>
  ): Promise<Result<TResult, QueryError>>;
}

/**
 * Query cache interface
 */
export interface QueryCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// ============================================================================
// COMMON QUERY MIDDLEWARES
// ============================================================================

/**
 * Authorization middleware for queries
 */
export class QueryAuthorizationMiddleware implements QueryMiddleware {
  constructor(
    private authorizer: {
      canRead(queryType: string, userId?: string, tenantId?: string): Promise<boolean>;
    }
  ) {}

  async execute<TPayload, TResult>(
    query: Query<TPayload>,
    next: () => Promise<Result<TResult, QueryError>>
  ): Promise<Result<TResult, QueryError>> {
    const canRead = await this.authorizer.canRead(
      query.queryType,
      query.metadata.userId,
      query.metadata.tenantId
    );

    if (!canRead) {
      return Err({
        code: 'UNAUTHORIZED',
        message: `Not authorized to execute query ${query.queryType}`,
        details: { queryType: query.queryType, userId: query.metadata.userId },
      });
    }

    return next();
  }
}

/**
 * Logging middleware for queries
 */
export class QueryLoggingMiddleware implements QueryMiddleware {
  constructor(
    private logger: {
      info(message: string, context?: object): void;
      error(message: string, context?: object): void;
    }
  ) {}

  async execute<TPayload, TResult>(
    query: Query<TPayload>,
    next: () => Promise<Result<TResult, QueryError>>
  ): Promise<Result<TResult, QueryError>> {
    const startTime = Date.now();

    this.logger.info(`Executing query: ${query.queryType}`, {
      queryId: query.queryId,
      correlationId: query.metadata.correlationId,
    });

    const result = await next();
    const duration = Date.now() - startTime;

    if (result.isOk) {
      this.logger.info(`Query completed: ${query.queryType}`, {
        queryId: query.queryId,
        durationMs: duration,
      });
    } else {
      this.logger.error(`Query failed: ${query.queryType}`, {
        queryId: query.queryId,
        error: result.error.code,
        durationMs: duration,
      });
    }

    return result;
  }
}

/**
 * Metrics middleware for queries
 */
export class QueryMetricsMiddleware implements QueryMiddleware {
  constructor(
    private metrics: {
      recordDuration(name: string, duration: number, labels?: Record<string, string>): void;
      incrementCounter(name: string, labels?: Record<string, string>): void;
    }
  ) {}

  async execute<TPayload, TResult>(
    query: Query<TPayload>,
    next: () => Promise<Result<TResult, QueryError>>
  ): Promise<Result<TResult, QueryError>> {
    const startTime = Date.now();
    const result = await next();
    const duration = Date.now() - startTime;

    this.metrics.recordDuration('query_duration_ms', duration, {
      queryType: query.queryType,
    });

    this.metrics.incrementCounter('query_executions', {
      queryType: query.queryType,
      status: result.isOk ? 'success' : 'failure',
    });

    return result;
  }
}

// ============================================================================
// IN-MEMORY QUERY CACHE
// ============================================================================

/**
 * Simple in-memory cache implementation
 */
export class InMemoryQueryCache implements QueryCache {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

// Singleton query bus
export const queryBus = new QueryBus();

/**
 * CQRS Query Bus
 *
 * Handles query dispatching for read operations with:
 * - Type-safe query/handler registration
 * - Caching support
 * - Pagination helpers
 * - Projection-based reads
 */

import type { ZodSchema } from 'zod';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Query<TParams = unknown> {
  type: string;
  params: TParams;
  metadata: QueryMetadata;
}

export interface QueryMetadata {
  queryId: string;
  correlationId: string;
  userId?: string | undefined;
  tenantId?: string | undefined;
  timestamp: Date;
  cacheKey?: string | undefined;
  cacheTtlMs?: number | undefined;
}

export interface QueryResult<TData = unknown> {
  success: boolean;
  queryId: string;
  data?: TData | undefined;
  pagination?: PaginationInfo | undefined;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | undefined;
  cached: boolean;
  executionTimeMs: number;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface QueryContext {
  correlationId: string;
  userId?: string | undefined;
  tenantId?: string | undefined;
}

export type QueryHandler<TParams, TData> = (
  query: Query<TParams>,
  context: QueryContext
) => Promise<QueryResult<TData>>;

export type QueryMiddleware = (
  query: Query,
  context: QueryContext,
  next: () => Promise<QueryResult>
) => Promise<QueryResult>;

// ============================================================================
// QUERY BUS IMPLEMENTATION
// ============================================================================

interface RegisteredQueryHandler {
  handler: QueryHandler<unknown, unknown>;
  schema?: ZodSchema | undefined;
}

interface CacheEntry {
  result: QueryResult;
  expiresAt: number;
}

export class QueryBus {
  private handlers = new Map<string, RegisteredQueryHandler>();
  private middleware: QueryMiddleware[] = [];
  private cache = new Map<string, CacheEntry>();

  constructor(private defaultCacheTtlMs: number = 60000) {}

  /**
   * Register a query handler
   */
  register<TParams, TData>(
    queryType: string,
    handler: QueryHandler<TParams, TData>,
    schema?: ZodSchema<TParams>
  ): void {
    if (this.handlers.has(queryType)) {
      throw new Error(`Handler for query '${queryType}' already registered`);
    }

    this.handlers.set(queryType, {
      handler: handler as QueryHandler<unknown, unknown>,
      schema,
    });
  }

  /**
   * Add middleware to the query pipeline
   */
  use(middleware: QueryMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute a query
   */
  async execute<TParams, TData>(query: Query<TParams>): Promise<QueryResult<TData>> {
    const startTime = Date.now();

    // Check cache first
    if (query.metadata.cacheKey) {
      const cached = this.getFromCache(query.metadata.cacheKey);
      if (cached) {
        return {
          ...cached,
          cached: true,
          executionTimeMs: Date.now() - startTime,
        } as QueryResult<TData>;
      }
    }

    const registration = this.handlers.get(query.type);

    if (!registration) {
      return {
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: `No handler registered for query '${query.type}'`,
        },
        cached: false,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Validate params if schema provided
    if (registration.schema) {
      const validation = registration.schema.safeParse(query.params);
      if (!validation.success) {
        return {
          success: false,
          queryId: query.metadata.queryId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameters validation failed',
            details: validation.error.flatten(),
          },
          cached: false,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    const context: QueryContext = {
      correlationId: query.metadata.correlationId,
      userId: query.metadata.userId,
      tenantId: query.metadata.tenantId,
    };

    // Build middleware chain
    const executeHandler = async (): Promise<QueryResult> => {
      return registration.handler(query, context);
    };

    const chain = this.middleware.reduceRight<() => Promise<QueryResult>>(
      (next, mw) => () => mw(query, context, next),
      executeHandler
    );

    try {
      const result = await chain();

      // Cache successful results if cache key provided
      if (result.success && query.metadata.cacheKey) {
        this.setCache(
          query.metadata.cacheKey,
          result,
          query.metadata.cacheTtlMs ?? this.defaultCacheTtlMs
        );
      }

      return {
        ...result,
        cached: false,
        executionTimeMs: Date.now() - startTime,
      } as QueryResult<TData>;
    } catch (error) {
      return {
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        cached: false,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Helper to create and execute a query
   */
  async query<TParams, TData>(
    type: string,
    params: TParams,
    metadata: Partial<QueryMetadata> = {}
  ): Promise<QueryResult<TData>> {
    const query: Query<TParams> = {
      type,
      params,
      metadata: {
        queryId: metadata.queryId ?? crypto.randomUUID(),
        correlationId: metadata.correlationId ?? crypto.randomUUID(),
        userId: metadata.userId,
        tenantId: metadata.tenantId,
        timestamp: metadata.timestamp ?? new Date(),
        cacheKey: metadata.cacheKey,
        cacheTtlMs: metadata.cacheTtlMs,
      },
    };

    return this.execute(query);
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): QueryResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, result: QueryResult, ttlMs: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear cache
   */
  clearCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if handler exists
   */
  hasHandler(queryType: string): boolean {
    return this.handlers.has(queryType);
  }

  /**
   * Get registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// BUILT-IN MIDDLEWARE
// ============================================================================

/**
 * Logging middleware for queries
 */
export function queryLoggingMiddleware(
  logger: { info: (obj: unknown, msg: string) => void }
): QueryMiddleware {
  return async (query, context, next) => {
    logger.info(
      {
        queryType: query.type,
        queryId: query.metadata.queryId,
        correlationId: context.correlationId,
      },
      'Query received'
    );

    const result = await next();

    logger.info(
      {
        queryType: query.type,
        queryId: query.metadata.queryId,
        success: result.success,
        cached: result.cached,
        executionTimeMs: result.executionTimeMs,
      },
      'Query executed'
    );

    return result;
  };
}

/**
 * Authorization middleware
 */
export function authorizationMiddleware(
  authorize: (query: Query, context: QueryContext) => boolean | Promise<boolean>
): QueryMiddleware {
  return async (query, context, next) => {
    const allowed = await authorize(query, context);

    if (!allowed) {
      return {
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to execute this query',
        },
        cached: false,
        executionTimeMs: 0,
      };
    }

    return next();
  };
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Create a typed query factory
 */
export function defineQuery<TParams>(type: string, schema: ZodSchema<TParams>) {
  return {
    type,
    schema,
    create(params: TParams, metadata: Partial<QueryMetadata> = {}): Query<TParams> {
      return {
        type,
        params,
        metadata: {
          queryId: metadata.queryId ?? crypto.randomUUID(),
          correlationId: metadata.correlationId ?? crypto.randomUUID(),
          userId: metadata.userId,
          tenantId: metadata.tenantId,
          timestamp: metadata.timestamp ?? new Date(),
          cacheKey: metadata.cacheKey,
          cacheTtlMs: metadata.cacheTtlMs,
        },
      };
    },
  };
}

/**
 * Calculate pagination info
 */
export function calculatePagination(
  page: number,
  pageSize: number,
  total: number
): PaginationInfo {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Apply pagination to array
 */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

// ============================================================================
// FACTORY
// ============================================================================

export function createQueryBus(defaultCacheTtlMs?: number): QueryBus {
  return new QueryBus(defaultCacheTtlMs);
}

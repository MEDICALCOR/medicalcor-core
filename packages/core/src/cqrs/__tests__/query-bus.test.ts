/**
 * Query Bus Tests
 *
 * Tests for query dispatching, caching, and middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QueryBus,
  createQueryBus,
  defineQuery,
  calculatePagination,
  paginate,
  queryLoggingMiddleware,
  authorizationMiddleware,
  type Query,
  type QueryContext,
  type QueryHandler,
  type QueryMiddleware,
} from '../query-bus.js';
import { z } from 'zod';

describe('QueryBus', () => {
  let queryBus: QueryBus;

  beforeEach(() => {
    queryBus = new QueryBus();
  });

  describe('register', () => {
    it('should register a query handler', () => {
      const handler: QueryHandler<{ id: string }, { name: string }> = async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: { name: 'Test' },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler);

      expect(queryBus.hasHandler('GetUser')).toBe(true);
    });

    it('should throw if handler already registered', () => {
      const handler: QueryHandler<unknown, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler);

      expect(() => queryBus.register('GetUser', handler)).toThrow(
        "Handler for query 'GetUser' already registered"
      );
    });

    it('should register handler with schema', () => {
      const schema = z.object({ id: z.string() });
      const handler: QueryHandler<z.infer<typeof schema>, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler, schema);

      expect(queryBus.hasHandler('GetUser')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute a registered query', async () => {
      const handler: QueryHandler<{ id: string }, { name: string }> = async () => ({
        success: true,
        queryId: '1',
        data: { name: 'John' },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler);

      const query: Query<{ id: string }> = {
        type: 'GetUser',
        params: { id: '123' },
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const result = await queryBus.execute(query);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John' });
    });

    it('should return error for unregistered query', async () => {
      const query: Query<unknown> = {
        type: 'UnknownQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const result = await queryBus.execute(query);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HANDLER_NOT_FOUND');
    });

    it('should validate params with schema', async () => {
      const schema = z.object({ id: z.string().min(1) });
      const handler: QueryHandler<z.infer<typeof schema>, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler, schema);

      const query: Query<{ id: string }> = {
        type: 'GetUser',
        params: { id: '' }, // Invalid: empty string
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const result = await queryBus.execute(query);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should catch handler execution errors', async () => {
      const handler: QueryHandler<unknown, unknown> = async () => {
        throw new Error('Handler error');
      };

      queryBus.register('FailingQuery', handler);

      const query: Query<unknown> = {
        type: 'FailingQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const result = await queryBus.execute(query);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Handler error');
    });

    it('should measure execution time', async () => {
      const handler: QueryHandler<unknown, unknown> = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          success: true,
          queryId: '1',
          data: {},
          cached: false,
          executionTimeMs: 0,
        };
      };

      queryBus.register('SlowQuery', handler);

      const query: Query<unknown> = {
        type: 'SlowQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const result = await queryBus.execute(query);

      expect(result.executionTimeMs).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      queryBus = new QueryBus(60000); // 60s default TTL
    });

    it('should cache successful results', async () => {
      let callCount = 0;
      const handler: QueryHandler<unknown, { count: number }> = async () => ({
        success: true,
        queryId: '1',
        data: { count: ++callCount },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('CachedQuery', handler);

      const query: Query<unknown> = {
        type: 'CachedQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'test-cache-key',
        },
      };

      // First call
      const result1 = await queryBus.execute(query);
      expect(result1.data?.count).toBe(1);
      expect(result1.cached).toBe(false);

      // Second call should return cached result
      const result2 = await queryBus.execute(query);
      expect(result2.data?.count).toBe(1); // Same count
      expect(result2.cached).toBe(true);
    });

    it('should not cache failed results', async () => {
      let callCount = 0;
      const handler: QueryHandler<unknown, { count: number }> = async () => ({
        success: false,
        queryId: '1',
        error: { code: 'TEST_ERROR', message: 'Test error' },
        data: { count: ++callCount },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('FailingQuery', handler);

      const query: Query<unknown> = {
        type: 'FailingQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'test-key',
        },
      };

      await queryBus.execute(query);
      await queryBus.execute(query);

      // Handler should be called twice
      expect(callCount).toBe(2);
    });

    it('should respect custom cache TTL', async () => {
      const handler: QueryHandler<unknown, { value: string }> = async () => ({
        success: true,
        queryId: '1',
        data: { value: 'test' },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('ShortCacheQuery', handler);

      const query: Query<unknown> = {
        type: 'ShortCacheQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'short-ttl',
          cacheTtlMs: 10, // 10ms
        },
      };

      await queryBus.execute(query);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      const result = await queryBus.execute(query);
      expect(result.cached).toBe(false); // Cache expired
    });

    it('should clear cache by pattern', async () => {
      const handler: QueryHandler<unknown, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('TestQuery', handler);

      // Create multiple cached queries
      await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'user:123',
        },
      });

      await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q2',
          correlationId: 'c2',
          timestamp: new Date(),
          cacheKey: 'user:456',
        },
      });

      await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q3',
          correlationId: 'c3',
          timestamp: new Date(),
          cacheKey: 'product:789',
        },
      });

      // Clear only user caches
      queryBus.clearCache('user:.*');

      // User caches should be cleared
      const result1 = await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'user:123',
        },
      });
      expect(result1.cached).toBe(false);

      // Product cache should still exist
      const result2 = await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q3',
          correlationId: 'c3',
          timestamp: new Date(),
          cacheKey: 'product:789',
        },
      });
      expect(result2.cached).toBe(true);
    });

    it('should clear all cache when no pattern provided', async () => {
      const handler: QueryHandler<unknown, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('TestQuery', handler);

      await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'key1',
        },
      });

      queryBus.clearCache();

      const result = await queryBus.execute({
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
          cacheKey: 'key1',
        },
      });

      expect(result.cached).toBe(false);
    });
  });

  describe('middleware', () => {
    it('should execute middleware in order', async () => {
      const executionOrder: string[] = [];

      const middleware1: QueryMiddleware = async (_query, _context, next) => {
        executionOrder.push('middleware1-before');
        const result = await next();
        executionOrder.push('middleware1-after');
        return result;
      };

      const middleware2: QueryMiddleware = async (_query, _context, next) => {
        executionOrder.push('middleware2-before');
        const result = await next();
        executionOrder.push('middleware2-after');
        return result;
      };

      const handler: QueryHandler<unknown, unknown> = async () => {
        executionOrder.push('handler');
        return {
          success: true,
          queryId: '1',
          data: {},
          cached: false,
          executionTimeMs: 0,
        };
      };

      queryBus.use(middleware1);
      queryBus.use(middleware2);
      queryBus.register('TestQuery', handler);

      await queryBus.query('TestQuery', {});

      expect(executionOrder).toEqual([
        'middleware1-before',
        'middleware2-before',
        'handler',
        'middleware2-after',
        'middleware1-after',
      ]);
    });

    it('should allow middleware to short-circuit execution', async () => {
      const middleware: QueryMiddleware = async () => ({
        success: false,
        queryId: '1',
        error: { code: 'BLOCKED', message: 'Blocked by middleware' },
        cached: false,
        executionTimeMs: 0,
      });

      let handlerCalled = false;
      const handler: QueryHandler<unknown, unknown> = async () => {
        handlerCalled = true;
        return {
          success: true,
          queryId: '1',
          data: {},
          cached: false,
          executionTimeMs: 0,
        };
      };

      queryBus.use(middleware);
      queryBus.register('TestQuery', handler);

      const result = await queryBus.query('TestQuery', {});

      expect(result.error?.code).toBe('BLOCKED');
      expect(handlerCalled).toBe(false);
    });
  });

  describe('query helper method', () => {
    it('should create and execute query', async () => {
      const handler: QueryHandler<{ id: string }, { name: string }> = async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: { name: 'Test User' },
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('GetUser', handler);

      const result = await queryBus.query<{ id: string }, { name: string }>(
        'GetUser',
        { id: '123' },
        { userId: 'user-1' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test User');
    });

    it('should generate query ID if not provided', async () => {
      const handler: QueryHandler<unknown, unknown> = async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('TestQuery', handler);

      const result = await queryBus.query('TestQuery', {});

      expect(result.queryId).toBeDefined();
      expect(result.queryId).toMatch(/^[0-9a-f-]{36}$/i); // UUID format
    });
  });

  describe('hasHandler', () => {
    it('should return true for registered handler', () => {
      const handler: QueryHandler<unknown, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('TestQuery', handler);

      expect(queryBus.hasHandler('TestQuery')).toBe(true);
    });

    it('should return false for unregistered handler', () => {
      expect(queryBus.hasHandler('NonExistentQuery')).toBe(false);
    });
  });

  describe('getRegisteredQueries', () => {
    it('should return list of registered query types', () => {
      const handler: QueryHandler<unknown, unknown> = async () => ({
        success: true,
        queryId: '1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      queryBus.register('Query1', handler);
      queryBus.register('Query2', handler);
      queryBus.register('Query3', handler);

      const registered = queryBus.getRegisteredQueries();

      expect(registered).toContain('Query1');
      expect(registered).toContain('Query2');
      expect(registered).toContain('Query3');
      expect(registered).toHaveLength(3);
    });

    it('should return empty array when no queries registered', () => {
      const registered = queryBus.getRegisteredQueries();
      expect(registered).toEqual([]);
    });
  });
});

describe('Built-in Middleware', () => {
  describe('queryLoggingMiddleware', () => {
    it('should log query execution', async () => {
      const infoLogs: unknown[] = [];
      const mockLogger = {
        info: (obj: unknown, msg: string) => infoLogs.push({ obj, msg }),
      };

      const middleware = queryLoggingMiddleware(mockLogger);

      const mockNext = vi.fn().mockResolvedValue({
        success: true,
        queryId: 'q1',
        data: {},
        cached: false,
        executionTimeMs: 50,
      });

      const query: Query = {
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const context: QueryContext = {
        correlationId: 'c1',
      };

      await middleware(query, context, mockNext);

      expect(infoLogs).toHaveLength(2);
      expect(infoLogs[0]).toMatchObject({ msg: 'Query received' });
      expect(infoLogs[1]).toMatchObject({ msg: 'Query executed' });
    });
  });

  describe('authorizationMiddleware', () => {
    it('should allow authorized queries', async () => {
      const authorize = vi.fn().mockResolvedValue(true);
      const middleware = authorizationMiddleware(authorize);

      const mockNext = vi.fn().mockResolvedValue({
        success: true,
        queryId: 'q1',
        data: {},
        cached: false,
        executionTimeMs: 0,
      });

      const query: Query = {
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const context: QueryContext = {
        correlationId: 'c1',
        userId: 'user-1',
      };

      const result = await middleware(query, context, mockNext);

      expect(result.success).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block unauthorized queries', async () => {
      const authorize = vi.fn().mockResolvedValue(false);
      const middleware = authorizationMiddleware(authorize);

      const mockNext = vi.fn();

      const query: Query = {
        type: 'TestQuery',
        params: {},
        metadata: {
          queryId: 'q1',
          correlationId: 'c1',
          timestamp: new Date(),
        },
      };

      const context: QueryContext = {
        correlationId: 'c1',
      };

      const result = await middleware(query, context, mockNext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('Query Helpers', () => {
  describe('defineQuery', () => {
    it('should create query factory', () => {
      const schema = z.object({
        userId: z.string(),
        includeDetails: z.boolean().optional(),
      });

      const GetUserQuery = defineQuery('GetUser', schema);

      expect(GetUserQuery.type).toBe('GetUser');
      expect(GetUserQuery.schema).toBe(schema);
    });

    it('should create query with factory', () => {
      const schema = z.object({ id: z.string() });
      const GetUserQuery = defineQuery('GetUser', schema);

      const query = GetUserQuery.create({ id: '123' });

      expect(query.type).toBe('GetUser');
      expect(query.params).toEqual({ id: '123' });
      expect(query.metadata.queryId).toBeDefined();
      expect(query.metadata.correlationId).toBeDefined();
    });

    it('should allow custom metadata', () => {
      const schema = z.object({ id: z.string() });
      const GetUserQuery = defineQuery('GetUser', schema);

      const query = GetUserQuery.create(
        { id: '123' },
        {
          queryId: 'custom-q-id',
          correlationId: 'custom-c-id',
          userId: 'user-1',
        }
      );

      expect(query.metadata.queryId).toBe('custom-q-id');
      expect(query.metadata.correlationId).toBe('custom-c-id');
      expect(query.metadata.userId).toBe('user-1');
    });
  });

  describe('calculatePagination', () => {
    it('should calculate pagination info correctly', () => {
      const info = calculatePagination(2, 20, 100);

      expect(info.page).toBe(2);
      expect(info.pageSize).toBe(20);
      expect(info.total).toBe(100);
      expect(info.totalPages).toBe(5);
      expect(info.hasNext).toBe(true);
      expect(info.hasPrevious).toBe(true);
    });

    it('should handle first page', () => {
      const info = calculatePagination(1, 10, 50);

      expect(info.hasPrevious).toBe(false);
      expect(info.hasNext).toBe(true);
    });

    it('should handle last page', () => {
      const info = calculatePagination(5, 10, 50);

      expect(info.hasPrevious).toBe(true);
      expect(info.hasNext).toBe(false);
    });

    it('should handle single page', () => {
      const info = calculatePagination(1, 20, 10);

      expect(info.totalPages).toBe(1);
      expect(info.hasPrevious).toBe(false);
      expect(info.hasNext).toBe(false);
    });

    it('should handle partial last page', () => {
      const info = calculatePagination(3, 10, 25);

      expect(info.totalPages).toBe(3);
      expect(info.hasNext).toBe(false);
    });
  });

  describe('paginate', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

    it('should return correct page', () => {
      const page1 = paginate(items, 1, 10);
      expect(page1).toHaveLength(10);
      expect(page1[0]?.id).toBe(1);
      expect(page1[9]?.id).toBe(10);

      const page2 = paginate(items, 2, 10);
      expect(page2).toHaveLength(10);
      expect(page2[0]?.id).toBe(11);
      expect(page2[9]?.id).toBe(20);
    });

    it('should handle last partial page', () => {
      const lastPage = paginate(items, 10, 11);
      expect(lastPage).toHaveLength(1);
      expect(lastPage[0]?.id).toBe(100);
    });

    it('should return empty array for page beyond range', () => {
      const beyondPage = paginate(items, 20, 10);
      expect(beyondPage).toHaveLength(0);
    });

    it('should handle different page sizes', () => {
      const small = paginate(items, 1, 5);
      expect(small).toHaveLength(5);

      const large = paginate(items, 1, 50);
      expect(large).toHaveLength(50);
    });
  });
});

describe('Factory Function', () => {
  it('should create QueryBus with default TTL', () => {
    const bus = createQueryBus();
    expect(bus).toBeInstanceOf(QueryBus);
  });

  it('should create QueryBus with custom TTL', () => {
    const bus = createQueryBus(120000); // 120s
    expect(bus).toBeInstanceOf(QueryBus);
  });
});

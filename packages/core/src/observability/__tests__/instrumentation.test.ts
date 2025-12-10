/**
 * Tests for Auto-Instrumentation utilities
 *
 * Tests HTTP instrumentation, external service wrapping, and database instrumentation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  instrumentFastify,
  instrumentExternalCall,
  instrumentDatabase,
  createCommandMetricsMiddleware,
  createQueryMetricsMiddleware,
  createHealthIndicator,
  type InstrumentationOptions,
  type ExternalCallOptions,
  type DatabaseClient,
  type HealthIndicator,
} from '../instrumentation.js';

// Mock metrics
vi.mock('../metrics.js', () => ({
  httpRequestsTotal: { inc: vi.fn() },
  httpRequestDuration: { observe: vi.fn() },
  externalServiceRequests: { inc: vi.fn() },
  externalServiceDuration: { startTimer: vi.fn().mockReturnValue(vi.fn()) },
  commandsExecuted: { inc: vi.fn() },
  commandDuration: { startTimer: vi.fn().mockReturnValue(vi.fn()) },
  queriesExecuted: { inc: vi.fn() },
  queryDuration: { startTimer: vi.fn().mockReturnValue(vi.fn()) },
}));

// Mock telemetry to fail (simulating Edge runtime)
vi.mock('../../telemetry.js', () => {
  throw new Error('Not available in Edge Runtime');
});

describe('Instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('instrumentFastify', () => {
    it('should add hooks to fastify instance', () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      expect(mockFastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockFastify.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
      expect(mockFastify.addHook).toHaveBeenCalledWith('onError', expect.any(Function));
    });

    it('should accept custom options', () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      const options: InstrumentationOptions = {
        serviceName: 'custom-service',
        ignorePaths: ['/custom-health'],
        collectRequestBody: true,
        collectResponseBody: true,
      };

      instrumentFastify(mockFastify, options);

      expect(mockFastify.addHook).toHaveBeenCalledTimes(3);
    });

    it('should skip ignored paths in onRequest hook', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify, { ignorePaths: ['/health'] });

      // Get the onRequest hook
      const onRequestCall = mockFastify.addHook.mock.calls.find((call) => call[0] === 'onRequest');
      const onRequestHook = onRequestCall?.[1];

      // Create mock request for ignored path
      const mockRequest = {
        url: '/health',
        headers: {},
        method: 'GET',
      };
      const mockReply = {};

      // Should not throw and should not add observability
      await onRequestHook(mockRequest, mockReply);
      expect(mockRequest).not.toHaveProperty('observability');
    });

    it('should add observability context on non-ignored paths', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onRequestCall = mockFastify.addHook.mock.calls.find((call) => call[0] === 'onRequest');
      const onRequestHook = onRequestCall?.[1];

      const mockRequest = {
        url: '/api/leads?page=1',
        headers: {
          'x-correlation-id': 'corr-123',
          'x-trace-id': 'trace-456',
          'user-agent': 'test-agent',
        },
        method: 'POST',
        routeOptions: { url: '/api/leads' },
      };
      const mockReply = {};

      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest).toHaveProperty('observability');
      expect(
        (mockRequest as { observability: { correlationId: string } }).observability.correlationId
      ).toBe('corr-123');
    });

    it('should generate correlation ID if not provided', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onRequestCall = mockFastify.addHook.mock.calls.find((call) => call[0] === 'onRequest');
      const onRequestHook = onRequestCall?.[1];

      const mockRequest = {
        url: '/api/test',
        headers: {},
        method: 'GET',
      };

      await onRequestHook(mockRequest, {});

      expect(
        (mockRequest as { observability: { correlationId: string } }).observability.correlationId
      ).toBeDefined();
    });

    it('should handle onResponse hook', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onResponseCall = mockFastify.addHook.mock.calls.find(
        (call) => call[0] === 'onResponse'
      );
      const onResponseHook = onResponseCall?.[1];

      const mockRequest = {
        observability: {
          method: 'GET',
          path: '/api/test',
          startTime: performance.now() - 100,
        },
      };
      const mockReply = {
        statusCode: 200,
      };

      await onResponseHook(mockRequest, mockReply);

      // Metrics should be recorded (mocked)
    });

    it('should skip onResponse if no observability context', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onResponseCall = mockFastify.addHook.mock.calls.find(
        (call) => call[0] === 'onResponse'
      );
      const onResponseHook = onResponseCall?.[1];

      const mockRequest = {};
      const mockReply = { statusCode: 200 };

      // Should not throw
      await onResponseHook(mockRequest, mockReply);
    });

    it('should handle onError hook', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onErrorCall = mockFastify.addHook.mock.calls.find((call) => call[0] === 'onError');
      const onErrorHook = onErrorCall?.[1];

      const mockRequest = {
        observability: { correlationId: 'test' },
      };
      const mockError = new Error('Test error');

      // Should not throw
      await onErrorHook(mockRequest, {}, mockError);
    });

    it('should skip onError if no observability context', async () => {
      const mockFastify = {
        addHook: vi.fn(),
      };

      instrumentFastify(mockFastify);

      const onErrorCall = mockFastify.addHook.mock.calls.find((call) => call[0] === 'onError');
      const onErrorHook = onErrorCall?.[1];

      // Should not throw
      await onErrorHook({}, {}, new Error('Test'));
    });
  });

  describe('instrumentExternalCall', () => {
    it('should wrap function and track success', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
      const options: ExternalCallOptions = {
        service: 'hubspot',
        operation: 'getContact',
      };

      const wrapped = instrumentExternalCall(mockFn, options);
      const result = await wrapped('arg1', 'arg2');

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toEqual({ data: 'test' });
    });

    it('should track errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('API Error'));
      const options: ExternalCallOptions = {
        service: 'stripe',
        operation: 'createPayment',
      };

      const wrapped = instrumentExternalCall(mockFn, options);

      await expect(wrapped()).rejects.toThrow('API Error');
    });

    it('should support timeout option', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('done'), 100)));
      const options: ExternalCallOptions = {
        service: 'external',
        operation: 'slowCall',
        timeout: 50,
      };

      const wrapped = instrumentExternalCall(mockFn, options);

      await expect(wrapped()).rejects.toThrow('Timeout');
    });

    it('should succeed before timeout', async () => {
      const mockFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('fast'), 10)));
      const options: ExternalCallOptions = {
        service: 'external',
        operation: 'fastCall',
        timeout: 100,
      };

      const wrapped = instrumentExternalCall(mockFn, options);
      const result = await wrapped();

      expect(result).toBe('fast');
    });
  });

  describe('instrumentDatabase', () => {
    it('should wrap query method', async () => {
      const originalQuery = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
      const mockClient: DatabaseClient = {
        query: originalQuery,
      };

      const instrumented = instrumentDatabase(mockClient);
      const result = await instrumented.query('SELECT * FROM users');

      // The wrapped function calls the original
      expect(originalQuery).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual({ rows: [{ id: 1 }] });
    });

    it('should handle query with parameters', async () => {
      const originalQuery = vi.fn().mockResolvedValue({ rows: [] });
      const mockClient: DatabaseClient = {
        query: originalQuery,
      };

      const instrumented = instrumentDatabase(mockClient, 'mydb');
      await instrumented.query('SELECT * FROM users WHERE id = $1', [123]);

      expect(originalQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });

    it('should extract operation from SQL', async () => {
      const originalQuery = vi.fn().mockResolvedValue({ rows: [] });
      const mockClient: DatabaseClient = {
        query: originalQuery,
      };

      const instrumented = instrumentDatabase(mockClient);

      await instrumented.query('INSERT INTO users VALUES (1)');
      await instrumented.query('UPDATE users SET name = $1', ['test']);
      await instrumented.query('DELETE FROM users WHERE id = $1', [1]);

      expect(originalQuery).toHaveBeenCalledTimes(3);
    });

    it('should handle query errors', async () => {
      const mockClient: DatabaseClient = {
        query: vi.fn().mockRejectedValue(new Error('Connection lost')),
      };

      const instrumented = instrumentDatabase(mockClient);

      await expect(instrumented.query('SELECT 1')).rejects.toThrow('Connection lost');
    });
  });

  describe('createCommandMetricsMiddleware', () => {
    it('should create middleware that tracks commands', async () => {
      const middleware = createCommandMetricsMiddleware();

      const command = { type: 'CreateLead' };
      const context = { correlationId: 'test' };
      const next = vi.fn().mockResolvedValue({ success: true });

      const result = await middleware(command, context, next);

      expect(next).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should track failed commands', async () => {
      const middleware = createCommandMetricsMiddleware();

      const command = { type: 'UpdateLead' };
      const context = {};
      const next = vi.fn().mockResolvedValue({ success: false, error: 'Not found' });

      const result = await middleware(command, context, next);

      expect(result.success).toBe(false);
    });
  });

  describe('createQueryMetricsMiddleware', () => {
    it('should create middleware that tracks queries', async () => {
      const middleware = createQueryMetricsMiddleware();

      const query = { type: 'GetLead' };
      const context = { correlationId: 'test' };
      const next = vi.fn().mockResolvedValue({ success: true, data: {}, cached: false });

      const result = await middleware(query, context, next);

      expect(next).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should track cached queries', async () => {
      const middleware = createQueryMetricsMiddleware();

      const query = { type: 'GetLeadList' };
      const context = {};
      const next = vi.fn().mockResolvedValue({ success: true, data: [], cached: true });

      const result = await middleware(query, context, next);

      expect(result.cached).toBe(true);
    });
  });

  describe('createHealthIndicator', () => {
    it('should create health indicator that returns healthy', async () => {
      const indicator = createHealthIndicator('database', async () => true);

      const result = await indicator.check();

      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return details when check returns object', async () => {
      const indicator = createHealthIndicator('redis', async () => ({
        connected: true,
        version: '7.0',
      }));

      const result = await indicator.check();

      expect(result.status).toBe('healthy');
      expect(result.details).toEqual({ connected: true, version: '7.0' });
    });

    it('should return unhealthy on error', async () => {
      const indicator = createHealthIndicator('database', async () => {
        throw new Error('Connection refused');
      });

      const result = await indicator.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
    });

    it('should return unhealthy on timeout', async () => {
      const indicator = createHealthIndicator(
        'slow-service',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return true;
        },
        50 // 50ms timeout
      );

      const result = await indicator.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Health check timeout');
    });

    it('should return degraded if latency is high', async () => {
      const indicator = createHealthIndicator(
        'slow-but-works',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return true;
        },
        100 // 100ms timeout, degraded at 50ms
      );

      const result = await indicator.check();

      expect(result.status).toBe('degraded');
    });

    it('should have correct name', () => {
      const indicator = createHealthIndicator('my-service', async () => true);

      expect(indicator.name).toBe('my-service');
    });
  });
});

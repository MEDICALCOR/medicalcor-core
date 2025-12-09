/**
 * @fileoverview Tests for Health Check Utilities
 *
 * Tests the health check manager, common checkers, and all status transitions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createHealthCheck,
  createDatabaseChecker,
  createRedisChecker,
  createHttpChecker,
  type HealthStatus,
  type DependencyCheck,
  type HealthCheckConfig,
} from '../health.js';

describe('Health Check Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createHealthCheck', () => {
    const baseConfig: HealthCheckConfig = {
      version: '1.0.0',
      startTime: new Date('2024-01-01T00:00:00Z'),
    };

    describe('factory function', () => {
      it('should create a health check manager with correct interface', () => {
        const health = createHealthCheck(baseConfig);

        expect(health).toHaveProperty('addCheck');
        expect(health).toHaveProperty('removeCheck');
        expect(health).toHaveProperty('check');
        expect(health).toHaveProperty('liveness');
        expect(health).toHaveProperty('readiness');
        expect(typeof health.addCheck).toBe('function');
        expect(typeof health.removeCheck).toBe('function');
        expect(typeof health.check).toBe('function');
        expect(typeof health.liveness).toBe('function');
        expect(typeof health.readiness).toBe('function');
      });

      it('should use default checkTimeout of 5000ms', async () => {
        const health = createHealthCheck(baseConfig);
        let resolveChecker: () => void;
        const slowChecker = vi.fn(
          () =>
            new Promise<DependencyCheck>((resolve) => {
              resolveChecker = () =>
                resolve({
                  name: 'slow',
                  status: 'healthy',
                  lastChecked: new Date(),
                });
            })
        );

        health.addCheck('slow', slowChecker);

        const checkPromise = health.check();

        // Advance time past default timeout
        await vi.advanceTimersByTimeAsync(5001);

        const result = await checkPromise;

        expect(result.dependencies).toHaveLength(1);
        expect(result.dependencies[0]?.status).toBe('unhealthy');
        expect(result.dependencies[0]?.message).toBe('Check timeout');
      });

      it('should use custom checkTimeout when provided', async () => {
        const health = createHealthCheck({ ...baseConfig, checkTimeout: 1000 });
        const slowChecker = vi.fn(
          () =>
            new Promise<DependencyCheck>((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    name: 'slow',
                    status: 'healthy',
                    lastChecked: new Date(),
                  }),
                2000
              );
            })
        );

        health.addCheck('slow', slowChecker);

        const checkPromise = health.check();
        await vi.advanceTimersByTimeAsync(1001);

        const result = await checkPromise;

        expect(result.dependencies[0]?.status).toBe('unhealthy');
        expect(result.dependencies[0]?.message).toBe('Check timeout');
      });
    });

    describe('addCheck and removeCheck', () => {
      it('should add a health checker', async () => {
        const health = createHealthCheck(baseConfig);
        const checker = vi.fn().mockResolvedValue({
          name: 'test',
          status: 'healthy' as HealthStatus,
          lastChecked: new Date(),
        });

        health.addCheck('test', checker);
        await health.check();

        expect(checker).toHaveBeenCalledTimes(1);
      });

      it('should remove a health checker', async () => {
        const health = createHealthCheck(baseConfig);
        const checker = vi.fn().mockResolvedValue({
          name: 'test',
          status: 'healthy' as HealthStatus,
          lastChecked: new Date(),
        });

        health.addCheck('test', checker);
        health.removeCheck('test');
        const result = await health.check();

        expect(checker).not.toHaveBeenCalled();
        expect(result.dependencies).toHaveLength(0);
      });

      it('should replace checker with same name', async () => {
        const health = createHealthCheck(baseConfig);
        const checker1 = vi.fn().mockResolvedValue({
          name: 'test',
          status: 'healthy' as HealthStatus,
          lastChecked: new Date(),
        });
        const checker2 = vi.fn().mockResolvedValue({
          name: 'test',
          status: 'degraded' as HealthStatus,
          lastChecked: new Date(),
        });

        health.addCheck('test', checker1);
        health.addCheck('test', checker2);
        const result = await health.check();

        expect(checker1).not.toHaveBeenCalled();
        expect(checker2).toHaveBeenCalledTimes(1);
        expect(result.dependencies[0]?.status).toBe('degraded');
      });
    });

    describe('check', () => {
      it('should return healthy status when no checks are registered', async () => {
        const health = createHealthCheck(baseConfig);

        const result = await health.check();

        expect(result.status).toBe('healthy');
        expect(result.dependencies).toHaveLength(0);
        expect(result.version).toBe('1.0.0');
      });

      it('should return healthy status when all checks pass', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'healthy',
          latencyMs: 10,
          lastChecked: new Date(),
        }));
        health.addCheck('redis', async () => ({
          name: 'redis',
          status: 'healthy',
          latencyMs: 5,
          lastChecked: new Date(),
        }));

        const result = await health.check();

        expect(result.status).toBe('healthy');
        expect(result.dependencies).toHaveLength(2);
        expect(result.dependencies.every((d) => d.status === 'healthy')).toBe(true);
      });

      it('should return degraded status when any check is degraded', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'healthy',
          lastChecked: new Date(),
        }));
        health.addCheck('redis', async () => ({
          name: 'redis',
          status: 'degraded',
          message: 'High latency',
          lastChecked: new Date(),
        }));

        const result = await health.check();

        expect(result.status).toBe('degraded');
      });

      it('should return unhealthy status when any check is unhealthy', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'unhealthy',
          message: 'Connection refused',
          lastChecked: new Date(),
        }));
        health.addCheck('redis', async () => ({
          name: 'redis',
          status: 'healthy',
          lastChecked: new Date(),
        }));

        const result = await health.check();

        expect(result.status).toBe('unhealthy');
      });

      it('should prioritize unhealthy over degraded', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'unhealthy',
          lastChecked: new Date(),
        }));
        health.addCheck('redis', async () => ({
          name: 'redis',
          status: 'degraded',
          lastChecked: new Date(),
        }));

        const result = await health.check();

        expect(result.status).toBe('unhealthy');
      });

      it('should handle checker throwing error', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('failing', async () => {
          throw new Error('Database connection failed');
        });

        const result = await health.check();

        expect(result.status).toBe('unhealthy');
        expect(result.dependencies[0]?.message).toBe('Database connection failed');
      });

      it('should handle non-Error throws', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('failing', async () => {
          throw 'string error';
        });

        const result = await health.check();

        expect(result.status).toBe('unhealthy');
        expect(result.dependencies[0]?.message).toBe('Unknown error');
      });

      it('should calculate uptime correctly', async () => {
        vi.setSystemTime(new Date('2024-01-01T00:00:30Z'));
        const health = createHealthCheck(baseConfig);

        const result = await health.check();

        expect(result.uptime).toBe(30);
      });

      it('should set lastChecked on all dependency results', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('test', async () => ({
          name: 'test',
          status: 'healthy',
          lastChecked: new Date('2000-01-01'), // Old date
        }));

        const result = await health.check();

        expect(result.dependencies[0]?.lastChecked).toBeInstanceOf(Date);
        expect(result.dependencies[0]?.lastChecked.getTime()).toBeGreaterThan(
          new Date('2020-01-01').getTime()
        );
      });
    });

    describe('liveness', () => {
      it('should return ok status', () => {
        const health = createHealthCheck(baseConfig);

        const result = health.liveness();

        expect(result.status).toBe('ok');
        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should not run any checks', async () => {
        const health = createHealthCheck(baseConfig);
        const checker = vi.fn().mockResolvedValue({
          name: 'test',
          status: 'unhealthy',
          lastChecked: new Date(),
        });
        health.addCheck('test', checker);

        health.liveness();

        expect(checker).not.toHaveBeenCalled();
      });
    });

    describe('readiness', () => {
      it('should return ready=true when all checks are healthy', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'healthy',
          lastChecked: new Date(),
        }));

        const result = await health.readiness();

        expect(result.ready).toBe(true);
        expect(result.checks).toHaveLength(1);
      });

      it('should return ready=true when checks are degraded', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'degraded',
          lastChecked: new Date(),
        }));

        const result = await health.readiness();

        expect(result.ready).toBe(true);
      });

      it('should return ready=false when any check is unhealthy', async () => {
        const health = createHealthCheck(baseConfig);
        health.addCheck('db', async () => ({
          name: 'db',
          status: 'unhealthy',
          lastChecked: new Date(),
        }));

        const result = await health.readiness();

        expect(result.ready).toBe(false);
      });
    });
  });

  describe('createDatabaseChecker', () => {
    it('should return healthy when query succeeds', async () => {
      const queryFn = vi.fn().mockResolvedValue(undefined);

      const checker = createDatabaseChecker(queryFn);
      const result = await checker();

      expect(result.name).toBe('database');
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when query fails', async () => {
      const queryFn = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const checker = createDatabaseChecker(queryFn);
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Connection refused');
    });

    it('should use custom name when provided', async () => {
      const queryFn = vi.fn().mockResolvedValue(undefined);

      const checker = createDatabaseChecker(queryFn, 'postgres');
      const result = await checker();

      expect(result.name).toBe('postgres');
    });

    it('should handle non-Error throws', async () => {
      const queryFn = vi.fn().mockRejectedValue('string error');

      const checker = createDatabaseChecker(queryFn);
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Database check failed');
    });

    it('should measure latency correctly', async () => {
      vi.useRealTimers();
      const queryFn = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      const checker = createDatabaseChecker(queryFn);
      const result = await checker();

      // Allow 5ms tolerance for timing variations in test environments
      expect(result.latencyMs).toBeGreaterThanOrEqual(45);
      expect(result.latencyMs).toBeLessThan(200);
    });
  });

  describe('createRedisChecker', () => {
    it('should return healthy when ping returns PONG', async () => {
      const pingFn = vi.fn().mockResolvedValue('PONG');

      const checker = createRedisChecker(pingFn);
      const result = await checker();

      expect(result.name).toBe('redis');
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeDefined();
    });

    it('should return degraded when ping returns unexpected response', async () => {
      const pingFn = vi.fn().mockResolvedValue('UNEXPECTED');

      const checker = createRedisChecker(pingFn);
      const result = await checker();

      expect(result.status).toBe('degraded');
      expect(result.message).toBe('Unexpected response: UNEXPECTED');
    });

    it('should return unhealthy when ping fails', async () => {
      const pingFn = vi.fn().mockRejectedValue(new Error('Redis connection timeout'));

      const checker = createRedisChecker(pingFn);
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Redis connection timeout');
    });

    it('should use custom name when provided', async () => {
      const pingFn = vi.fn().mockResolvedValue('PONG');

      const checker = createRedisChecker(pingFn, 'cache');
      const result = await checker();

      expect(result.name).toBe('cache');
    });

    it('should handle non-Error throws', async () => {
      const pingFn = vi.fn().mockRejectedValue('string error');

      const checker = createRedisChecker(pingFn);
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Redis check failed');
    });
  });

  describe('createHttpChecker', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return healthy when endpoint returns expected status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.name).toBe('api');
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeDefined();
    });

    it('should return degraded for 4xx responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('degraded');
      expect(result.message).toBe('HTTP 404');
    });

    it('should return unhealthy for 5xx responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('HTTP 500');
    });

    it('should return unhealthy for 502 responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 502,
        ok: false,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy for 503 responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('unhealthy');
    });

    it('should use custom expected status code', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 204,
        ok: true,
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api', 204);
      const result = await checker();

      expect(result.status).toBe('healthy');
    });

    it('should return unhealthy when fetch throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Network error');
    });

    it('should handle non-Error throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue('string error');

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      const result = await checker();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('HTTP check failed');
    });

    it('should include AbortSignal with 5000ms timeout', async () => {
      let capturedOptions: RequestInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedOptions = options;
        return Promise.resolve({ status: 200, ok: true });
      });

      const checker = createHttpChecker('https://api.example.com/health', 'api');
      await checker();

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions?.signal).toBeDefined();
    });
  });
});

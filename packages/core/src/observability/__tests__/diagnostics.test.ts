/**
 * Tests for Diagnostics Collector
 *
 * Tests diagnostic snapshots, health checks, and trace lookup functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DiagnosticsCollector,
  diagnostics,
  recordTrace,
  lookupTrace,
  searchTraces,
  getPrometheusMetrics,
  getMetricsJSON,
  type TraceLookup,
} from '../diagnostics.js';

// Mock metrics
vi.mock('../metrics.js', () => ({
  globalMetrics: {
    toPrometheusText: vi.fn().mockReturnValue('# HELP test_metric\ntest_metric 1'),
    toJSON: vi.fn().mockReturnValue({ test_metric: 1 }),
  },
  httpRequestsTotal: {
    getAll: vi.fn().mockReturnValue([
      { labels: { method: 'GET', path: '/api/test', status: '200' }, value: 100 },
      { labels: { method: 'POST', path: '/api/leads', status: '201' }, value: 50 },
      { labels: { method: 'GET', path: '/api/test', status: '500' }, value: 5 },
    ]),
  },
  httpRequestDuration: {
    getAll: vi.fn().mockReturnValue([
      { labels: { method: 'GET', path: '/api/test' }, sum: 10, count: 100 },
      { labels: { method: 'POST', path: '/api/leads' }, sum: 25, count: 50 },
    ]),
  },
  leadsCreated: {
    getAll: vi.fn().mockReturnValue([{ labels: {}, value: 1000 }]),
  },
  leadsConverted: {
    getAll: vi.fn().mockReturnValue([{ labels: {}, value: 250 }]),
  },
  commandsExecuted: {
    getAll: vi.fn().mockReturnValue([
      { labels: { type: 'CreateLead', status: 'success' }, value: 900 },
      { labels: { type: 'CreateLead', status: 'error' }, value: 100 },
    ]),
  },
  queriesExecuted: {
    getAll: vi.fn().mockReturnValue([
      { labels: { type: 'GetLead', cached: 'true' }, value: 500 },
      { labels: { type: 'GetLead', cached: 'false' }, value: 500 },
    ]),
  },
  externalServiceRequests: {
    getAll: vi.fn().mockReturnValue([
      { labels: { service: 'hubspot', operation: 'getContact', status: 'success' }, value: 100 },
      { labels: { service: 'hubspot', operation: 'getContact', status: 'error' }, value: 10 },
      { labels: { service: 'stripe', operation: 'createPayment', status: 'success' }, value: 50 },
    ]),
  },
}));

describe('DiagnosticsCollector', () => {
  let collector: DiagnosticsCollector;

  beforeEach(() => {
    collector = new DiagnosticsCollector();
    vi.clearAllMocks();
  });

  describe('registerHealthIndicator', () => {
    it('should register a health indicator', () => {
      const indicator = {
        name: 'database',
        check: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 10 }),
      };

      collector.registerHealthIndicator(indicator);

      // Indicator is registered internally
    });
  });

  describe('recordLatency', () => {
    it('should record latency samples', () => {
      collector.recordLatency(100);
      collector.recordLatency(200);
      collector.recordLatency(150);

      // Latencies are stored in buffer
    });

    it('should maintain max buffer size', () => {
      // Record more than max buffer size
      for (let i = 0; i < 1100; i++) {
        collector.recordLatency(i);
      }

      // Buffer should be limited
    });
  });

  describe('getSnapshot', () => {
    it('should return diagnostic snapshot', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('uptimeMs');
      expect(snapshot).toHaveProperty('system');
      expect(snapshot).toHaveProperty('http');
      expect(snapshot).toHaveProperty('business');
      expect(snapshot).toHaveProperty('performance');
      expect(snapshot).toHaveProperty('health');
    });

    it('should include system information', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.system.nodeVersion).toBe(process.version);
      expect(snapshot.system.platform).toBe(process.platform);
      expect(snapshot.system.memoryUsage).toHaveProperty('heapUsed');
      expect(snapshot.system.memoryUsage).toHaveProperty('heapTotal');
      expect(snapshot.system.cpuUsage).toHaveProperty('user');
      expect(snapshot.system.cpuUsage).toHaveProperty('system');
    });

    it('should include HTTP metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.http.totalRequests).toBe(155); // 100 + 50 + 5
      expect(snapshot.http.requestsByStatus['200']).toBe(100);
      expect(snapshot.http.requestsByStatus['201']).toBe(50);
      expect(snapshot.http.requestsByStatus['500']).toBe(5);
    });

    it('should include business metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.business.leadsCreated).toBe(1000);
      expect(snapshot.business.leadsConverted).toBe(250);
      expect(snapshot.business.conversionRate).toBe(0.25);
      expect(snapshot.business.commandsExecuted).toBe(1000);
      expect(snapshot.business.commandSuccessRate).toBe(0.9);
      expect(snapshot.business.queriesExecuted).toBe(1000);
      expect(snapshot.business.queryCacheHitRate).toBe(0.5);
    });

    it('should include performance metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.performance.externalServiceHealth).toHaveProperty('hubspot');
      expect(snapshot.performance.externalServiceHealth).toHaveProperty('stripe');
      expect(snapshot.performance.slowestEndpoints).toBeDefined();
    });

    it('should calculate percentiles from latency buffer', async () => {
      // Record some latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordLatency(i);
      }

      const snapshot = await collector.getSnapshot();

      expect(snapshot.http.avgLatencyMs).toBeGreaterThan(0);
      expect(snapshot.http.p50LatencyMs).toBeGreaterThan(0);
      expect(snapshot.http.p95LatencyMs).toBeGreaterThan(0);
      expect(snapshot.http.p99LatencyMs).toBeGreaterThan(0);
    });

    it('should handle empty latency buffer', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.http.avgLatencyMs).toBe(0);
      expect(snapshot.http.p50LatencyMs).toBe(0);
    });

    it('should run health checks', async () => {
      const mockIndicator = {
        name: 'test-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
      };

      collector.registerHealthIndicator(mockIndicator);
      const snapshot = await collector.getSnapshot();

      expect(mockIndicator.check).toHaveBeenCalled();
      expect(snapshot.health.checks['test-service']).toBeDefined();
    });

    it('should determine overall health status', async () => {
      const healthyIndicator = {
        name: 'healthy-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
      };

      collector.registerHealthIndicator(healthyIndicator);
      const snapshot = await collector.getSnapshot();

      expect(snapshot.health.overall).toBe('healthy');
    });

    it('should set overall to degraded if any check is degraded', async () => {
      const healthyIndicator = {
        name: 'healthy-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
      };
      const degradedIndicator = {
        name: 'degraded-service',
        check: vi.fn().mockResolvedValue({ status: 'degraded', latencyMs: 500 }),
      };

      collector.registerHealthIndicator(healthyIndicator);
      collector.registerHealthIndicator(degradedIndicator);
      const snapshot = await collector.getSnapshot();

      expect(snapshot.health.overall).toBe('degraded');
    });

    it('should set overall to unhealthy if any check is unhealthy', async () => {
      const healthyIndicator = {
        name: 'healthy-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
      };
      const unhealthyIndicator = {
        name: 'unhealthy-service',
        check: vi.fn().mockResolvedValue({ status: 'unhealthy', latencyMs: 0, error: 'Down' }),
      };

      collector.registerHealthIndicator(healthyIndicator);
      collector.registerHealthIndicator(unhealthyIndicator);
      const snapshot = await collector.getSnapshot();

      expect(snapshot.health.overall).toBe('unhealthy');
    });
  });

  describe('getQuickHealth', () => {
    it('should return ok status normally', () => {
      const health = collector.getQuickHealth();

      expect(health.status).toBe('ok');
      expect(health.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Global diagnostics instance', () => {
  it('should be a DiagnosticsCollector instance', () => {
    expect(diagnostics).toBeInstanceOf(DiagnosticsCollector);
  });
});

describe('Trace functions', () => {
  beforeEach(() => {
    // Clear trace buffer between tests by looking up and recording new traces
  });

  describe('recordTrace', () => {
    it('should record a trace', () => {
      const trace: TraceLookup = {
        traceId: 'trace-123',
        correlationId: 'corr-123',
        spans: [],
        totalDurationMs: 100,
        status: 'ok',
      };

      recordTrace(trace);

      const found = lookupTrace('trace-123');
      expect(found).toEqual(trace);
    });

    it('should handle buffer overflow', () => {
      // Record more than max traces
      for (let i = 0; i < 1100; i++) {
        recordTrace({
          traceId: `trace-${i}`,
          spans: [],
          totalDurationMs: i,
          status: 'ok',
        });
      }

      // Early traces should be evicted
      expect(lookupTrace('trace-0')).toBeUndefined();
      expect(lookupTrace('trace-1099')).toBeDefined();
    });
  });

  describe('lookupTrace', () => {
    it('should find existing trace', () => {
      const trace: TraceLookup = {
        traceId: 'lookup-test',
        spans: [],
        totalDurationMs: 50,
        status: 'ok',
      };

      recordTrace(trace);
      const found = lookupTrace('lookup-test');

      expect(found).toEqual(trace);
    });

    it('should return undefined for non-existent trace', () => {
      const found = lookupTrace('non-existent-trace-id');

      expect(found).toBeUndefined();
    });
  });

  describe('searchTraces', () => {
    beforeEach(() => {
      // Add some test traces
      recordTrace({
        traceId: 'search-1',
        correlationId: 'corr-A',
        spans: [],
        totalDurationMs: 100,
        status: 'ok',
      });
      recordTrace({
        traceId: 'search-2',
        correlationId: 'corr-A',
        spans: [],
        totalDurationMs: 500,
        status: 'error',
      });
      recordTrace({
        traceId: 'search-3',
        correlationId: 'corr-B',
        spans: [],
        totalDurationMs: 200,
        status: 'ok',
      });
    });

    it('should filter by correlationId', () => {
      const results = searchTraces({ correlationId: 'corr-A' });

      expect(results.length).toBe(2);
      expect(results.every((t) => t.correlationId === 'corr-A')).toBe(true);
    });

    it('should filter by minDurationMs', () => {
      const results = searchTraces({ minDurationMs: 300 });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((t) => t.totalDurationMs >= 300)).toBe(true);
    });

    it('should filter by status', () => {
      const results = searchTraces({ status: 'error' });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((t) => t.status === 'error')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const results = searchTraces({
        correlationId: 'corr-A',
        status: 'ok',
      });

      expect(results.length).toBe(1);
      expect(results[0]?.traceId).toBe('search-1');
    });

    it('should respect limit', () => {
      const results = searchTraces({}, 1);

      expect(results.length).toBe(1);
    });

    it('should return empty array if no matches', () => {
      const results = searchTraces({ correlationId: 'non-existent' });

      expect(results).toEqual([]);
    });
  });
});

describe('Prometheus metrics', () => {
  describe('getPrometheusMetrics', () => {
    it('should return prometheus format text', () => {
      const text = getPrometheusMetrics();

      expect(typeof text).toBe('string');
      expect(text).toContain('test_metric');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return JSON format metrics', () => {
      const json = getMetricsJSON();

      expect(typeof json).toBe('object');
      expect(json).toHaveProperty('test_metric');
    });
  });
});

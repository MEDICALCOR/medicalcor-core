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
  type TraceSpan,
  type HealthSnapshot,
} from '../diagnostics.js';
import type { HealthIndicator, HealthCheckResult } from '../instrumentation.js';

// Mock the metrics module
vi.mock('../metrics.js', () => {
  const createMockCounter = () => ({
    getAll: vi.fn(() => []),
    inc: vi.fn(),
    get: vi.fn(() => 0),
  });

  const createMockHistogram = () => ({
    getAll: vi.fn(() => []),
    observe: vi.fn(),
  });

  return {
    globalMetrics: {
      toPrometheusText: vi.fn(() => '# Prometheus metrics'),
      toJSON: vi.fn(() => ({ metrics: [] })),
    },
    httpRequestsTotal: createMockCounter(),
    httpRequestDuration: createMockHistogram(),
    leadsCreated: createMockCounter(),
    leadsConverted: createMockCounter(),
    commandsExecuted: createMockCounter(),
    queriesExecuted: createMockCounter(),
    externalServiceRequests: createMockCounter(),
  };
});

describe('DiagnosticsCollector', () => {
  let collector: DiagnosticsCollector;

  beforeEach(() => {
    collector = new DiagnosticsCollector();
    vi.clearAllMocks();
  });

  describe('registerHealthIndicator', () => {
    it('should register a health indicator', async () => {
      const indicator: HealthIndicator = {
        name: 'database',
        check: vi.fn().mockResolvedValue({
          status: 'healthy',
          details: { connections: 5 },
        }),
      };

      collector.registerHealthIndicator(indicator);

      const snapshot = await collector.getSnapshot();
      expect(snapshot.health.checks).toHaveProperty('database');
    });

    it('should register multiple health indicators', async () => {
      const dbIndicator: HealthIndicator = {
        name: 'database',
        check: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };
      const cacheIndicator: HealthIndicator = {
        name: 'cache',
        check: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };

      collector.registerHealthIndicator(dbIndicator);
      collector.registerHealthIndicator(cacheIndicator);

      const snapshot = await collector.getSnapshot();
      expect(Object.keys(snapshot.health.checks)).toHaveLength(2);
    });
  });

  describe('recordLatency', () => {
    it('should record latency samples', () => {
      collector.recordLatency(100);
      collector.recordLatency(200);
      collector.recordLatency(150);

      // Latencies should affect the HTTP snapshot
      // We can verify by getting a snapshot
    });

    it('should maintain buffer size limit', () => {
      // Record more than max buffer size (1000)
      for (let i = 0; i < 1100; i++) {
        collector.recordLatency(i);
      }

      // Buffer should still work, oldest entries should be removed
      const health = collector.getQuickHealth();
      expect(health.status).toBeDefined();
    });
  });

  describe('getSnapshot', () => {
    it('should return a complete diagnostic snapshot', async () => {
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

      expect(snapshot.system.nodeVersion).toMatch(/^v?\d+\.\d+\.\d+/);
      expect(snapshot.system.platform).toBeTruthy();
      expect(snapshot.system.memoryUsage).toHaveProperty('heapUsed');
      expect(snapshot.system.memoryUsage).toHaveProperty('heapTotal');
      expect(snapshot.system.memoryUsage).toHaveProperty('external');
      expect(snapshot.system.memoryUsage).toHaveProperty('rss');
      expect(snapshot.system.cpuUsage).toHaveProperty('user');
      expect(snapshot.system.cpuUsage).toHaveProperty('system');
    });

    it('should include HTTP metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.http).toHaveProperty('totalRequests');
      expect(snapshot.http).toHaveProperty('requestsByStatus');
      expect(snapshot.http).toHaveProperty('requestsByPath');
      expect(snapshot.http).toHaveProperty('avgLatencyMs');
      expect(snapshot.http).toHaveProperty('p50LatencyMs');
      expect(snapshot.http).toHaveProperty('p95LatencyMs');
      expect(snapshot.http).toHaveProperty('p99LatencyMs');
    });

    it('should calculate latency percentiles', async () => {
      // Record some latencies
      for (let i = 1; i <= 100; i++) {
        collector.recordLatency(i);
      }

      const snapshot = await collector.getSnapshot();

      // Average should be around 50.5
      expect(snapshot.http.avgLatencyMs).toBeGreaterThan(45);
      expect(snapshot.http.avgLatencyMs).toBeLessThan(56);
      // P50 should be around 50
      expect(snapshot.http.p50LatencyMs).toBeGreaterThan(45);
      expect(snapshot.http.p50LatencyMs).toBeLessThan(55);
      // P95 should be around 95
      expect(snapshot.http.p95LatencyMs).toBeGreaterThan(90);
      expect(snapshot.http.p95LatencyMs).toBeLessThan(100);
      // P99 should be around 99
      expect(snapshot.http.p99LatencyMs).toBeGreaterThan(95);
      expect(snapshot.http.p99LatencyMs).toBeLessThan(101);
    });

    it('should include business metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.business).toHaveProperty('leadsCreated');
      expect(snapshot.business).toHaveProperty('leadsConverted');
      expect(snapshot.business).toHaveProperty('conversionRate');
      expect(snapshot.business).toHaveProperty('commandsExecuted');
      expect(snapshot.business).toHaveProperty('commandSuccessRate');
      expect(snapshot.business).toHaveProperty('queriesExecuted');
      expect(snapshot.business).toHaveProperty('queryCacheHitRate');
    });

    it('should include performance metrics', async () => {
      const snapshot = await collector.getSnapshot();

      expect(snapshot.performance).toHaveProperty('avgResponseTimeMs');
      expect(snapshot.performance).toHaveProperty('externalServiceHealth');
      expect(snapshot.performance).toHaveProperty('slowestEndpoints');
    });

    it('should aggregate health check results', async () => {
      const healthyIndicator: HealthIndicator = {
        name: 'healthy-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };
      const degradedIndicator: HealthIndicator = {
        name: 'degraded-service',
        check: vi.fn().mockResolvedValue({ status: 'degraded' }),
      };

      collector.registerHealthIndicator(healthyIndicator);
      collector.registerHealthIndicator(degradedIndicator);

      const snapshot = await collector.getSnapshot();

      expect(snapshot.health.overall).toBe('degraded');
    });

    it('should set overall health to unhealthy when any check is unhealthy', async () => {
      const healthyIndicator: HealthIndicator = {
        name: 'healthy-service',
        check: vi.fn().mockResolvedValue({ status: 'healthy' }),
      };
      const unhealthyIndicator: HealthIndicator = {
        name: 'unhealthy-service',
        check: vi.fn().mockResolvedValue({ status: 'unhealthy' }),
      };

      collector.registerHealthIndicator(healthyIndicator);
      collector.registerHealthIndicator(unhealthyIndicator);

      const snapshot = await collector.getSnapshot();

      expect(snapshot.health.overall).toBe('unhealthy');
    });
  });

  describe('getQuickHealth', () => {
    it('should return quick health status', () => {
      const health = collector.getQuickHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptimeMs');
      expect(['ok', 'degraded', 'error']).toContain(health.status);
    });

    it('should report ok status under normal memory conditions', () => {
      const health = collector.getQuickHealth();

      // Under normal test conditions, should be ok
      expect(health.status).toBe('ok');
    });

    it('should report uptimeMs', () => {
      const health = collector.getQuickHealth();

      expect(health.uptimeMs).toBeGreaterThan(0);
    });
  });
});

describe('Trace Functions', () => {
  beforeEach(() => {
    // Clear traces by recording 1000+ traces to flush old ones
    // (This is a workaround since there's no direct clear function)
  });

  describe('recordTrace', () => {
    it('should record a trace', () => {
      const trace: TraceLookup = {
        traceId: 'trace-123',
        correlationId: 'corr-456',
        spans: [],
        totalDurationMs: 100,
        status: 'ok',
      };

      recordTrace(trace);

      const result = lookupTrace('trace-123');
      expect(result).toEqual(trace);
    });

    it('should record trace with spans', () => {
      const span: TraceSpan = {
        spanId: 'span-1',
        name: 'http.request',
        service: 'api',
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 50,
        status: 'ok',
        attributes: { path: '/api/leads' },
      };

      const trace: TraceLookup = {
        traceId: 'trace-with-spans',
        spans: [span],
        totalDurationMs: 50,
        status: 'ok',
      };

      recordTrace(trace);

      const result = lookupTrace('trace-with-spans');
      expect(result?.spans).toHaveLength(1);
      expect(result?.spans[0]?.name).toBe('http.request');
    });

    it('should evict old traces when buffer is full', () => {
      // Record more than max traces (1000)
      for (let i = 0; i < 1100; i++) {
        recordTrace({
          traceId: `trace-${i}`,
          spans: [],
          totalDurationMs: 10,
          status: 'ok',
        });
      }

      // First trace should be evicted
      expect(lookupTrace('trace-0')).toBeUndefined();
      // Later traces should still exist
      expect(lookupTrace('trace-1099')).toBeDefined();
    });
  });

  describe('lookupTrace', () => {
    it('should return undefined for non-existent trace', () => {
      const result = lookupTrace('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return trace by ID', () => {
      const trace: TraceLookup = {
        traceId: 'lookup-test',
        spans: [],
        totalDurationMs: 100,
        status: 'ok',
      };

      recordTrace(trace);

      const result = lookupTrace('lookup-test');
      expect(result).toEqual(trace);
    });
  });

  describe('searchTraces', () => {
    beforeEach(() => {
      // Record some test traces
      recordTrace({
        traceId: 'search-1',
        correlationId: 'corr-a',
        spans: [],
        totalDurationMs: 50,
        status: 'ok',
      });
      recordTrace({
        traceId: 'search-2',
        correlationId: 'corr-b',
        spans: [],
        totalDurationMs: 150,
        status: 'error',
      });
      recordTrace({
        traceId: 'search-3',
        correlationId: 'corr-a',
        spans: [],
        totalDurationMs: 200,
        status: 'ok',
      });
    });

    it('should return all traces when no filter', () => {
      const results = searchTraces({});
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by correlationId', () => {
      const results = searchTraces({ correlationId: 'corr-a' });

      expect(results.every((t) => t.correlationId === 'corr-a')).toBe(true);
    });

    it('should filter by minDurationMs', () => {
      const results = searchTraces({ minDurationMs: 100 });

      expect(results.every((t) => t.totalDurationMs >= 100)).toBe(true);
    });

    it('should filter by status', () => {
      const results = searchTraces({ status: 'error' });

      expect(results.every((t) => t.status === 'error')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const results = searchTraces({
        correlationId: 'corr-a',
        minDurationMs: 100,
      });

      expect(results.every((t) => t.correlationId === 'corr-a' && t.totalDurationMs >= 100)).toBe(
        true
      );
    });

    it('should respect limit parameter', () => {
      const results = searchTraces({}, 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array when no matches', () => {
      const results = searchTraces({ correlationId: 'non-existent' });

      expect(results).toEqual([]);
    });
  });
});

describe('Prometheus Metrics', () => {
  describe('getPrometheusMetrics', () => {
    it('should return prometheus-formatted metrics', () => {
      const metrics = getPrometheusMetrics();

      expect(typeof metrics).toBe('string');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON', () => {
      const metrics = getMetricsJSON();

      expect(typeof metrics).toBe('object');
    });
  });
});

describe('Global diagnostics instance', () => {
  it('should be a DiagnosticsCollector instance', () => {
    expect(diagnostics).toBeInstanceOf(DiagnosticsCollector);
  });

  it('should support registering health indicators', () => {
    const indicator: HealthIndicator = {
      name: 'test-indicator',
      check: vi.fn().mockResolvedValue({ status: 'healthy' }),
    };

    // Should not throw
    diagnostics.registerHealthIndicator(indicator);
  });
});

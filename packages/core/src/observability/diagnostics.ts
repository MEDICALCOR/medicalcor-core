/**
 * 100ms Diagnostics
 *
 * Fast diagnostic capabilities for:
 * - Real-time system health
 * - Performance snapshots
 * - Error analysis
 * - Trace lookup
 */

import {
  globalMetrics,
  httpRequestsTotal,
  httpRequestDuration,
  leadsCreated,
  leadsConverted,
  commandsExecuted,
  queriesExecuted,
  externalServiceRequests,
} from './metrics.js';
import type { HealthIndicator, HealthCheckResult } from './instrumentation.js';

// ============================================================================
// DIAGNOSTIC SNAPSHOT
// ============================================================================

export interface DiagnosticSnapshot {
  timestamp: Date;
  uptimeMs: number;
  system: SystemSnapshot;
  http: HttpSnapshot;
  business: BusinessSnapshot;
  performance: PerformanceSnapshot;
  health: HealthSnapshot;
}

export interface SystemSnapshot {
  nodeVersion: string;
  platform: string;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

export interface HttpSnapshot {
  totalRequests: number;
  requestsByStatus: Record<string, number>;
  requestsByPath: Record<string, number>;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface BusinessSnapshot {
  leadsCreated: number;
  leadsConverted: number;
  conversionRate: number;
  commandsExecuted: number;
  commandSuccessRate: number;
  queriesExecuted: number;
  queryCacheHitRate: number;
}

export interface PerformanceSnapshot {
  avgResponseTimeMs: number;
  externalServiceHealth: Record<
    string,
    {
      requests: number;
      successRate: number;
      avgLatencyMs: number;
    }
  >;
  slowestEndpoints: {
    path: string;
    avgLatencyMs: number;
    requests: number;
  }[];
}

export interface HealthSnapshot {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthCheckResult>;
}

// ============================================================================
// DIAGNOSTICS COLLECTOR
// ============================================================================

const startTime = Date.now();

export class DiagnosticsCollector {
  private healthIndicators: HealthIndicator[] = [];
  private latencyBuffer: number[] = [];
  private maxBufferSize = 1000;

  /**
   * Register a health indicator
   */
  registerHealthIndicator(indicator: HealthIndicator): void {
    this.healthIndicators.push(indicator);
  }

  /**
   * Record a latency sample
   */
  recordLatency(latencyMs: number): void {
    this.latencyBuffer.push(latencyMs);
    if (this.latencyBuffer.length > this.maxBufferSize) {
      this.latencyBuffer.shift();
    }
  }

  /**
   * Get a diagnostic snapshot (target: <100ms)
   */
  async getSnapshot(): Promise<DiagnosticSnapshot> {
    const [health] = await Promise.all([this.collectHealthChecks()]);

    return {
      timestamp: new Date(),
      uptimeMs: Date.now() - startTime,
      system: this.collectSystemSnapshot(),
      http: this.collectHttpSnapshot(),
      business: this.collectBusinessSnapshot(),
      performance: this.collectPerformanceSnapshot(),
      health,
    };
  }

  /**
   * Get a quick health check (target: <10ms)
   */
  getQuickHealth(): { status: 'ok' | 'degraded' | 'error'; uptimeMs: number } {
    const memUsage = process.memoryUsage();
    const heapUsedPct = memUsage.heapUsed / memUsage.heapTotal;

    return {
      status: heapUsedPct > 0.9 ? 'degraded' : 'ok',
      uptimeMs: Date.now() - startTime,
    };
  }

  private collectSystemSnapshot(): SystemSnapshot {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      cpuUsage: {
        user: cpuUsage.user / 1000000, // Convert to seconds
        system: cpuUsage.system / 1000000,
      },
    };
  }

  private collectHttpSnapshot(): HttpSnapshot {
    const requestsByStatus: Record<string, number> = {};
    const requestsByPath: Record<string, number> = {};
    let totalRequests = 0;

    for (const { labels, value } of httpRequestsTotal.getAll()) {
      totalRequests += value;
      requestsByStatus[labels.status!] = (requestsByStatus[labels.status!] ?? 0) + value;
      requestsByPath[labels.path!] = (requestsByPath[labels.path!] ?? 0) + value;
    }

    // Calculate percentiles from buffer
    const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

    return {
      totalRequests,
      requestsByStatus,
      requestsByPath,
      avgLatencyMs: avg,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
    };
  }

  private collectBusinessSnapshot(): BusinessSnapshot {
    let leadsCreatedTotal = 0;
    for (const { value } of leadsCreated.getAll()) {
      leadsCreatedTotal += value;
    }

    let leadsConvertedTotal = 0;
    for (const { value } of leadsConverted.getAll()) {
      leadsConvertedTotal += value;
    }

    let commandsTotal = 0;
    let commandsSuccess = 0;
    for (const { labels, value } of commandsExecuted.getAll()) {
      commandsTotal += value;
      if (labels.status === 'success') {
        commandsSuccess += value;
      }
    }

    let queriesTotal = 0;
    let queriesCached = 0;
    for (const { labels, value } of queriesExecuted.getAll()) {
      queriesTotal += value;
      if (labels.cached === 'true') {
        queriesCached += value;
      }
    }

    return {
      leadsCreated: leadsCreatedTotal,
      leadsConverted: leadsConvertedTotal,
      conversionRate: leadsCreatedTotal > 0 ? leadsConvertedTotal / leadsCreatedTotal : 0,
      commandsExecuted: commandsTotal,
      commandSuccessRate: commandsTotal > 0 ? commandsSuccess / commandsTotal : 1,
      queriesExecuted: queriesTotal,
      queryCacheHitRate: queriesTotal > 0 ? queriesCached / queriesTotal : 0,
    };
  }

  private collectPerformanceSnapshot(): PerformanceSnapshot {
    // Collect external service health
    const externalServiceHealth: Record<
      string,
      { requests: number; successRate: number; avgLatencyMs: number }
    > = {};

    for (const { labels, value } of externalServiceRequests.getAll()) {
      const service = labels.service!;
      externalServiceHealth[service] ??= {
        requests: 0,
        successRate: 0,
        avgLatencyMs: 0,
      };
      externalServiceHealth[service].requests += value;
      if (labels.status === 'success') {
        externalServiceHealth[service].successRate =
          (externalServiceHealth[service].successRate *
            (externalServiceHealth[service].requests - value) +
            value) /
          externalServiceHealth[service].requests;
      }
    }

    // Find slowest endpoints
    const pathLatencies: Record<string, { total: number; count: number }> = {};
    for (const { labels, sum, count } of httpRequestDuration.getAll()) {
      const path = labels.path!;
      pathLatencies[path] ??= { total: 0, count: 0 };
      pathLatencies[path].total += sum;
      pathLatencies[path].count += count;
    }

    const slowestEndpoints = Object.entries(pathLatencies)
      .map(([path, { total, count }]) => ({
        path,
        avgLatencyMs: count > 0 ? (total / count) * 1000 : 0,
        requests: count,
      }))
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
      .slice(0, 10);

    return {
      avgResponseTimeMs:
        this.latencyBuffer.length > 0
          ? this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length
          : 0,
      externalServiceHealth,
      slowestEndpoints,
    };
  }

  private async collectHealthChecks(): Promise<HealthSnapshot> {
    const checks: Record<string, HealthCheckResult> = {};
    let worstStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    await Promise.all(
      this.healthIndicators.map(async (indicator) => {
        const result = await indicator.check();
        checks[indicator.name] = result;

        if (result.status === 'unhealthy') {
          worstStatus = 'unhealthy';
        } else if (result.status === 'degraded' && worstStatus !== 'unhealthy') {
          worstStatus = 'degraded';
        }
      })
    );

    return {
      overall: worstStatus,
      checks,
    };
  }
}

// ============================================================================
// GLOBAL DIAGNOSTICS INSTANCE
// ============================================================================

export const diagnostics = new DiagnosticsCollector();

// ============================================================================
// TRACE LOOKUP (for 100ms diagnostics)
// ============================================================================

export interface TraceLookup {
  traceId: string;
  correlationId?: string;
  spans: TraceSpan[];
  totalDurationMs: number;
  status: 'ok' | 'error';
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
}

// In-memory trace buffer for quick lookup (last 1000 traces)
const traceBuffer = new Map<string, TraceLookup>();
const maxTraces = 1000;

export function recordTrace(trace: TraceLookup): void {
  if (traceBuffer.size >= maxTraces) {
    // Remove oldest entry
    const firstKey = traceBuffer.keys().next().value!;
    traceBuffer.delete(firstKey);
  }
  traceBuffer.set(trace.traceId, trace);
}

export function lookupTrace(traceId: string): TraceLookup | undefined {
  return traceBuffer.get(traceId);
}

export function searchTraces(
  filter: {
    correlationId?: string;
    minDurationMs?: number;
    status?: 'ok' | 'error';
  },
  limit = 100
): TraceLookup[] {
  const results: TraceLookup[] = [];

  for (const trace of traceBuffer.values()) {
    if (filter.correlationId && trace.correlationId !== filter.correlationId) {
      continue;
    }
    if (filter.minDurationMs && trace.totalDurationMs < filter.minDurationMs) {
      continue;
    }
    if (filter.status && trace.status !== filter.status) {
      continue;
    }

    results.push(trace);
    if (results.length >= limit) break;
  }

  return results;
}

// ============================================================================
// PROMETHEUS ENDPOINT HANDLER
// ============================================================================

export function getPrometheusMetrics(): string {
  return globalMetrics.toPrometheusText();
}

export function getMetricsJSON(): Record<string, unknown> {
  return globalMetrics.toJSON();
}

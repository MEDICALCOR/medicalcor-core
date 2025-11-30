/**
 * @module architecture/observability/metrics
 *
 * Metrics Infrastructure
 * ======================
 *
 * Prometheus-compatible metrics for monitoring.
 */

// ============================================================================
// METRIC TYPES
// ============================================================================

/**
 * Base metric interface
 */
export interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  readonly labels: string[];
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Counter - monotonically increasing value
 */
export interface Counter extends Metric {
  readonly type: 'counter';
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

/**
 * Gauge - value that can go up and down
 */
export interface Gauge extends Metric {
  readonly type: 'gauge';
  set(value: number, labels?: Record<string, string>): void;
  inc(labels?: Record<string, string>, value?: number): void;
  dec(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

/**
 * Histogram - distribution of values
 */
export interface Histogram extends Metric {
  readonly type: 'histogram';
  readonly buckets: number[];
  observe(value: number, labels?: Record<string, string>): void;
  getSum(labels?: Record<string, string>): number;
  getCount(labels?: Record<string, string>): number;
}

/**
 * Summary - statistical summary of values
 */
export interface Summary extends Metric {
  readonly type: 'summary';
  readonly quantiles: number[];
  observe(value: number, labels?: Record<string, string>): void;
  getSum(labels?: Record<string, string>): number;
  getCount(labels?: Record<string, string>): number;
}

// ============================================================================
// METRIC REGISTRY
// ============================================================================

/**
 * Metric registry interface
 */
export interface MetricRegistry {
  createCounter(name: string, help: string, labels?: string[]): Counter;
  createGauge(name: string, help: string, labels?: string[]): Gauge;
  createHistogram(name: string, help: string, buckets?: number[], labels?: string[]): Histogram;
  createSummary(name: string, help: string, quantiles?: number[], labels?: string[]): Summary;
  getMetric(name: string): Metric | undefined;
  getAllMetrics(): Metric[];
  export(): string; // Prometheus format
  reset(): void;
}

// ============================================================================
// IN-MEMORY METRIC REGISTRY
// ============================================================================

/**
 * In-memory metric registry implementation
 */
export class InMemoryMetricRegistry implements MetricRegistry {
  private metrics = new Map<string, Metric>();
  private counterValues = new Map<string, Map<string, number>>();
  private gaugeValues = new Map<string, Map<string, number>>();
  private histogramValues = new Map<
    string,
    Map<string, { sum: number; count: number; buckets: Map<number, number> }>
  >();
  private summaryValues = new Map<
    string,
    Map<string, { sum: number; count: number; values: number[] }>
  >();

  createCounter(name: string, help: string, labels: string[] = []): Counter {
    const counter: Counter = {
      name,
      help,
      type: 'counter',
      labels,
      inc: (labelValues?: Record<string, string>, value = 1) => {
        const key = this.labelsToKey(labelValues);
        const values = this.counterValues.get(name) ?? new Map();
        values.set(key, (values.get(key) ?? 0) + value);
        this.counterValues.set(name, values);
      },
      get: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.counterValues.get(name)?.get(key) ?? 0;
      },
    };
    this.metrics.set(name, counter);
    return counter;
  }

  createGauge(name: string, help: string, labels: string[] = []): Gauge {
    const gauge: Gauge = {
      name,
      help,
      type: 'gauge',
      labels,
      set: (value: number, labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        const values = this.gaugeValues.get(name) ?? new Map();
        values.set(key, value);
        this.gaugeValues.set(name, values);
      },
      inc: (labelValues?: Record<string, string>, value = 1) => {
        const key = this.labelsToKey(labelValues);
        const values = this.gaugeValues.get(name) ?? new Map();
        values.set(key, (values.get(key) ?? 0) + value);
        this.gaugeValues.set(name, values);
      },
      dec: (labelValues?: Record<string, string>, value = 1) => {
        const key = this.labelsToKey(labelValues);
        const values = this.gaugeValues.get(name) ?? new Map();
        values.set(key, (values.get(key) ?? 0) - value);
        this.gaugeValues.set(name, values);
      },
      get: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.gaugeValues.get(name)?.get(key) ?? 0;
      },
    };
    this.metrics.set(name, gauge);
    return gauge;
  }

  createHistogram(
    name: string,
    help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: string[] = []
  ): Histogram {
    const histogram: Histogram = {
      name,
      help,
      type: 'histogram',
      labels,
      buckets,
      observe: (value: number, labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        const values = this.histogramValues.get(name) ?? new Map();
        const existing = values.get(key) ?? { sum: 0, count: 0, buckets: new Map() };
        existing.sum += value;
        existing.count++;
        for (const bucket of buckets) {
          if (value <= bucket) {
            existing.buckets.set(bucket, (existing.buckets.get(bucket) ?? 0) + 1);
          }
        }
        values.set(key, existing);
        this.histogramValues.set(name, values);
      },
      getSum: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.histogramValues.get(name)?.get(key)?.sum ?? 0;
      },
      getCount: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.histogramValues.get(name)?.get(key)?.count ?? 0;
      },
    };
    this.metrics.set(name, histogram);
    return histogram;
  }

  createSummary(
    name: string,
    help: string,
    quantiles: number[] = [0.5, 0.9, 0.99],
    labels: string[] = []
  ): Summary {
    const summary: Summary = {
      name,
      help,
      type: 'summary',
      labels,
      quantiles,
      observe: (value: number, labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        const values = this.summaryValues.get(name) ?? new Map();
        const existing = values.get(key) ?? { sum: 0, count: 0, values: [] };
        existing.sum += value;
        existing.count++;
        existing.values.push(value);
        values.set(key, existing);
        this.summaryValues.set(name, values);
      },
      getSum: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.summaryValues.get(name)?.get(key)?.sum ?? 0;
      },
      getCount: (labelValues?: Record<string, string>) => {
        const key = this.labelsToKey(labelValues);
        return this.summaryValues.get(name)?.get(key)?.count ?? 0;
      },
    };
    this.metrics.set(name, summary);
    return summary;
  }

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  export(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      switch (metric.type) {
        case 'counter':
          this.exportCounter(metric.name, lines);
          break;
        case 'gauge':
          this.exportGauge(metric.name, lines);
          break;
        case 'histogram':
          this.exportHistogram(metric.name, lines);
          break;
        case 'summary':
          this.exportSummary(metric.name, lines);
          break;
      }
    }

    return lines.join('\n');
  }

  reset(): void {
    this.counterValues.clear();
    this.gaugeValues.clear();
    this.histogramValues.clear();
    this.summaryValues.clear();
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private exportCounter(name: string, lines: string[]): void {
    const values = this.counterValues.get(name);
    if (values) {
      for (const [labels, value] of values) {
        const labelStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelStr} ${value}`);
      }
    }
  }

  private exportGauge(name: string, lines: string[]): void {
    const values = this.gaugeValues.get(name);
    if (values) {
      for (const [labels, value] of values) {
        const labelStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelStr} ${value}`);
      }
    }
  }

  private exportHistogram(name: string, lines: string[]): void {
    const values = this.histogramValues.get(name);
    if (values) {
      for (const [labels, data] of values) {
        const labelStr = labels ? `,${labels}` : '';
        for (const [bucket, count] of data.buckets) {
          lines.push(`${name}_bucket{le="${bucket}"${labelStr}} ${count}`);
        }
        lines.push(`${name}_bucket{le="+Inf"${labelStr}} ${data.count}`);
        lines.push(`${name}_sum{${labels}} ${data.sum}`);
        lines.push(`${name}_count{${labels}} ${data.count}`);
      }
    }
  }

  private exportSummary(name: string, lines: string[]): void {
    const values = this.summaryValues.get(name);
    const metric = this.metrics.get(name) as Summary;
    if (values && metric) {
      for (const [labels, data] of values) {
        const labelStr = labels ? `,${labels}` : '';
        const sorted = [...data.values].sort((a, b) => a - b);
        for (const q of metric.quantiles) {
          const idx = Math.ceil(q * sorted.length) - 1;
          const value = sorted[idx] ?? 0;
          lines.push(`${name}{quantile="${q}"${labelStr}} ${value}`);
        }
        lines.push(`${name}_sum{${labels}} ${data.sum}`);
        lines.push(`${name}_count{${labels}} ${data.count}`);
      }
    }
  }
}

// ============================================================================
// STANDARD METRICS
// ============================================================================

/**
 * Standard application metrics
 */
export interface StandardMetrics {
  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly httpRequestsInFlight: Gauge;
  readonly errorTotal: Counter;
  readonly dbQueryDuration: Histogram;
  readonly dbConnectionsActive: Gauge;
  readonly eventPublished: Counter;
  readonly eventProcessed: Counter;
  readonly eventProcessingDuration: Histogram;
  readonly commandExecuted: Counter;
  readonly commandDuration: Histogram;
  readonly queryExecuted: Counter;
  readonly queryDuration: Histogram;
}

/**
 * Create standard metrics
 */
export function createStandardMetrics(registry: MetricRegistry): StandardMetrics {
  return {
    httpRequestsTotal: registry.createCounter('http_requests_total', 'Total HTTP requests', [
      'method',
      'path',
      'status',
    ]),
    httpRequestDuration: registry.createHistogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      ['method', 'path']
    ),
    httpRequestsInFlight: registry.createGauge(
      'http_requests_in_flight',
      'Current HTTP requests being processed',
      ['method']
    ),
    errorTotal: registry.createCounter('errors_total', 'Total errors', ['type', 'code']),
    dbQueryDuration: registry.createHistogram(
      'db_query_duration_seconds',
      'Database query duration in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      ['operation', 'table']
    ),
    dbConnectionsActive: registry.createGauge(
      'db_connections_active',
      'Active database connections',
      ['pool']
    ),
    eventPublished: registry.createCounter('events_published_total', 'Total events published', [
      'event_type',
      'aggregate_type',
    ]),
    eventProcessed: registry.createCounter('events_processed_total', 'Total events processed', [
      'event_type',
      'handler',
      'status',
    ]),
    eventProcessingDuration: registry.createHistogram(
      'event_processing_duration_seconds',
      'Event processing duration in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      ['event_type', 'handler']
    ),
    commandExecuted: registry.createCounter('commands_executed_total', 'Total commands executed', [
      'command_type',
      'status',
    ]),
    commandDuration: registry.createHistogram(
      'command_duration_seconds',
      'Command execution duration in seconds',
      [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5],
      ['command_type']
    ),
    queryExecuted: registry.createCounter('queries_executed_total', 'Total queries executed', [
      'query_type',
      'status',
    ]),
    queryDuration: registry.createHistogram(
      'query_duration_seconds',
      'Query execution duration in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      ['query_type']
    ),
  };
}

// Singleton registry
export const metricRegistry = new InMemoryMetricRegistry();
export const standardMetrics = createStandardMetrics(metricRegistry);

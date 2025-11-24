/**
 * Observability-First Metrics
 *
 * Prometheus-compatible metrics for:
 * - Business KPIs (leads, conversions, appointments)
 * - Technical metrics (latency, errors, throughput)
 * - Resource utilization (connections, memory)
 *
 * Enables 100ms diagnostics through efficient metric collection.
 */

// ============================================================================
// METRIC TYPES
// ============================================================================

export interface MetricLabel {
  name: string;
  value: string;
}

export interface MetricValue {
  value: number;
  labels: MetricLabel[];
  timestamp: number;
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  help: string;
  labels?: string[];
  buckets?: number[]; // For histograms
  objectives?: Record<number, number>; // For summaries
}

// ============================================================================
// COUNTER
// ============================================================================

export class Counter {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labels: string[] = []
  ) {}

  inc(labels: Record<string, string> = {}, amount = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + amount);
  }

  get(labels: Record<string, string> = {}): number {
    return this.values.get(this.labelsToKey(labels)) ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  getAll(): Array<{ labels: Record<string, string>; value: number }> {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  private labelsToKey(labels: Record<string, string>): string {
    return this.labels.map((l) => labels[l] ?? '').join(':');
  }

  private keyToLabels(key: string): Record<string, string> {
    const values = key.split(':');
    return Object.fromEntries(this.labels.map((l, i) => [l, values[i] ?? '']));
  }
}

// ============================================================================
// GAUGE
// ============================================================================

export class Gauge {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labels: string[] = []
  ) {}

  set(value: number, labels: Record<string, string> = {}): void {
    this.values.set(this.labelsToKey(labels), value);
  }

  inc(labels: Record<string, string> = {}, amount = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current + amount);
  }

  dec(labels: Record<string, string> = {}, amount = 1): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) ?? 0;
    this.values.set(key, current - amount);
  }

  get(labels: Record<string, string> = {}): number {
    return this.values.get(this.labelsToKey(labels)) ?? 0;
  }

  getAll(): Array<{ labels: Record<string, string>; value: number }> {
    return Array.from(this.values.entries()).map(([key, value]) => ({
      labels: this.keyToLabels(key),
      value,
    }));
  }

  private labelsToKey(labels: Record<string, string>): string {
    return this.labels.map((l) => labels[l] ?? '').join(':');
  }

  private keyToLabels(key: string): Record<string, string> {
    const values = key.split(':');
    return Object.fromEntries(this.labels.map((l, i) => [l, values[i] ?? '']));
  }
}

// ============================================================================
// HISTOGRAM
// ============================================================================

export class Histogram {
  private buckets: number[];
  private counts = new Map<string, number[]>();
  private sums = new Map<string, number>();
  private totalCounts = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labels: string[] = [],
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels: Record<string, string> = {}): void {
    const key = this.labelsToKey(labels);

    // Initialize if needed
    if (!this.counts.has(key)) {
      this.counts.set(key, new Array(this.buckets.length).fill(0));
      this.sums.set(key, 0);
      this.totalCounts.set(key, 0);
    }

    // Update buckets
    const bucketCounts = this.counts.get(key)!;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) {
        bucketCounts[i]!++;
      }
    }

    // Update sum and count
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.totalCounts.set(key, (this.totalCounts.get(key) ?? 0) + 1);
  }

  /**
   * Timer helper - returns a function to call when done
   */
  startTimer(labels: Record<string, string> = {}): () => number {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observe(duration, labels);
      return duration;
    };
  }

  getAll(): Array<{
    labels: Record<string, string>;
    buckets: Array<{ le: number; count: number }>;
    sum: number;
    count: number;
  }> {
    return Array.from(this.counts.keys()).map((key) => ({
      labels: this.keyToLabels(key),
      buckets: this.buckets.map((le, i) => ({
        le,
        count: this.counts.get(key)![i]!,
      })),
      sum: this.sums.get(key) ?? 0,
      count: this.totalCounts.get(key) ?? 0,
    }));
  }

  private labelsToKey(labels: Record<string, string>): string {
    return this.labels.map((l) => labels[l] ?? '').join(':');
  }

  private keyToLabels(key: string): Record<string, string> {
    const values = key.split(':');
    return Object.fromEntries(this.labels.map((l, i) => [l, values[i] ?? '']));
  }
}

// ============================================================================
// METRICS REGISTRY
// ============================================================================

export class MetricsRegistry {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  /**
   * Create or get a counter
   */
  counter(name: string, help: string, labels: string[] = []): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter(name, help, labels));
    }
    return this.counters.get(name)!;
  }

  /**
   * Create or get a gauge
   */
  gauge(name: string, help: string, labels: string[] = []): Gauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Gauge(name, help, labels));
    }
    return this.gauges.get(name)!;
  }

  /**
   * Create or get a histogram
   */
  histogram(
    name: string,
    help: string,
    labels: string[] = [],
    buckets?: number[]
  ): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Histogram(name, help, labels, buckets));
    }
    return this.histograms.get(name)!;
  }

  /**
   * Export all metrics in Prometheus text format
   */
  toPrometheusText(): string {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const { labels, value } of counter.getAll()) {
        const labelStr = this.formatLabels(labels);
        lines.push(`${counter.name}${labelStr} ${value}`);
      }
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      for (const { labels, value } of gauge.getAll()) {
        const labelStr = this.formatLabels(labels);
        lines.push(`${gauge.name}${labelStr} ${value}`);
      }
    }

    // Histograms
    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      for (const { labels, buckets, sum, count } of histogram.getAll()) {
        for (const { le, count: bucketCount } of buckets) {
          const labelStr = this.formatLabels({ ...labels, le: String(le) });
          lines.push(`${histogram.name}_bucket${labelStr} ${bucketCount}`);
        }
        const labelStr = this.formatLabels(labels);
        lines.push(`${histogram.name}_sum${labelStr} ${sum}`);
        lines.push(`${histogram.name}_count${labelStr} ${count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export all metrics as JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(
        Array.from(this.counters.entries()).map(([name, counter]) => [
          name,
          counter.getAll(),
        ])
      ),
      gauges: Object.fromEntries(
        Array.from(this.gauges.entries()).map(([name, gauge]) => [name, gauge.getAll()])
      ),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, histogram]) => [
          name,
          histogram.getAll(),
        ])
      ),
    };
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels).filter(([, v]) => v !== '');
    if (entries.length === 0) return '';
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
  }
}

// ============================================================================
// GLOBAL REGISTRY & MEDICAL METRICS
// ============================================================================

export const globalMetrics = new MetricsRegistry();

// HTTP Metrics
export const httpRequestsTotal = globalMetrics.counter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'path', 'status']
);

export const httpRequestDuration = globalMetrics.histogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method', 'path'],
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

// Business Metrics - Leads
export const leadsCreated = globalMetrics.counter(
  'medicalcor_leads_created_total',
  'Total leads created',
  ['channel', 'source']
);

export const leadsScored = globalMetrics.counter(
  'medicalcor_leads_scored_total',
  'Total leads scored',
  ['classification']
);

export const leadsConverted = globalMetrics.counter(
  'medicalcor_leads_converted_total',
  'Total leads converted'
);

export const leadScoringDuration = globalMetrics.histogram(
  'medicalcor_lead_scoring_duration_seconds',
  'Lead scoring duration in seconds',
  ['method'], // 'ai' or 'rule_based'
  [0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

// Business Metrics - Appointments
export const appointmentsScheduled = globalMetrics.counter(
  'medicalcor_appointments_scheduled_total',
  'Total appointments scheduled',
  ['service_type']
);

export const appointmentsCancelled = globalMetrics.counter(
  'medicalcor_appointments_cancelled_total',
  'Total appointments cancelled',
  ['reason']
);

// Business Metrics - Messaging
export const messagesReceived = globalMetrics.counter(
  'medicalcor_messages_received_total',
  'Total messages received',
  ['channel']
);

export const messagesSent = globalMetrics.counter(
  'medicalcor_messages_sent_total',
  'Total messages sent',
  ['channel', 'type']
);

// Technical Metrics - External Services
export const externalServiceRequests = globalMetrics.counter(
  'medicalcor_external_service_requests_total',
  'Total external service requests',
  ['service', 'operation', 'status']
);

export const externalServiceDuration = globalMetrics.histogram(
  'medicalcor_external_service_duration_seconds',
  'External service call duration',
  ['service', 'operation'],
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

// Technical Metrics - Event Store
export const eventsAppended = globalMetrics.counter(
  'medicalcor_events_appended_total',
  'Total events appended to event store',
  ['type']
);

export const eventStoreLatency = globalMetrics.histogram(
  'medicalcor_event_store_latency_seconds',
  'Event store operation latency',
  ['operation'],
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
);

// Technical Metrics - Command/Query Bus
export const commandsExecuted = globalMetrics.counter(
  'medicalcor_commands_executed_total',
  'Total commands executed',
  ['type', 'status']
);

export const commandDuration = globalMetrics.histogram(
  'medicalcor_command_duration_seconds',
  'Command execution duration',
  ['type'],
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

export const queriesExecuted = globalMetrics.counter(
  'medicalcor_queries_executed_total',
  'Total queries executed',
  ['type', 'cached']
);

export const queryDuration = globalMetrics.histogram(
  'medicalcor_query_duration_seconds',
  'Query execution duration',
  ['type'],
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
);

// Resource Metrics
export const activeConnections = globalMetrics.gauge(
  'medicalcor_active_connections',
  'Number of active connections',
  ['type'] // 'database', 'redis', 'websocket'
);

export const queueSize = globalMetrics.gauge(
  'medicalcor_queue_size',
  'Size of internal queues',
  ['queue']
);

// AI Gateway Metrics
export const aiFunctionCalls = globalMetrics.counter(
  'medicalcor_ai_function_calls_total',
  'Total AI function calls',
  ['function', 'status']
);

export const aiFunctionDuration = globalMetrics.histogram(
  'medicalcor_ai_function_duration_seconds',
  'AI function execution duration',
  ['function'],
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

export const aiIntentDetections = globalMetrics.counter(
  'medicalcor_ai_intent_detections_total',
  'Total AI intent detections',
  ['detected_function', 'confidence_bucket']
);

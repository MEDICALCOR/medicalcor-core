/**
 * @fileoverview OSAX Metrics Module
 *
 * Observability and metrics collection for OSAX clinical workflows.
 *
 * @module core/metrics/osax
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Metric types
 */
export type OsaxMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Metric definition
 */
export interface OsaxMetricDefinition {
  readonly name: string;
  readonly type: OsaxMetricType;
  readonly description: string;
  readonly labels?: string[];
  readonly buckets?: number[]; // For histograms
}

/**
 * Metrics collector interface
 */
export interface OsaxMetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void;
}

/**
 * Metrics storage backend interface
 */
export interface MetricsBackend {
  record(metric: MetricRecord): void;
  query(name: string, timeRange: { start: Date; end: Date }): Promise<MetricDataPoint[]>;
}

/**
 * Metric record
 */
export interface MetricRecord {
  readonly name: string;
  readonly type: OsaxMetricType;
  readonly value: number;
  readonly labels: Record<string, string>;
  readonly timestamp: Date;
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  readonly timestamp: Date;
  readonly value: number;
  readonly labels: Record<string, string>;
}

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

/**
 * OSAX metrics catalog
 */
export const OSAX_METRICS: Record<string, OsaxMetricDefinition> = {
  // Case metrics
  CASES_CREATED: {
    name: 'osax_cases_created_total',
    type: 'counter',
    description: 'Total number of OSAX cases created',
    labels: ['priority', 'source'],
  },
  CASES_ACTIVE: {
    name: 'osax_cases_active',
    type: 'gauge',
    description: 'Current number of active OSAX cases',
    labels: ['status', 'severity'],
  },
  CASE_STATUS_TRANSITIONS: {
    name: 'osax_case_status_transitions_total',
    type: 'counter',
    description: 'Total number of case status transitions',
    labels: ['from_status', 'to_status'],
  },

  // Scoring metrics
  CASES_SCORED: {
    name: 'osax_cases_scored_total',
    type: 'counter',
    description: 'Total number of cases scored',
    labels: ['severity', 'method'],
  },
  SCORING_DURATION: {
    name: 'osax_scoring_duration_seconds',
    type: 'histogram',
    description: 'Time taken to score a case',
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  },
  AHI_DISTRIBUTION: {
    name: 'osax_ahi_distribution',
    type: 'histogram',
    description: 'Distribution of AHI values',
    buckets: [5, 10, 15, 20, 30, 40, 50, 60, 80, 100],
  },
  COMPOSITE_SCORE_DISTRIBUTION: {
    name: 'osax_composite_score_distribution',
    type: 'histogram',
    description: 'Distribution of composite scores',
    buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  },

  // Review metrics
  CASES_REVIEWED: {
    name: 'osax_cases_reviewed_total',
    type: 'counter',
    description: 'Total number of cases reviewed',
    labels: ['decision', 'physician_id'],
  },
  REVIEW_DURATION: {
    name: 'osax_review_duration_minutes',
    type: 'histogram',
    description: 'Time taken to review a case',
    buckets: [1, 5, 10, 15, 30, 60],
  },
  TIME_TO_REVIEW: {
    name: 'osax_time_to_review_hours',
    type: 'histogram',
    description: 'Time from scoring to review completion',
    buckets: [1, 4, 8, 24, 48, 72, 168],
  },

  // Treatment metrics
  TREATMENTS_INITIATED: {
    name: 'osax_treatments_initiated_total',
    type: 'counter',
    description: 'Total number of treatments initiated',
    labels: ['type'],
  },
  TREATMENT_COMPLIANCE: {
    name: 'osax_treatment_compliance_percent',
    type: 'histogram',
    description: 'Treatment compliance percentage',
    buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  },
  ACTIVE_TREATMENTS: {
    name: 'osax_active_treatments',
    type: 'gauge',
    description: 'Current number of active treatments',
    labels: ['type', 'status'],
  },

  // Follow-up metrics
  FOLLOW_UPS_SCHEDULED: {
    name: 'osax_followups_scheduled_total',
    type: 'counter',
    description: 'Total number of follow-ups scheduled',
    labels: ['type'],
  },
  FOLLOW_UPS_COMPLETED: {
    name: 'osax_followups_completed_total',
    type: 'counter',
    description: 'Total number of follow-ups completed',
    labels: ['type', 'outcome'],
  },
  FOLLOW_UPS_MISSED: {
    name: 'osax_followups_missed_total',
    type: 'counter',
    description: 'Total number of follow-ups missed',
    labels: ['type'],
  },
  FOLLOW_UP_COMPLETION_RATE: {
    name: 'osax_followup_completion_rate',
    type: 'gauge',
    description: 'Follow-up completion rate',
  },

  // SLA metrics
  SLA_VIOLATIONS: {
    name: 'osax_sla_violations_total',
    type: 'counter',
    description: 'Total number of SLA violations',
    labels: ['sla_type', 'severity'],
  },
  CASES_PENDING_REVIEW: {
    name: 'osax_cases_pending_review',
    type: 'gauge',
    description: 'Cases pending review (SLA tracking)',
    labels: ['sla_status'],
  },

  // Error metrics
  ERRORS: {
    name: 'osax_errors_total',
    type: 'counter',
    description: 'Total number of errors',
    labels: ['operation', 'error_type'],
  },
};

// ============================================================================
// METRICS COLLECTOR IMPLEMENTATION
// ============================================================================

/**
 * OsaxMetrics
 *
 * Collects and manages OSAX-specific metrics.
 */
export class OsaxMetrics implements OsaxMetricsCollector {
  private readonly backend: MetricsBackend;
  private readonly prefix: string;
  private readonly defaultLabels: Record<string, string>;

  constructor(options: {
    backend: MetricsBackend;
    prefix?: string;
    defaultLabels?: Record<string, string>;
  }) {
    this.backend = options.backend;
    this.prefix = options.prefix ?? 'osax';
    this.defaultLabels = options.defaultLabels ?? {};
  }

  // ============================================================================
  // CORE METRIC METHODS
  // ============================================================================

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.backend.record({
      name: this.formatName(name),
      type: 'counter',
      value,
      labels: { ...this.defaultLabels, ...labels },
      timestamp: new Date(),
    });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.backend.record({
      name: this.formatName(name),
      type: 'gauge',
      value,
      labels: { ...this.defaultLabels, ...labels },
      timestamp: new Date(),
    });
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.backend.record({
      name: this.formatName(name),
      type: 'histogram',
      value,
      labels: { ...this.defaultLabels, ...labels },
      timestamp: new Date(),
    });
  }

  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.recordHistogram(name, durationMs / 1000, labels);
  }

  // ============================================================================
  // OSAX-SPECIFIC METHODS
  // ============================================================================

  /**
   * Record case creation
   */
  recordCaseCreated(priority: string, source: string = 'manual'): void {
    this.incrementCounter('cases_created_total', 1, { priority, source });
  }

  /**
   * Record case status change
   */
  recordStatusTransition(fromStatus: string, toStatus: string): void {
    this.incrementCounter('case_status_transitions_total', 1, {
      from_status: fromStatus,
      to_status: toStatus,
    });
  }

  /**
   * Record scoring metrics
   */
  recordScoring(result: {
    severity: string;
    compositeScore: number;
    ahi: number;
    method: string;
    durationMs: number;
  }): void {
    this.incrementCounter('cases_scored_total', 1, {
      severity: result.severity,
      method: result.method,
    });
    this.recordHistogram('scoring_duration_seconds', result.durationMs / 1000);
    this.recordHistogram('ahi_distribution', result.ahi);
    this.recordHistogram('composite_score_distribution', result.compositeScore);
  }

  /**
   * Record review metrics
   */
  recordReview(decision: string, physicianId: string, durationMinutes?: number): void {
    this.incrementCounter('cases_reviewed_total', 1, {
      decision,
      physician_id: physicianId,
    });
    if (durationMinutes !== undefined) {
      this.recordHistogram('review_duration_minutes', durationMinutes);
    }
  }

  /**
   * Record treatment initiation
   */
  recordTreatmentInitiated(type: string): void {
    this.incrementCounter('treatments_initiated_total', 1, { type });
  }

  /**
   * Record treatment compliance
   */
  recordTreatmentCompliance(type: string, compliancePercent: number): void {
    this.recordHistogram('treatment_compliance_percent', compliancePercent, { type });
  }

  /**
   * Record follow-up scheduled
   */
  recordFollowUpScheduled(type: string): void {
    this.incrementCounter('followups_scheduled_total', 1, { type });
  }

  /**
   * Record follow-up completed
   */
  recordFollowUpCompleted(type: string, outcome: string): void {
    this.incrementCounter('followups_completed_total', 1, { type, outcome });
  }

  /**
   * Record follow-up missed
   */
  recordFollowUpMissed(type: string): void {
    this.incrementCounter('followups_missed_total', 1, { type });
  }

  /**
   * Record SLA violation
   */
  recordSlaViolation(slaType: string, severity: string): void {
    this.incrementCounter('sla_violations_total', 1, { sla_type: slaType, severity });
  }

  /**
   * Record error
   */
  recordError(operation: string, errorType: string): void {
    this.incrementCounter('errors_total', 1, { operation, error_type: errorType });
  }

  /**
   * Update active cases gauge
   */
  updateActiveCasesGauge(statusCounts: Record<string, number>): void {
    for (const [status, count] of Object.entries(statusCounts)) {
      this.setGauge('cases_active', count, { status });
    }
  }

  /**
   * Update pending review gauge
   */
  updatePendingReviewGauge(counts: { withinSla: number; nearingSla: number; overdueSla: number }): void {
    this.setGauge('cases_pending_review', counts.withinSla, { sla_status: 'within' });
    this.setGauge('cases_pending_review', counts.nearingSla, { sla_status: 'nearing' });
    this.setGauge('cases_pending_review', counts.overdueSla, { sla_status: 'overdue' });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private formatName(name: string): string {
    const cleaned = name.replace(/^osax_/, '');
    return `${this.prefix}_${cleaned}`;
  }
}

// ============================================================================
// IN-MEMORY BACKEND (for testing/development)
// ============================================================================

/**
 * In-memory metrics backend for testing
 */
export class InMemoryMetricsBackend implements MetricsBackend {
  private records: MetricRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords: number = 10000) {
    this.maxRecords = maxRecords;
  }

  record(metric: MetricRecord): void {
    this.records.push(metric);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  async query(
    name: string,
    timeRange: { start: Date; end: Date }
  ): Promise<MetricDataPoint[]> {
    return this.records
      .filter(
        (r) =>
          r.name === name &&
          r.timestamp >= timeRange.start &&
          r.timestamp <= timeRange.end
      )
      .map((r) => ({
        timestamp: r.timestamp,
        value: r.value,
        labels: r.labels,
      }));
  }

  getRecords(): MetricRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create OSAX metrics collector
 */
export function createOsaxMetrics(options?: {
  backend?: MetricsBackend;
  prefix?: string;
  defaultLabels?: Record<string, string>;
}): OsaxMetrics {
  const backend = options?.backend ?? new InMemoryMetricsBackend();
  return new OsaxMetrics({
    backend,
    prefix: options?.prefix,
    defaultLabels: options?.defaultLabels,
  });
}

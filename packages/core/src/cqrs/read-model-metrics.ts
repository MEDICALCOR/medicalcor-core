/**
 * @fileoverview Read Model Metrics Collector
 *
 * Collects and exposes Prometheus-compatible metrics for CQRS read model
 * (materialized view) refresh operations.
 *
 * @module @medicalcor/core/cqrs/read-model-metrics
 *
 * ## Metrics Exposed
 *
 * - `medicalcor_read_model_refresh_total` - Counter of refresh operations
 * - `medicalcor_read_model_refresh_duration_seconds` - Histogram of refresh durations
 * - `medicalcor_read_model_staleness_seconds` - Gauge of seconds since last refresh
 * - `medicalcor_read_model_row_count` - Gauge of current row counts
 * - `medicalcor_read_model_concurrent_refreshes` - Gauge of active refreshes
 * - `medicalcor_read_model_health` - Gauge of health status per view
 * - `medicalcor_read_model_refresh_errors_total` - Counter of errors by type
 *
 * @example
 * ```typescript
 * import { ReadModelMetricsCollector } from '@medicalcor/core/cqrs';
 *
 * const metricsCollector = new ReadModelMetricsCollector();
 *
 * // Record a successful refresh
 * metricsCollector.recordRefresh({
 *   viewName: 'mv_dashboard_lead_summary',
 *   success: true,
 *   durationMs: 1234,
 *   rowCount: 5000,
 * });
 *
 * // Update staleness metrics periodically
 * metricsCollector.updateStalenessMetrics(readModelMetadata);
 * ```
 */

import { createLogger } from '../logger/index.js';
import {
  readModelRefreshTotal,
  readModelRefreshDuration,
  readModelStaleness,
  readModelRowCount,
  readModelConcurrentRefreshes,
  readModelHealth,
  readModelRefreshErrors,
  readModelRefreshQueueDepth,
  readModelRefreshInterval,
} from '../observability/metrics.js';

const logger = createLogger({ serviceName: 'read-model-metrics' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a read model refresh operation
 */
export interface RefreshMetricEvent {
  viewName: string;
  success: boolean;
  durationMs: number;
  rowCount: number;
  errorMessage?: string | null;
  errorType?: RefreshErrorType;
}

/**
 * Read model metadata for staleness tracking
 */
export interface ReadModelMetadataSnapshot {
  viewName: string;
  lastRefreshAt: Date | null;
  refreshIntervalMinutes: number;
  isRefreshing: boolean;
  lastError: string | null;
  rowCount: number | null;
}

/**
 * Types of refresh errors for categorization
 */
export type RefreshErrorType = 'timeout' | 'lock_conflict' | 'connection' | 'query' | 'unknown';

/**
 * Health status values
 */
export type HealthStatus = 'healthy' | 'stale' | 'error';

/**
 * Configuration for the metrics collector
 */
export interface ReadModelMetricsCollectorConfig {
  /** Threshold in seconds beyond scheduled refresh to consider stale (default: 60) */
  staleThresholdSeconds?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

/**
 * Read Model Metrics Collector
 *
 * Provides a high-level API for recording read model refresh metrics
 * in Prometheus format. Integrates with the global metrics registry.
 */
export class ReadModelMetricsCollector {
  private staleThresholdSeconds: number;
  private debug: boolean;
  private lastRefreshTimestamps = new Map<string, Date>();

  constructor(config: ReadModelMetricsCollectorConfig = {}) {
    this.staleThresholdSeconds = config.staleThresholdSeconds ?? 60;
    this.debug = config.debug ?? false;

    if (this.debug) {
      logger.debug({ config }, 'ReadModelMetricsCollector initialized');
    }
  }

  // ==========================================================================
  // REFRESH TRACKING
  // ==========================================================================

  /**
   * Record a refresh operation result
   */
  recordRefresh(event: RefreshMetricEvent): void {
    const { viewName, success, durationMs, rowCount, errorMessage, errorType } = event;

    // Record refresh counter
    const status = success ? 'success' : 'failure';
    readModelRefreshTotal.inc({ view_name: viewName, status });

    // Record duration (convert ms to seconds)
    const durationSeconds = durationMs / 1000;
    readModelRefreshDuration.observe(durationSeconds, { view_name: viewName });

    // Update row count gauge
    if (rowCount > 0) {
      readModelRowCount.set(rowCount, { view_name: viewName });
    }

    // Track last refresh timestamp for staleness calculations
    if (success) {
      this.lastRefreshTimestamps.set(viewName, new Date());
      // Reset staleness to 0 on success
      readModelStaleness.set(0, { view_name: viewName });
      // Mark as healthy
      readModelHealth.set(1, { view_name: viewName });
    } else {
      // Record error with type
      const type = errorType ?? this.categorizeError(errorMessage);
      readModelRefreshErrors.inc({ view_name: viewName, error_type: type });
      // Mark as error state
      readModelHealth.set(0, { view_name: viewName });
    }

    if (this.debug) {
      logger.debug(
        { viewName, success, durationMs, rowCount, errorMessage },
        'Recorded refresh metric'
      );
    }
  }

  /**
   * Record that a refresh was skipped (already in progress)
   */
  recordSkippedRefresh(viewName: string): void {
    readModelRefreshTotal.inc({ view_name: viewName, status: 'skipped' });

    if (this.debug) {
      logger.debug({ viewName }, 'Recorded skipped refresh');
    }
  }

  /**
   * Record the start of a refresh operation
   * Returns a function to call when the refresh completes
   */
  startRefreshTimer(viewName: string): () => RefreshMetricEvent {
    const startTime = performance.now();
    readModelConcurrentRefreshes.inc();

    if (this.debug) {
      logger.debug({ viewName }, 'Started refresh timer');
    }

    return () => {
      const durationMs = performance.now() - startTime;
      readModelConcurrentRefreshes.dec();
      return {
        viewName,
        success: false, // Caller should override this
        durationMs,
        rowCount: 0,
      };
    };
  }

  // ==========================================================================
  // STALENESS TRACKING
  // ==========================================================================

  /**
   * Update staleness metrics from read model metadata
   * Should be called periodically (e.g., every 30s)
   */
  updateStalenessMetrics(metadata: ReadModelMetadataSnapshot[]): void {
    const now = new Date();

    for (const m of metadata) {
      // Update refresh interval gauge
      const intervalSeconds = m.refreshIntervalMinutes * 60;
      readModelRefreshInterval.set(intervalSeconds, { view_name: m.viewName });

      // Calculate staleness
      if (m.lastRefreshAt) {
        const stalenessSeconds = (now.getTime() - m.lastRefreshAt.getTime()) / 1000;
        readModelStaleness.set(stalenessSeconds, { view_name: m.viewName });

        // Update health status based on staleness
        const expectedRefreshTime = intervalSeconds + this.staleThresholdSeconds;
        let healthValue: number;
        if (m.lastError) {
          healthValue = 0; // error
        } else if (stalenessSeconds > expectedRefreshTime) {
          healthValue = 0.5; // stale
        } else {
          healthValue = 1; // healthy
        }
        readModelHealth.set(healthValue, { view_name: m.viewName });
      }

      // Update row count if available
      if (m.rowCount !== null) {
        readModelRowCount.set(m.rowCount, { view_name: m.viewName });
      }
    }

    if (this.debug) {
      logger.debug({ viewCount: metadata.length }, 'Updated staleness metrics');
    }
  }

  /**
   * Get the health status for a view based on current metrics
   */
  getHealthStatus(viewName: string, metadata: ReadModelMetadataSnapshot): HealthStatus {
    if (metadata.lastError) {
      return 'error';
    }

    if (!metadata.lastRefreshAt) {
      return 'stale';
    }

    const now = new Date();
    const stalenessSeconds = (now.getTime() - metadata.lastRefreshAt.getTime()) / 1000;
    const expectedRefreshTime = metadata.refreshIntervalMinutes * 60 + this.staleThresholdSeconds;

    if (stalenessSeconds > expectedRefreshTime) {
      return 'stale';
    }

    return 'healthy';
  }

  // ==========================================================================
  // QUEUE TRACKING
  // ==========================================================================

  /**
   * Update the refresh queue depth
   */
  setQueueDepth(depth: number): void {
    readModelRefreshQueueDepth.set(depth);
  }

  /**
   * Update concurrent refresh count
   */
  setConcurrentRefreshes(count: number): void {
    readModelConcurrentRefreshes.set(count);
  }

  // ==========================================================================
  // AGGREGATED METRICS
  // ==========================================================================

  /**
   * Get a summary of current metrics state
   */
  getSummary(): ReadModelMetricsSummary {
    const views: ViewMetricsSummary[] = [];

    for (const [viewName, lastRefresh] of this.lastRefreshTimestamps) {
      const now = new Date();
      const stalenessSeconds = (now.getTime() - lastRefresh.getTime()) / 1000;

      views.push({
        viewName,
        lastRefreshAt: lastRefresh,
        stalenessSeconds,
      });
    }

    return {
      views,
      timestamp: new Date(),
    };
  }

  /**
   * Reset internal state (useful for testing)
   */
  reset(): void {
    this.lastRefreshTimestamps.clear();
    logger.info('ReadModelMetricsCollector reset');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Categorize an error message into a standard type
   */
  private categorizeError(errorMessage?: string | null): RefreshErrorType {
    if (!errorMessage) {
      return 'unknown';
    }

    const msg = errorMessage.toLowerCase();

    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'timeout';
    }

    if (msg.includes('lock') || msg.includes('concurrent') || msg.includes('already')) {
      return 'lock_conflict';
    }

    if (
      msg.includes('connection') ||
      msg.includes('connect') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound')
    ) {
      return 'connection';
    }

    if (msg.includes('query') || msg.includes('syntax') || msg.includes('sql')) {
      return 'query';
    }

    return 'unknown';
  }
}

// ============================================================================
// SUMMARY TYPES
// ============================================================================

/**
 * Summary of metrics for a single view
 */
export interface ViewMetricsSummary {
  viewName: string;
  lastRefreshAt: Date;
  stalenessSeconds: number;
}

/**
 * Overall metrics summary
 */
export interface ReadModelMetricsSummary {
  views: ViewMetricsSummary[];
  timestamp: Date;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new ReadModelMetricsCollector instance
 */
export function createReadModelMetricsCollector(
  config?: ReadModelMetricsCollectorConfig
): ReadModelMetricsCollector {
  return new ReadModelMetricsCollector(config);
}

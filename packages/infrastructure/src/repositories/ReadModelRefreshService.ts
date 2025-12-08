/**
 * @fileoverview Read Model Refresh Service
 *
 * Service for managing the refresh of CQRS read models (materialized views).
 * Provides scheduled and on-demand refresh capabilities with monitoring.
 *
 * @module @medicalcor/infrastructure/repositories/read-model-refresh-service
 *
 * ## Usage
 *
 * The service can be used in two ways:
 * 1. Manual refresh via method calls
 * 2. Automatic refresh via the start() method
 *
 * @example
 * ```typescript
 * import { ReadModelRefreshService, PostgresReadModelRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresReadModelRepository({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * const refreshService = new ReadModelRefreshService({
 *   repository,
 *   defaultRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
 *   enableAutoRefresh: true,
 * });
 *
 * // Start automatic refresh
 * await refreshService.start();
 *
 * // Manual refresh
 * await refreshService.refreshAll();
 *
 * // Graceful shutdown
 * await refreshService.stop();
 * ```
 */

import {
  createLogger,
  type ReadModelMetricsCollector,
  createReadModelMetricsCollector,
  type ReadModelMetadataSnapshot,
} from '@medicalcor/core';
import type {
  IReadModelRepository,
  ReadModelRefreshResult,
  ReadModelMetadata,
} from '@medicalcor/application';

const logger = createLogger({ name: 'read-model-refresh-service' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the Read Model Refresh Service
 */
export interface ReadModelRefreshServiceConfig {
  /** The read model repository instance */
  repository: IReadModelRepository;
  /** Default refresh interval in milliseconds (default: 5 minutes) */
  defaultRefreshIntervalMs?: number;
  /** Enable automatic refresh on a timer (default: false) */
  enableAutoRefresh?: boolean;
  /** Check for stale read models interval in milliseconds (default: 1 minute) */
  staleCheckIntervalMs?: number;
  /** Maximum concurrent refresh operations (default: 2) */
  maxConcurrentRefreshes?: number;
  /** Optional metrics collector instance (default: creates new one) */
  metricsCollector?: ReadModelMetricsCollector;
  /** Enable Prometheus metrics collection (default: true) */
  enableMetrics?: boolean;
  /** Staleness metrics update interval in milliseconds (default: 30 seconds) */
  stalenessMetricsIntervalMs?: number;
}

/**
 * Refresh statistics for monitoring
 */
export interface RefreshStats {
  totalRefreshes: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastRefreshAt: Date | null;
  lastError: string | null;
}

/**
 * Refresh schedule entry
 */
export interface RefreshSchedule {
  viewName: string;
  nextRefreshAt: Date;
  intervalMinutes: number;
  isEnabled: boolean;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Read Model Refresh Service
 *
 * Manages the refresh of CQRS read models (materialized views) with
 * support for scheduled and on-demand refreshes.
 */
export class ReadModelRefreshService {
  private repository: IReadModelRepository;
  private defaultRefreshIntervalMs: number;
  private enableAutoRefresh: boolean;
  private staleCheckIntervalMs: number;
  private maxConcurrentRefreshes: number;
  private enableMetrics: boolean;
  private stalenessMetricsIntervalMs: number;

  private refreshTimer: NodeJS.Timeout | null = null;
  private stalenessTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeRefreshes = new Set<string>();
  private metricsCollector: ReadModelMetricsCollector;
  private stats: RefreshStats = {
    totalRefreshes: 0,
    successfulRefreshes: 0,
    failedRefreshes: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    lastRefreshAt: null,
    lastError: null,
  };

  constructor(config: ReadModelRefreshServiceConfig) {
    this.repository = config.repository;
    this.defaultRefreshIntervalMs = config.defaultRefreshIntervalMs ?? 5 * 60 * 1000;
    this.enableAutoRefresh = config.enableAutoRefresh ?? false;
    this.staleCheckIntervalMs = config.staleCheckIntervalMs ?? 60 * 1000;
    this.maxConcurrentRefreshes = config.maxConcurrentRefreshes ?? 2;
    this.enableMetrics = config.enableMetrics ?? true;
    this.stalenessMetricsIntervalMs = config.stalenessMetricsIntervalMs ?? 30 * 1000;

    // Initialize metrics collector
    this.metricsCollector = config.metricsCollector ?? createReadModelMetricsCollector();

    logger.info(
      {
        defaultRefreshIntervalMs: this.defaultRefreshIntervalMs,
        enableAutoRefresh: this.enableAutoRefresh,
        staleCheckIntervalMs: this.staleCheckIntervalMs,
        enableMetrics: this.enableMetrics,
      },
      'ReadModelRefreshService initialized'
    );
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start the automatic refresh service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('ReadModelRefreshService is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting ReadModelRefreshService');

    if (this.enableAutoRefresh) {
      // Initial refresh of all stale read models
      await this.refreshStale();

      // Start periodic check for stale read models
      this.refreshTimer = setInterval(async () => {
        try {
          await this.refreshStale();
        } catch (error) {
          logger.error({ error }, 'Error in automatic refresh cycle');
        }
      }, this.staleCheckIntervalMs);

      logger.info({ intervalMs: this.staleCheckIntervalMs }, 'Automatic refresh enabled');
    }

    // Start staleness metrics collection if metrics are enabled
    if (this.enableMetrics) {
      await this.updateStalenessMetrics();

      this.stalenessTimer = setInterval(async () => {
        try {
          await this.updateStalenessMetrics();
        } catch (error) {
          logger.error({ error }, 'Error updating staleness metrics');
        }
      }, this.stalenessMetricsIntervalMs);

      logger.info(
        { intervalMs: this.stalenessMetricsIntervalMs },
        'Staleness metrics collection enabled'
      );
    }
  }

  /**
   * Stop the automatic refresh service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.stalenessTimer) {
      clearInterval(this.stalenessTimer);
      this.stalenessTimer = null;
    }

    // Wait for any active refreshes to complete
    while (this.activeRefreshes.size > 0) {
      logger.info(
        { activeRefreshes: this.activeRefreshes.size },
        'Waiting for active refreshes to complete'
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info('ReadModelRefreshService stopped');
  }

  /**
   * Check if the service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ==========================================================================
  // REFRESH OPERATIONS
  // ==========================================================================

  /**
   * Refresh a specific read model by name
   */
  async refresh(viewName: string): Promise<ReadModelRefreshResult> {
    if (this.activeRefreshes.has(viewName)) {
      logger.warn({ viewName }, 'Read model is already being refreshed');

      // Record skipped refresh in metrics
      if (this.enableMetrics) {
        this.metricsCollector.recordSkippedRefresh(viewName);
      }

      return {
        viewName,
        success: false,
        durationMs: 0,
        rowCount: 0,
        errorMessage: 'Refresh already in progress',
      };
    }

    this.activeRefreshes.add(viewName);

    // Update concurrent refresh count in metrics
    if (this.enableMetrics) {
      this.metricsCollector.setConcurrentRefreshes(this.activeRefreshes.size);
    }

    try {
      const result = await this.repository.refreshReadModel(viewName);
      this.updateStats(result);

      // Record refresh metrics
      if (this.enableMetrics) {
        this.metricsCollector.recordRefresh({
          viewName: result.viewName,
          success: result.success,
          durationMs: result.durationMs,
          rowCount: result.rowCount,
          errorMessage: result.errorMessage,
        });
      }

      return result;
    } finally {
      this.activeRefreshes.delete(viewName);

      // Update concurrent refresh count
      if (this.enableMetrics) {
        this.metricsCollector.setConcurrentRefreshes(this.activeRefreshes.size);
      }
    }
  }

  /**
   * Refresh all dashboard read models
   */
  async refreshAll(): Promise<ReadModelRefreshResult[]> {
    logger.info('Refreshing all dashboard read models');

    const results = await this.repository.refreshAllDashboardReadModels();

    for (const result of results) {
      this.updateStats(result);

      // Record metrics for each refresh
      if (this.enableMetrics) {
        this.metricsCollector.recordRefresh({
          viewName: result.viewName,
          success: result.success,
          durationMs: result.durationMs,
          rowCount: result.rowCount,
          errorMessage: result.errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Refresh only stale read models
   */
  async refreshStale(): Promise<ReadModelRefreshResult[]> {
    // Get list of stale read models
    const staleViews = await this.repository.getStaleReadModels();

    if (staleViews.length === 0) {
      // Reset queue depth to 0
      if (this.enableMetrics) {
        this.metricsCollector.setQueueDepth(0);
      }
      return [];
    }

    logger.info({ count: staleViews.length }, 'Found stale read models');

    // Track queue depth
    if (this.enableMetrics) {
      this.metricsCollector.setQueueDepth(staleViews.length);
    }

    // Limit concurrent refreshes
    const results: ReadModelRefreshResult[] = [];
    const pending = [...staleViews];

    while (pending.length > 0) {
      // Update queue depth as we process
      if (this.enableMetrics) {
        this.metricsCollector.setQueueDepth(pending.length);
      }

      // Wait if we're at max concurrent refreshes
      while (this.activeRefreshes.size >= this.maxConcurrentRefreshes) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const viewName = pending.shift();
      if (!viewName) break;

      // Skip if already being refreshed
      if (this.activeRefreshes.has(viewName)) {
        continue;
      }

      // Start refresh without awaiting (will run concurrently)
      this.refresh(viewName)
        .then((result) => results.push(result))
        .catch((error: unknown) => {
          logger.error({ viewName, error }, 'Error refreshing read model');
          const errorResult: ReadModelRefreshResult = {
            viewName,
            success: false,
            durationMs: 0,
            rowCount: 0,
            errorMessage: String(error),
          };
          results.push(errorResult);

          // Record error in metrics
          if (this.enableMetrics) {
            this.metricsCollector.recordRefresh({
              viewName,
              success: false,
              durationMs: 0,
              rowCount: 0,
              errorMessage: String(error),
            });
          }
        });
    }

    // Wait for all pending refreshes to complete
    while (this.activeRefreshes.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Reset queue depth after all refreshes complete
    if (this.enableMetrics) {
      this.metricsCollector.setQueueDepth(0);
    }

    return results;
  }

  /**
   * Force refresh a specific read model, bypassing the schedule
   */
  async forceRefresh(viewName: string): Promise<ReadModelRefreshResult> {
    logger.info({ viewName }, 'Force refreshing read model');
    return this.refresh(viewName);
  }

  // ==========================================================================
  // MONITORING
  // ==========================================================================

  /**
   * Get refresh statistics
   */
  getStats(): RefreshStats {
    return { ...this.stats };
  }

  /**
   * Reset refresh statistics
   */
  resetStats(): void {
    this.stats = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      lastRefreshAt: null,
      lastError: null,
    };
    logger.info('Refresh statistics reset');
  }

  /**
   * Get the current refresh schedule
   */
  async getSchedule(): Promise<RefreshSchedule[]> {
    const metadata = await this.repository.getReadModelMetadata();

    return metadata.map((m: ReadModelMetadata) => ({
      viewName: m.viewName,
      nextRefreshAt: m.nextScheduledRefresh ?? new Date(),
      intervalMinutes: m.refreshIntervalMinutes,
      isEnabled: !m.isRefreshing,
    }));
  }

  /**
   * Get metadata for all read models
   */
  async getMetadata(): Promise<ReadModelMetadata[]> {
    return this.repository.getReadModelMetadata();
  }

  /**
   * Check health of read models
   * Returns true if all read models are within their expected refresh intervals
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    staleCount: number;
    errorCount: number;
    details: { viewName: string; status: 'healthy' | 'stale' | 'error' }[];
  }> {
    const metadata = await this.repository.getReadModelMetadata();
    const now = new Date();

    const details = metadata.map((m: ReadModelMetadata) => {
      if (m.lastError) {
        return { viewName: m.viewName, status: 'error' as const };
      }

      if (m.nextScheduledRefresh && m.nextScheduledRefresh < now) {
        return { viewName: m.viewName, status: 'stale' as const };
      }

      return { viewName: m.viewName, status: 'healthy' as const };
    });

    const staleCount = details.filter((d) => d.status === 'stale').length;
    const errorCount = details.filter((d) => d.status === 'error').length;

    return {
      healthy: staleCount === 0 && errorCount === 0,
      staleCount,
      errorCount,
      details,
    };
  }

  /**
   * Get the metrics collector instance
   * Useful for accessing metrics summary or for testing
   */
  getMetricsCollector(): ReadModelMetricsCollector {
    return this.metricsCollector;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Update staleness metrics from repository metadata
   */
  private async updateStalenessMetrics(): Promise<void> {
    try {
      const metadata = await this.repository.getReadModelMetadata();

      // Convert to snapshot format for metrics collector
      const snapshots: ReadModelMetadataSnapshot[] = metadata.map(
        (m: ReadModelMetadata): ReadModelMetadataSnapshot => ({
          viewName: m.viewName,
          lastRefreshAt: m.lastRefreshAt,
          refreshIntervalMinutes: m.refreshIntervalMinutes,
          isRefreshing: m.isRefreshing,
          lastError: m.lastError,
          rowCount: m.rowCount,
        })
      );

      this.metricsCollector.updateStalenessMetrics(snapshots);
    } catch (error) {
      logger.error({ error }, 'Failed to update staleness metrics');
    }
  }

  private updateStats(result: ReadModelRefreshResult): void {
    this.stats.totalRefreshes++;
    this.stats.totalDurationMs += result.durationMs;
    this.stats.avgDurationMs = this.stats.totalDurationMs / this.stats.totalRefreshes;
    this.stats.lastRefreshAt = new Date();

    if (result.success) {
      this.stats.successfulRefreshes++;
    } else {
      this.stats.failedRefreshes++;
      this.stats.lastError = result.errorMessage;
    }
  }
}

/**
 * Factory function to create a Read Model Refresh Service
 */
export function createReadModelRefreshService(
  config: ReadModelRefreshServiceConfig
): ReadModelRefreshService {
  return new ReadModelRefreshService(config);
}

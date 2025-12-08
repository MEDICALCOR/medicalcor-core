/**
 * Read Model Metrics Collector Tests
 *
 * Tests for Prometheus-compatible metrics collection for
 * CQRS read model (materialized view) refresh operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReadModelMetricsCollector,
  createReadModelMetricsCollector,
  type RefreshMetricEvent,
  type ReadModelMetadataSnapshot,
} from '../read-model-metrics.js';
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
  globalMetrics,
} from '../../observability/metrics.js';

describe('ReadModelMetricsCollector', () => {
  let collector: ReadModelMetricsCollector;

  beforeEach(() => {
    // Reset global metrics before each test
    globalMetrics.reset();
    collector = new ReadModelMetricsCollector();
  });

  describe('recordRefresh', () => {
    it('should record a successful refresh', () => {
      const event: RefreshMetricEvent = {
        viewName: 'mv_dashboard_lead_summary',
        success: true,
        durationMs: 1234,
        rowCount: 5000,
      };

      collector.recordRefresh(event);

      // Check counter was incremented
      const counterValue = readModelRefreshTotal.get({
        view_name: 'mv_dashboard_lead_summary',
        status: 'success',
      });
      expect(counterValue).toBe(1);

      // Check row count was recorded
      const rowCountValue = readModelRowCount.get({
        view_name: 'mv_dashboard_lead_summary',
      });
      expect(rowCountValue).toBe(5000);

      // Check health was set to 1 (healthy)
      const healthValue = readModelHealth.get({
        view_name: 'mv_dashboard_lead_summary',
      });
      expect(healthValue).toBe(1);
    });

    it('should record a failed refresh with error categorization', () => {
      const event: RefreshMetricEvent = {
        viewName: 'mv_dashboard_daily_metrics',
        success: false,
        durationMs: 5000,
        rowCount: 0,
        errorMessage: 'connection refused: ECONNREFUSED',
      };

      collector.recordRefresh(event);

      // Check failure counter
      const counterValue = readModelRefreshTotal.get({
        view_name: 'mv_dashboard_daily_metrics',
        status: 'failure',
      });
      expect(counterValue).toBe(1);

      // Check error was categorized as connection error
      const errorValue = readModelRefreshErrors.get({
        view_name: 'mv_dashboard_daily_metrics',
        error_type: 'connection',
      });
      expect(errorValue).toBe(1);

      // Check health was set to 0 (error)
      const healthValue = readModelHealth.get({
        view_name: 'mv_dashboard_daily_metrics',
      });
      expect(healthValue).toBe(0);
    });

    it('should categorize timeout errors correctly', () => {
      const event: RefreshMetricEvent = {
        viewName: 'mv_test_view',
        success: false,
        durationMs: 60000,
        rowCount: 0,
        errorMessage: 'query timed out after 60 seconds',
      };

      collector.recordRefresh(event);

      const errorValue = readModelRefreshErrors.get({
        view_name: 'mv_test_view',
        error_type: 'timeout',
      });
      expect(errorValue).toBe(1);
    });

    it('should categorize lock conflict errors correctly', () => {
      const event: RefreshMetricEvent = {
        viewName: 'mv_test_view',
        success: false,
        durationMs: 100,
        rowCount: 0,
        errorMessage: 'could not obtain lock on relation',
      };

      collector.recordRefresh(event);

      const errorValue = readModelRefreshErrors.get({
        view_name: 'mv_test_view',
        error_type: 'lock_conflict',
      });
      expect(errorValue).toBe(1);
    });

    it('should use explicit error type when provided', () => {
      const event: RefreshMetricEvent = {
        viewName: 'mv_test_view',
        success: false,
        durationMs: 100,
        rowCount: 0,
        errorMessage: 'some error',
        errorType: 'query',
      };

      collector.recordRefresh(event);

      const errorValue = readModelRefreshErrors.get({
        view_name: 'mv_test_view',
        error_type: 'query',
      });
      expect(errorValue).toBe(1);
    });
  });

  describe('recordSkippedRefresh', () => {
    it('should record a skipped refresh', () => {
      collector.recordSkippedRefresh('mv_dashboard_lead_summary');

      const counterValue = readModelRefreshTotal.get({
        view_name: 'mv_dashboard_lead_summary',
        status: 'skipped',
      });
      expect(counterValue).toBe(1);
    });
  });

  describe('startRefreshTimer', () => {
    it('should track concurrent refreshes', () => {
      const endTimer = collector.startRefreshTimer('mv_test_view');

      expect(readModelConcurrentRefreshes.get()).toBe(1);

      endTimer();

      expect(readModelConcurrentRefreshes.get()).toBe(0);
    });

    it('should track multiple concurrent refreshes', () => {
      const endTimer1 = collector.startRefreshTimer('mv_view_1');
      const endTimer2 = collector.startRefreshTimer('mv_view_2');

      expect(readModelConcurrentRefreshes.get()).toBe(2);

      endTimer1();
      expect(readModelConcurrentRefreshes.get()).toBe(1);

      endTimer2();
      expect(readModelConcurrentRefreshes.get()).toBe(0);
    });

    it('should return event with duration', async () => {
      const endTimer = collector.startRefreshTimer('mv_test_view');

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));

      const event = endTimer();

      expect(event.viewName).toBe('mv_test_view');
      // Allow tolerance for timer precision variance across environments
      expect(event.durationMs).toBeGreaterThanOrEqual(45);
    });
  });

  describe('updateStalenessMetrics', () => {
    it('should update staleness for all views', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      const metadata: ReadModelMetadataSnapshot[] = [
        {
          viewName: 'mv_stale_view',
          lastRefreshAt: fiveMinutesAgo,
          refreshIntervalMinutes: 1,
          isRefreshing: false,
          lastError: null,
          rowCount: 1000,
        },
        {
          viewName: 'mv_fresh_view',
          lastRefreshAt: oneMinuteAgo,
          refreshIntervalMinutes: 5,
          isRefreshing: false,
          lastError: null,
          rowCount: 500,
        },
      ];

      collector.updateStalenessMetrics(metadata);

      // Check staleness values are set
      const staleViewStaleness = readModelStaleness.get({
        view_name: 'mv_stale_view',
      });
      const freshViewStaleness = readModelStaleness.get({
        view_name: 'mv_fresh_view',
      });

      // Stale view should be around 300 seconds
      expect(staleViewStaleness).toBeGreaterThan(290);
      expect(staleViewStaleness).toBeLessThan(310);

      // Fresh view should be around 60 seconds
      expect(freshViewStaleness).toBeGreaterThan(55);
      expect(freshViewStaleness).toBeLessThan(70);

      // Check refresh intervals
      expect(readModelRefreshInterval.get({ view_name: 'mv_stale_view' })).toBe(60);
      expect(readModelRefreshInterval.get({ view_name: 'mv_fresh_view' })).toBe(300);

      // Check row counts
      expect(readModelRowCount.get({ view_name: 'mv_stale_view' })).toBe(1000);
      expect(readModelRowCount.get({ view_name: 'mv_fresh_view' })).toBe(500);
    });

    it('should mark views with errors as unhealthy', () => {
      const metadata: ReadModelMetadataSnapshot[] = [
        {
          viewName: 'mv_error_view',
          lastRefreshAt: new Date(),
          refreshIntervalMinutes: 5,
          isRefreshing: false,
          lastError: 'Some error occurred',
          rowCount: 0,
        },
      ];

      collector.updateStalenessMetrics(metadata);

      const healthValue = readModelHealth.get({
        view_name: 'mv_error_view',
      });
      expect(healthValue).toBe(0);
    });

    it('should mark stale views as 0.5 health', () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const metadata: ReadModelMetadataSnapshot[] = [
        {
          viewName: 'mv_stale_view',
          lastRefreshAt: tenMinutesAgo,
          refreshIntervalMinutes: 5, // 5 minutes + 60s threshold = 360s expected
          isRefreshing: false,
          lastError: null,
          rowCount: 1000,
        },
      ];

      collector.updateStalenessMetrics(metadata);

      const healthValue = readModelHealth.get({
        view_name: 'mv_stale_view',
      });
      expect(healthValue).toBe(0.5);
    });
  });

  describe('getHealthStatus', () => {
    it('should return "error" for views with errors', () => {
      const metadata: ReadModelMetadataSnapshot = {
        viewName: 'mv_error_view',
        lastRefreshAt: new Date(),
        refreshIntervalMinutes: 5,
        isRefreshing: false,
        lastError: 'Some error',
        rowCount: 0,
      };

      const status = collector.getHealthStatus('mv_error_view', metadata);
      expect(status).toBe('error');
    });

    it('should return "stale" for views that have never refreshed', () => {
      const metadata: ReadModelMetadataSnapshot = {
        viewName: 'mv_new_view',
        lastRefreshAt: null,
        refreshIntervalMinutes: 5,
        isRefreshing: false,
        lastError: null,
        rowCount: 0,
      };

      const status = collector.getHealthStatus('mv_new_view', metadata);
      expect(status).toBe('stale');
    });

    it('should return "healthy" for fresh views', () => {
      const metadata: ReadModelMetadataSnapshot = {
        viewName: 'mv_fresh_view',
        lastRefreshAt: new Date(),
        refreshIntervalMinutes: 5,
        isRefreshing: false,
        lastError: null,
        rowCount: 1000,
      };

      const status = collector.getHealthStatus('mv_fresh_view', metadata);
      expect(status).toBe('healthy');
    });
  });

  describe('setQueueDepth', () => {
    it('should update the queue depth gauge', () => {
      collector.setQueueDepth(5);
      expect(readModelRefreshQueueDepth.get()).toBe(5);

      collector.setQueueDepth(0);
      expect(readModelRefreshQueueDepth.get()).toBe(0);
    });
  });

  describe('setConcurrentRefreshes', () => {
    it('should update the concurrent refreshes gauge', () => {
      collector.setConcurrentRefreshes(3);
      expect(readModelConcurrentRefreshes.get()).toBe(3);

      collector.setConcurrentRefreshes(0);
      expect(readModelConcurrentRefreshes.get()).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should return summary of tracked views', () => {
      // Record some refreshes
      collector.recordRefresh({
        viewName: 'mv_view_1',
        success: true,
        durationMs: 100,
        rowCount: 1000,
      });

      collector.recordRefresh({
        viewName: 'mv_view_2',
        success: true,
        durationMs: 200,
        rowCount: 2000,
      });

      const summary = collector.getSummary();

      expect(summary.views).toHaveLength(2);
      expect(summary.timestamp).toBeInstanceOf(Date);

      const view1 = summary.views.find((v) => v.viewName === 'mv_view_1');
      const view2 = summary.views.find((v) => v.viewName === 'mv_view_2');

      expect(view1).toBeDefined();
      expect(view2).toBeDefined();
      expect(view1?.lastRefreshAt).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('should clear internal state', () => {
      collector.recordRefresh({
        viewName: 'mv_view_1',
        success: true,
        durationMs: 100,
        rowCount: 1000,
      });

      expect(collector.getSummary().views).toHaveLength(1);

      collector.reset();

      expect(collector.getSummary().views).toHaveLength(0);
    });
  });

  describe('factory function', () => {
    it('should create a collector with default config', () => {
      const collector = createReadModelMetricsCollector();
      expect(collector).toBeInstanceOf(ReadModelMetricsCollector);
    });

    it('should create a collector with custom config', () => {
      const collector = createReadModelMetricsCollector({
        staleThresholdSeconds: 120,
        debug: true,
      });
      expect(collector).toBeInstanceOf(ReadModelMetricsCollector);
    });
  });

  describe('Prometheus export', () => {
    it('should export metrics in Prometheus format', () => {
      // Record some metrics
      collector.recordRefresh({
        viewName: 'mv_test_view',
        success: true,
        durationMs: 1500,
        rowCount: 10000,
      });

      collector.setQueueDepth(3);

      const prometheusOutput = globalMetrics.toPrometheusText();

      // Check that our metrics are present
      expect(prometheusOutput).toContain('medicalcor_read_model_refresh_total');
      expect(prometheusOutput).toContain('medicalcor_read_model_row_count');
      expect(prometheusOutput).toContain('medicalcor_read_model_refresh_queue_depth');
    });
  });
});

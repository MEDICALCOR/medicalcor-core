/**
 * @fileoverview Tests for Read Model Refresh Service
 *
 * Tests the refresh service for CQRS read models.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReadModelRefreshService,
  createReadModelRefreshService,
  type ReadModelRefreshServiceConfig,
} from '../ReadModelRefreshService.js';
import type {
  IReadModelRepository,
  ReadModelRefreshResult,
  ReadModelMetadata,
} from '@medicalcor/application';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockRepository(): IReadModelRepository {
  return {
    getLeadSummary: vi.fn(),
    getLeadSummaries: vi.fn(),
    getDailyMetrics: vi.fn(),
    getDailyMetric: vi.fn(),
    getAppointmentSummary: vi.fn(),
    getRevenueSummary: vi.fn(),
    getAgentPerformance: vi.fn(),
    getAgentPerformanceById: vi.fn(),
    getChannelPerformance: vi.fn(),
    getChannelPerformanceByChannel: vi.fn(),
    getDashboardData: vi.fn(),
    getReadModelMetadata: vi.fn().mockResolvedValue([]),
    getReadModelMetadataByName: vi.fn(),
    refreshReadModel: vi.fn().mockResolvedValue({
      viewName: 'test',
      success: true,
      durationMs: 100,
      rowCount: 50,
      errorMessage: null,
    } as ReadModelRefreshResult),
    refreshAllDashboardReadModels: vi.fn().mockResolvedValue([]),
    refreshStaleReadModels: vi.fn().mockResolvedValue([]),
    getStaleReadModels: vi.fn().mockResolvedValue([]),
  };
}

function createMockMetadata(viewName: string, overrides = {}): ReadModelMetadata {
  const now = new Date();
  return {
    viewName,
    lastRefreshAt: now,
    lastRefreshDurationMs: 1000,
    rowCount: 100,
    nextScheduledRefresh: new Date(now.getTime() + 5 * 60 * 1000),
    refreshIntervalMinutes: 5,
    isRefreshing: false,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ReadModelRefreshService', () => {
  let mockRepository: IReadModelRepository;
  let service: ReadModelRefreshService;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = new ReadModelRefreshService({
      repository: mockRepository,
      enableAutoRefresh: false,
      staleCheckIntervalMs: 100,
    });
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await service.stop();
    vi.useRealTimers();
  });

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  describe('start/stop', () => {
    it('should start and stop the service', async () => {
      expect(service.isActive()).toBe(false);

      await service.start();
      expect(service.isActive()).toBe(true);

      await service.stop();
      expect(service.isActive()).toBe(false);
    });

    it('should warn when starting already running service', async () => {
      await service.start();
      await service.start(); // Should not throw, just warn

      expect(service.isActive()).toBe(true);
    });

    it('should do nothing when stopping inactive service', async () => {
      await service.stop(); // Should not throw
      expect(service.isActive()).toBe(false);
    });
  });

  describe('auto refresh', () => {
    it('should refresh stale models on start when autoRefresh enabled', async () => {
      // Use real timers for this test as it involves real async operations
      vi.useRealTimers();

      const autoService = new ReadModelRefreshService({
        repository: mockRepository,
        enableAutoRefresh: true,
        staleCheckIntervalMs: 10000, // High interval to prevent periodic checks during test
      });

      vi.mocked(mockRepository.getStaleReadModels).mockResolvedValue(['mv_dashboard_lead_summary']);
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'mv_dashboard_lead_summary',
        success: true,
        durationMs: 100,
        rowCount: 50,
        errorMessage: null,
      });

      await autoService.start();

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRepository.getStaleReadModels).toHaveBeenCalled();

      await autoService.stop();

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });

    it('should set up periodic refresh when autoRefresh enabled', async () => {
      // Just verify the service starts and sets up without testing the interval
      vi.useRealTimers();

      const autoService = new ReadModelRefreshService({
        repository: mockRepository,
        enableAutoRefresh: true,
        staleCheckIntervalMs: 10000,
      });

      vi.mocked(mockRepository.getStaleReadModels).mockResolvedValue([]);

      await autoService.start();

      expect(autoService.isActive()).toBe(true);

      await autoService.stop();

      vi.useFakeTimers();
    });
  });

  // ==========================================================================
  // REFRESH OPERATIONS
  // ==========================================================================

  describe('refresh', () => {
    it('should refresh a specific read model', async () => {
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'mv_dashboard_lead_summary',
        success: true,
        durationMs: 1500,
        rowCount: 100,
        errorMessage: null,
      });

      const result = await service.refresh('mv_dashboard_lead_summary');

      expect(mockRepository.refreshReadModel).toHaveBeenCalledWith('mv_dashboard_lead_summary');
      expect(result.success).toBe(true);
      expect(result.durationMs).toBe(1500);
    });

    it('should prevent concurrent refresh of same view', async () => {
      // Create a slow-resolving promise
      let resolveRefresh: (value: ReadModelRefreshResult) => void;
      const slowRefresh = new Promise<ReadModelRefreshResult>((resolve) => {
        resolveRefresh = resolve;
      });

      vi.mocked(mockRepository.refreshReadModel).mockReturnValueOnce(slowRefresh);

      // Start first refresh
      const firstRefresh = service.refresh('mv_dashboard_lead_summary');

      // Try to start second refresh immediately
      const secondRefresh = await service.refresh('mv_dashboard_lead_summary');

      // Second should fail with "already in progress"
      expect(secondRefresh.success).toBe(false);
      expect(secondRefresh.errorMessage).toBe('Refresh already in progress');

      // Complete first refresh
      resolveRefresh!({
        viewName: 'mv_dashboard_lead_summary',
        success: true,
        durationMs: 100,
        rowCount: 50,
        errorMessage: null,
      });

      const firstResult = await firstRefresh;
      expect(firstResult.success).toBe(true);
    });
  });

  describe('refreshAll', () => {
    it('should refresh all dashboard read models', async () => {
      const mockResults: ReadModelRefreshResult[] = [
        {
          viewName: 'mv_dashboard_lead_summary',
          success: true,
          durationMs: 1000,
          rowCount: 100,
          errorMessage: null,
        },
        {
          viewName: 'mv_dashboard_daily_metrics',
          success: true,
          durationMs: 2000,
          rowCount: 500,
          errorMessage: null,
        },
      ];
      vi.mocked(mockRepository.refreshAllDashboardReadModels).mockResolvedValue(mockResults);

      const results = await service.refreshAll();

      expect(mockRepository.refreshAllDashboardReadModels).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should update stats for each result', async () => {
      const mockResults: ReadModelRefreshResult[] = [
        { viewName: 'view1', success: true, durationMs: 1000, rowCount: 100, errorMessage: null },
        { viewName: 'view2', success: false, durationMs: 500, rowCount: 0, errorMessage: 'Error' },
      ];
      vi.mocked(mockRepository.refreshAllDashboardReadModels).mockResolvedValue(mockResults);

      await service.refreshAll();

      const stats = service.getStats();
      expect(stats.totalRefreshes).toBe(2);
      expect(stats.successfulRefreshes).toBe(1);
      expect(stats.failedRefreshes).toBe(1);
      expect(stats.lastError).toBe('Error');
    });
  });

  describe('refreshStale', () => {
    it('should refresh stale read models', async () => {
      // Use real timers for this test as it involves async polling
      vi.useRealTimers();

      vi.mocked(mockRepository.getStaleReadModels).mockResolvedValue([
        'mv_dashboard_lead_summary',
        'mv_dashboard_daily_metrics',
      ]);

      vi.mocked(mockRepository.refreshReadModel).mockImplementation((viewName) =>
        Promise.resolve({
          viewName,
          success: true,
          durationMs: 100,
          rowCount: 50,
          errorMessage: null,
        })
      );

      const results = await service.refreshStale();

      expect(mockRepository.getStaleReadModels).toHaveBeenCalled();
      expect(results).toHaveLength(2);

      vi.useFakeTimers();
    });

    it('should return empty array when no stale models', async () => {
      vi.mocked(mockRepository.getStaleReadModels).mockResolvedValue([]);

      const results = await service.refreshStale();

      expect(results).toEqual([]);
    });
  });

  describe('forceRefresh', () => {
    it('should force refresh a specific view', async () => {
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'mv_dashboard_lead_summary',
        success: true,
        durationMs: 100,
        rowCount: 50,
        errorMessage: null,
      });

      const result = await service.forceRefresh('mv_dashboard_lead_summary');

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // MONITORING
  // ==========================================================================

  describe('getStats', () => {
    it('should return refresh statistics', async () => {
      // Perform some refreshes
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'test',
        success: true,
        durationMs: 1000,
        rowCount: 50,
        errorMessage: null,
      });

      await service.refresh('view1');
      await service.refresh('view2');

      const stats = service.getStats();

      expect(stats.totalRefreshes).toBe(2);
      expect(stats.successfulRefreshes).toBe(2);
      expect(stats.failedRefreshes).toBe(0);
      expect(stats.totalDurationMs).toBe(2000);
      expect(stats.avgDurationMs).toBe(1000);
      expect(stats.lastRefreshAt).not.toBeNull();
    });

    it('should track failed refreshes', async () => {
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'test',
        success: false,
        durationMs: 50,
        rowCount: 0,
        errorMessage: 'Connection failed',
      });

      await service.refresh('view1');

      const stats = service.getStats();

      expect(stats.failedRefreshes).toBe(1);
      expect(stats.lastError).toBe('Connection failed');
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      vi.mocked(mockRepository.refreshReadModel).mockResolvedValue({
        viewName: 'test',
        success: true,
        durationMs: 1000,
        rowCount: 50,
        errorMessage: null,
      });

      await service.refresh('view1');
      service.resetStats();

      const stats = service.getStats();

      expect(stats.totalRefreshes).toBe(0);
      expect(stats.successfulRefreshes).toBe(0);
      expect(stats.failedRefreshes).toBe(0);
      expect(stats.totalDurationMs).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.lastRefreshAt).toBeNull();
      expect(stats.lastError).toBeNull();
    });
  });

  describe('getSchedule', () => {
    it('should return refresh schedule', async () => {
      const mockMetadata = [
        createMockMetadata('mv_dashboard_lead_summary'),
        createMockMetadata('mv_dashboard_daily_metrics'),
      ];
      vi.mocked(mockRepository.getReadModelMetadata).mockResolvedValue(mockMetadata);

      const schedule = await service.getSchedule();

      expect(schedule).toHaveLength(2);
      expect(schedule[0]!.viewName).toBe('mv_dashboard_lead_summary');
      expect(schedule[0]!.intervalMinutes).toBe(5);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for all read models', async () => {
      const mockMetadata = [createMockMetadata('mv_dashboard_lead_summary')];
      vi.mocked(mockRepository.getReadModelMetadata).mockResolvedValue(mockMetadata);

      const metadata = await service.getMetadata();

      expect(mockRepository.getReadModelMetadata).toHaveBeenCalled();
      expect(metadata).toHaveLength(1);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when all models are fresh', async () => {
      const now = new Date();
      const mockMetadata = [
        createMockMetadata('mv_dashboard_lead_summary', {
          nextScheduledRefresh: new Date(now.getTime() + 5 * 60 * 1000), // 5 mins from now
          lastError: null,
        }),
      ];
      vi.mocked(mockRepository.getReadModelMetadata).mockResolvedValue(mockMetadata);

      const health = await service.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.staleCount).toBe(0);
      expect(health.errorCount).toBe(0);
      expect(health.details[0]!.status).toBe('healthy');
    });

    it('should detect stale read models', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000); // 10 mins ago
      const mockMetadata = [
        createMockMetadata('mv_dashboard_lead_summary', {
          nextScheduledRefresh: past,
          lastError: null,
        }),
      ];
      vi.mocked(mockRepository.getReadModelMetadata).mockResolvedValue(mockMetadata);

      const health = await service.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.staleCount).toBe(1);
      expect(health.details[0]!.status).toBe('stale');
    });

    it('should detect read models with errors', async () => {
      const mockMetadata = [
        createMockMetadata('mv_dashboard_lead_summary', {
          lastError: 'Connection refused',
        }),
      ];
      vi.mocked(mockRepository.getReadModelMetadata).mockResolvedValue(mockMetadata);

      const health = await service.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.errorCount).toBe(1);
      expect(health.details[0]!.status).toBe('error');
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createReadModelRefreshService', () => {
  it('should create a service instance', () => {
    const mockRepository = createMockRepository();
    const service = createReadModelRefreshService({
      repository: mockRepository,
    });

    expect(service).toBeInstanceOf(ReadModelRefreshService);
  });
});

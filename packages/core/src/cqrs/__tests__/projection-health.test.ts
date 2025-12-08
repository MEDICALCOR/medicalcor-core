/**
 * Projection Health Monitor Tests
 *
 * Tests for projection health monitoring and checkpoint management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProjectionHealthMonitor,
  createProjectionHealthMonitor,
  DEFAULT_PROJECTION_HEALTH_CONFIG,
  type ProjectionHealth,
  type ProjectionHealthConfig,
} from '../projection-health.js';
import type { Pool } from 'pg';

describe('ProjectionHealthMonitor', () => {
  let mockPool: Pool;
  let monitor: ProjectionHealthMonitor;

  beforeEach(() => {
    // Create a minimal mock pool
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    monitor = new ProjectionHealthMonitor(mockPool);
  });

  describe('checkHealth', () => {
    it('should return health status for a projection', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-123',
            last_event_timestamp: new Date('2024-01-01T10:00:00Z'),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '60',
            events_behind: '5',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const health = await monitor.checkHealth('lead-stats');

      expect(health.name).toBe('lead-stats');
      expect(health.lastEventId).toBe('event-123');
      expect(health.eventsProcessed).toBe(1000);
      expect(health.eventsBehind).toBe(5);
      expect(health.lagSeconds).toBe(60);
      expect(health.status).toBe('running');
      expect(health.lastError).toBeNull();
    });

    it('should mark projection as stale when lag exceeds threshold', async () => {
      const config: Partial<ProjectionHealthConfig> = {
        staleThresholdSeconds: 300, // 5 minutes
      };
      monitor = new ProjectionHealthMonitor(mockPool, config);

      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-123',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '600', // 10 minutes
            events_behind: '100',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const health = await monitor.checkHealth('lead-stats');

      expect(health.isStale).toBe(true);
      expect(health.lagSeconds).toBe(600);
    });

    it('should handle projection with no checkpoint (never processed)', async () => {
      const mockQueryResponse = {
        rows: [],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const health = await monitor.checkHealth('new-projection');

      expect(health.name).toBe('new-projection');
      expect(health.lastEventId).toBeNull();
      expect(health.lagSeconds).toBe(Infinity);
      expect(health.isStale).toBe(true);
      expect(health.status).toBe('unknown');
      expect(health.lastError).toContain('checkpoint not found');
    });

    it('should handle projection with error status', async () => {
      const errorTime = new Date('2024-01-01T09:00:00Z');
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-100',
            last_event_timestamp: new Date('2024-01-01T08:00:00Z'),
            events_processed: '500',
            status: 'error',
            last_error: 'Database connection failed',
            last_error_at: errorTime,
            lag_seconds: '3600',
            events_behind: '200',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const health = await monitor.checkHealth('lead-stats');

      expect(health.status).toBe('error');
      expect(health.lastError).toBe('Database connection failed');
      expect(health.lastErrorAt).toEqual(errorTime);
    });

    it('should handle missing projection_checkpoints table', async () => {
      const error = new Error('relation "projection_checkpoints" does not exist');

      vi.mocked(mockPool.query).mockRejectedValue(error);

      const health = await monitor.checkHealth('lead-stats');

      expect(health.status).toBe('unknown');
      expect(health.lastError).toContain('table not found');
    });

    it('should propagate other database errors', async () => {
      const error = new Error('Connection timeout');

      vi.mocked(mockPool.query).mockRejectedValue(error);

      await expect(monitor.checkHealth('lead-stats')).rejects.toThrow('Connection timeout');
    });

    it('should handle null lag_seconds (never processed events)', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: null,
            last_event_timestamp: null,
            events_processed: '0',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: null,
            events_behind: '1000',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const health = await monitor.checkHealth('lead-stats');

      expect(health.lagSeconds).toBe(Infinity);
      expect(health.isStale).toBe(true);
    });
  });

  describe('checkAllProjections', () => {
    it('should return health summary for all projections', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-1',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '60',
            events_behind: '5',
          },
          {
            projection_name: 'patient-activity',
            last_event_id: 'event-2',
            last_event_timestamp: new Date(),
            events_processed: '500',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '30',
            events_behind: '2',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const summary = await monitor.checkAllProjections();

      expect(summary.healthy).toBe(true);
      expect(summary.healthyCount).toBe(2);
      expect(summary.staleCount).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.projections).toHaveLength(2);
    });

    it('should count stale projections correctly', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-1',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '600', // Stale (> 300 default threshold)
            events_behind: '100',
          },
          {
            projection_name: 'patient-activity',
            last_event_id: 'event-2',
            last_event_timestamp: new Date(),
            events_processed: '500',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '30', // Healthy
            events_behind: '2',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const summary = await monitor.checkAllProjections();

      expect(summary.healthy).toBe(false); // Has stale projections
      expect(summary.healthyCount).toBe(1);
      expect(summary.staleCount).toBe(1);
      expect(summary.errorCount).toBe(0);
    });

    it('should count error projections correctly', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-1',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'error',
            last_error: 'Database error',
            last_error_at: new Date(),
            lag_seconds: '60',
            events_behind: '5',
          },
          {
            projection_name: 'patient-activity',
            last_event_id: 'event-2',
            last_event_timestamp: new Date(),
            events_processed: '500',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '30',
            events_behind: '2',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const summary = await monitor.checkAllProjections();

      expect(summary.healthy).toBe(false);
      expect(summary.errorCount).toBe(1);
    });

    it('should handle empty result (no projections)', async () => {
      const mockQueryResponse = {
        rows: [],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const summary = await monitor.checkAllProjections();

      expect(summary.healthy).toBe(true);
      expect(summary.healthyCount).toBe(0);
      expect(summary.staleCount).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.projections).toHaveLength(0);
    });

    it('should handle missing table gracefully', async () => {
      const error = new Error('relation "projection_checkpoints" does not exist');

      vi.mocked(mockPool.query).mockRejectedValue(error);

      const summary = await monitor.checkAllProjections();

      expect(summary.healthy).toBe(true);
      expect(summary.projections).toHaveLength(0);
    });

    it('should propagate other errors', async () => {
      const error = new Error('Network error');

      vi.mocked(mockPool.query).mockRejectedValue(error);

      await expect(monitor.checkAllProjections()).rejects.toThrow('Network error');
    });
  });

  describe('updateCheckpoint', () => {
    it('should update projection checkpoint', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] } as never);

      await monitor.updateCheckpoint(
        'lead-stats',
        'event-123',
        new Date('2024-01-01T10:00:00Z'),
        10
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projection_checkpoints'),
        expect.arrayContaining(['lead-stats', 'event-123'])
      );
    });

    it('should use default value for eventsProcessed', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] } as never);

      await monitor.updateCheckpoint('lead-stats', 'event-123', new Date('2024-01-01T10:00:00Z'));

      const call = vi.mocked(mockPool.query).mock.calls[0];
      expect(call?.[1]).toContain(1); // Default eventsProcessed is 1
    });
  });

  describe('recordError', () => {
    it('should record error for projection', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] } as never);

      await monitor.recordError('lead-stats', 'Processing failed');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'error'"),
        expect.arrayContaining(['lead-stats', 'Processing failed'])
      );
    });
  });

  describe('pauseProjection', () => {
    it('should pause a projection', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] } as never);

      await monitor.pauseProjection('lead-stats');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'paused'"),
        expect.arrayContaining(['lead-stats'])
      );
    });
  });

  describe('resumeProjection', () => {
    it('should resume a paused projection', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({ rows: [] } as never);

      await monitor.resumeProjection('lead-stats');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'running'"),
        expect.arrayContaining(['lead-stats'])
      );
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = monitor.getConfig();

      expect(config.staleThresholdSeconds).toBe(
        DEFAULT_PROJECTION_HEALTH_CONFIG.staleThresholdSeconds
      );
      expect(config.criticalEventsBehind).toBe(
        DEFAULT_PROJECTION_HEALTH_CONFIG.criticalEventsBehind
      );
    });

    it('should return custom configuration', () => {
      const customConfig: Partial<ProjectionHealthConfig> = {
        staleThresholdSeconds: 600,
        criticalEventsBehind: 5000,
      };

      const customMonitor = new ProjectionHealthMonitor(mockPool, customConfig);
      const config = customMonitor.getConfig();

      expect(config.staleThresholdSeconds).toBe(600);
      expect(config.criticalEventsBehind).toBe(5000);
    });

    it('should not allow mutation of internal config', () => {
      const config = monitor.getConfig();
      config.staleThresholdSeconds = 9999;

      const configAgain = monitor.getConfig();
      expect(configAgain.staleThresholdSeconds).toBe(
        DEFAULT_PROJECTION_HEALTH_CONFIG.staleThresholdSeconds
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle projection lifecycle from running to error to recovery', async () => {
      // Initial healthy state
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-100',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '30',
            events_behind: '2',
          },
        ],
      } as never);

      let health = await monitor.checkHealth('lead-stats');
      expect(health.status).toBe('running');
      expect(health.lastError).toBeNull();

      // Record error
      vi.mocked(mockPool.query).mockClear();
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as never);
      await monitor.recordError('lead-stats', 'Database connection lost');

      // Check error state
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-100',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'error',
            last_error: 'Database connection lost',
            last_error_at: new Date(),
            lag_seconds: '300',
            events_behind: '50',
          },
        ],
      } as never);

      health = await monitor.checkHealth('lead-stats');
      expect(health.status).toBe('error');
      expect(health.lastError).toBe('Database connection lost');

      // Resume after fix
      vi.mocked(mockPool.query).mockClear();
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as never);
      await monitor.resumeProjection('lead-stats');

      // Check recovered state
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            projection_name: 'lead-stats',
            last_event_id: 'event-150',
            last_event_timestamp: new Date(),
            events_processed: '1050',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '10',
            events_behind: '1',
          },
        ],
      } as never);

      health = await monitor.checkHealth('lead-stats');
      expect(health.status).toBe('running');
      expect(health.lastError).toBeNull();
    });

    it('should identify projections needing attention', async () => {
      const mockQueryResponse = {
        rows: [
          {
            projection_name: 'healthy-projection',
            last_event_id: 'event-1',
            last_event_timestamp: new Date(),
            events_processed: '1000',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '10',
            events_behind: '1',
          },
          {
            projection_name: 'stale-projection',
            last_event_id: 'event-2',
            last_event_timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
            events_processed: '500',
            status: 'running',
            last_error: null,
            last_error_at: null,
            lag_seconds: '600',
            events_behind: '100',
          },
          {
            projection_name: 'error-projection',
            last_event_id: 'event-3',
            last_event_timestamp: new Date(),
            events_processed: '100',
            status: 'error',
            last_error: 'Failed to process event',
            last_error_at: new Date(),
            lag_seconds: '200',
            events_behind: '50',
          },
          {
            projection_name: 'paused-projection',
            last_event_id: 'event-4',
            last_event_timestamp: new Date(),
            events_processed: '2000',
            status: 'paused',
            last_error: null,
            last_error_at: null,
            lag_seconds: '0',
            events_behind: '0',
          },
        ],
      };

      vi.mocked(mockPool.query).mockResolvedValue(mockQueryResponse as never);

      const summary = await monitor.checkAllProjections();

      const needsAttention = summary.projections.filter((p) => p.isStale || p.status === 'error');

      expect(needsAttention).toHaveLength(2);
      expect(needsAttention.map((p) => p.name)).toContain('stale-projection');
      expect(needsAttention.map((p) => p.name)).toContain('error-projection');
    });
  });
});

describe('Factory Function', () => {
  it('should create ProjectionHealthMonitor with default config', () => {
    const mockPool = {} as Pool;
    const monitor = createProjectionHealthMonitor(mockPool);

    expect(monitor).toBeInstanceOf(ProjectionHealthMonitor);
    expect(monitor.getConfig()).toEqual(DEFAULT_PROJECTION_HEALTH_CONFIG);
  });

  it('should create ProjectionHealthMonitor with custom config', () => {
    const mockPool = {} as Pool;
    const customConfig = {
      staleThresholdSeconds: 600,
    };

    const monitor = createProjectionHealthMonitor(mockPool, customConfig);

    expect(monitor.getConfig().staleThresholdSeconds).toBe(600);
  });
});

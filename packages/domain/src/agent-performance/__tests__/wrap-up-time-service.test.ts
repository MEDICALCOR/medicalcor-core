import { describe, it, expect, beforeEach, vi } from 'vitest';

import type {
  WrapUpEvent,
  WrapUpStats,
  WrapUpTrendPoint,
  AgentWrapUpPerformance,
  WrapUpDashboardData,
  StartWrapUpRequest,
  CompleteWrapUpRequest,
  AgentPerformanceTimeRange,
} from '@medicalcor/types';
import {
  WrapUpTimeService,
  createWrapUpTimeService,
  type IWrapUpTimeRepository,
} from '../wrap-up-time-service.js';

/**
 * Tests for WrapUpTimeService
 *
 * M8: Wrap-Up Time Tracking - Agent productivity metrics
 *
 * Covers:
 * - Starting wrap-up tracking
 * - Completing wrap-up tracking
 * - Retrieving active wrap-ups
 * - Calculating wrap-up statistics
 * - Trend analysis
 * - Dashboard data generation
 * - Stale wrap-up handling
 * - Edge cases
 */

// ============================================================================
// MOCK REPOSITORY
// ============================================================================

function createMockRepository(): IWrapUpTimeRepository {
  return {
    startWrapUp: vi.fn(),
    completeWrapUp: vi.fn(),
    abandonWrapUp: vi.fn(),
    getActiveWrapUp: vi.fn(),
    getWrapUpByCallSid: vi.fn(),
    getWrapUpStats: vi.fn(),
    getWrapUpTrend: vi.fn(),
    getTeamWrapUpStats: vi.fn(),
    getAgentWrapUpPerformance: vi.fn(),
    getWrapUpDashboardData: vi.fn(),
    abandonStaleWrapUps: vi.fn(),
  };
}

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createWrapUpEvent(overrides: Partial<WrapUpEvent> = {}): WrapUpEvent {
  return {
    id: 'wrap-up-123',
    agentId: 'agent-123',
    clinicId: 'clinic-123',
    callSid: 'call-abc123',
    leadId: 'lead-456',
    dispositionId: null,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationSeconds: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createWrapUpStats(overrides: Partial<WrapUpStats> = {}): WrapUpStats {
  return {
    agentId: 'agent-123',
    totalWrapUps: 50,
    completedWrapUps: 45,
    abandonedWrapUps: 5,
    totalWrapUpTimeSeconds: 3000,
    avgWrapUpTimeSeconds: 60,
    minWrapUpTimeSeconds: 30,
    maxWrapUpTimeSeconds: 120,
    periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    periodEnd: new Date().toISOString(),
    ...overrides,
  };
}

function createTrendPoint(
  date: string,
  overrides: Partial<WrapUpTrendPoint> = {}
): WrapUpTrendPoint {
  return {
    date,
    wrapUpCount: 10,
    avgWrapUpTimeSeconds: 60,
    totalWrapUpTimeSeconds: 600,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('WrapUpTimeService', () => {
  let service: WrapUpTimeService;
  let mockRepository: IWrapUpTimeRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    service = createWrapUpTimeService({ repository: mockRepository });
  });

  // ============================================================================
  // STARTING WRAP-UP
  // ============================================================================

  describe('startWrapUp', () => {
    it('should start a new wrap-up tracking session', async () => {
      const request: StartWrapUpRequest = {
        agentId: 'agent-123',
        clinicId: 'clinic-123',
        callSid: 'call-abc123',
        leadId: 'lead-456',
      };

      const expectedEvent = createWrapUpEvent();
      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(null);
      vi.mocked(mockRepository.startWrapUp).mockResolvedValue(expectedEvent);

      const result = await service.startWrapUp(request);

      expect(result).toEqual(expectedEvent);
      expect(mockRepository.startWrapUp).toHaveBeenCalledWith(request);
    });

    it('should abandon existing active wrap-up before starting new one', async () => {
      const request: StartWrapUpRequest = {
        agentId: 'agent-123',
        clinicId: 'clinic-123',
        callSid: 'call-new123',
      };

      const existingWrapUp = createWrapUpEvent({ callSid: 'call-old123' });
      const newWrapUp = createWrapUpEvent({ callSid: 'call-new123' });

      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(existingWrapUp);
      vi.mocked(mockRepository.startWrapUp).mockResolvedValue(newWrapUp);

      await service.startWrapUp(request);

      expect(mockRepository.abandonWrapUp).toHaveBeenCalledWith('call-old123', 'agent-123');
      expect(mockRepository.startWrapUp).toHaveBeenCalledWith(request);
    });
  });

  // ============================================================================
  // COMPLETING WRAP-UP
  // ============================================================================

  describe('completeWrapUp', () => {
    it('should complete wrap-up tracking with disposition', async () => {
      const request: CompleteWrapUpRequest = {
        callSid: 'call-abc123',
        agentId: 'agent-123',
        dispositionId: 'disposition-789',
        notes: 'Follow up scheduled',
      };

      const completedEvent = createWrapUpEvent({
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationSeconds: 45,
        dispositionId: 'disposition-789',
        notes: 'Follow up scheduled',
      });

      vi.mocked(mockRepository.completeWrapUp).mockResolvedValue(completedEvent);

      const result = await service.completeWrapUp(request);

      expect(result).toEqual(completedEvent);
      expect(result?.durationSeconds).toBe(45);
      expect(result?.status).toBe('completed');
    });

    it('should return null if no active wrap-up found', async () => {
      const request: CompleteWrapUpRequest = {
        callSid: 'call-nonexistent',
        agentId: 'agent-123',
      };

      vi.mocked(mockRepository.completeWrapUp).mockResolvedValue(null);

      const result = await service.completeWrapUp(request);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // ACTIVE WRAP-UP QUERIES
  // ============================================================================

  describe('getActiveWrapUp', () => {
    it('should return currently active wrap-up', async () => {
      const activeWrapUp = createWrapUpEvent();
      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(activeWrapUp);

      const result = await service.getActiveWrapUp('agent-123');

      expect(result).toEqual(activeWrapUp);
      expect(mockRepository.getActiveWrapUp).toHaveBeenCalledWith('agent-123');
    });

    it('should return null if no active wrap-up', async () => {
      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(null);

      const result = await service.getActiveWrapUp('agent-123');

      expect(result).toBeNull();
    });
  });

  describe('getCurrentWrapUpDuration', () => {
    it('should calculate current duration for active wrap-up', async () => {
      const startedAt = new Date(Date.now() - 30000); // 30 seconds ago
      const activeWrapUp = createWrapUpEvent({ startedAt: startedAt.toISOString() });
      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(activeWrapUp);

      const result = await service.getCurrentWrapUpDuration('agent-123');

      expect(result).toBeGreaterThanOrEqual(29);
      expect(result).toBeLessThanOrEqual(31);
    });

    it('should return null if no active wrap-up', async () => {
      vi.mocked(mockRepository.getActiveWrapUp).mockResolvedValue(null);

      const result = await service.getCurrentWrapUpDuration('agent-123');

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // STATISTICS
  // ============================================================================

  describe('getAgentWrapUpStats', () => {
    it('should retrieve wrap-up statistics for agent', async () => {
      const stats = createWrapUpStats();
      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);

      const result = await service.getAgentWrapUpStats('agent-123', '30d');

      expect(result).toEqual(stats);
      expect(mockRepository.getWrapUpStats).toHaveBeenCalledWith(
        'agent-123',
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('should respect different time ranges', async () => {
      const stats = createWrapUpStats();
      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);

      await service.getAgentWrapUpStats('agent-123', '7d');
      await service.getAgentWrapUpStats('agent-123', '90d');

      expect(mockRepository.getWrapUpStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAverageWrapUpTime', () => {
    it('should return average wrap-up time in seconds', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 75 });
      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);

      const result = await service.getAverageWrapUpTime('agent-123', '30d');

      expect(result).toBe(75);
    });
  });

  // ============================================================================
  // PERFORMANCE EVALUATION
  // ============================================================================

  describe('evaluateAgentPerformance', () => {
    it('should evaluate agent as meeting target when under threshold', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 45 }); // Under 60s target
      const trend: WrapUpTrendPoint[] = [
        createTrendPoint('2024-01-01', {
          avgWrapUpTimeSeconds: 50,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 500,
        }),
        createTrendPoint('2024-01-02', {
          avgWrapUpTimeSeconds: 45,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 450,
        }),
      ];

      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue(trend);

      const result = await service.evaluateAgentPerformance('agent-123', '30d');

      expect(result.meetsTarget).toBe(true);
      expect(result.avgWrapUpSeconds).toBe(45);
      expect(result.targetSeconds).toBe(60);
    });

    it('should evaluate agent as not meeting target when over threshold', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 90 }); // Over 60s target
      const trend: WrapUpTrendPoint[] = [];

      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue(trend);

      const result = await service.evaluateAgentPerformance('agent-123', '30d');

      expect(result.meetsTarget).toBe(false);
      expect(result.percentOfTarget).toBe(150);
    });

    it('should calculate improving trend when wrap-up time is decreasing', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 50 });
      const trend: WrapUpTrendPoint[] = [
        createTrendPoint('2024-01-01', {
          avgWrapUpTimeSeconds: 70,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 700,
        }),
        createTrendPoint('2024-01-02', {
          avgWrapUpTimeSeconds: 65,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 650,
        }),
        createTrendPoint('2024-01-03', {
          avgWrapUpTimeSeconds: 55,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 550,
        }),
        createTrendPoint('2024-01-04', {
          avgWrapUpTimeSeconds: 50,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 500,
        }),
      ];

      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue(trend);

      const result = await service.evaluateAgentPerformance('agent-123', '30d');

      expect(result.trend).toBe('improving');
    });

    it('should calculate declining trend when wrap-up time is increasing', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 90 });
      const trend: WrapUpTrendPoint[] = [
        createTrendPoint('2024-01-01', {
          avgWrapUpTimeSeconds: 50,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 500,
        }),
        createTrendPoint('2024-01-02', {
          avgWrapUpTimeSeconds: 55,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 550,
        }),
        createTrendPoint('2024-01-03', {
          avgWrapUpTimeSeconds: 75,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 750,
        }),
        createTrendPoint('2024-01-04', {
          avgWrapUpTimeSeconds: 90,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 900,
        }),
      ];

      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue(trend);

      const result = await service.evaluateAgentPerformance('agent-123', '30d');

      expect(result.trend).toBe('declining');
    });

    it('should report stable trend when no significant change', async () => {
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 60 });
      const trend: WrapUpTrendPoint[] = [
        createTrendPoint('2024-01-01', {
          avgWrapUpTimeSeconds: 58,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 580,
        }),
        createTrendPoint('2024-01-02', {
          avgWrapUpTimeSeconds: 62,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 620,
        }),
        createTrendPoint('2024-01-03', {
          avgWrapUpTimeSeconds: 59,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 590,
        }),
        createTrendPoint('2024-01-04', {
          avgWrapUpTimeSeconds: 61,
          wrapUpCount: 10,
          totalWrapUpTimeSeconds: 610,
        }),
      ];

      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue(trend);

      const result = await service.evaluateAgentPerformance('agent-123', '30d');

      expect(result.trend).toBe('stable');
    });
  });

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  describe('getClinicWrapUpPerformance', () => {
    it('should retrieve wrap-up performance for all agents in clinic', async () => {
      const performance: AgentWrapUpPerformance[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          avgWrapUpTimeSeconds: 45,
          totalWrapUps: 100,
          completionRate: 95,
          trend: 'improving',
          comparedToTeamAvg: -10,
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent Two',
          avgWrapUpTimeSeconds: 65,
          totalWrapUps: 80,
          completionRate: 90,
          trend: 'stable',
          comparedToTeamAvg: 10,
        },
      ];

      vi.mocked(mockRepository.getAgentWrapUpPerformance).mockResolvedValue(performance);

      const result = await service.getClinicWrapUpPerformance('clinic-123', '30d');

      expect(result).toHaveLength(2);
      expect(result[0].agentName).toBe('Agent One');
    });
  });

  describe('getWrapUpDashboardData', () => {
    it('should retrieve complete dashboard data', async () => {
      const dashboardData: WrapUpDashboardData = {
        teamAvgWrapUpSeconds: 55,
        teamAvgWrapUpSecondsChange: -5,
        totalWrapUps: 500,
        totalWrapUpTimeSeconds: 27500,
        completionRate: 92,
        agentPerformance: [],
        trend: [],
        topPerformers: [],
        needsImprovement: [],
      };

      vi.mocked(mockRepository.getWrapUpDashboardData).mockResolvedValue(dashboardData);

      const result = await service.getWrapUpDashboardData('clinic-123', '30d');

      expect(result.teamAvgWrapUpSeconds).toBe(55);
      expect(result.teamAvgWrapUpSecondsChange).toBe(-5);
    });
  });

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  describe('abandonStaleWrapUps', () => {
    it('should abandon stale wrap-ups when auto-abandon is enabled', async () => {
      vi.mocked(mockRepository.abandonStaleWrapUps).mockResolvedValue(5);

      const result = await service.abandonStaleWrapUps();

      expect(result).toBe(5);
      expect(mockRepository.abandonStaleWrapUps).toHaveBeenCalledWith(30); // Default max minutes
    });

    it('should not abandon wrap-ups when auto-abandon is disabled', async () => {
      const serviceWithoutAutoAbandon = createWrapUpTimeService(
        { repository: mockRepository },
        { enableAutoAbandon: false }
      );

      const result = await serviceWithoutAutoAbandon.abandonStaleWrapUps();

      expect(result).toBe(0);
      expect(mockRepository.abandonStaleWrapUps).not.toHaveBeenCalled();
    });

    it('should use custom max age when configured', async () => {
      const serviceWithCustomAge = createWrapUpTimeService(
        { repository: mockRepository },
        { maxWrapUpMinutes: 15 }
      );

      vi.mocked(mockRepository.abandonStaleWrapUps).mockResolvedValue(3);

      await serviceWithCustomAge.abandonStaleWrapUps();

      expect(mockRepository.abandonStaleWrapUps).toHaveBeenCalledWith(15);
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('Configuration', () => {
    it('should use default configuration values', async () => {
      const defaultService = createWrapUpTimeService({ repository: mockRepository });

      // Test uses default target of 60 seconds
      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 60 });
      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue([]);

      const result = await defaultService.evaluateAgentPerformance('agent-123');

      expect(result.targetSeconds).toBe(60);
    });

    it('should use custom target wrap-up time', async () => {
      const customService = createWrapUpTimeService(
        { repository: mockRepository },
        { targetWrapUpSeconds: 90 }
      );

      const stats = createWrapUpStats({ avgWrapUpTimeSeconds: 80 });
      vi.mocked(mockRepository.getWrapUpStats).mockResolvedValue(stats);
      vi.mocked(mockRepository.getWrapUpTrend).mockResolvedValue([]);

      const result = await customService.evaluateAgentPerformance('agent-123');

      expect(result.targetSeconds).toBe(90);
      expect(result.meetsTarget).toBe(true); // 80 < 90
    });
  });
});

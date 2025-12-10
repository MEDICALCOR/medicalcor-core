/**
 * @fileoverview Tests for PostgreSQL Wrap-Up Time Repository
 *
 * Tests wrap-up event CRUD operations, statistics, and dashboard data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresWrapUpTimeRepository,
  createWrapUpTimeRepository,
} from '../PostgresWrapUpTimeRepository.js';
import type { Pool } from 'pg';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool(): Pool & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    release: vi.fn(),
  } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

function createMockWrapUpEventRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'event-123',
    agent_id: 'agent-456',
    clinic_id: 'clinic-789',
    call_sid: 'call-abc',
    lead_id: 'lead-def',
    disposition_id: null,
    status: 'in_progress' as const,
    started_at: now,
    completed_at: null,
    duration_seconds: null,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockWrapUpStatsRow(overrides = {}) {
  return {
    total_wrap_ups: 10,
    completed_wrap_ups: 8,
    abandoned_wrap_ups: 2,
    total_wrap_up_time: 1800,
    avg_wrap_up_time: '180.00',
    min_wrap_up_time: 60,
    max_wrap_up_time: 300,
    ...overrides,
  };
}

function createMockWrapUpTrendRow(overrides = {}) {
  return {
    date: '2024-12-01',
    wrap_up_count: 5,
    avg_wrap_up_time_seconds: 150,
    total_wrap_up_time_seconds: 750,
    ...overrides,
  };
}

function createMockAgentPerformanceRow(overrides = {}) {
  return {
    agent_id: 'agent-456',
    agent_name: 'Test Agent',
    avg_wrap_up_seconds: '150',
    total_wrap_ups: 25,
    completion_rate: '90.5',
    compared_to_team_avg: '-5.2',
    ...overrides,
  };
}

function createMockTeamStatsRow(overrides = {}) {
  return {
    total_wrap_ups: 100,
    total_wrap_up_time: 15000,
    team_avg_wrap_up_seconds: '150',
    ...overrides,
  };
}

function createMockCompletionRow(overrides = {}) {
  return {
    completed: '85',
    total: '100',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresWrapUpTimeRepository', () => {
  let mockPool: Pool & { query: ReturnType<typeof vi.fn> };
  let repository: PostgresWrapUpTimeRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = new PostgresWrapUpTimeRepository(mockPool);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // EVENT OPERATIONS
  // ==========================================================================

  describe('startWrapUp', () => {
    it('should abandon existing in-progress wrap-ups and create new one', async () => {
      const mockRow = createMockWrapUpEventRow();
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE existing wrap-ups
        .mockResolvedValueOnce({ rows: [mockRow] }); // INSERT new wrap-up

      const result = await repository.startWrapUp({
        agentId: 'agent-456',
        clinicId: 'clinic-789',
        callSid: 'call-abc',
        leadId: 'lead-def',
      });

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("status = 'abandoned'"),
        ['agent-456']
      );
      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO agent_wrap_up_events'),
        expect.any(Array)
      );
      expect(result.id).toBe('event-123');
      expect(result.status).toBe('in_progress');
    });

    it('should throw error when no row returned', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // INSERT returns nothing

      await expect(
        repository.startWrapUp({
          agentId: 'agent-456',
          clinicId: 'clinic-789',
          callSid: 'call-abc',
        })
      ).rejects.toThrow('Failed to start wrap-up');
    });
  });

  describe('completeWrapUp', () => {
    it('should complete an in-progress wrap-up', async () => {
      const completedRow = createMockWrapUpEventRow({
        status: 'completed',
        completed_at: new Date(),
        duration_seconds: 120,
        disposition_id: 'disp-123',
        notes: 'Call completed successfully',
      });
      mockPool.query
        .mockResolvedValueOnce({ rows: [completedRow] }) // UPDATE wrap-up
        .mockResolvedValueOnce({ rows: [] }); // UPDATE daily metrics

      const result = await repository.completeWrapUp({
        callSid: 'call-abc',
        agentId: 'agent-456',
        dispositionId: 'disp-123',
        notes: 'Call completed successfully',
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.dispositionId).toBe('disp-123');
    });

    it('should return null when wrap-up not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.completeWrapUp({
        callSid: 'nonexistent',
        agentId: 'agent-456',
      });

      expect(result).toBeNull();
    });
  });

  describe('abandonWrapUp', () => {
    it('should abandon an in-progress wrap-up', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await expect(repository.abandonWrapUp('call-abc', 'agent-456')).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("status = 'abandoned'"), [
        'call-abc',
        'agent-456',
      ]);
    });
  });

  describe('getActiveWrapUp', () => {
    it('should find active wrap-up for agent', async () => {
      const mockRow = createMockWrapUpEventRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getActiveWrapUp('agent-456');

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-456');
      expect(result!.status).toBe('in_progress');
    });

    it('should return null when no active wrap-up', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getActiveWrapUp('agent-456');

      expect(result).toBeNull();
    });
  });

  describe('getWrapUpByCallSid', () => {
    it('should find wrap-up by call SID and agent', async () => {
      const mockRow = createMockWrapUpEventRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getWrapUpByCallSid('call-abc', 'agent-456');

      expect(result).not.toBeNull();
      expect(result!.callSid).toBe('call-abc');
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getWrapUpByCallSid('nonexistent', 'agent-456');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  describe('getWrapUpStats', () => {
    it('should get wrap-up statistics for agent', async () => {
      const mockRow = createMockWrapUpStatsRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-10');
      const result = await repository.getWrapUpStats('agent-456', startDate, endDate);

      expect(result.agentId).toBe('agent-456');
      expect(result.totalWrapUps).toBe(10);
      expect(result.completedWrapUps).toBe(8);
      expect(result.abandonedWrapUps).toBe(2);
      expect(result.avgWrapUpTimeSeconds).toBe(180);
    });

    it('should return default stats when no data', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-10');
      const result = await repository.getWrapUpStats('agent-456', startDate, endDate);

      expect(result.totalWrapUps).toBe(0);
      expect(result.completedWrapUps).toBe(0);
      expect(result.avgWrapUpTimeSeconds).toBe(0);
    });
  });

  describe('getWrapUpTrend', () => {
    it('should get wrap-up trend for agent', async () => {
      const mockRows = [
        createMockWrapUpTrendRow({ date: '2024-12-01' }),
        createMockWrapUpTrendRow({ date: '2024-12-02', wrap_up_count: 8 }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getWrapUpTrend('agent-456', '7d');

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBe('2024-12-01');
      expect(result[1]!.wrapUpCount).toBe(8);
    });
  });

  describe('getTeamWrapUpStats', () => {
    it('should get team wrap-up statistics', async () => {
      const mockRow = createMockWrapUpStatsRow({ total_wrap_ups: 50 });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const startDate = new Date('2024-12-01');
      const endDate = new Date('2024-12-10');
      const result = await repository.getTeamWrapUpStats('clinic-789', startDate, endDate);

      expect(result.totalWrapUps).toBe(50);
    });
  });

  // ==========================================================================
  // DASHBOARD DATA
  // ==========================================================================

  describe('getAgentWrapUpPerformance', () => {
    it('should get agent performance comparison', async () => {
      const mockRows = [
        createMockAgentPerformanceRow({ agent_id: 'agent-1', agent_name: 'Agent One' }),
        createMockAgentPerformanceRow({ agent_id: 'agent-2', agent_name: 'Agent Two' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getAgentWrapUpPerformance('clinic-789', '30d');

      expect(result).toHaveLength(2);
      expect(result[0]!.agentId).toBe('agent-1');
      expect(result[0]!.avgWrapUpTimeSeconds).toBe(150);
      expect(result[0]!.completionRate).toBe(90.5);
    });
  });

  describe('getWrapUpDashboardData', () => {
    it('should get comprehensive dashboard data', async () => {
      // Current stats
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockTeamStatsRow()],
      });
      // Previous stats for comparison
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockTeamStatsRow({ team_avg_wrap_up_seconds: '160' })],
      });
      // Completion rate
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockCompletionRow()],
      });
      // Trend
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockWrapUpTrendRow()],
      });
      // Agent performance
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockAgentPerformanceRow({ total_wrap_ups: 10 })],
      });

      const result = await repository.getWrapUpDashboardData('clinic-789', '7d');

      expect(result.teamAvgWrapUpSeconds).toBe(150);
      expect(result.completionRate).toBe(85);
      expect(result.trend).toHaveLength(1);
      expect(result.agentPerformance).toHaveLength(1);
    });

    it('should handle missing data gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [createMockTeamStatsRow()] })
        .mockResolvedValueOnce({ rows: [] }) // No previous stats
        .mockResolvedValueOnce({ rows: [] }) // No completion data
        .mockResolvedValueOnce({ rows: [] }) // No trend
        .mockResolvedValueOnce({ rows: [] }); // No agent data

      const result = await repository.getWrapUpDashboardData('clinic-789', '7d');

      expect(result.teamAvgWrapUpSecondsChange).toBe(0);
      expect(result.completionRate).toBe(100); // Default when no data
    });
  });

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  describe('abandonStaleWrapUps', () => {
    it('should abandon stale wrap-ups older than threshold', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await repository.abandonStaleWrapUps(30);

      expect(result).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'in_progress'"),
        [30]
      );
    });

    it('should return 0 when no stale wrap-ups', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await repository.abandonStaleWrapUps(30);

      expect(result).toBe(0);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createWrapUpTimeRepository', () => {
  it('should create a repository instance', () => {
    const mockPool = createMockPool();
    const repo = createWrapUpTimeRepository(mockPool);

    expect(repo).toBeInstanceOf(PostgresWrapUpTimeRepository);
  });
});

/**
 * @fileoverview Tests for PostgreSQL Agent Performance Repository
 *
 * Tests agent CRUD operations, session management, metrics, and dashboard data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresAgentPerformanceRepository,
  createAgentPerformanceRepository,
} from '../PostgresAgentPerformanceRepository.js';
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

function createMockAgentRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'agent-123',
    clinic_id: 'clinic-456',
    user_id: 'user-789',
    external_id: null,
    name: 'Test Agent',
    email: 'test@example.com',
    phone: '+40721234567',
    avatar_url: null,
    agent_type: 'human',
    role: 'agent',
    skills: ['sales', 'support'],
    languages: ['en', 'ro'],
    max_concurrent_chats: 5,
    status: 'active',
    available: true,
    hired_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockSessionRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'session-123',
    agent_id: 'agent-123',
    clinic_id: 'clinic-456',
    started_at: now,
    ended_at: null,
    status: 'available',
    leads_handled: 5,
    calls_handled: 3,
    messages_sent: 25,
    avg_response_time_ms: 45000,
    total_break_seconds: 900,
    ...overrides,
  };
}

function createMockDailyMetricsRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'metrics-123',
    agent_id: 'agent-123',
    clinic_id: 'clinic-456',
    metric_date: now,
    leads_assigned: 10,
    leads_handled: 8,
    leads_converted: 3,
    leads_lost: 2,
    calls_inbound: 15,
    calls_outbound: 5,
    calls_answered: 18,
    calls_missed: 2,
    total_talk_time_seconds: 3600,
    avg_call_duration_seconds: 180,
    messages_sent: 50,
    messages_received: 45,
    avg_response_time_ms: 30000,
    min_response_time_ms: 5000,
    max_response_time_ms: 120000,
    first_response_time_ms: 15000,
    appointments_scheduled: 4,
    appointments_completed: 3,
    appointments_cancelled: 1,
    escalations: 1,
    handoffs_received: 2,
    handoffs_given: 1,
    csat_responses: 5,
    csat_total_score: 23,
    nps_promoters: 3,
    nps_detractors: 0,
    nps_passives: 2,
    revenue_generated: 15000,
    time_logged_seconds: 28800,
    time_on_break_seconds: 1800,
    time_in_calls_seconds: 3600,
    wrap_up_time_seconds: 600,
    wrap_up_count: 10,
    avg_wrap_up_time_seconds: 60,
    min_wrap_up_time_seconds: 30,
    max_wrap_up_time_seconds: 120,
    ...overrides,
  };
}

function createMockPerformanceSummaryRow(overrides = {}) {
  return {
    id: 'agent-123',
    name: 'Test Agent',
    avatar_url: null,
    agent_type: 'human',
    role: 'agent',
    current_status: 'available',
    leads_handled: 50,
    conversions: 15,
    conversion_rate: '30.0',
    avg_response_time: '2.5',
    satisfaction: '4.5',
    total_calls: 75,
    talk_time_hours: '12.5',
    revenue: '25000',
    active_leads: 8,
    ...overrides,
  };
}

function createMockTrendRow(overrides = {}) {
  return {
    date: '2024-12-01',
    leads_handled: 10,
    conversions: 3,
    conversion_rate: '30.0',
    avg_response_time_min: '2.5',
    satisfaction: '4.5',
    revenue: '5000',
    ...overrides,
  };
}

function createMockDashboardMetricsRow(overrides = {}) {
  return {
    total_agents: '10',
    active_agents: '8',
    total_leads: '500',
    avg_conversion_rate: '28.5',
    avg_response_time: '3.2',
    avg_satisfaction: '4.3',
    total_revenue: '125000',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresAgentPerformanceRepository', () => {
  let mockPool: Pool & { query: ReturnType<typeof vi.fn> };
  let repository: PostgresAgentPerformanceRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = new PostgresAgentPerformanceRepository(mockPool);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // AGENT OPERATIONS
  // ==========================================================================

  describe('getAgent', () => {
    it('should find agent by ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockAgentRow()] });

      const result = await repository.getAgent('agent-123');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM agents'), [
        'agent-123',
      ]);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('agent-123');
      expect(result!.skills).toEqual(['sales', 'support']);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getAgent('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAgents', () => {
    it('should find agents for clinic', async () => {
      const mockRows = [
        createMockAgentRow({ id: 'agent-1' }),
        createMockAgentRow({ id: 'agent-2' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getAgents('clinic-456');

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('clinic_id = $1'), [
        'clinic-456',
      ]);
    });

    it('should filter by agent type', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockAgentRow({ agent_type: 'ai' })] });

      await repository.getAgents('clinic-456', { agentType: 'ai' });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('agent_type = $'), [
        'clinic-456',
        'ai',
      ]);
    });

    it('should filter by status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockAgentRow()] });

      await repository.getAgents('clinic-456', { status: 'active' });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('status = $'), [
        'clinic-456',
        'active',
      ]);
    });

    it('should apply limit and offset', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockAgentRow()] });

      await repository.getAgents('clinic-456', { limit: 10, offset: 20 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 20])
      );
    });
  });

  describe('createAgent', () => {
    it('should create a new agent', async () => {
      const mockRow = createMockAgentRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.createAgent({
        clinicId: 'clinic-456',
        name: 'Test Agent',
        agentType: 'human',
        role: 'agent',
        skills: ['sales'],
        languages: ['en'],
        maxConcurrentChats: 5,
        status: 'active',
        available: true,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        expect.any(Array)
      );
      expect(result.id).toBe('agent-123');
    });

    it('should throw error when insert fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.createAgent({
          clinicId: 'clinic-456',
          name: 'Test',
          agentType: 'human',
          role: 'agent',
          skills: [],
          languages: [],
          maxConcurrentChats: 5,
          status: 'active',
          available: true,
        })
      ).rejects.toThrow('Failed to create agent');
    });
  });

  describe('updateAgent', () => {
    it('should update agent fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        repository.updateAgent('agent-123', { name: 'Updated Name', status: 'inactive' })
      ).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agents SET'),
        expect.any(Array)
      );
    });

    it('should skip update when no valid fields', async () => {
      await repository.updateAgent('agent-123', {});

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SESSION OPERATIONS
  // ==========================================================================

  describe('getActiveSession', () => {
    it('should find active session for agent', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockSessionRow()] });

      const result = await repository.getActiveSession('agent-123');

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-123');
      expect(result!.endedAt).toBeNull();
    });

    it('should return null when no active session', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getActiveSession('agent-123');

      expect(result).toBeNull();
    });
  });

  describe('startSession', () => {
    it('should start a new session', async () => {
      const mockRow = createMockSessionRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.startSession({
        agentId: 'agent-123',
        clinicId: 'clinic-456',
        startedAt: new Date().toISOString(),
        status: 'available',
        endedAt: null,
        leadsHandled: 0,
        callsHandled: 0,
        messagesSent: 0,
        avgResponseTimeMs: null,
        totalBreakSeconds: 0,
      });

      expect(result.id).toBe('session-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_sessions'),
        expect.any(Array)
      );
    });

    it('should throw error when insert fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.startSession({
          agentId: 'agent-123',
          clinicId: 'clinic-456',
          startedAt: new Date().toISOString(),
          status: 'available',
          endedAt: null,
          leadsHandled: 0,
          callsHandled: 0,
          messagesSent: 0,
          avgResponseTimeMs: null,
          totalBreakSeconds: 0,
        })
      ).rejects.toThrow('Failed to start session');
    });
  });

  describe('endSession', () => {
    it('should end a session', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(repository.endSession('session-123')).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ended_at = NOW()'), [
        'session-123',
      ]);
    });
  });

  describe('updateSessionMetrics', () => {
    it('should update session metrics', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        repository.updateSessionMetrics('session-123', {
          leadsHandled: 10,
          callsHandled: 5,
          messagesSent: 50,
          avgResponseTimeMs: 30000,
        })
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // PERFORMANCE METRICS
  // ==========================================================================

  describe('getDailyMetrics', () => {
    it('should get daily metrics for agent', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockDailyMetricsRow()] });

      const result = await repository.getDailyMetrics('agent-123', new Date('2024-12-01'));

      expect(result).not.toBeNull();
      expect(result!.leadsHandled).toBe(8);
      expect(result!.leadsConverted).toBe(3);
      expect(result!.wrapUpCount).toBe(10);
    });

    it('should return null when no metrics', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getDailyMetrics('agent-123', new Date());

      expect(result).toBeNull();
    });
  });

  describe('incrementMetric', () => {
    it('should increment a metric', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        repository.incrementMetric('agent-123', 'clinic-456', 'leadsHandled', 1)
      ).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should skip unknown metrics', async () => {
      await repository.incrementMetric('agent-123', 'clinic-456', 'unknown' as any, 1);

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('updateDailyMetrics', () => {
    it('should update daily metrics', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        repository.updateDailyMetrics('agent-123', 'clinic-456', new Date(), {
          avgResponseTimeMs: 25000,
          revenueGenerated: 10000,
        })
      ).resolves.not.toThrow();
    });

    it('should skip when no valid metrics provided', async () => {
      await repository.updateDailyMetrics('agent-123', 'clinic-456', new Date(), {});

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DASHBOARD DATA
  // ==========================================================================

  describe('getPerformanceSummary', () => {
    it('should get performance summary for all agents', async () => {
      const mockRows = [
        createMockPerformanceSummaryRow({ id: 'agent-1' }),
        createMockPerformanceSummaryRow({ id: 'agent-2' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getPerformanceSummary('clinic-456', '30d');

      expect(result).toHaveLength(2);
      expect(result[0]!.conversionRate).toBe(30);
      expect(result[0]!.satisfaction).toBe(4.5);
    });
  });

  describe('getAgentTrend', () => {
    it('should get trend data for agent', async () => {
      const mockRows = [
        createMockTrendRow({ date: '2024-12-01' }),
        createMockTrendRow({ date: '2024-12-02', leads_handled: 12 }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getAgentTrend('agent-123', '7d');

      expect(result).toHaveLength(2);
      expect(result[0]!.date).toBe('2024-12-01');
      expect(result[1]!.leadsHandled).toBe(12);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should get dashboard metrics with comparison', async () => {
      // Current period
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow()],
      });
      // Previous period
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow({ avg_conversion_rate: '25.0' })],
      });

      const result = await repository.getDashboardMetrics('clinic-456', '30d');

      expect(result.totalAgents).toBe(10);
      expect(result.activeAgents).toBe(8);
      expect(result.avgConversionRate).toBe(28.5);
      expect(result.avgConversionRateChange).toBeCloseTo(14, 0); // (28.5-25)/25 * 100
    });

    it('should handle zero previous values', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow()],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow({ avg_conversion_rate: '0' })],
      });

      const result = await repository.getDashboardMetrics('clinic-456', '30d');

      expect(result.avgConversionRateChange).toBe(0);
    });
  });

  describe('getDashboardData', () => {
    it('should get comprehensive dashboard data', async () => {
      // Dashboard metrics - current
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow()],
      });
      // Dashboard metrics - previous
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockDashboardMetricsRow()],
      });
      // Performance summary
      mockPool.query.mockResolvedValueOnce({
        rows: [createMockPerformanceSummaryRow({ leads_handled: 50 })],
      });
      // Performance over time
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            date: '2024-12-01',
            avg_conversion_rate: '30.0',
            avg_response_time: '2.5',
            total_leads: '10',
          },
        ],
      });

      const result = await repository.getDashboardData('clinic-456', '7d');

      expect(result.metrics).toBeDefined();
      expect(result.agents).toHaveLength(1);
      expect(result.performanceOverTime).toHaveLength(1);
      expect(result.topPerformers).toBeDefined();
      expect(result.needsAttention).toBeDefined();
    });
  });

  // ==========================================================================
  // AGENT STATUS
  // ==========================================================================

  describe('getAgentCurrentStatus', () => {
    it('should get current status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ status: 'available' }] });

      const result = await repository.getAgentCurrentStatus('agent-123');

      expect(result).toBe('available');
    });

    it('should return null when no active session', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getAgentCurrentStatus('agent-123');

      expect(result).toBeNull();
    });
  });

  describe('getActiveAgentCount', () => {
    it('should count active agents', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '8' }] });

      const result = await repository.getActiveAgentCount('clinic-456');

      expect(result).toBe(8);
    });

    it('should return 0 when no active agents', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getActiveAgentCount('clinic-456');

      expect(result).toBe(0);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createAgentPerformanceRepository', () => {
  it('should create a repository instance', () => {
    const mockPool = createMockPool();
    const repo = createAgentPerformanceRepository(mockPool);

    expect(repo).toBeInstanceOf(PostgresAgentPerformanceRepository);
  });
});

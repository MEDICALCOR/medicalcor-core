/**
 * @fileoverview Tests for PostgreSQL Read Model Repository
 *
 * Tests CQRS read model queries for dashboard data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresReadModelRepository,
  createPostgresReadModelRepository,
  type PostgresReadModelRepositoryConfig,
} from '../PostgresReadModelRepository.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool() {
  return {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestRepository(mockPool: ReturnType<typeof createMockPool>) {
  const config: PostgresReadModelRepositoryConfig = {
    connectionString: 'postgresql://mock:mock@localhost/mock',
  };

  const repo = new PostgresReadModelRepository(config);
  (repo as unknown as { pool: ReturnType<typeof createMockPool> }).pool = mockPool;

  return repo;
}

function createMockLeadSummaryRow(overrides = {}) {
  const now = new Date();
  return {
    clinic_id: 'clinic-456',
    total_leads: '150',
    new_leads: '25',
    contacted_leads: '40',
    qualified_leads: '35',
    converted_leads: '45',
    lost_leads: '5',
    hot_leads: '30',
    warm_leads: '50',
    cold_leads: '40',
    unqualified_leads: '30',
    whatsapp_leads: '80',
    voice_leads: '40',
    web_leads: '25',
    referral_leads: '5',
    avg_score: '3.50',
    scored_leads: '120',
    leads_last_7_days: '20',
    leads_last_30_days: '75',
    leads_this_month: '60',
    conversion_rate: '30.00',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockDailyMetricsRow(date: Date, overrides = {}) {
  const now = new Date();
  return {
    clinic_id: 'clinic-456',
    date,
    new_leads: '5',
    hot_leads: '2',
    warm_leads: '2',
    converted_leads: '1',
    lost_leads: '0',
    appointments_scheduled: '3',
    appointments_completed: '4',
    appointments_cancelled: '1',
    messages_received: '15',
    messages_sent: '20',
    payments_count: '2',
    gross_revenue: '5000.00',
    refunds: '0.00',
    net_revenue: '5000.00',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockAppointmentSummaryRow(overrides = {}) {
  const now = new Date();
  return {
    clinic_id: 'clinic-456',
    total_appointments: '500',
    scheduled_count: '50',
    confirmed_count: '30',
    completed_count: '380',
    cancelled_count: '25',
    no_show_count: '15',
    upcoming_count: '80',
    next_24h_count: '8',
    next_7_days_count: '45',
    last_7_days: '35',
    last_30_days: '120',
    show_rate: '96.20',
    cancellation_rate: '5.00',
    avg_daily_appointments: '4.00',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockRevenueSummaryRow(overrides = {}) {
  const now = new Date();
  return {
    clinic_id: 'clinic-456',
    total_cases: '200',
    total_case_value: '1500000.00',
    total_collected: '1200000.00',
    total_outstanding: '300000.00',
    avg_case_value: '7500.00',
    pending_cases: '20',
    in_progress_cases: '50',
    completed_cases: '120',
    cancelled_cases: '10',
    unpaid_cases: '15',
    partial_paid_cases: '45',
    fully_paid_cases: '130',
    revenue_last_7_days: '45000.00',
    revenue_last_30_days: '180000.00',
    revenue_this_month: '150000.00',
    revenue_this_year: '1200000.00',
    collection_rate: '80.00',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockAgentPerformanceRow(agentId: string, overrides = {}) {
  const now = new Date();
  return {
    agent_id: agentId,
    clinic_id: 'clinic-456',
    total_leads_assigned: '50',
    leads_converted: '15',
    leads_lost: '5',
    leads_active: '30',
    conversion_rate: '75.00',
    hot_leads: '10',
    warm_leads: '15',
    cold_leads: '5',
    activity_last_7_days: '12',
    activity_last_30_days: '45',
    avg_lead_score: '3.80',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockChannelPerformanceRow(channel: string, overrides = {}) {
  const now = new Date();
  return {
    clinic_id: 'clinic-456',
    channel,
    total_leads: '80',
    leads_last_30_days: '25',
    avg_score: '3.60',
    hot_leads: '15',
    warm_leads: '30',
    cold_leads: '20',
    unqualified_leads: '15',
    converted_leads: '25',
    conversion_rate: '31.25',
    avg_days_to_qualify: '5.50',
    refreshed_at: now,
    ...overrides,
  };
}

function createMockMetadataRow(viewName: string, overrides = {}) {
  const now = new Date();
  return {
    view_name: viewName,
    last_refresh_at: now,
    last_refresh_duration_ms: 1250,
    row_count: '100',
    next_scheduled_refresh: new Date(now.getTime() + 5 * 60 * 1000),
    refresh_interval_minutes: 5,
    is_refreshing: false,
    last_error: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresReadModelRepository', () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let repository: PostgresReadModelRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = createTestRepository(mockPool);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // LEAD SUMMARY
  // ==========================================================================

  describe('getLeadSummary', () => {
    it('should get lead summary for a clinic', async () => {
      const mockRow = createMockLeadSummaryRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getLeadSummary('clinic-456');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('mv_dashboard_lead_summary'),
        ['clinic-456']
      );
      expect(result).not.toBeNull();
      expect(result!.clinicId).toBe('clinic-456');
      expect(result!.totalLeads).toBe(150);
      expect(result!.conversionRate).toBe(30);
      expect(result!.avgScore).toBe(3.5);
    });

    it('should return null when clinic not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getLeadSummary('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getLeadSummaries', () => {
    it('should get lead summaries for multiple clinics', async () => {
      const mockRows = [
        createMockLeadSummaryRow({ clinic_id: 'clinic-1' }),
        createMockLeadSummaryRow({ clinic_id: 'clinic-2' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getLeadSummaries(['clinic-1', 'clinic-2']);

      expect(result).toHaveLength(2);
      expect(result[0]!.clinicId).toBe('clinic-1');
      expect(result[1]!.clinicId).toBe('clinic-2');
    });

    it('should return empty array for empty input', async () => {
      const result = await repository.getLeadSummaries([]);

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DAILY METRICS
  // ==========================================================================

  describe('getDailyMetrics', () => {
    it('should get daily metrics for date range', async () => {
      const mockRows = [
        createMockDailyMetricsRow(new Date('2024-11-15')),
        createMockDailyMetricsRow(new Date('2024-11-14')),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getDailyMetrics('clinic-456', {
        startDate: new Date('2024-11-01'),
        endDate: new Date('2024-11-30'),
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.newLeads).toBe(5);
      expect(result[0]!.netRevenue).toBe(5000);
    });
  });

  describe('getDailyMetric', () => {
    it('should get metrics for a specific date', async () => {
      const mockRow = createMockDailyMetricsRow(new Date('2024-11-15'));
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getDailyMetric('clinic-456', new Date('2024-11-15'));

      expect(result).not.toBeNull();
      expect(result!.appointmentsScheduled).toBe(3);
    });

    it('should return null when date not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getDailyMetric('clinic-456', new Date('2020-01-01'));

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // APPOINTMENT SUMMARY
  // ==========================================================================

  describe('getAppointmentSummary', () => {
    it('should get appointment summary for a clinic', async () => {
      const mockRow = createMockAppointmentSummaryRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getAppointmentSummary('clinic-456');

      expect(result).not.toBeNull();
      expect(result!.totalAppointments).toBe(500);
      expect(result!.showRate).toBe(96.2);
      expect(result!.upcomingCount).toBe(80);
    });
  });

  // ==========================================================================
  // REVENUE SUMMARY
  // ==========================================================================

  describe('getRevenueSummary', () => {
    it('should get revenue summary for a clinic', async () => {
      const mockRow = createMockRevenueSummaryRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getRevenueSummary('clinic-456');

      expect(result).not.toBeNull();
      expect(result!.totalCases).toBe(200);
      expect(result!.totalCollected).toBe(1200000);
      expect(result!.collectionRate).toBe(80);
    });
  });

  // ==========================================================================
  // AGENT PERFORMANCE
  // ==========================================================================

  describe('getAgentPerformance', () => {
    it('should get agent performance for a clinic', async () => {
      const mockRows = [
        createMockAgentPerformanceRow('agent-1'),
        createMockAgentPerformanceRow('agent-2'),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getAgentPerformance('clinic-456');

      expect(result).toHaveLength(2);
      expect(result[0]!.agentId).toBe('agent-1');
      expect(result[0]!.conversionRate).toBe(75);
    });
  });

  describe('getAgentPerformanceById', () => {
    it('should get performance for a specific agent', async () => {
      const mockRow = createMockAgentPerformanceRow('agent-1');
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getAgentPerformanceById('clinic-456', 'agent-1');

      expect(result).not.toBeNull();
      expect(result!.totalLeadsAssigned).toBe(50);
    });

    it('should return null when agent not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getAgentPerformanceById('clinic-456', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // CHANNEL PERFORMANCE
  // ==========================================================================

  describe('getChannelPerformance', () => {
    it('should get channel performance for a clinic', async () => {
      const mockRows = [
        createMockChannelPerformanceRow('whatsapp'),
        createMockChannelPerformanceRow('voice'),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getChannelPerformance('clinic-456');

      expect(result).toHaveLength(2);
      expect(result[0]!.channel).toBe('whatsapp');
      expect(result[0]!.conversionRate).toBe(31.25);
    });
  });

  describe('getChannelPerformanceByChannel', () => {
    it('should get performance for a specific channel', async () => {
      const mockRow = createMockChannelPerformanceRow('whatsapp');
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getChannelPerformanceByChannel('clinic-456', 'whatsapp');

      expect(result).not.toBeNull();
      expect(result!.totalLeads).toBe(80);
      expect(result!.avgDaysToQualify).toBe(5.5);
    });
  });

  // ==========================================================================
  // COMBINED DASHBOARD DATA
  // ==========================================================================

  describe('getDashboardData', () => {
    it('should get all dashboard data in parallel', async () => {
      const now = new Date();
      mockPool.query
        .mockResolvedValueOnce({ rows: [createMockLeadSummaryRow()] })
        .mockResolvedValueOnce({ rows: [createMockAppointmentSummaryRow()] })
        .mockResolvedValueOnce({ rows: [createMockRevenueSummaryRow()] })
        .mockResolvedValueOnce({
          rows: [createMockDailyMetricsRow(now)],
        })
        .mockResolvedValueOnce({
          rows: [createMockChannelPerformanceRow('whatsapp')],
        });

      const result = await repository.getDashboardData('clinic-456');

      expect(result.leadSummary).not.toBeNull();
      expect(result.appointmentSummary).not.toBeNull();
      expect(result.revenueSummary).not.toBeNull();
      expect(result.dailyMetrics).toHaveLength(1);
      expect(result.channelPerformance).toHaveLength(1);
    });

    it('should use default date range when not provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.getDashboardData('clinic-456');

      // Should have called getDailyMetrics with default 30-day range
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });
  });

  // ==========================================================================
  // READ MODEL MANAGEMENT
  // ==========================================================================

  describe('getReadModelMetadata', () => {
    it('should get metadata for all read models', async () => {
      const mockRows = [
        createMockMetadataRow('mv_dashboard_lead_summary'),
        createMockMetadataRow('mv_dashboard_daily_metrics'),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getReadModelMetadata();

      expect(result).toHaveLength(2);
      expect(result[0]!.viewName).toBe('mv_dashboard_lead_summary');
      expect(result[0]!.refreshIntervalMinutes).toBe(5);
    });
  });

  describe('getReadModelMetadataByName', () => {
    it('should get metadata for a specific view', async () => {
      const mockRow = createMockMetadataRow('mv_dashboard_lead_summary');
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.getReadModelMetadataByName('mv_dashboard_lead_summary');

      expect(result).not.toBeNull();
      expect(result!.lastRefreshDurationMs).toBe(1250);
    });

    it('should return null when view not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getReadModelMetadataByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('refreshReadModel', () => {
    it('should refresh a specific read model', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            success: true,
            duration_ms: 1500,
            row_count: '150',
            error_message: null,
          },
        ],
      });

      const result = await repository.refreshReadModel('mv_dashboard_lead_summary');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('refresh_read_model'), [
        'mv_dashboard_lead_summary',
      ]);
      expect(result.success).toBe(true);
      expect(result.durationMs).toBe(1500);
      expect(result.rowCount).toBe(150);
    });

    it('should handle refresh failure', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            success: false,
            duration_ms: 50,
            row_count: '0',
            error_message: 'Table does not exist',
          },
        ],
      });

      const result = await repository.refreshReadModel('mv_nonexistent');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Table does not exist');
    });

    it('should handle empty result from refresh function', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.refreshReadModel('mv_dashboard_lead_summary');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('No result from refresh function');
    });
  });

  describe('refreshAllDashboardReadModels', () => {
    it('should refresh all dashboard read models', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            view_name: 'mv_dashboard_lead_summary',
            success: true,
            duration_ms: 1000,
            row_count: '100',
            error_message: null,
          },
          {
            view_name: 'mv_dashboard_daily_metrics',
            success: true,
            duration_ms: 2000,
            row_count: '500',
            error_message: null,
          },
        ],
      });

      const result = await repository.refreshAllDashboardReadModels();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('refresh_all_dashboard_read_models')
      );
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.success)).toBe(true);
    });
  });

  describe('refreshStaleReadModels', () => {
    it('should refresh only stale read models', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            view_name: 'mv_dashboard_lead_summary',
            success: true,
            duration_ms: 1000,
            row_count: '100',
            error_message: null,
          },
        ],
      });

      const result = await repository.refreshStaleReadModels();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('refresh_stale_read_models')
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getStaleReadModels', () => {
    it('should get list of stale read models', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { view_name: 'mv_dashboard_lead_summary' },
          { view_name: 'mv_dashboard_daily_metrics' },
        ],
      });

      const result = await repository.getStaleReadModels();

      expect(result).toEqual(['mv_dashboard_lead_summary', 'mv_dashboard_daily_metrics']);
    });
  });

  // ==========================================================================
  // CLOSE
  // ==========================================================================

  describe('close', () => {
    it('should close the pool', async () => {
      await repository.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createPostgresReadModelRepository', () => {
  it('should create a repository instance', () => {
    const repo = createPostgresReadModelRepository({
      connectionString: 'postgresql://test:test@localhost/test',
    });

    expect(repo).toBeInstanceOf(PostgresReadModelRepository);
  });
});

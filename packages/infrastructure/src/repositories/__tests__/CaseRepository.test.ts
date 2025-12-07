/**
 * @fileoverview Tests for CaseRepository Adapter
 *
 * Tests the cohort analysis and trend tracking functionality
 * of the CaseRepository PostgreSQL adapter.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  CaseRepository,
  createCaseRepository,
  type CaseRepositoryConfig,
} from '../CaseRepository.js';

// =============================================================================
// MOCKS
// =============================================================================

const mockQuery = vi.fn<Parameters<Pool['query']>, ReturnType<Pool['query']>>();

const mockPool = {
  query: mockQuery,
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
} as unknown as Pool;

const createMockQueryResult = <T>(rows: T[]): QueryResult<T> => ({
  rows,
  rowCount: rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
});

// =============================================================================
// TEST DATA
// =============================================================================

const CLINIC_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockCohortSummaryRows = [
  {
    clinic_id: CLINIC_ID,
    cohort_month: new Date('2024-03-01'),
    acquisition_source: null,
    acquisition_channel: null,
    cohort_size: 100,
    converted_leads: 35,
    conversion_rate: 35.0,
    total_revenue: 52500,
    total_collected: 45000,
    total_outstanding: 7500,
    avg_ltv: 450,
    avg_ltv_converted: 1285.71,
    total_cases: 42,
    completed_cases: 38,
    avg_cases_per_customer: 1.2,
    avg_days_to_first_case: 14.5,
    max_months_active: 3,
    collection_rate: 85.71,
  },
  {
    clinic_id: CLINIC_ID,
    cohort_month: new Date('2024-02-01'),
    acquisition_source: null,
    acquisition_channel: null,
    cohort_size: 90,
    converted_leads: 30,
    conversion_rate: 33.33,
    total_revenue: 45000,
    total_collected: 40000,
    total_outstanding: 5000,
    avg_ltv: 444.44,
    avg_ltv_converted: 1333.33,
    total_cases: 36,
    completed_cases: 34,
    avg_cases_per_customer: 1.2,
    avg_days_to_first_case: 12.3,
    max_months_active: 4,
    collection_rate: 88.89,
  },
  {
    clinic_id: CLINIC_ID,
    cohort_month: new Date('2024-01-01'),
    acquisition_source: null,
    acquisition_channel: null,
    cohort_size: 85,
    converted_leads: 28,
    conversion_rate: 32.94,
    total_revenue: 42000,
    total_collected: 38000,
    total_outstanding: 4000,
    avg_ltv: 447.06,
    avg_ltv_converted: 1357.14,
    total_cases: 33,
    completed_cases: 31,
    avg_cases_per_customer: 1.18,
    avg_days_to_first_case: 15.8,
    max_months_active: 5,
    collection_rate: 90.48,
  },
  // Previous year cohort for YoY comparison
  {
    clinic_id: CLINIC_ID,
    cohort_month: new Date('2023-03-01'),
    acquisition_source: null,
    acquisition_channel: null,
    cohort_size: 80,
    converted_leads: 24,
    conversion_rate: 30.0,
    total_revenue: 36000,
    total_collected: 32000,
    total_outstanding: 4000,
    avg_ltv: 400,
    avg_ltv_converted: 1333.33,
    total_cases: 28,
    completed_cases: 26,
    avg_cases_per_customer: 1.17,
    avg_days_to_first_case: 18.2,
    max_months_active: 15,
    collection_rate: 88.89,
  },
];

const mockPeriodStatsRows = [
  {
    idx: 0,
    period_start: new Date('2024-03-01'),
    period_end: new Date('2024-03-31'),
    total_cases: 42,
    completed_cases: 38,
    total_value: 52500,
    total_collected: 45000,
    total_outstanding: 7500,
    unique_patients: 100,
    new_patients: 35,
    returning_patients: 15,
    high_value_cases: 8,
    avg_case_value: 1250,
    avg_days_to_payment: 18.5,
    collection_rate: 85.71,
  },
  {
    idx: 1,
    period_start: new Date('2024-02-01'),
    period_end: new Date('2024-02-29'),
    total_cases: 36,
    completed_cases: 34,
    total_value: 45000,
    total_collected: 40000,
    total_outstanding: 5000,
    unique_patients: 90,
    new_patients: 30,
    returning_patients: 12,
    high_value_cases: 6,
    avg_case_value: 1250,
    avg_days_to_payment: 15.2,
    collection_rate: 88.89,
  },
];

// =============================================================================
// TESTS
// =============================================================================

describe('CaseRepository', () => {
  let repository: CaseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new CaseRepository({
      pool: mockPool,
      defaultClinicId: CLINIC_ID,
    });
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(repository).toBeInstanceOf(CaseRepository);
    });

    it('should use default cache TTL when not provided', () => {
      const repo = new CaseRepository({ pool: mockPool });
      expect(repo).toBeInstanceOf(CaseRepository);
    });
  });

  describe('createCaseRepository factory', () => {
    it('should create repository instance', () => {
      const repo = createCaseRepository({ pool: mockPool });
      expect(repo).toBeInstanceOf(CaseRepository);
    });
  });

  describe('getCohortMonthlySummaries', () => {
    it('should return monthly cohort summaries', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows));

      const result = await repository.getCohortMonthlySummaries({
        clinicId: CLINIC_ID,
        limit: 12,
      });

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        clinicId: CLINIC_ID,
        cohortSize: 100,
        convertedLeads: 35,
        conversionRate: 35.0,
        totalRevenue: 52500,
        totalCollected: 45000,
        avgLtv: 450,
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0]?.[1]).toContain(CLINIC_ID);
    });

    it('should handle date range filters', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows.slice(0, 2)));

      const result = await repository.getCohortMonthlySummaries({
        clinicId: CLINIC_ID,
        startMonth: new Date('2024-02-01'),
        endMonth: new Date('2024-03-31'),
        limit: 12,
      });

      expect(result).toHaveLength(2);
    });

    it('should handle acquisition source filter', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.getCohortMonthlySummaries({
        clinicId: CLINIC_ID,
        acquisitionSource: 'whatsapp',
        limit: 12,
      });

      expect(result).toHaveLength(0);
      expect(mockQuery.mock.calls[0]?.[1]).toContain('whatsapp');
    });

    it('should handle empty result', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.getCohortMonthlySummaries({
        clinicId: CLINIC_ID,
        limit: 12,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getCohortComparison', () => {
    it('should return cohort comparisons with MoM and YoY growth', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows));

      const result = await repository.getCohortComparison({
        clinicId: CLINIC_ID,
        limit: 12,
      });

      expect(result).toHaveLength(4);

      // Check first cohort (March 2024)
      const march2024 = result[0]!;
      expect(march2024.cohortMonth).toEqual(new Date('2024-03-01'));
      expect(march2024.avgLtv).toBe(450);

      // Should have MoM comparison with Feb 2024
      expect(march2024.prevCohortAvgLtv).toBe(444.44);
      expect(march2024.ltvGrowthVsPrev).toBeCloseTo(1.25, 1);

      // Should have YoY comparison with March 2023
      expect(march2024.yoyCohortAvgLtv).toBe(400);
      expect(march2024.ltvGrowthYoy).toBeCloseTo(12.5, 1);
    });

    it('should handle missing comparison periods', async () => {
      // Only return current period, no historical data
      mockQuery.mockResolvedValueOnce(createMockQueryResult([mockCohortSummaryRows[0]!]));

      const result = await repository.getCohortComparison({
        clinicId: CLINIC_ID,
        limit: 1,
      });

      expect(result[0]!.prevCohortAvgLtv).toBeNull();
      expect(result[0]!.ltvGrowthVsPrev).toBeNull();
      expect(result[0]!.yoyCohortAvgLtv).toBeNull();
      expect(result[0]!.ltvGrowthYoy).toBeNull();
    });
  });

  describe('getCohortEvolution', () => {
    it('should return cohort evolution data', async () => {
      const evolutionRows = [
        {
          cohort_month: new Date('2024-01-01'),
          cohort_size: 100,
          months_since_acquisition: 0,
          period_revenue: 15000,
          paying_customers: 30,
          cumulative_revenue: 15000,
        },
        {
          cohort_month: new Date('2024-01-01'),
          cohort_size: 100,
          months_since_acquisition: 1,
          period_revenue: 8000,
          paying_customers: 15,
          cumulative_revenue: 23000,
        },
        {
          cohort_month: new Date('2024-01-01'),
          cohort_size: 100,
          months_since_acquisition: 2,
          period_revenue: 5000,
          paying_customers: 10,
          cumulative_revenue: 28000,
        },
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(evolutionRows));

      const result = await repository.getCohortEvolution({
        clinicId: CLINIC_ID,
        cohortMonth: new Date('2024-01-01'),
        maxMonths: 24,
      });

      expect(result.cohortMonth).toEqual(new Date('2024-01-01'));
      expect(result.cohortSize).toBe(100);
      expect(result.dataPoints).toHaveLength(3);
      expect(result.currentLtv).toBe(280); // 28000 / 100
      expect(result.cohortAgeMonths).toBe(2);

      // Check evolution data points
      expect(result.dataPoints[0]!.periodRevenue).toBe(15000);
      expect(result.dataPoints[0]!.cumulativeRevenue).toBe(15000);
      expect(result.dataPoints[2]!.cumulativeRevenue).toBe(28000);
    });

    it('should handle empty cohort', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.getCohortEvolution({
        clinicId: CLINIC_ID,
        cohortMonth: new Date('2024-01-01'),
        maxMonths: 24,
      });

      expect(result.cohortSize).toBe(0);
      expect(result.dataPoints).toEqual([]);
      expect(result.currentLtv).toBeNull();
    });
  });

  describe('getCohortDashboard', () => {
    it('should return complete dashboard data', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows));

      const result = await repository.getCohortDashboard({
        clinicId: CLINIC_ID,
        limit: 12,
        includeBreakdown: false,
      });

      expect(result.cohorts).toHaveLength(4);
      expect(result.sourceBreakdown).toBeUndefined();
      expect(result.summary.totalCohorts).toBe(4);
      expect(result.summary.totalLeads).toBe(355); // 100 + 90 + 85 + 80
      expect(result.summary.overallAvgLtv).toBeCloseTo(435.37, 1);
      expect(result.summary.bestCohortMonth).toEqual(new Date('2024-03-01'));
      expect(result.metadata.lastRefreshed).toBeInstanceOf(Date);
    });

    it('should include source breakdown when requested', async () => {
      // First call for cohorts
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows));
      // Second call for breakdown
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockCohortSummaryRows));

      const result = await repository.getCohortDashboard({
        clinicId: CLINIC_ID,
        limit: 12,
        includeBreakdown: true,
      });

      expect(result.sourceBreakdown).toBeDefined();
      expect(result.sourceBreakdown).toHaveLength(4);
    });
  });

  describe('getMultiPeriodStats', () => {
    it('should return stats for multiple periods', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getMultiPeriodStats(CLINIC_ID, [
        { start: new Date('2024-03-01'), end: new Date('2024-03-31') },
        { start: new Date('2024-02-01'), end: new Date('2024-02-29') },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]!.totalCases).toBe(42);
      expect(result[0]!.totalCollected).toBe(45000);
      expect(result[1]!.totalCases).toBe(36);
    });

    it('should handle empty periods array', async () => {
      const result = await repository.getMultiPeriodStats(CLINIC_ID, []);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('getPeriodStats', () => {
    it('should return stats for a single period', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([mockPeriodStatsRows[0]]));

      const result = await repository.getPeriodStats(
        CLINIC_ID,
        new Date('2024-03-01'),
        new Date('2024-03-31')
      );

      expect(result.totalCases).toBe(42);
      expect(result.completedCases).toBe(38);
      expect(result.totalValue).toBe(52500);
      expect(result.highValueCases).toBe(8);
    });

    it('should return empty stats for period with no data', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await repository.getPeriodStats(
        CLINIC_ID,
        new Date('2020-01-01'),
        new Date('2020-01-31')
      );

      expect(result.totalCases).toBe(0);
      expect(result.totalValue).toBe(0);
    });
  });

  describe('getMoMComparison', () => {
    it('should return MoM comparison data', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getMoMComparison(CLINIC_ID, new Date('2024-03-15'));

      expect(result.currentPeriod.totalCases).toBe(42);
      expect(result.previousPeriod.totalCases).toBe(36);
      expect(result.caseGrowth).toBeCloseTo(16.67, 1);
      expect(result.revenueGrowth).toBeCloseTo(12.5, 1);
    });
  });

  describe('getMoMComparisonRange', () => {
    it('should return MoM comparison for multiple months', async () => {
      const rangeRows = [
        { ...mockPeriodStatsRows[1], idx: 0, period_start: new Date('2024-01-01') }, // Extra for comparison
        { ...mockPeriodStatsRows[1], idx: 1, period_start: new Date('2024-02-01') },
        { ...mockPeriodStatsRows[0], idx: 2, period_start: new Date('2024-03-01') },
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(rangeRows));

      const result = await repository.getMoMComparisonRange(CLINIC_ID, new Date('2024-02-01'), 2);

      expect(result).toHaveLength(2);
      expect(result[0]!.previousPeriod).not.toBeNull();
      expect(result[1]!.revenueGrowth).toBeCloseTo(12.5, 1);
    });
  });

  describe('getYoYComparison', () => {
    it('should return YoY comparison data', async () => {
      const yoyRows = [
        mockPeriodStatsRows[0], // March 2024
        {
          ...mockPeriodStatsRows[1],
          idx: 1,
          period_start: new Date('2023-03-01'),
          total_cases: 28,
          total_collected: 32000,
        }, // March 2023
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(yoyRows));

      const result = await repository.getYoYComparison(CLINIC_ID, new Date('2024-03-15'));

      expect(result.currentPeriod.totalCases).toBe(42);
      expect(result.previousPeriod.totalCases).toBe(28);
      expect(result.caseGrowth).toBeCloseTo(50, 1);
      expect(result.revenueGrowth).toBeCloseTo(40.63, 1);
    });
  });

  describe('getYoYComparisonRange', () => {
    it('should return YoY comparison for multiple months', async () => {
      const rangeRows = [
        // Feb 2024
        { ...mockPeriodStatsRows[1], idx: 0, period_start: new Date('2024-02-01') },
        // Feb 2023 (YoY)
        {
          ...mockPeriodStatsRows[1],
          idx: 1,
          period_start: new Date('2023-02-01'),
          total_cases: 30,
          total_collected: 35000,
        },
        // Mar 2024
        { ...mockPeriodStatsRows[0], idx: 2, period_start: new Date('2024-03-01') },
        // Mar 2023 (YoY)
        {
          ...mockPeriodStatsRows[0],
          idx: 3,
          period_start: new Date('2023-03-01'),
          total_cases: 28,
          total_collected: 32000,
        },
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(rangeRows));

      const result = await repository.getYoYComparisonRange(CLINIC_ID, new Date('2024-02-01'), 2);

      expect(result).toHaveLength(2);
      expect(result[0]!.caseGrowth).toBeCloseTo(20, 1); // 36 vs 30
      expect(result[1]!.caseGrowth).toBeCloseTo(50, 1); // 42 vs 28
    });
  });

  describe('getTrendDashboard', () => {
    it('should return comprehensive trend dashboard', async () => {
      // Mock multiple calls for different trend types
      mockQuery.mockResolvedValue(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getTrendDashboard({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 3,
      });

      expect(result.revenueTrend).toBeDefined();
      expect(result.conversionTrend).toBeDefined();
      expect(result.avgLtvTrend).toBeDefined();
      expect(result.caseVolumeTrend).toBeDefined();
      expect(result.collectionRateTrend).toBeDefined();
      expect(result.periodRange.start).toBeInstanceOf(Date);
      expect(result.periodRange.end).toBeInstanceOf(Date);
      expect(result.lastRefreshed).toBeInstanceOf(Date);
    });
  });

  describe('getRevenueTrend', () => {
    it('should return revenue trend analysis', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      expect(result.periodType).toBe('MoM');
      expect(result.dataPoints).toHaveLength(2);
      expect(result.currentValue).toBe(45000);
      expect(result.previousValue).toBe(40000);
      expect(result.overallDirection).toBe('up');
    });

    it('should identify best and worst periods', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      expect(result.bestPeriod).toBeDefined();
      expect(result.worstPeriod).toBeDefined();
    });
  });

  describe('getCaseVolumeTrend', () => {
    it('should return case volume trend analysis', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getCaseVolumeTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      // Data is returned in chronological order after processing
      // Feb (36) -> Mar (42), so current is 42 (most recent)
      expect(result.currentValue).toBe(42);
      expect(result.dataPoints).toHaveLength(2);
      // First data point is Feb (earlier), second is Mar (later)
      expect(result.dataPoints[0]!.value).toBe(36);
      expect(result.dataPoints[1]!.value).toBe(42);
    });
  });

  describe('getConversionTrend', () => {
    it('should return conversion rate trend', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getConversionTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      expect(result.periodType).toBe('MoM');
      expect(result.dataPoints).toHaveLength(2);
    });
  });

  describe('getAvgLtvTrend', () => {
    it('should return average LTV trend', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getAvgLtvTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      expect(result.periodType).toBe('MoM');
      expect(result.dataPoints).toHaveLength(2);
    });
  });

  describe('trend direction calculation', () => {
    it('should identify "up" trend for positive growth', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      const lastPoint = result.dataPoints[result.dataPoints.length - 1];
      expect(lastPoint!.direction).toBe('up');
    });

    it('should identify "stable" trend for minimal change', async () => {
      const stableRows = [
        { ...mockPeriodStatsRows[0], total_collected: 45000 },
        { ...mockPeriodStatsRows[1], total_collected: 44950 },
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(stableRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'MoM',
        periodCount: 2,
      });

      expect(result.overallDirection).toBe('stable');
    });
  });

  describe('period type handling', () => {
    it('should handle YoY period type', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'YoY',
        periodCount: 2,
      });

      expect(result.periodType).toBe('YoY');
    });

    it('should handle QoQ period type', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult(mockPeriodStatsRows));

      const result = await repository.getRevenueTrend({
        clinicId: CLINIC_ID,
        periodType: 'QoQ',
        periodCount: 2,
      });

      expect(result.periodType).toBe('QoQ');
    });
  });
});

/**
 * Unit Tests: Cohort LTV Analysis Service
 *
 * M7 Tests the cohort-based lifetime value analysis functionality.
 *
 * These tests verify:
 * - Cohort dashboard summary calculation
 * - LTV trend calculation
 * - Cohort evolution tracking
 * - Payback analysis
 * - Segment distribution calculation
 * - Health score calculation
 *
 * @module domain/ltv/__tests__/cohort-analysis.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CohortAnalysisService,
  createCohortAnalysisService,
  type CohortAnalysisDeps,
  type CohortDashboardSummary,
  type CohortEvolution,
  type CohortPaybackAnalysis,
} from '../cohort-analysis-service.js';
import type {
  CohortLTVSummary,
  CohortLTVEvolutionPoint,
  CohortComparison,
} from '../../cases/repositories/CaseRepository.js';

// ============================================================================
// MOCK DEPENDENCIES
// ============================================================================

interface MockCohortAnalysisDeps {
  getCohortLTVSummaries: ReturnType<typeof vi.fn>;
  getCohortComparisons: ReturnType<typeof vi.fn>;
  getCohortLTVEvolution: ReturnType<typeof vi.fn>;
  refreshCohortLTVViews: ReturnType<typeof vi.fn>;
}

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

function createMockCohortComparison(overrides: Partial<CohortComparison> = {}): CohortComparison {
  return {
    clinicId: 'clinic-1',
    cohortMonth: new Date('2024-01-01'),
    cohortSize: 100,
    convertedLeads: 25,
    conversionRate: 25,
    totalCollected: 125000,
    avgLtv: 1250,
    avgLtvConverted: 5000,
    collectionRate: 80,
    avgDaysToFirstCase: 14,
    prevCohortAvgLtv: 1100,
    ltvGrowthVsPrev: 13.6,
    yoyCohortAvgLtv: 900,
    ltvGrowthYoy: 38.9,
    ...overrides,
  };
}

function createMockCohortSummary(overrides: Partial<CohortLTVSummary> = {}): CohortLTVSummary {
  return {
    clinicId: 'clinic-1',
    cohortMonth: new Date('2024-01-01'),
    acquisitionSource: null,
    acquisitionChannel: null,
    cohortSize: 100,
    convertedLeads: 25,
    conversionRate: 25,
    totalRevenue: 150000,
    totalCollected: 125000,
    totalOutstanding: 25000,
    avgLtv: 1250,
    avgLtvConverted: 5000,
    totalCases: 30,
    completedCases: 20,
    avgCasesPerCustomer: 1.2,
    avgDaysToFirstCase: 14,
    maxMonthsActive: 12,
    collectionRate: 83.3,
    ...overrides,
  };
}

function createMockEvolutionPoint(
  monthsSinceAcquisition: number,
  overrides: Partial<CohortLTVEvolutionPoint> = {}
): CohortLTVEvolutionPoint {
  const baseRevenue = 10000 * (monthsSinceAcquisition + 1);
  return {
    clinicId: 'clinic-1',
    cohortMonth: new Date('2024-01-01'),
    monthsSinceAcquisition,
    cohortSize: 100,
    periodRevenue: 10000,
    payingCustomers: 20 - monthsSinceAcquisition,
    cumulativeRevenue: baseRevenue,
    cumulativeLtvPerLead: baseRevenue / 100,
    payingPercentage: 20 - monthsSinceAcquisition,
    ...overrides,
  };
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Cohort Analysis Service', () => {
  let service: CohortAnalysisService;
  let mockDeps: MockCohortAnalysisDeps;

  beforeEach(() => {
    mockDeps = {
      getCohortLTVSummaries: vi.fn(),
      getCohortComparisons: vi.fn(),
      getCohortLTVEvolution: vi.fn(),
      refreshCohortLTVViews: vi.fn(),
    };

    service = createCohortAnalysisService({}, mockDeps as CohortAnalysisDeps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // DASHBOARD SUMMARY TESTS
  // ==========================================================================

  describe('Dashboard Summary Calculation', () => {
    it('should calculate correct summary from cohort data', () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({
          cohortMonth: new Date('2024-03-01'),
          cohortSize: 100,
          convertedLeads: 30,
          totalCollected: 150000,
          avgLtv: 1500,
          ltvGrowthVsPrev: 10,
        }),
        createMockCohortComparison({
          cohortMonth: new Date('2024-02-01'),
          cohortSize: 80,
          convertedLeads: 20,
          totalCollected: 100000,
          avgLtv: 1250,
          ltvGrowthVsPrev: 5,
        }),
        createMockCohortComparison({
          cohortMonth: new Date('2024-01-01'),
          cohortSize: 60,
          convertedLeads: 12,
          totalCollected: 60000,
          avgLtv: 1000,
          ltvGrowthVsPrev: null,
        }),
      ];

      const summary = service.calculateDashboardSummary(cohorts);

      expect(summary.totalCohorts).toBe(3);
      expect(summary.totalLeads).toBe(240); // 100 + 80 + 60
      expect(summary.overallAvgLtv).toBe(1292); // (150000 + 100000 + 60000) / 240
      expect(summary.overallConversionRate).toBe(25.8); // (30 + 20 + 12) / 240 * 100
      expect(summary.bestCohortMonth).toEqual(new Date('2024-03-01'));
      expect(summary.bestCohortLtv).toBe(1500);
      expect(summary.ltvTrend).toBe(7.5); // (10 + 5) / 2
    });

    it('should handle empty cohort array', () => {
      const summary = service.calculateDashboardSummary([]);

      expect(summary.totalCohorts).toBe(0);
      expect(summary.totalLeads).toBe(0);
      expect(summary.overallAvgLtv).toBe(0);
      expect(summary.overallConversionRate).toBe(0);
      expect(summary.bestCohortMonth).toBeNull();
      expect(summary.bestCohortLtv).toBeNull();
      expect(summary.ltvTrend).toBeNull();
    });

    it('should handle cohorts with null LTV', () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({
          cohortMonth: new Date('2024-02-01'),
          avgLtv: null,
          ltvGrowthVsPrev: null,
        }),
        createMockCohortComparison({
          cohortMonth: new Date('2024-01-01'),
          avgLtv: 1000,
          ltvGrowthVsPrev: null,
        }),
      ];

      const summary = service.calculateDashboardSummary(cohorts);

      expect(summary.bestCohortMonth).toEqual(new Date('2024-01-01'));
      expect(summary.bestCohortLtv).toBe(1000);
      expect(summary.ltvTrend).toBeNull();
    });
  });

  // ==========================================================================
  // LTV TREND TESTS
  // ==========================================================================

  describe('LTV Trend Calculation', () => {
    it('should calculate average trend from growth rates', () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({ ltvGrowthVsPrev: 15 }),
        createMockCohortComparison({ ltvGrowthVsPrev: 10 }),
        createMockCohortComparison({ ltvGrowthVsPrev: 5 }),
      ];

      const trend = service.calculateLtvTrend(cohorts);

      expect(trend).toBe(10); // (15 + 10 + 5) / 3
    });

    it('should handle negative growth rates', () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({ ltvGrowthVsPrev: 10 }),
        createMockCohortComparison({ ltvGrowthVsPrev: -5 }),
        createMockCohortComparison({ ltvGrowthVsPrev: -15 }),
      ];

      const trend = service.calculateLtvTrend(cohorts);

      expect(trend).toBe(-3.3); // (10 - 5 - 15) / 3 = -3.33...
    });

    it('should return null when no valid growth rates', () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({ ltvGrowthVsPrev: null }),
        createMockCohortComparison({ ltvGrowthVsPrev: null }),
      ];

      const trend = service.calculateLtvTrend(cohorts);

      expect(trend).toBeNull();
    });
  });

  // ==========================================================================
  // COHORT EVOLUTION TESTS
  // ==========================================================================

  describe('Cohort Evolution', () => {
    it('should fetch and structure evolution data', async () => {
      const evolutionPoints: CohortLTVEvolutionPoint[] = [
        createMockEvolutionPoint(0, { cumulativeRevenue: 10000, cumulativeLtvPerLead: 100 }),
        createMockEvolutionPoint(1, { cumulativeRevenue: 22000, cumulativeLtvPerLead: 220 }),
        createMockEvolutionPoint(2, { cumulativeRevenue: 35000, cumulativeLtvPerLead: 350 }),
        createMockEvolutionPoint(3, { cumulativeRevenue: 45000, cumulativeLtvPerLead: 450 }),
      ];
      mockDeps.getCohortLTVEvolution.mockResolvedValue(evolutionPoints);

      const evolution = await service.getCohortEvolution('clinic-1', new Date('2024-01-01'));

      expect(mockDeps.getCohortLTVEvolution).toHaveBeenCalledWith(
        'clinic-1',
        new Date('2024-01-01'),
        24
      );
      expect(evolution.cohortSize).toBe(100);
      expect(evolution.dataPoints).toHaveLength(4);
      expect(evolution.currentLtv).toBe(450);
      expect(evolution.cohortAgeMonths).toBe(3);
    });

    it('should handle empty evolution data', async () => {
      mockDeps.getCohortLTVEvolution.mockResolvedValue([]);

      const evolution = await service.getCohortEvolution('clinic-1', new Date('2024-01-01'));

      expect(evolution.cohortSize).toBe(0);
      expect(evolution.dataPoints).toHaveLength(0);
      expect(evolution.currentLtv).toBeNull();
      expect(evolution.cohortAgeMonths).toBe(0);
    });

    it('should compare multiple cohort evolutions', async () => {
      const createEvolutionFor = (month: Date) => [
        createMockEvolutionPoint(0, { cohortMonth: month }),
        createMockEvolutionPoint(1, { cohortMonth: month }),
      ];

      mockDeps.getCohortLTVEvolution
        .mockResolvedValueOnce(createEvolutionFor(new Date('2024-01-01')))
        .mockResolvedValueOnce(createEvolutionFor(new Date('2024-02-01')))
        .mockResolvedValueOnce(createEvolutionFor(new Date('2024-03-01')));

      const evolutions = await service.compareCohortEvolutions('clinic-1', [
        new Date('2024-01-01'),
        new Date('2024-02-01'),
        new Date('2024-03-01'),
      ]);

      expect(evolutions).toHaveLength(3);
      expect(mockDeps.getCohortLTVEvolution).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // PAYBACK ANALYSIS TESTS
  // ==========================================================================

  describe('Payback Analysis', () => {
    it('should calculate payback metrics', () => {
      const evolution: CohortEvolution = {
        cohortMonth: new Date('2024-01-01'),
        cohortSize: 100,
        dataPoints: [
          createMockEvolutionPoint(0, { cumulativeLtvPerLead: 50 }),
          createMockEvolutionPoint(1, { cumulativeLtvPerLead: 100 }),
          createMockEvolutionPoint(2, { cumulativeLtvPerLead: 150 }),
          createMockEvolutionPoint(3, { cumulativeLtvPerLead: 200 }),
          createMockEvolutionPoint(6, { cumulativeLtvPerLead: 350 }),
          createMockEvolutionPoint(12, { cumulativeLtvPerLead: 600 }),
        ],
        currentLtv: 600,
        cohortAgeMonths: 12,
      };

      const analysis = service.calculatePaybackAnalysis(evolution, 150);

      expect(analysis.cohortSize).toBe(100);
      expect(analysis.estimatedCac).toBe(150);
      expect(analysis.paybackMonth).toBe(2); // First month where LTV >= 150
      expect(analysis.ltvAt3Months).toBe(200);
      expect(analysis.ltvAt6Months).toBe(350);
      expect(analysis.ltvAt12Months).toBe(600);
      expect(analysis.ltvCacRatio).toBe(4); // 600 / 150
      expect(analysis.isProfitable).toBe(true);
    });

    it('should handle evolution without CAC', () => {
      const evolution: CohortEvolution = {
        cohortMonth: new Date('2024-01-01'),
        cohortSize: 100,
        dataPoints: [
          createMockEvolutionPoint(0, { cumulativeLtvPerLead: 100 }),
          createMockEvolutionPoint(3, { cumulativeLtvPerLead: 300 }),
        ],
        currentLtv: 300,
        cohortAgeMonths: 3,
      };

      const analysis = service.calculatePaybackAnalysis(evolution);

      expect(analysis.paybackMonth).toBeNull();
      expect(analysis.ltvCacRatio).toBeNull();
      expect(analysis.isProfitable).toBeNull();
    });

    it('should detect unprofitable cohort', () => {
      const evolution: CohortEvolution = {
        cohortMonth: new Date('2024-01-01'),
        cohortSize: 100,
        dataPoints: [
          createMockEvolutionPoint(0, { cumulativeLtvPerLead: 20 }),
          createMockEvolutionPoint(3, { cumulativeLtvPerLead: 50 }),
        ],
        currentLtv: 50,
        cohortAgeMonths: 3,
      };

      const analysis = service.calculatePaybackAnalysis(evolution, 100);

      expect(analysis.paybackMonth).toBeNull();
      expect(analysis.ltvCacRatio).toBe(0.5);
      expect(analysis.isProfitable).toBe(false);
    });
  });

  // ==========================================================================
  // SEGMENT DISTRIBUTION TESTS
  // ==========================================================================

  describe('Cohort Segment Distribution', () => {
    it('should calculate segment distribution for cohort', () => {
      const cohortMonth = new Date('2024-01-01');
      const leadLtvs = [
        { leadId: 'lead-1', totalPaid: 1000 }, // Bronze
        { leadId: 'lead-2', totalPaid: 3000 }, // Bronze
        { leadId: 'lead-3', totalPaid: 7000 }, // Silver
        { leadId: 'lead-4', totalPaid: 12000 }, // Silver
        { leadId: 'lead-5', totalPaid: 20000 }, // Gold
        { leadId: 'lead-6', totalPaid: 35000 }, // Platinum
        { leadId: 'lead-7', totalPaid: 60000 }, // Diamond
      ];

      const segments = service.calculateCohortSegments(cohortMonth, leadLtvs);

      expect(segments).toHaveLength(5);

      // Bronze (0-5000)
      expect(segments[0]?.segmentName).toBe('Bronze');
      expect(segments[0]?.customerCount).toBe(2);
      expect(segments[0]?.totalRevenue).toBe(4000);
      expect(segments[0]?.percentageOfCohort).toBe(28.6); // 2/7

      // Silver (5000-15000)
      expect(segments[1]?.segmentName).toBe('Silver');
      expect(segments[1]?.customerCount).toBe(2);
      expect(segments[1]?.totalRevenue).toBe(19000);

      // Gold (15000-30000)
      expect(segments[2]?.segmentName).toBe('Gold');
      expect(segments[2]?.customerCount).toBe(1);

      // Platinum (30000-50000)
      expect(segments[3]?.segmentName).toBe('Platinum');
      expect(segments[3]?.customerCount).toBe(1);

      // Diamond (50000+)
      expect(segments[4]?.segmentName).toBe('Diamond');
      expect(segments[4]?.customerCount).toBe(1);
      expect(segments[4]?.maxLtv).toBeNull();
    });

    it('should handle empty lead array', () => {
      const segments = service.calculateCohortSegments(new Date('2024-01-01'), []);

      expect(segments).toHaveLength(5);
      segments.forEach((segment) => {
        expect(segment.customerCount).toBe(0);
        expect(segment.totalRevenue).toBe(0);
        expect(segment.percentageOfCohort).toBe(0);
      });
    });
  });

  // ==========================================================================
  // HEALTH SCORE TESTS
  // ==========================================================================

  describe('Cohort Health Score', () => {
    it('should calculate high health score for strong cohort', () => {
      const cohort = createMockCohortComparison({
        cohortSize: 100,
        conversionRate: 30,
        collectionRate: 90,
        ltvGrowthVsPrev: 15,
      });

      const score = service.calculateCohortHealthScore(cohort);

      // Conversion: 30/20 * 30 = 45 -> capped at 30
      // Collection: 90/80 * 30 = 33.75 -> capped at 30
      // Growth: (15 + 10) * 2 = 50 -> capped at 20
      // Size: 100+ = 20
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should calculate low health score for weak cohort', () => {
      const cohort = createMockCohortComparison({
        cohortSize: 5,
        conversionRate: 5,
        collectionRate: 40,
        ltvGrowthVsPrev: -20,
      });

      const score = service.calculateCohortHealthScore(cohort);

      expect(score).toBeLessThan(40);
    });

    it('should handle null metrics gracefully', () => {
      const cohort = createMockCohortComparison({
        cohortSize: 50,
        conversionRate: null,
        collectionRate: null,
        ltvGrowthVsPrev: null,
      });

      const score = service.calculateCohortHealthScore(cohort);

      // Only size factor applies
      expect(score).toBe(15);
    });
  });

  // ==========================================================================
  // DASHBOARD INTEGRATION TESTS
  // ==========================================================================

  describe('Dashboard Integration', () => {
    it('should fetch cohort dashboard data', async () => {
      const cohorts: CohortComparison[] = [
        createMockCohortComparison({ cohortMonth: new Date('2024-03-01') }),
        createMockCohortComparison({ cohortMonth: new Date('2024-02-01') }),
        createMockCohortComparison({ cohortMonth: new Date('2024-01-01') }),
      ];
      mockDeps.getCohortComparisons.mockResolvedValue(cohorts);

      const dashboard = await service.getCohortDashboard('clinic-1', {
        limit: 12,
      });

      expect(mockDeps.getCohortComparisons).toHaveBeenCalledWith('clinic-1', {
        limit: 12,
      });
      expect(dashboard.cohorts).toHaveLength(3);
      expect(dashboard.summary.totalCohorts).toBe(3);
      expect(dashboard.sourceBreakdown).toBeUndefined();
    });

    it('should include source breakdown when requested', async () => {
      const cohorts: CohortComparison[] = [createMockCohortComparison()];
      const summaries: CohortLTVSummary[] = [
        createMockCohortSummary({ acquisitionSource: 'facebook' }),
        createMockCohortSummary({ acquisitionSource: 'google' }),
      ];

      mockDeps.getCohortComparisons.mockResolvedValue(cohorts);
      mockDeps.getCohortLTVSummaries.mockResolvedValue(summaries);

      const dashboard = await service.getCohortDashboard('clinic-1', {
        includeBreakdown: true,
      });

      expect(mockDeps.getCohortLTVSummaries).toHaveBeenCalled();
      expect(dashboard.sourceBreakdown).toHaveLength(2);
    });

    it('should throw error when dependencies not configured', async () => {
      const noDepsService = createCohortAnalysisService();

      await expect(noDepsService.getCohortDashboard('clinic-1')).rejects.toThrow(
        'Cohort analysis service dependencies not configured'
      );
    });
  });

  // ==========================================================================
  // VIEW REFRESH TESTS
  // ==========================================================================

  describe('View Refresh', () => {
    it('should call refresh function', async () => {
      mockDeps.refreshCohortLTVViews.mockResolvedValue(undefined);

      await service.refreshViews();

      expect(mockDeps.refreshCohortLTVViews).toHaveBeenCalledTimes(1);
    });

    it('should throw error when dependencies not configured', async () => {
      const noDepsService = createCohortAnalysisService();

      await expect(noDepsService.refreshViews()).rejects.toThrow(
        'Cohort analysis service dependencies not configured'
      );
    });
  });

  // ==========================================================================
  // FACTORY TESTS
  // ==========================================================================

  describe('Service Factory', () => {
    it('should create service with default config', () => {
      const svc = createCohortAnalysisService();
      expect(svc).toBeInstanceOf(CohortAnalysisService);
    });

    it('should create service with custom config', () => {
      const svc = createCohortAnalysisService({
        defaultCohortLimit: 24,
        segmentThresholds: [0, 1000, 5000, 10000],
        segmentNames: ['Starter', 'Basic', 'Pro', 'Enterprise'],
      });
      expect(svc).toBeInstanceOf(CohortAnalysisService);
    });

    it('should create service with dependencies', () => {
      const svc = createCohortAnalysisService({}, mockDeps as CohortAnalysisDeps);
      expect(svc).toBeInstanceOf(CohortAnalysisService);
    });
  });
});

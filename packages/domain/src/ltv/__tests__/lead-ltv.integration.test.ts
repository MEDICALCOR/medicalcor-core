/**
 * Integration Tests: Lead LTV (Lifetime Value) Workflow
 *
 * H1 Tests the complete workflow from Lead creation through conversion
 * to LTV calculation and analytics.
 *
 * These tests verify:
 * - Lead lifecycle to LTV mapping
 * - LTV segment calculation (Bronze, Silver, Gold, Platinum, Diamond)
 * - Average LTV calculations
 * - Monthly growth calculations
 * - Collection rate calculations
 * - Dashboard stats aggregation
 * - Edge cases (zero revenue, empty data, negative growth)
 *
 * @module domain/ltv/__tests__/lead-ltv.integration.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LTVService,
  createLTVService,
  DEFAULT_LTV_SEGMENTS,
  type LTVServiceDeps,
  type LTVDashboardStats,
  type LTVSegment,
} from '../ltv-service.js';
import type {
  LeadLTV,
  MonthlyRevenue,
  CasePipelineSummary,
  PaginatedResult,
} from '../../cases/repositories/CaseRepository.js';

// ============================================================================
// MOCK DEPENDENCIES
// ============================================================================

interface MockLTVServiceDeps {
  getClinicStats: ReturnType<typeof vi.fn>;
  getTopLeadsByLTV: ReturnType<typeof vi.fn>;
  getMonthlyRevenue: ReturnType<typeof vi.fn>;
  getCasePipeline: ReturnType<typeof vi.fn>;
  getLeadsLTV: ReturnType<typeof vi.fn>;
}

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

function createMockLeadLTV(overrides: Partial<LeadLTV> = {}): LeadLTV {
  return {
    leadId: `lead-${Math.random().toString(36).slice(2, 9)}`,
    clinicId: 'clinic-1',
    fullName: 'Test Patient',
    email: 'test@example.com',
    phone: '+40721000001',
    leadCreatedAt: new Date('2024-01-01'),
    totalCases: 2,
    completedCases: 1,
    totalCaseValue: 10000,
    totalPaid: 8000,
    totalOutstanding: 2000,
    avgCaseValue: 5000,
    firstCaseDate: new Date('2024-02-01'),
    lastCaseDate: new Date('2024-06-01'),
    ...overrides,
  };
}

function createMockMonthlyRevenue(
  month: Date,
  overrides: Partial<MonthlyRevenue> = {}
): MonthlyRevenue {
  return {
    month,
    clinicId: 'clinic-1',
    casesWithPayments: 10,
    paymentCount: 15,
    grossRevenue: 50000,
    refunds: 1000,
    netRevenue: 49000,
    avgPaymentAmount: 3267,
    ...overrides,
  };
}

function createMockCasePipeline(
  status: string,
  paymentStatus: string,
  overrides: Partial<CasePipelineSummary> = {}
): CasePipelineSummary {
  return {
    clinicId: 'clinic-1',
    status: status as CasePipelineSummary['status'],
    paymentStatus: paymentStatus as CasePipelineSummary['paymentStatus'],
    caseCount: 5,
    totalValue: 25000,
    paidValue: 20000,
    outstandingValue: 5000,
    avgCaseValue: 5000,
    ...overrides,
  };
}

function createMockDashboardStats(overrides: Partial<LTVDashboardStats> = {}): LTVDashboardStats {
  return {
    totalRevenue: 500000,
    totalOutstanding: 50000,
    avgLTV: 10000,
    totalCases: 100,
    paidCases: 80,
    partialCases: 15,
    monthlyGrowth: 5.5,
    currency: 'EUR',
    ...overrides,
  };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Lead LTV Integration', () => {
  let ltvService: LTVService;
  let mockDeps: MockLTVServiceDeps;

  beforeEach(() => {
    mockDeps = {
      getClinicStats: vi.fn(),
      getTopLeadsByLTV: vi.fn(),
      getMonthlyRevenue: vi.fn(),
      getCasePipeline: vi.fn(),
      getLeadsLTV: vi.fn(),
    };

    ltvService = createLTVService({ currency: 'EUR' }, mockDeps as LTVServiceDeps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SEGMENT CALCULATION TESTS
  // ==========================================================================

  describe('LTV Segment Calculation', () => {
    it('should calculate correct segments with default thresholds', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ leadId: 'lead-1', totalPaid: 2000 }), // Bronze (0-5000)
        createMockLeadLTV({ leadId: 'lead-2', totalPaid: 4500 }), // Bronze
        createMockLeadLTV({ leadId: 'lead-3', totalPaid: 7000 }), // Silver (5000-15000)
        createMockLeadLTV({ leadId: 'lead-4', totalPaid: 12000 }), // Silver
        createMockLeadLTV({ leadId: 'lead-5', totalPaid: 20000 }), // Gold (15000-30000)
        createMockLeadLTV({ leadId: 'lead-6', totalPaid: 35000 }), // Platinum (30000-50000)
        createMockLeadLTV({ leadId: 'lead-7', totalPaid: 60000 }), // Diamond (50000+)
      ];

      const segments = ltvService.calculateSegments(leads);

      expect(segments).toHaveLength(5);

      // Bronze segment (0-5000)
      expect(segments[0]?.name).toBe('Bronze');
      expect(segments[0]?.customerCount).toBe(2);
      expect(segments[0]?.totalRevenue).toBe(6500); // 2000 + 4500
      expect(segments[0]?.minLTV).toBe(0);
      expect(segments[0]?.maxLTV).toBe(5000);

      // Silver segment (5000-15000)
      expect(segments[1]?.name).toBe('Silver');
      expect(segments[1]?.customerCount).toBe(2);
      expect(segments[1]?.totalRevenue).toBe(19000); // 7000 + 12000

      // Gold segment (15000-30000)
      expect(segments[2]?.name).toBe('Gold');
      expect(segments[2]?.customerCount).toBe(1);
      expect(segments[2]?.totalRevenue).toBe(20000);

      // Platinum segment (30000-50000)
      expect(segments[3]?.name).toBe('Platinum');
      expect(segments[3]?.customerCount).toBe(1);
      expect(segments[3]?.totalRevenue).toBe(35000);

      // Diamond segment (50000+)
      expect(segments[4]?.name).toBe('Diamond');
      expect(segments[4]?.customerCount).toBe(1);
      expect(segments[4]?.totalRevenue).toBe(60000);
      expect(segments[4]?.maxLTV).toBeNull(); // No upper bound
    });

    it('should calculate correct percentages', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 1000 }), // Bronze
        createMockLeadLTV({ totalPaid: 2000 }), // Bronze
        createMockLeadLTV({ totalPaid: 3000 }), // Bronze
        createMockLeadLTV({ totalPaid: 8000 }), // Silver
      ];

      const segments = ltvService.calculateSegments(leads);

      // 3 out of 4 are Bronze = 75%
      expect(segments[0]?.percentageOfCustomers).toBe(75);
      // 1 out of 4 is Silver = 25%
      expect(segments[1]?.percentageOfCustomers).toBe(25);
    });

    it('should handle empty leads array', () => {
      const segments = ltvService.calculateSegments([]);

      expect(segments).toHaveLength(5);
      segments.forEach((segment) => {
        expect(segment.customerCount).toBe(0);
        expect(segment.totalRevenue).toBe(0);
        expect(segment.percentageOfCustomers).toBe(0);
      });
    });

    it('should handle leads at exact threshold boundaries', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 5000 }), // Exactly at Silver threshold
        createMockLeadLTV({ totalPaid: 15000 }), // Exactly at Gold threshold
        createMockLeadLTV({ totalPaid: 30000 }), // Exactly at Platinum threshold
        createMockLeadLTV({ totalPaid: 50000 }), // Exactly at Diamond threshold
      ];

      const segments = ltvService.calculateSegments(leads);

      // Boundaries are inclusive on lower end, exclusive on upper
      expect(segments[0]?.customerCount).toBe(0); // Bronze: 0 <= x < 5000
      expect(segments[1]?.customerCount).toBe(1); // Silver: 5000 <= x < 15000
      expect(segments[2]?.customerCount).toBe(1); // Gold: 15000 <= x < 30000
      expect(segments[3]?.customerCount).toBe(1); // Platinum: 30000 <= x < 50000
      expect(segments[4]?.customerCount).toBe(1); // Diamond: 50000+
    });

    it('should use custom segment thresholds', () => {
      const customService = createLTVService({
        currency: 'EUR',
        segmentThresholds: [0, 1000, 5000, 10000],
      });

      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 500 }), // Tier 1
        createMockLeadLTV({ totalPaid: 2000 }), // Tier 2
        createMockLeadLTV({ totalPaid: 7000 }), // Tier 3
        createMockLeadLTV({ totalPaid: 15000 }), // Tier 4 (above last threshold)
      ];

      const segments = customService.calculateSegments(leads);

      expect(segments).toHaveLength(4);
      expect(segments[0]?.customerCount).toBe(1); // 0-1000
      expect(segments[1]?.customerCount).toBe(1); // 1000-5000
      expect(segments[2]?.customerCount).toBe(1); // 5000-10000
      expect(segments[3]?.customerCount).toBe(1); // 10000+
    });
  });

  // ==========================================================================
  // AVERAGE LTV CALCULATION TESTS
  // ==========================================================================

  describe('Average LTV Calculation', () => {
    it('should calculate correct average LTV', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 10000 }),
        createMockLeadLTV({ totalPaid: 20000 }),
        createMockLeadLTV({ totalPaid: 30000 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);

      expect(avgLTV).toBe(20000); // (10000 + 20000 + 30000) / 3
    });

    it('should return 0 for empty leads', () => {
      const avgLTV = ltvService.calculateAvgLTV([]);
      expect(avgLTV).toBe(0);
    });

    it('should round average to nearest integer', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 1000 }),
        createMockLeadLTV({ totalPaid: 2000 }),
        createMockLeadLTV({ totalPaid: 3000 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);
      expect(avgLTV).toBe(2000); // Exactly 2000

      // Test rounding
      const leadsForRounding: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 1000 }),
        createMockLeadLTV({ totalPaid: 1001 }),
      ];
      const roundedAvg = ltvService.calculateAvgLTV(leadsForRounding);
      expect(roundedAvg).toBe(1001); // 1000.5 rounds to 1001
    });

    it('should handle single lead', () => {
      const leads: LeadLTV[] = [createMockLeadLTV({ totalPaid: 5000 })];
      const avgLTV = ltvService.calculateAvgLTV(leads);
      expect(avgLTV).toBe(5000);
    });

    it('should handle zero-value leads', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 0 }),
        createMockLeadLTV({ totalPaid: 0 }),
        createMockLeadLTV({ totalPaid: 3000 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);
      expect(avgLTV).toBe(1000); // (0 + 0 + 3000) / 3
    });
  });

  // ==========================================================================
  // MONTHLY GROWTH CALCULATION TESTS
  // ==========================================================================

  describe('Monthly Growth Calculation', () => {
    it('should calculate positive month-over-month growth', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 50000 }),
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 55000 }),
      ];

      const growth = ltvService.calculateMonthlyGrowth(revenueData);

      expect(growth).toBe(10); // (55000 - 50000) / 50000 * 100 = 10%
    });

    it('should calculate negative month-over-month growth', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 50000 }),
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 45000 }),
      ];

      const growth = ltvService.calculateMonthlyGrowth(revenueData);

      expect(growth).toBe(-10); // (45000 - 50000) / 50000 * 100 = -10%
    });

    it('should return 0 for insufficient data', () => {
      const singleMonth: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 50000 }),
      ];

      expect(ltvService.calculateMonthlyGrowth(singleMonth)).toBe(0);
      expect(ltvService.calculateMonthlyGrowth([])).toBe(0);
    });

    it('should return 0 when previous month revenue is 0', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 0 }),
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 50000 }),
      ];

      const growth = ltvService.calculateMonthlyGrowth(revenueData);
      expect(growth).toBe(0); // Cannot divide by 0
    });

    it('should sort data by date and use most recent months', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-04-01'), { netRevenue: 40000 }),
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 60000 }),
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 50000 }),
      ];

      const growth = ltvService.calculateMonthlyGrowth(revenueData);

      // Should compare June (60000) vs May (50000), not other months
      expect(growth).toBe(20); // (60000 - 50000) / 50000 * 100 = 20%
    });

    it('should round growth percentage to one decimal place', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 30000 }),
        createMockMonthlyRevenue(new Date('2024-06-01'), { netRevenue: 35000 }),
      ];

      const growth = ltvService.calculateMonthlyGrowth(revenueData);

      // (35000 - 30000) / 30000 * 100 = 16.666...% -> 16.7%
      expect(growth).toBe(16.7);
    });
  });

  // ==========================================================================
  // COLLECTION RATE CALCULATION TESTS
  // ==========================================================================

  describe('Collection Rate Calculation', () => {
    it('should calculate correct collection rate', () => {
      const pipeline: CasePipelineSummary[] = [
        createMockCasePipeline('active', 'paid', { totalValue: 100000, paidValue: 80000 }),
        createMockCasePipeline('active', 'partial', { totalValue: 50000, paidValue: 25000 }),
      ];

      const rate = ltvService.calculateCollectionRate(pipeline);

      // (80000 + 25000) / (100000 + 50000) * 100 = 70%
      expect(rate).toBe(70);
    });

    it('should return 0 for empty pipeline', () => {
      const rate = ltvService.calculateCollectionRate([]);
      expect(rate).toBe(0);
    });

    it('should return 0 when total value is 0', () => {
      const pipeline: CasePipelineSummary[] = [
        createMockCasePipeline('active', 'unpaid', { totalValue: 0, paidValue: 0 }),
      ];

      const rate = ltvService.calculateCollectionRate(pipeline);
      expect(rate).toBe(0);
    });

    it('should return 100% when fully collected', () => {
      const pipeline: CasePipelineSummary[] = [
        createMockCasePipeline('completed', 'paid', { totalValue: 50000, paidValue: 50000 }),
      ];

      const rate = ltvService.calculateCollectionRate(pipeline);
      expect(rate).toBe(100);
    });
  });

  // ==========================================================================
  // DASHBOARD STATS TESTS
  // ==========================================================================

  describe('Dashboard Stats', () => {
    it('should fetch dashboard stats from dependencies', async () => {
      const mockStats = createMockDashboardStats();
      mockDeps.getClinicStats.mockResolvedValue(mockStats);

      const stats = await ltvService.getDashboardStats('clinic-1');

      expect(mockDeps.getClinicStats).toHaveBeenCalledWith('clinic-1');
      expect(stats).toEqual(mockStats);
    });

    it('should throw error when dependencies not configured', async () => {
      const noDepsService = createLTVService({ currency: 'EUR' });

      await expect(noDepsService.getDashboardStats('clinic-1')).rejects.toThrow(
        'LTV service dependencies not configured'
      );
    });
  });

  // ==========================================================================
  // TOP CUSTOMERS TESTS
  // ==========================================================================

  describe('Top Customers', () => {
    it('should fetch top customers by LTV', async () => {
      const mockLeads: LeadLTV[] = [
        createMockLeadLTV({ leadId: 'lead-1', totalPaid: 100000 }),
        createMockLeadLTV({ leadId: 'lead-2', totalPaid: 80000 }),
        createMockLeadLTV({ leadId: 'lead-3', totalPaid: 60000 }),
      ];
      mockDeps.getTopLeadsByLTV.mockResolvedValue(mockLeads);

      const topCustomers = await ltvService.getTopCustomers('clinic-1', 10);

      expect(mockDeps.getTopLeadsByLTV).toHaveBeenCalledWith('clinic-1', 10);
      expect(topCustomers).toHaveLength(3);
      expect(topCustomers[0]?.totalPaid).toBe(100000);
    });

    it('should use default limit of 10', async () => {
      mockDeps.getTopLeadsByLTV.mockResolvedValue([]);

      await ltvService.getTopCustomers('clinic-1');

      expect(mockDeps.getTopLeadsByLTV).toHaveBeenCalledWith('clinic-1', 10);
    });
  });

  // ==========================================================================
  // REVENUE TREND TESTS
  // ==========================================================================

  describe('Revenue Trend', () => {
    it('should fetch monthly revenue trend', async () => {
      const mockRevenue: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-01-01'), { netRevenue: 40000 }),
        createMockMonthlyRevenue(new Date('2024-02-01'), { netRevenue: 45000 }),
        createMockMonthlyRevenue(new Date('2024-03-01'), { netRevenue: 50000 }),
      ];
      mockDeps.getMonthlyRevenue.mockResolvedValue(mockRevenue);

      const trend = await ltvService.getRevenueTrend('clinic-1', 6);

      expect(mockDeps.getMonthlyRevenue).toHaveBeenCalledWith('clinic-1', 6);
      expect(trend).toHaveLength(3);
    });

    it('should use default of 6 months', async () => {
      mockDeps.getMonthlyRevenue.mockResolvedValue([]);

      await ltvService.getRevenueTrend('clinic-1');

      expect(mockDeps.getMonthlyRevenue).toHaveBeenCalledWith('clinic-1', 6);
    });
  });

  // ==========================================================================
  // CASE PIPELINE TESTS
  // ==========================================================================

  describe('Case Pipeline', () => {
    it('should fetch case pipeline breakdown', async () => {
      const mockPipeline: CasePipelineSummary[] = [
        createMockCasePipeline('active', 'paid', { caseCount: 30 }),
        createMockCasePipeline('active', 'partial', { caseCount: 20 }),
        createMockCasePipeline('completed', 'paid', { caseCount: 50 }),
      ];
      mockDeps.getCasePipeline.mockResolvedValue(mockPipeline);

      const pipeline = await ltvService.getCasePipeline('clinic-1');

      expect(mockDeps.getCasePipeline).toHaveBeenCalledWith('clinic-1');
      expect(pipeline).toHaveLength(3);
    });
  });

  // ==========================================================================
  // CUSTOMER SEGMENTS ASYNC TESTS
  // ==========================================================================

  describe('Customer Segments (Async)', () => {
    it('should fetch and calculate customer segments', async () => {
      const mockResult: PaginatedResult<LeadLTV> = {
        data: [
          createMockLeadLTV({ totalPaid: 3000 }), // Bronze
          createMockLeadLTV({ totalPaid: 8000 }), // Silver
          createMockLeadLTV({ totalPaid: 20000 }), // Gold
        ],
        total: 3,
        limit: 10000,
        offset: 0,
        hasMore: false,
      };
      mockDeps.getLeadsLTV.mockResolvedValue(mockResult);

      const segments = await ltvService.getCustomerSegments('clinic-1');

      expect(mockDeps.getLeadsLTV).toHaveBeenCalledWith('clinic-1', { limit: 10000 });
      expect(segments).toHaveLength(5);
      expect(segments[0]?.customerCount).toBe(1); // Bronze
      expect(segments[1]?.customerCount).toBe(1); // Silver
      expect(segments[2]?.customerCount).toBe(1); // Gold
    });
  });

  // ==========================================================================
  // LEAD LIFECYCLE TO LTV FLOW TESTS
  // ==========================================================================

  describe('Lead Lifecycle to LTV Flow', () => {
    it('should track LTV from lead creation through conversion', async () => {
      // Simulate lead lifecycle: Create → Score → Qualify → Convert → Pay → LTV
      const clinicId = 'clinic-1';
      const leadId = 'lead-converted';

      // Step 1: Lead created with initial engagement
      const newLead: LeadLTV = createMockLeadLTV({
        leadId,
        clinicId,
        totalCases: 0,
        completedCases: 0,
        totalCaseValue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        avgCaseValue: 0,
        firstCaseDate: undefined,
        lastCaseDate: undefined,
      });

      expect(newLead.totalPaid).toBe(0);
      expect(newLead.totalCases).toBe(0);

      // Step 2: Lead converts - first case created
      const convertedLead: LeadLTV = {
        ...newLead,
        totalCases: 1,
        totalCaseValue: 15000,
        totalPaid: 0,
        totalOutstanding: 15000,
        avgCaseValue: 15000,
        firstCaseDate: new Date('2024-03-01'),
        lastCaseDate: new Date('2024-03-01'),
      };

      expect(convertedLead.totalCases).toBe(1);
      expect(convertedLead.totalOutstanding).toBe(15000);

      // Step 3: First payment made
      const partiallyPaidLead: LeadLTV = {
        ...convertedLead,
        totalPaid: 5000,
        totalOutstanding: 10000,
      };

      expect(partiallyPaidLead.totalPaid).toBe(5000);
      expect(partiallyPaidLead.totalOutstanding).toBe(10000);

      // Step 4: Full payment completed + second case
      const fullyPaidLead: LeadLTV = {
        ...partiallyPaidLead,
        totalCases: 2,
        completedCases: 1,
        totalCaseValue: 25000,
        totalPaid: 20000,
        totalOutstanding: 5000,
        avgCaseValue: 12500,
        lastCaseDate: new Date('2024-06-01'),
      };

      expect(fullyPaidLead.totalPaid).toBe(20000);
      expect(fullyPaidLead.completedCases).toBe(1);
      expect(fullyPaidLead.avgCaseValue).toBe(12500);

      // Step 5: Calculate LTV and verify segment
      const segments = ltvService.calculateSegments([fullyPaidLead]);

      // 20000 EUR paid puts lead in Gold segment (15000-30000)
      const goldSegment = segments.find((s) => s.name === 'Gold');
      expect(goldSegment?.customerCount).toBe(1);
      expect(goldSegment?.totalRevenue).toBe(20000);
    });

    it('should handle multiple leads with different lifecycles', async () => {
      const leads: LeadLTV[] = [
        // High-value converted patient
        createMockLeadLTV({
          leadId: 'lead-high-value',
          totalPaid: 45000,
          totalCases: 3,
          completedCases: 3,
        }),
        // Recently converted, partial payment
        createMockLeadLTV({
          leadId: 'lead-recent',
          totalPaid: 8000,
          totalCases: 1,
          completedCases: 0,
        }),
        // New lead, no revenue yet
        createMockLeadLTV({
          leadId: 'lead-new',
          totalPaid: 0,
          totalCases: 0,
          completedCases: 0,
        }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);
      const segments = ltvService.calculateSegments(leads);

      // Average: (45000 + 8000 + 0) / 3 = 17666.67 -> 17667
      expect(avgLTV).toBe(17667);

      // Segment distribution
      expect(segments[0]?.customerCount).toBe(1); // Bronze: lead-new (0)
      expect(segments[1]?.customerCount).toBe(1); // Silver: lead-recent (8000)
      expect(segments[3]?.customerCount).toBe(1); // Platinum: lead-high-value (45000)
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle all leads with zero revenue', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 0 }),
        createMockLeadLTV({ totalPaid: 0 }),
        createMockLeadLTV({ totalPaid: 0 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);
      const segments = ltvService.calculateSegments(leads);

      expect(avgLTV).toBe(0);
      expect(segments[0]?.customerCount).toBe(3); // All in Bronze
      expect(segments[0]?.totalRevenue).toBe(0);
    });

    it('should handle very large LTV values', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 1000000 }), // 1 million
        createMockLeadLTV({ totalPaid: 500000 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);
      const segments = ltvService.calculateSegments(leads);

      expect(avgLTV).toBe(750000);
      expect(segments[4]?.customerCount).toBe(2); // Both in Diamond (50000+)
      expect(segments[4]?.totalRevenue).toBe(1500000);
    });

    it('should handle decimal payment amounts', () => {
      const leads: LeadLTV[] = [
        createMockLeadLTV({ totalPaid: 1234.56 }),
        createMockLeadLTV({ totalPaid: 2345.67 }),
      ];

      const avgLTV = ltvService.calculateAvgLTV(leads);

      // (1234.56 + 2345.67) / 2 = 1790.115 -> rounds to 1790
      expect(avgLTV).toBe(1790);
    });

    it('should handle concurrent revenue data months', () => {
      const revenueData: MonthlyRevenue[] = [
        createMockMonthlyRevenue(new Date('2024-06-01T00:00:00Z'), { netRevenue: 60000 }),
        createMockMonthlyRevenue(new Date('2024-06-01T12:00:00Z'), { netRevenue: 55000 }), // Same day, different time
        createMockMonthlyRevenue(new Date('2024-05-01'), { netRevenue: 50000 }),
      ];

      // Should handle gracefully, using first in sort order
      const growth = ltvService.calculateMonthlyGrowth(revenueData);
      expect(typeof growth).toBe('number');
    });
  });

  // ==========================================================================
  // DEFAULT SEGMENT CONSTANTS
  // ==========================================================================

  describe('Default Segment Constants', () => {
    it('should export correct default segment thresholds', () => {
      expect(DEFAULT_LTV_SEGMENTS).toEqual([0, 5000, 15000, 30000, 50000]);
    });
  });

  // ==========================================================================
  // SERVICE FACTORY
  // ==========================================================================

  describe('Service Factory', () => {
    it('should create service with default config', () => {
      const service = createLTVService();
      expect(service).toBeInstanceOf(LTVService);
    });

    it('should create service with custom currency', () => {
      const service = createLTVService({ currency: 'USD' });
      expect(service).toBeInstanceOf(LTVService);
    });

    it('should create service with dependencies', () => {
      const service = createLTVService({ currency: 'EUR' }, mockDeps as LTVServiceDeps);
      expect(service).toBeInstanceOf(LTVService);
    });
  });
});

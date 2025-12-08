/**
 * Server Action Tests: LTV Dashboard
 *
 * Tests for LTV (Lifetime Value) dashboard server actions including:
 * - Permission checks for all actions
 * - Stats retrieval
 * - Top customers listing
 * - Monthly revenue data
 * - Case pipeline breakdown
 * - Complete dashboard data aggregation
 * - Report export functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockLeadLTV,
  createMockLTVDashboardStats,
  createMockMonthlyRevenue,
  createMockCasePipeline,
} from '../setup/test-data';

// Mock the auth module - use vi.hoisted for the mock function
const mockRequirePermission = vi.hoisted(() => vi.fn());
const mockRequireCurrentUser = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    clinicId: 'clinic-456',
  })
);

vi.mock('@/lib/auth/server-action-auth', () => ({
  requirePermission: mockRequirePermission,
  requireCurrentUser: mockRequireCurrentUser,
}));

// Import after mocks
import {
  getLTVStatsAction,
  getTopCustomersAction,
  getMonthlyRevenueAction,
  getCasePipelineAction,
  getLTVDashboardDataAction,
  exportLTVReportAction,
  type LeadLTV,
  type LTVDashboardStats,
  type MonthlyRevenue,
  type CasePipeline,
  type LTVDashboardData,
} from '@/app/ltv-dashboard/actions';

describe('LTV Dashboard Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(undefined);
  });

  describe('getLTVStatsAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await getLTVStatsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return dashboard statistics', async () => {
      const result = await getLTVStatsAction();

      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('totalOutstanding');
      expect(result).toHaveProperty('avgLTV');
      expect(result).toHaveProperty('totalCases');
      expect(result).toHaveProperty('paidCases');
      expect(result).toHaveProperty('partialCases');
      expect(result).toHaveProperty('monthlyGrowth');
    });

    it('should return numeric values for all stats', async () => {
      const result = await getLTVStatsAction();

      expect(typeof result.totalRevenue).toBe('number');
      expect(typeof result.totalOutstanding).toBe('number');
      expect(typeof result.avgLTV).toBe('number');
      expect(typeof result.totalCases).toBe('number');
      expect(typeof result.paidCases).toBe('number');
      expect(typeof result.partialCases).toBe('number');
      expect(typeof result.monthlyGrowth).toBe('number');
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(getLTVStatsAction()).rejects.toThrow('Permission denied');
    });

    it('should return non-negative values', async () => {
      const result = await getLTVStatsAction();

      expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(result.totalOutstanding).toBeGreaterThanOrEqual(0);
      expect(result.avgLTV).toBeGreaterThanOrEqual(0);
      expect(result.totalCases).toBeGreaterThanOrEqual(0);
      expect(result.paidCases).toBeGreaterThanOrEqual(0);
      expect(result.partialCases).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTopCustomersAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await getTopCustomersAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return array of customers', async () => {
      const result = await getTopCustomersAction();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return customers with required properties', async () => {
      const result = await getTopCustomersAction();

      result.forEach((customer) => {
        expect(customer).toHaveProperty('leadId');
        expect(customer).toHaveProperty('fullName');
        expect(customer).toHaveProperty('totalCases');
        expect(customer).toHaveProperty('completedCases');
        expect(customer).toHaveProperty('totalCaseValue');
        expect(customer).toHaveProperty('totalPaid');
        expect(customer).toHaveProperty('totalOutstanding');
        expect(customer).toHaveProperty('avgCaseValue');
      });
    });

    it('should respect limit parameter', async () => {
      const result = await getTopCustomersAction(3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should use default limit of 10', async () => {
      const result = await getTopCustomersAction();

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should return customers with consistent value calculations', async () => {
      const result = await getTopCustomersAction();

      result.forEach((customer) => {
        // Outstanding should equal total minus paid
        expect(customer.totalOutstanding).toBe(customer.totalCaseValue - customer.totalPaid);
      });
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(getTopCustomersAction()).rejects.toThrow('Permission denied');
    });
  });

  describe('getMonthlyRevenueAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await getMonthlyRevenueAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return array of monthly revenue data', async () => {
      const result = await getMonthlyRevenueAction();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return monthly data with required properties', async () => {
      const result = await getMonthlyRevenueAction();

      result.forEach((month) => {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('grossRevenue');
        expect(month).toHaveProperty('netRevenue');
        expect(month).toHaveProperty('refunds');
        expect(month).toHaveProperty('paymentCount');
        expect(month).toHaveProperty('casesWithPayments');
      });
    });

    it('should respect months parameter', async () => {
      const result = await getMonthlyRevenueAction(3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should use default of 6 months', async () => {
      const result = await getMonthlyRevenueAction();

      expect(result.length).toBeLessThanOrEqual(6);
    });

    it('should return months in YYYY-MM format', async () => {
      const result = await getMonthlyRevenueAction();

      result.forEach((month) => {
        expect(month.month).toMatch(/^\d{4}-\d{2}$/);
      });
    });

    it('should have net revenue equal to gross minus refunds', async () => {
      const result = await getMonthlyRevenueAction();

      result.forEach((month) => {
        expect(month.netRevenue).toBe(month.grossRevenue - month.refunds);
      });
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(getMonthlyRevenueAction()).rejects.toThrow('Permission denied');
    });
  });

  describe('getCasePipelineAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await getCasePipelineAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return array of pipeline data', async () => {
      const result = await getCasePipelineAction();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return pipeline stages with required properties', async () => {
      const result = await getCasePipelineAction();

      result.forEach((stage) => {
        expect(stage).toHaveProperty('status');
        expect(stage).toHaveProperty('paymentStatus');
        expect(stage).toHaveProperty('caseCount');
        expect(stage).toHaveProperty('totalValue');
        expect(stage).toHaveProperty('paidValue');
        expect(stage).toHaveProperty('outstandingValue');
      });
    });

    it('should have consistent value calculations per stage', async () => {
      const result = await getCasePipelineAction();

      result.forEach((stage) => {
        expect(stage.outstandingValue).toBe(stage.totalValue - stage.paidValue);
      });
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(getCasePipelineAction()).rejects.toThrow('Permission denied');
    });
  });

  describe('getLTVDashboardDataAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await getLTVDashboardDataAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return complete dashboard data', async () => {
      const result = await getLTVDashboardDataAction();

      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('topCustomers');
      expect(result).toHaveProperty('monthlyRevenue');
      expect(result).toHaveProperty('casePipeline');
    });

    it('should return stats object', async () => {
      const result = await getLTVDashboardDataAction();

      expect(result.stats).toHaveProperty('totalRevenue');
      expect(result.stats).toHaveProperty('avgLTV');
    });

    it('should return top 5 customers by default', async () => {
      const result = await getLTVDashboardDataAction();

      expect(result.topCustomers.length).toBeLessThanOrEqual(5);
    });

    it('should return 6 months of revenue data', async () => {
      const result = await getLTVDashboardDataAction();

      expect(result.monthlyRevenue.length).toBeLessThanOrEqual(6);
    });

    it('should return case pipeline array', async () => {
      const result = await getLTVDashboardDataAction();

      expect(Array.isArray(result.casePipeline)).toBe(true);
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(getLTVDashboardDataAction()).rejects.toThrow('Permission denied');
    });

    it('should aggregate all data in single call', async () => {
      await getLTVDashboardDataAction();

      // Permission checked once at the top level
      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });
  });

  describe('exportLTVReportAction', () => {
    it('should require VIEW_ANALYTICS permission', async () => {
      await exportLTVReportAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
    });

    it('should return success status and message for CSV', async () => {
      const result = await exportLTVReportAction('csv');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('CSV');
    });

    it('should return success status and message for XLSX', async () => {
      const result = await exportLTVReportAction('xlsx');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('XLSX');
    });

    it('should return success status and message for PDF', async () => {
      const result = await exportLTVReportAction('pdf');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('PDF');
    });

    it('should default to CSV format', async () => {
      const result = await exportLTVReportAction();

      expect(result.message).toContain('CSV');
    });

    it('should indicate not implemented status', async () => {
      const result = await exportLTVReportAction();

      // Current implementation returns not implemented
      expect(result.success).toBe(false);
      expect(result.message).toContain('not yet implemented');
    });

    it('should throw when permission denied', async () => {
      mockRequirePermission.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(exportLTVReportAction()).rejects.toThrow('Permission denied');
    });
  });
});

describe('LTV Dashboard Type Definitions', () => {
  it('should export LeadLTV type', () => {
    const customer: LeadLTV = createMockLeadLTV();
    expect(customer).toHaveProperty('leadId');
    expect(customer).toHaveProperty('fullName');
  });

  it('should export LTVDashboardStats type', () => {
    const stats: LTVDashboardStats = createMockLTVDashboardStats();
    expect(stats).toHaveProperty('totalRevenue');
  });

  it('should export MonthlyRevenue type', () => {
    const revenue: MonthlyRevenue = createMockMonthlyRevenue();
    expect(revenue).toHaveProperty('month');
    expect(revenue).toHaveProperty('grossRevenue');
  });

  it('should export CasePipeline type', () => {
    const pipeline: CasePipeline = createMockCasePipeline();
    expect(pipeline).toHaveProperty('status');
    expect(pipeline).toHaveProperty('caseCount');
  });

  it('should export LTVDashboardData type', () => {
    const data: LTVDashboardData = {
      stats: createMockLTVDashboardStats(),
      topCustomers: [createMockLeadLTV()],
      monthlyRevenue: [createMockMonthlyRevenue()],
      casePipeline: [createMockCasePipeline()],
    };
    expect(data).toHaveProperty('stats');
    expect(data).toHaveProperty('topCustomers');
    expect(data).toHaveProperty('monthlyRevenue');
    expect(data).toHaveProperty('casePipeline');
  });
});

describe('Permission Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check permission before fetching stats', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(getLTVStatsAction()).rejects.toThrow();
    expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
  });

  it('should check permission before fetching customers', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(getTopCustomersAction()).rejects.toThrow();
    expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
  });

  it('should check permission before fetching revenue', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(getMonthlyRevenueAction()).rejects.toThrow();
    expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
  });

  it('should check permission before fetching pipeline', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(getCasePipelineAction()).rejects.toThrow();
    expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
  });

  it('should check permission before exporting', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(exportLTVReportAction()).rejects.toThrow();
    expect(mockRequirePermission).toHaveBeenCalledWith('VIEW_ANALYTICS');
  });
});

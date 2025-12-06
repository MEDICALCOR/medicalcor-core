/**
 * @fileoverview LTV (Lifetime Value) Calculation Service
 *
 * H2 Production Fix: Core business metric service for calculating and
 * analyzing customer lifetime value.
 *
 * @module domain/ltv/ltv-service
 */

import type {
  LeadLTV,
  MonthlyRevenue,
  CasePipelineSummary,
  PaginatedResult,
  PaginationOptions,
} from '../cases/repositories/CaseRepository.js';

// ============================================================================
// LTV METRICS TYPES
// ============================================================================

/**
 * Dashboard statistics summary
 */
export interface LTVDashboardStats {
  /** Total revenue collected all time */
  totalRevenue: number;
  /** Total outstanding balance */
  totalOutstanding: number;
  /** Average customer lifetime value */
  avgLTV: number;
  /** Total number of cases */
  totalCases: number;
  /** Fully paid cases count */
  paidCases: number;
  /** Partially paid cases count */
  partialCases: number;
  /** Month-over-month growth percentage */
  monthlyGrowth: number;
  /** Currency code */
  currency: string;
}

/**
 * LTV trend data point
 */
export interface LTVTrendPoint {
  /** Date of the data point */
  date: Date;
  /** Average LTV at this point */
  avgLTV: number;
  /** Total revenue at this point */
  totalRevenue: number;
  /** Customer count at this point */
  customerCount: number;
}

/**
 * Customer segment by LTV
 */
export interface LTVSegment {
  /** Segment name */
  name: string;
  /** Minimum LTV threshold */
  minLTV: number;
  /** Maximum LTV threshold */
  maxLTV: number | null;
  /** Number of customers in segment */
  customerCount: number;
  /** Total revenue from segment */
  totalRevenue: number;
  /** Percentage of total customers */
  percentageOfCustomers: number;
}

/**
 * LTV service configuration
 */
export interface LTVServiceConfig {
  /** Default currency for calculations */
  currency?: string;
  /** LTV segment thresholds */
  segmentThresholds?: number[];
}

/**
 * LTV service dependencies (repository access)
 */
export interface LTVServiceDeps {
  /** Get LTV stats for a clinic */
  getClinicStats: (clinicId: string) => Promise<LTVDashboardStats>;
  /** Get top leads by LTV */
  getTopLeadsByLTV: (clinicId: string, limit?: number) => Promise<LeadLTV[]>;
  /** Get monthly revenue */
  getMonthlyRevenue: (clinicId: string, months?: number) => Promise<MonthlyRevenue[]>;
  /** Get case pipeline */
  getCasePipeline: (clinicId: string) => Promise<CasePipelineSummary[]>;
  /** Get all leads LTV with pagination */
  getLeadsLTV: (clinicId: string, options?: PaginationOptions) => Promise<PaginatedResult<LeadLTV>>;
}

// ============================================================================
// LTV CONSTANTS
// ============================================================================

/**
 * Default LTV segment thresholds (in EUR)
 */
export const DEFAULT_LTV_SEGMENTS = [0, 5000, 15000, 30000, 50000] as const;

/**
 * Segment names by threshold index
 */
const SEGMENT_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const;

// ============================================================================
// LTV SERVICE
// ============================================================================

/**
 * LTV Calculation Service
 *
 * Provides business metrics and analytics for customer lifetime value.
 */
export class LTVService {
  private config: Required<LTVServiceConfig>;
  private deps: LTVServiceDeps | undefined;

  constructor(config?: LTVServiceConfig, deps?: LTVServiceDeps) {
    this.config = {
      currency: config?.currency ?? 'EUR',
      segmentThresholds: config?.segmentThresholds ?? [...DEFAULT_LTV_SEGMENTS],
    };
    this.deps = deps;
  }

  /**
   * Calculate LTV segments from lead data
   */
  calculateSegments(leads: LeadLTV[]): LTVSegment[] {
    const thresholds = this.config.segmentThresholds;
    const segments: LTVSegment[] = [];
    const totalCustomers = leads.length;

    for (let i = 0; i < thresholds.length; i++) {
      const minLTV = thresholds[i] ?? 0;
      const maxLTV = thresholds[i + 1] ?? null;
      const name = SEGMENT_NAMES[i] ?? `Tier ${i + 1}`;

      const segmentLeads = leads.filter((lead) => {
        const ltv = lead.totalPaid;
        if (maxLTV === null) return ltv >= minLTV;
        return ltv >= minLTV && ltv < maxLTV;
      });

      segments.push({
        name,
        minLTV,
        maxLTV,
        customerCount: segmentLeads.length,
        totalRevenue: segmentLeads.reduce((sum, l) => sum + l.totalPaid, 0),
        percentageOfCustomers:
          totalCustomers > 0 ? (segmentLeads.length / totalCustomers) * 100 : 0,
      });
    }

    return segments;
  }

  /**
   * Calculate average LTV from leads
   */
  calculateAvgLTV(leads: LeadLTV[]): number {
    if (leads.length === 0) return 0;
    const totalPaid = leads.reduce((sum, l) => sum + l.totalPaid, 0);
    return Math.round(totalPaid / leads.length);
  }

  /**
   * Calculate month-over-month growth
   */
  calculateMonthlyGrowth(revenueData: MonthlyRevenue[]): number {
    if (revenueData.length < 2) return 0;

    // Sort by month descending
    const sorted = [...revenueData].sort(
      (a, b) => new Date(b.month).getTime() - new Date(a.month).getTime()
    );

    const current = sorted[0]?.netRevenue ?? 0;
    const previous = sorted[1]?.netRevenue ?? 0;

    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  /**
   * Calculate collection rate from pipeline
   */
  calculateCollectionRate(pipeline: CasePipelineSummary[]): number {
    const totalValue = pipeline.reduce((sum, p) => sum + p.totalValue, 0);
    const totalPaid = pipeline.reduce((sum, p) => sum + p.paidValue, 0);
    if (totalValue === 0) return 0;
    return Math.round((totalPaid / totalValue) * 100);
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(clinicId: string): Promise<LTVDashboardStats> {
    if (!this.deps) {
      throw new Error('LTV service dependencies not configured');
    }
    return this.deps.getClinicStats(clinicId);
  }

  /**
   * Get top customers by LTV
   */
  async getTopCustomers(clinicId: string, limit = 10): Promise<LeadLTV[]> {
    if (!this.deps) {
      throw new Error('LTV service dependencies not configured');
    }
    return this.deps.getTopLeadsByLTV(clinicId, limit);
  }

  /**
   * Get monthly revenue trend
   */
  async getRevenueTrend(clinicId: string, months = 6): Promise<MonthlyRevenue[]> {
    if (!this.deps) {
      throw new Error('LTV service dependencies not configured');
    }
    return this.deps.getMonthlyRevenue(clinicId, months);
  }

  /**
   * Get case pipeline breakdown
   */
  async getCasePipeline(clinicId: string): Promise<CasePipelineSummary[]> {
    if (!this.deps) {
      throw new Error('LTV service dependencies not configured');
    }
    return this.deps.getCasePipeline(clinicId);
  }

  /**
   * Get customer segments
   */
  async getCustomerSegments(clinicId: string): Promise<LTVSegment[]> {
    if (!this.deps) {
      throw new Error('LTV service dependencies not configured');
    }
    const result = await this.deps.getLeadsLTV(clinicId, { limit: 10000 });
    return this.calculateSegments(result.data);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an LTV service instance
 */
export function createLTVService(config?: LTVServiceConfig, deps?: LTVServiceDeps): LTVService {
  return new LTVService(config, deps);
}

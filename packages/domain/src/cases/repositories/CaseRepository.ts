/**
 * @fileoverview Case Repository Interface
 *
 * Defines the contract for case persistence operations.
 *
 * @module domain/cases/repositories/case-repository
 */

import type {
  Case,
  Payment,
  PaymentPlan,
  PaymentPlanInstallment,
  CaseStatus,
  PaymentStatus,
  CreateCaseInput,
  CreatePaymentInput,
} from '../entities/Case.js';

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Filter options for case queries
 */
export interface CaseQueryFilters {
  clinicId?: string;
  leadId?: string;
  treatmentPlanId?: string;
  status?: CaseStatus | CaseStatus[];
  paymentStatus?: PaymentStatus | PaymentStatus[];
  hasOutstanding?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'totalAmount' | 'outstandingAmount';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// LTV & ANALYTICS TYPES
// ============================================================================

/**
 * Lead Lifetime Value summary
 */
export interface LeadLTV {
  leadId: string;
  clinicId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  leadCreatedAt: Date;
  totalCases: number;
  completedCases: number;
  totalCaseValue: number;
  totalPaid: number;
  totalOutstanding: number;
  avgCaseValue: number;
  firstCaseDate?: Date;
  lastCaseDate?: Date;
}

/**
 * Monthly revenue summary
 */
export interface MonthlyRevenue {
  month: Date;
  clinicId: string;
  casesWithPayments: number;
  paymentCount: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  avgPaymentAmount: number;
}

/**
 * Case pipeline summary
 */
export interface CasePipelineSummary {
  clinicId: string;
  status: CaseStatus;
  paymentStatus: PaymentStatus;
  caseCount: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
  avgCaseValue: number;
}

// ============================================================================
// COHORT LTV TYPES
// ============================================================================

/**
 * Monthly cohort LTV summary
 */
export interface CohortLTVSummary {
  clinicId: string;
  cohortMonth: Date;
  acquisitionSource: string | null;
  acquisitionChannel: string | null;
  cohortSize: number;
  convertedLeads: number;
  conversionRate: number | null;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  avgLtv: number | null;
  avgLtvConverted: number | null;
  totalCases: number;
  completedCases: number;
  avgCasesPerCustomer: number | null;
  avgDaysToFirstCase: number | null;
  maxMonthsActive: number | null;
  collectionRate: number | null;
}

/**
 * Cohort LTV evolution point (revenue at specific month after acquisition)
 */
export interface CohortLTVEvolutionPoint {
  clinicId: string;
  cohortMonth: Date;
  monthsSinceAcquisition: number;
  cohortSize: number;
  periodRevenue: number;
  payingCustomers: number;
  cumulativeRevenue: number;
  cumulativeLtvPerLead: number | null;
  payingPercentage: number | null;
}

/**
 * Cohort comparison with growth metrics
 */
export interface CohortComparison {
  clinicId: string;
  cohortMonth: Date;
  cohortSize: number;
  convertedLeads: number;
  conversionRate: number | null;
  totalCollected: number;
  avgLtv: number | null;
  avgLtvConverted: number | null;
  collectionRate: number | null;
  avgDaysToFirstCase: number | null;
  prevCohortAvgLtv: number | null;
  ltvGrowthVsPrev: number | null;
  yoyCohortAvgLtv: number | null;
  ltvGrowthYoy: number | null;
}

/**
 * Cohort query options
 */
export interface CohortQueryOptions {
  startMonth?: Date;
  endMonth?: Date;
  acquisitionSource?: string;
  acquisitionChannel?: string;
  limit?: number;
  includeBreakdown?: boolean;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Case Repository Interface
 *
 * Defines persistence operations for cases, payments, and payment plans.
 */
export interface ICaseRepository {
  // ============================================================================
  // CASE OPERATIONS
  // ============================================================================

  /**
   * Find a case by ID
   */
  findById(id: string): Promise<Case | null>;

  /**
   * Find a case by case number
   */
  findByCaseNumber(clinicId: string, caseNumber: string): Promise<Case | null>;

  /**
   * Find cases matching filters
   */
  findMany(
    filters: CaseQueryFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Case>>;

  /**
   * Find cases for a specific lead
   */
  findByLeadId(leadId: string): Promise<Case[]>;

  /**
   * Create a new case
   */
  create(input: CreateCaseInput): Promise<Case>;

  /**
   * Update a case
   */
  update(id: string, updates: Partial<Omit<Case, 'id' | 'createdAt'>>): Promise<Case>;

  /**
   * Soft delete a case
   */
  softDelete(id: string, deletedBy?: string): Promise<void>;

  /**
   * Generate the next case number for a clinic
   */
  generateCaseNumber(clinicId: string): Promise<string>;

  // ============================================================================
  // PAYMENT OPERATIONS
  // ============================================================================

  /**
   * Find a payment by ID
   */
  findPaymentById(id: string): Promise<Payment | null>;

  /**
   * Find payments for a case
   */
  findPaymentsByCaseId(caseId: string): Promise<Payment[]>;

  /**
   * Create a new payment
   */
  createPayment(input: CreatePaymentInput): Promise<Payment>;

  /**
   * Update a payment
   */
  updatePayment(id: string, updates: Partial<Omit<Payment, 'id' | 'createdAt'>>): Promise<Payment>;

  /**
   * Process a payment (mark as completed and update case totals)
   */
  processPayment(
    paymentId: string,
    processorName: string,
    processorTransactionId: string
  ): Promise<Payment>;

  /**
   * Fail a payment
   */
  failPayment(paymentId: string, reason: string): Promise<Payment>;

  /**
   * Generate payment reference
   */
  generatePaymentReference(clinicId: string): Promise<string>;

  // ============================================================================
  // PAYMENT PLAN OPERATIONS
  // ============================================================================

  /**
   * Find a payment plan by ID
   */
  findPaymentPlanById(id: string): Promise<PaymentPlan | null>;

  /**
   * Find payment plans for a case
   */
  findPaymentPlansByCaseId(caseId: string): Promise<PaymentPlan[]>;

  /**
   * Create a payment plan
   */
  createPaymentPlan(
    caseId: string,
    name: string,
    totalAmount: number,
    numberOfInstallments: number,
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
    startDate: Date
  ): Promise<PaymentPlan>;

  /**
   * Find installments for a payment plan
   */
  findInstallments(paymentPlanId: string): Promise<PaymentPlanInstallment[]>;

  /**
   * Find overdue installments
   */
  findOverdueInstallments(clinicId?: string): Promise<PaymentPlanInstallment[]>;

  /**
   * Mark installment as paid
   */
  markInstallmentPaid(installmentId: string, paymentId: string, paidAmount: number): Promise<void>;

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================

  /**
   * Get Lead Lifetime Value
   */
  getLeadLTV(leadId: string): Promise<LeadLTV | null>;

  /**
   * Get LTV for all leads in a clinic
   */
  getClinicLeadLTVs(
    clinicId: string,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<LeadLTV>>;

  /**
   * Get monthly revenue
   */
  getMonthlyRevenue(clinicId: string, startMonth: Date, endMonth: Date): Promise<MonthlyRevenue[]>;

  /**
   * Get case pipeline summary
   */
  getCasePipeline(clinicId: string): Promise<CasePipelineSummary[]>;

  /**
   * Get total outstanding amount for a clinic
   */
  getTotalOutstanding(clinicId: string): Promise<number>;

  // ============================================================================
  // COHORT LTV OPERATIONS
  // ============================================================================

  /**
   * Get cohort LTV summaries for a clinic
   */
  getCohortLTVSummaries(
    clinicId: string,
    options?: CohortQueryOptions
  ): Promise<CohortLTVSummary[]>;

  /**
   * Get cohort comparison data with growth metrics
   */
  getCohortComparisons(clinicId: string, options?: CohortQueryOptions): Promise<CohortComparison[]>;

  /**
   * Get LTV evolution for a specific cohort
   */
  getCohortLTVEvolution(
    clinicId: string,
    cohortMonth: Date,
    maxMonths?: number
  ): Promise<CohortLTVEvolutionPoint[]>;

  /**
   * Refresh cohort LTV materialized views
   */
  refreshCohortLTVViews(): Promise<void>;
}

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
  findMany(filters: CaseQueryFilters, pagination?: PaginationOptions): Promise<PaginatedResult<Case>>;

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
}

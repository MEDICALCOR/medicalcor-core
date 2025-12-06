/**
 * @fileoverview Disposition Repository Interface
 *
 * M1 Production Fix: Repository for disposition code persistence.
 *
 * @module domain/disposition/repositories/disposition-repository
 */

import type {
  DispositionCode,
  DispositionCategory,
  CallDisposition,
  CreateCallDispositionInput,
  HandlerType,
} from '../entities/DispositionCode.js';

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Filter options for disposition code queries
 */
export interface DispositionCodeFilters {
  clinicId?: string | null;
  category?: DispositionCategory | DispositionCategory[];
  isPositiveOutcome?: boolean;
  requiresFollowUp?: boolean;
  isActive?: boolean;
}

/**
 * Filter options for call disposition queries
 */
export interface CallDispositionFilters {
  clinicId?: string;
  leadId?: string;
  dispositionCodeId?: string;
  dispositionCode?: string;
  category?: DispositionCategory | DispositionCategory[];
  handledByType?: HandlerType | HandlerType[];
  agentId?: string;
  hasFollowUp?: boolean;
  followUpDateBefore?: Date;
  setAfter?: Date;
  setBefore?: Date;
}

/**
 * Pagination options for disposition queries
 */
export interface DispositionPaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'setAt' | 'createdAt' | 'followUpDate';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Paginated result for disposition queries
 */
export interface DispositionPaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Disposition summary statistics
 */
export interface DispositionSummary {
  clinicId: string;
  code: string;
  name: string;
  category: DispositionCategory;
  isPositiveOutcome: boolean;
  callCount: number;
  aiHandled: number;
  humanHandled: number;
  hybridHandled: number;
  avgDurationSeconds: number;
  followUpsScheduled: number;
}

/**
 * Daily disposition trend
 */
export interface DailyDispositionTrend {
  clinicId: string;
  date: Date;
  category: DispositionCategory;
  totalCalls: number;
  positiveOutcomes: number;
  positiveRate: number;
}

/**
 * Agent disposition performance
 */
export interface AgentDispositionPerformance {
  clinicId: string;
  agentId: string;
  totalCalls: number;
  positiveOutcomes: number;
  completedCalls: number;
  followUpCalls: number;
  conversionRate: number;
  avgCallDuration: number;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Disposition Repository Interface
 *
 * Defines persistence operations for disposition codes and call dispositions.
 */
export interface IDispositionRepository {
  // ============================================================================
  // DISPOSITION CODE OPERATIONS
  // ============================================================================

  /**
   * Find a disposition code by ID
   */
  findCodeById(id: string): Promise<DispositionCode | null>;

  /**
   * Find a disposition code by code string
   */
  findCodeByCode(clinicId: string | null, code: string): Promise<DispositionCode | null>;

  /**
   * Find all disposition codes matching filters
   */
  findCodes(filters?: DispositionCodeFilters): Promise<DispositionCode[]>;

  /**
   * Get all active disposition codes for a clinic
   * (includes system-wide codes where clinicId is null)
   */
  getActiveCodesForClinic(clinicId: string): Promise<DispositionCode[]>;

  /**
   * Create a new disposition code (clinic-specific)
   */
  createCode(
    clinicId: string,
    code: string,
    name: string,
    category: DispositionCategory,
    options?: {
      description?: string;
      isPositiveOutcome?: boolean;
      requiresFollowUp?: boolean;
      followUpDays?: number;
      displayOrder?: number;
    }
  ): Promise<DispositionCode>;

  /**
   * Update a disposition code
   */
  updateCode(
    id: string,
    updates: Partial<Omit<DispositionCode, 'id' | 'createdAt'>>
  ): Promise<DispositionCode>;

  /**
   * Deactivate a disposition code
   */
  deactivateCode(id: string): Promise<void>;

  // ============================================================================
  // CALL DISPOSITION OPERATIONS
  // ============================================================================

  /**
   * Find a call disposition by ID
   */
  findById(id: string): Promise<CallDisposition | null>;

  /**
   * Find a call disposition by call SID
   */
  findByCallSid(callSid: string): Promise<CallDisposition | null>;

  /**
   * Find call dispositions for a lead
   */
  findByLeadId(leadId: string): Promise<CallDisposition[]>;

  /**
   * Find call dispositions matching filters
   */
  findMany(
    filters: CallDispositionFilters,
    pagination?: DispositionPaginationOptions
  ): Promise<DispositionPaginatedResult<CallDisposition>>;

  /**
   * Create a new call disposition
   */
  create(input: CreateCallDispositionInput): Promise<CallDisposition>;

  /**
   * Update a call disposition
   */
  update(
    id: string,
    updates: Partial<Omit<CallDisposition, 'id' | 'createdAt' | 'callSid'>>
  ): Promise<CallDisposition>;

  /**
   * Get pending follow-ups
   */
  getPendingFollowUps(clinicId: string, beforeDate?: Date): Promise<CallDisposition[]>;

  /**
   * Mark follow-up as completed
   */
  completeFollowUp(id: string, notes?: string): Promise<void>;

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================

  /**
   * Get disposition summary statistics
   */
  getDispositionSummary(
    clinicId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DispositionSummary[]>;

  /**
   * Get daily disposition trends
   */
  getDailyTrends(
    clinicId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyDispositionTrend[]>;

  /**
   * Get agent performance metrics
   */
  getAgentPerformance(clinicId: string): Promise<AgentDispositionPerformance[]>;

  /**
   * Get conversion rate by disposition code
   */
  getConversionRates(
    clinicId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Map<string, number>>;
}

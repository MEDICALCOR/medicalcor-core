/**
 * @fileoverview ILeadRepository Interface
 *
 * Banking/Medical Grade Repository Interface for Lead Aggregate.
 * Defines the contract for lead persistence operations.
 *
 * @module domain/shared-kernel/repository-interfaces/lead-repository
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - Leads are accessed/modified through this repository
 * 2. PERSISTENCE IGNORANCE - Domain doesn't know about database details
 * 3. SPECIFICATION PATTERN - Complex queries via specifications
 * 4. UNIT OF WORK COMPATIBLE - Supports transactional operations
 */

import type { LeadScore } from '../value-objects/lead-score.js';
import type { PhoneNumber } from '../value-objects/phone-number.js';

// ============================================================================
// LEAD AGGREGATE TYPES
// ============================================================================

/**
 * Lead source/channel
 */
export type LeadSource = 'whatsapp' | 'voice' | 'web_form' | 'hubspot' | 'facebook' | 'google' | 'referral' | 'manual';

/**
 * Lead lifecycle status
 */
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'nurturing' | 'scheduled' | 'converted' | 'lost' | 'invalid';

/**
 * Conversation entry
 */
export interface ConversationEntry {
  readonly id: string;
  readonly timestamp: Date;
  readonly role: 'patient' | 'assistant' | 'agent' | 'system';
  readonly channel: 'whatsapp' | 'voice' | 'sms' | 'email';
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Lead Entity (Aggregate Root)
 *
 * This is the domain entity representing a potential patient.
 * All modifications must go through domain methods to enforce invariants.
 */
export interface Lead {
  readonly id: string;
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;

  // Demographics (PII)
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date;
  readonly city?: string;
  readonly county?: string;

  // Lead metadata
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly score?: LeadScore;

  // Medical context
  readonly primarySymptoms: readonly string[];
  readonly procedureInterest: readonly string[];
  readonly urgencyLevel?: 'emergency' | 'urgent' | 'routine' | 'preventive';

  // Conversation tracking
  readonly conversationHistory: readonly ConversationEntry[];
  readonly lastContactAt?: Date;

  // UTM tracking
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Domain metadata
  readonly version: number; // For optimistic locking
}

/**
 * Lead creation input (without auto-generated fields)
 */
export interface CreateLeadInput {
  phone: PhoneNumber;
  email?: string;
  source: LeadSource;
  firstName?: string;
  lastName?: string;
  hubspotContactId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Lead update input
 */
export interface UpdateLeadInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: LeadStatus;
  score?: LeadScore;
  hubspotContactId?: string;
  hubspotDealId?: string;
  city?: string;
  county?: string;
  procedureInterest?: string[];
  urgencyLevel?: 'emergency' | 'urgent' | 'routine' | 'preventive';
}

// ============================================================================
// SPECIFICATION PATTERN
// ============================================================================

/**
 * Base specification interface for lead queries
 */
export interface LeadSpecification {
  readonly type: string;
  isSatisfiedBy(lead: Lead): boolean;
}

/**
 * Specification for finding leads by score classification
 */
export interface LeadByScoreSpec extends LeadSpecification {
  readonly type: 'BY_SCORE';
  readonly classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
}

/**
 * Specification for finding leads by status
 */
export interface LeadByStatusSpec extends LeadSpecification {
  readonly type: 'BY_STATUS';
  readonly status: LeadStatus;
}

/**
 * Specification for finding leads needing follow-up
 */
export interface LeadNeedingFollowUpSpec extends LeadSpecification {
  readonly type: 'NEEDING_FOLLOW_UP';
  readonly olderThan: Date;
}

/**
 * Specification for finding leads by source
 */
export interface LeadBySourceSpec extends LeadSpecification {
  readonly type: 'BY_SOURCE';
  readonly source: LeadSource;
}

/**
 * Union type of all lead specifications
 */
export type LeadSpec =
  | LeadByScoreSpec
  | LeadByStatusSpec
  | LeadNeedingFollowUpSpec
  | LeadBySourceSpec;

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * ILeadRepository - Banking Grade Lead Repository
 *
 * This interface defines the contract for lead persistence.
 * Implementations can be PostgreSQL, HubSpot, or in-memory for testing.
 *
 * INVARIANTS:
 * - Phone numbers are unique per lead
 * - Version must be checked for updates (optimistic locking)
 * - All operations return Result types (no exceptions)
 *
 * @example
 * ```typescript
 * // Get lead by phone
 * const result = await leadRepository.findByPhone(phoneNumber);
 * if (result.success) {
 *   const lead = result.value;
 *   console.log(lead?.score?.classification);
 * }
 *
 * // Find all HOT leads
 * const hotLeads = await leadRepository.findBySpecification({
 *   type: 'BY_SCORE',
 *   classification: 'HOT',
 *   isSatisfiedBy: (lead) => lead.score?.classification === 'HOT'
 * });
 *
 * // Create new lead
 * const newLead = await leadRepository.create({
 *   phone: PhoneNumber.create('+40721234567'),
 *   source: 'whatsapp',
 *   firstName: 'Ion'
 * });
 * ```
 */
export interface ILeadRepository {
  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  /**
   * Find lead by unique identifier
   *
   * @param id - Lead UUID
   * @returns Lead or null if not found
   */
  findById(id: string): Promise<LeadRepositoryResult<Lead | null>>;

  /**
   * Find lead by phone number
   *
   * @param phone - PhoneNumber value object
   * @returns Lead or null if not found
   */
  findByPhone(phone: PhoneNumber): Promise<LeadRepositoryResult<Lead | null>>;

  /**
   * Find lead by HubSpot contact ID
   *
   * @param hubspotContactId - HubSpot contact ID
   * @returns Lead or null if not found
   */
  findByHubSpotContactId(hubspotContactId: string): Promise<LeadRepositoryResult<Lead | null>>;

  /**
   * Find lead by email
   *
   * @param email - Email address
   * @returns Lead or null if not found
   */
  findByEmail(email: string): Promise<LeadRepositoryResult<Lead | null>>;

  /**
   * Find leads matching specification
   *
   * @param spec - Query specification
   * @param options - Pagination and sorting options
   * @returns Array of matching leads
   */
  findBySpecification(
    spec: LeadSpec,
    options?: QueryOptions
  ): Promise<LeadRepositoryResult<Lead[]>>;

  /**
   * Count leads matching specification
   *
   * @param spec - Query specification
   * @returns Count of matching leads
   */
  countBySpecification(spec: LeadSpec): Promise<LeadRepositoryResult<number>>;

  /**
   * Check if lead exists by phone
   *
   * @param phone - PhoneNumber value object
   * @returns True if lead exists
   */
  existsByPhone(phone: PhoneNumber): Promise<LeadRepositoryResult<boolean>>;

  // ============================================================================
  // COMMAND OPERATIONS
  // ============================================================================

  /**
   * Create new lead
   *
   * INVARIANTS:
   * - Phone must be unique
   * - Source is required
   *
   * @param input - Lead creation data
   * @returns Created lead with generated ID
   */
  create(input: CreateLeadInput): Promise<LeadRepositoryResult<Lead>>;

  /**
   * Update existing lead
   *
   * INVARIANTS:
   * - Lead must exist
   * - Version must match (optimistic locking)
   *
   * @param id - Lead ID
   * @param input - Update data
   * @param expectedVersion - Expected version for optimistic locking
   * @returns Updated lead
   */
  update(
    id: string,
    input: UpdateLeadInput,
    expectedVersion?: number
  ): Promise<LeadRepositoryResult<Lead>>;

  /**
   * Update lead score
   *
   * Specialized method for scoring operations.
   * Emits LeadScored domain event.
   *
   * @param id - Lead ID
   * @param score - New score
   * @param scoringMetadata - Metadata about scoring (reasoning, confidence, etc.)
   */
  updateScore(
    id: string,
    score: LeadScore,
    scoringMetadata?: ScoringMetadata
  ): Promise<LeadRepositoryResult<Lead>>;

  /**
   * Add conversation entry
   *
   * @param id - Lead ID
   * @param entry - Conversation entry
   * @returns Updated lead
   */
  addConversationEntry(
    id: string,
    entry: Omit<ConversationEntry, 'id'>
  ): Promise<LeadRepositoryResult<Lead>>;

  /**
   * Update lead status
   *
   * Validates status transitions.
   * Emits LeadStatusChanged domain event.
   *
   * @param id - Lead ID
   * @param newStatus - New status
   * @param reason - Reason for status change
   */
  updateStatus(
    id: string,
    newStatus: LeadStatus,
    reason?: string
  ): Promise<LeadRepositoryResult<Lead>>;

  /**
   * Soft delete lead
   *
   * Marks lead as deleted but retains for audit.
   * Required for GDPR "right to be forgotten" (with retention period).
   *
   * @param id - Lead ID
   * @param reason - Deletion reason
   */
  softDelete(id: string, reason: string): Promise<LeadRepositoryResult<void>>;

  /**
   * Hard delete lead
   *
   * Permanently removes lead data.
   * Use only for GDPR erasure requests after retention period.
   *
   * @param id - Lead ID
   */
  hardDelete(id: string): Promise<LeadRepositoryResult<void>>;

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Find multiple leads by IDs
   *
   * @param ids - Array of lead IDs
   * @returns Map of ID to Lead
   */
  findManyByIds(ids: string[]): Promise<LeadRepositoryResult<Map<string, Lead>>>;

  /**
   * Bulk update scores
   *
   * For batch scoring operations.
   *
   * @param updates - Array of ID and score pairs
   */
  bulkUpdateScores(
    updates: Array<{ id: string; score: LeadScore }>
  ): Promise<LeadRepositoryResult<number>>;

  // ============================================================================
  // UNIT OF WORK SUPPORT
  // ============================================================================

  /**
   * Begin transaction
   *
   * @returns Transaction context
   */
  beginTransaction(): Promise<TransactionContext>;

  /**
   * Commit transaction
   *
   * @param context - Transaction context
   */
  commitTransaction(context: TransactionContext): Promise<void>;

  /**
   * Rollback transaction
   *
   * @param context - Transaction context
   */
  rollbackTransaction(context: TransactionContext): Promise<void>;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Repository operation result
 */
export type LeadRepositoryResult<T> =
  | { success: true; value: T }
  | { success: false; error: LeadRepositoryError };

/**
 * Repository error types
 */
export interface LeadRepositoryError {
  readonly code: LeadRepositoryErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: Error;
}

/**
 * Repository error codes
 */
export type LeadRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE_PHONE'
  | 'DUPLICATE_EMAIL'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Query options for pagination and sorting
 */
export interface QueryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: keyof Lead;
  readonly orderDirection?: 'asc' | 'desc';
}

/**
 * Scoring metadata
 */
export interface ScoringMetadata {
  readonly method: 'ai' | 'rule_based' | 'manual';
  readonly reasoning: string;
  readonly confidence: number;
  readonly procedureInterest?: string[];
  readonly urgencyIndicators?: string[];
  readonly budgetMentioned?: boolean;
}

/**
 * Transaction context for unit of work
 */
export interface TransactionContext {
  readonly id: string;
  readonly startedAt: Date;
  readonly operations: readonly string[];
}

// ============================================================================
// FACTORY FUNCTIONS FOR SPECIFICATIONS
// ============================================================================

/**
 * Create specification for HOT leads
 */
export function hotLeadsSpec(): LeadByScoreSpec {
  return {
    type: 'BY_SCORE',
    classification: 'HOT',
    isSatisfiedBy: (lead) => lead.score?.classification === 'HOT',
  };
}

/**
 * Create specification for leads needing follow-up
 */
export function needsFollowUpSpec(olderThan: Date): LeadNeedingFollowUpSpec {
  return {
    type: 'NEEDING_FOLLOW_UP',
    olderThan,
    isSatisfiedBy: (lead) =>
      lead.status !== 'converted' &&
      lead.status !== 'lost' &&
      (!lead.lastContactAt || lead.lastContactAt < olderThan),
  };
}

/**
 * Create specification for leads by status
 */
export function byStatusSpec(status: LeadStatus): LeadByStatusSpec {
  return {
    type: 'BY_STATUS',
    status,
    isSatisfiedBy: (lead) => lead.status === status,
  };
}

/**
 * Create specification for leads by source
 */
export function bySourceSpec(source: LeadSource): LeadBySourceSpec {
  return {
    type: 'BY_SOURCE',
    source,
    isSatisfiedBy: (lead) => lead.source === source,
  };
}

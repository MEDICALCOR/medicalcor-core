/**
 * @fileoverview ICrmGateway Interface
 *
 * Banking/Medical Grade Gateway Interface for CRM Operations.
 * Abstracts external CRM systems (HubSpot, Pipedrive, etc.).
 *
 * @module domain/shared-kernel/repository-interfaces/crm-gateway
 *
 * DESIGN PRINCIPLES:
 * 1. ANTI-CORRUPTION LAYER - Protects domain from external CRM models
 * 2. PORT/ADAPTER PATTERN - Domain defines the port, adapters implement
 * 3. VENDOR AGNOSTIC - Can switch CRMs without changing domain code
 * 4. IDEMPOTENT OPERATIONS - Safe for retries
 */

import type { LeadScore } from '../value-objects/lead-score.js';
import type { PhoneNumber } from '../value-objects/phone-number.js';

// ============================================================================
// CRM CONTACT TYPES
// ============================================================================

/**
 * CRM Contact - Domain representation of a CRM contact
 * This is the Anti-Corruption Layer representation
 */
export interface CrmContact {
  readonly id: string;
  readonly email?: string;
  readonly phone?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly company?: string;

  // Lead scoring
  readonly leadScore?: number;
  readonly leadStatus?: string;

  // UTM tracking
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;

  // Custom properties
  readonly procedureInterest?: string[];
  readonly budgetRange?: string;
  readonly urgencyLevel?: string;
  readonly preferredLanguage?: string;

  // Lifecycle
  readonly lifecycleStage?: string;
  readonly ownerId?: string;

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Contact creation input
 */
export interface CreateCrmContactInput {
  email?: string;
  phone: PhoneNumber;
  firstName?: string;
  lastName?: string;
  company?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  lifecycleStage?: string;
  ownerId?: string;
  customProperties?: Record<string, string | number | boolean>;
}

/**
 * Contact update input
 */
export interface UpdateCrmContactInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  leadScore?: LeadScore;
  leadStatus?: string;
  procedureInterest?: string[];
  budgetRange?: string;
  urgencyLevel?: string;
  lifecycleStage?: string;
  ownerId?: string;
  customProperties?: Record<string, string | number | boolean>;
}

// ============================================================================
// CRM DEAL TYPES
// ============================================================================

/**
 * CRM Deal - Domain representation of a CRM deal/opportunity
 */
export interface CrmDeal {
  readonly id: string;
  readonly name: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly stage: string;
  readonly pipeline?: string;
  readonly contactId?: string;
  readonly ownerId?: string;
  readonly expectedCloseDate?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Deal creation input
 */
export interface CreateCrmDealInput {
  name: string;
  amount?: number;
  currency?: string;
  stage: string;
  pipeline?: string;
  contactId: string;
  ownerId?: string;
  expectedCloseDate?: Date;
  customProperties?: Record<string, string | number | boolean>;
}

// ============================================================================
// CRM TASK TYPES
// ============================================================================

/**
 * CRM Task - Domain representation of a CRM task
 */
export interface CrmTask {
  readonly id: string;
  readonly subject: string;
  readonly body?: string;
  readonly status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED';
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly dueDate?: Date;
  readonly contactId?: string;
  readonly dealId?: string;
  readonly ownerId?: string;
  readonly createdAt: Date;
}

/**
 * Task creation input
 */
export interface CreateCrmTaskInput {
  subject: string;
  body?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: Date;
  contactId?: string;
  dealId?: string;
  ownerId?: string;
}

// ============================================================================
// CRM NOTE TYPES
// ============================================================================

/**
 * CRM Note - Domain representation of a CRM note
 */
export interface CrmNote {
  readonly id: string;
  readonly body: string;
  readonly contactId?: string;
  readonly dealId?: string;
  readonly createdAt: Date;
}

/**
 * Note creation input
 */
export interface CreateCrmNoteInput {
  body: string;
  contactId?: string;
  dealId?: string;
}

// ============================================================================
// GATEWAY INTERFACE
// ============================================================================

/**
 * ICrmGateway - Banking Grade CRM Gateway
 *
 * This interface defines the contract for CRM operations.
 * Implementations can be HubSpot, Pipedrive, Salesforce, etc.
 *
 * DESIGN:
 * - All operations are idempotent where possible
 * - Returns Result types for error handling
 * - Supports both sync and async contact lookup
 *
 * @example
 * ```typescript
 * // Create or update contact (idempotent)
 * const contact = await crmGateway.upsertContact({
 *   phone: PhoneNumber.create('+40700000001'),
 *   firstName: 'Ion',
 *   utmSource: 'google'
 * });
 *
 * // Update lead score
 * await crmGateway.updateContactScore(contact.value.id, LeadScore.hot());
 *
 * // Create follow-up task
 * await crmGateway.createTask({
 *   subject: 'Follow up with hot lead',
 *   priority: 'HIGH',
 *   contactId: contact.value.id,
 *   dueDate: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
 * });
 * ```
 */
export interface ICrmGateway {
  // ============================================================================
  // CONTACT OPERATIONS
  // ============================================================================

  /**
   * Get contact by CRM ID
   *
   * @param id - CRM contact ID
   */
  getContact(id: string): Promise<CrmGatewayResult<CrmContact | null>>;

  /**
   * Find contact by phone number
   *
   * @param phone - PhoneNumber value object
   */
  findContactByPhone(phone: PhoneNumber): Promise<CrmGatewayResult<CrmContact | null>>;

  /**
   * Find contact by email
   *
   * @param email - Email address
   */
  findContactByEmail(email: string): Promise<CrmGatewayResult<CrmContact | null>>;

  /**
   * Create new contact
   *
   * @param input - Contact data
   * @param idempotencyKey - Optional key for idempotent creation
   */
  createContact(
    input: CreateCrmContactInput,
    idempotencyKey?: string
  ): Promise<CrmGatewayResult<CrmContact>>;

  /**
   * Update existing contact
   *
   * @param id - CRM contact ID
   * @param input - Update data
   */
  updateContact(id: string, input: UpdateCrmContactInput): Promise<CrmGatewayResult<CrmContact>>;

  /**
   * Create or update contact (idempotent by phone)
   *
   * This is the preferred method for lead ingestion.
   * Creates new contact if not found, updates if exists.
   *
   * @param input - Contact data
   */
  upsertContact(input: CreateCrmContactInput): Promise<CrmGatewayResult<CrmContact>>;

  /**
   * Update contact lead score
   *
   * Specialized method for scoring updates.
   *
   * @param id - CRM contact ID
   * @param score - LeadScore value object
   * @param metadata - Additional scoring metadata
   */
  updateContactScore(
    id: string,
    score: LeadScore,
    metadata?: ScoreUpdateMetadata
  ): Promise<CrmGatewayResult<CrmContact>>;

  /**
   * Delete contact
   *
   * @param id - CRM contact ID
   */
  deleteContact(id: string): Promise<CrmGatewayResult<void>>;

  // ============================================================================
  // DEAL OPERATIONS
  // ============================================================================

  /**
   * Get deal by ID
   *
   * @param id - CRM deal ID
   */
  getDeal(id: string): Promise<CrmGatewayResult<CrmDeal | null>>;

  /**
   * Find deals for contact
   *
   * @param contactId - CRM contact ID
   */
  findDealsByContact(contactId: string): Promise<CrmGatewayResult<CrmDeal[]>>;

  /**
   * Create new deal
   *
   * @param input - Deal data
   */
  createDeal(input: CreateCrmDealInput): Promise<CrmGatewayResult<CrmDeal>>;

  /**
   * Update deal stage
   *
   * @param id - CRM deal ID
   * @param stage - New stage
   */
  updateDealStage(id: string, stage: string): Promise<CrmGatewayResult<CrmDeal>>;

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  /**
   * Create task
   *
   * @param input - Task data
   */
  createTask(input: CreateCrmTaskInput): Promise<CrmGatewayResult<CrmTask>>;

  /**
   * Get pending tasks for contact
   *
   * @param contactId - CRM contact ID
   */
  getPendingTasksForContact(contactId: string): Promise<CrmGatewayResult<CrmTask[]>>;

  /**
   * Complete task
   *
   * @param id - CRM task ID
   */
  completeTask(id: string): Promise<CrmGatewayResult<CrmTask>>;

  // ============================================================================
  // NOTE OPERATIONS
  // ============================================================================

  /**
   * Add note to contact
   *
   * @param input - Note data
   */
  addNote(input: CreateCrmNoteInput): Promise<CrmGatewayResult<CrmNote>>;

  /**
   * Get notes for contact
   *
   * @param contactId - CRM contact ID
   * @param limit - Maximum notes to return
   */
  getNotesForContact(contactId: string, limit?: number): Promise<CrmGatewayResult<CrmNote[]>>;

  // ============================================================================
  // PIPELINE OPERATIONS
  // ============================================================================

  /**
   * Get available deal pipelines
   */
  getPipelines(): Promise<CrmGatewayResult<CrmPipeline[]>>;

  /**
   * Get pipeline stages
   *
   * @param pipelineId - Pipeline ID
   */
  getPipelineStages(pipelineId: string): Promise<CrmGatewayResult<CrmPipelineStage[]>>;

  // ============================================================================
  // OWNER OPERATIONS
  // ============================================================================

  /**
   * Get available owners/agents
   */
  getOwners(): Promise<CrmGatewayResult<CrmOwner[]>>;

  /**
   * Get owner by ID
   *
   * @param id - Owner ID
   */
  getOwner(id: string): Promise<CrmGatewayResult<CrmOwner | null>>;

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * Check CRM connection health
   */
  healthCheck(): Promise<CrmGatewayResult<CrmHealthStatus>>;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Gateway operation result
 */
export type CrmGatewayResult<T> =
  | { success: true; value: T }
  | { success: false; error: CrmGatewayError };

/**
 * Gateway error types
 */
export interface CrmGatewayError {
  readonly code: CrmGatewayErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly cause?: Error;
}

/**
 * Gateway error codes
 */
export type CrmGatewayErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_ERROR'
  | 'TIMEOUT'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/**
 * Score update metadata
 */
export interface ScoreUpdateMetadata {
  readonly method: 'ai' | 'rule_based' | 'manual';
  readonly reasoning?: string;
  readonly procedureInterest?: string[];
  readonly urgencyIndicators?: string[];
  readonly budgetMentioned?: boolean;
}

/**
 * CRM Pipeline
 */
export interface CrmPipeline {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

/**
 * CRM Pipeline Stage
 */
export interface CrmPipelineStage {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly probability?: number;
}

/**
 * CRM Owner/Agent
 */
export interface CrmOwner {
  readonly id: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isActive: boolean;
}

/**
 * CRM Health Status
 */
export interface CrmHealthStatus {
  readonly connected: boolean;
  readonly latencyMs: number;
  readonly rateLimit?: {
    readonly remaining: number;
    readonly resetAt: Date;
  };
  readonly apiVersion?: string;
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Create rate limited error
 */
export function rateLimitedError(resetAt: Date): CrmGatewayError {
  return {
    code: 'RATE_LIMITED',
    message: `CRM rate limit exceeded. Resets at ${resetAt.toISOString()}`,
    retryable: true,
    details: { resetAt: resetAt.toISOString() },
  };
}

/**
 * Create connection error
 */
export function connectionError(cause?: Error): CrmGatewayError {
  const baseError: CrmGatewayError = {
    code: 'CONNECTION_ERROR',
    message: 'Failed to connect to CRM',
    retryable: true,
  };

  if (cause !== undefined) {
    return { ...baseError, cause };
  }

  return baseError;
}

/**
 * Create not found error
 */
export function notFoundError(entityType: string, id: string): CrmGatewayError {
  return {
    code: 'NOT_FOUND',
    message: `${entityType} with ID ${id} not found`,
    retryable: false,
    details: { entityType, id },
  };
}

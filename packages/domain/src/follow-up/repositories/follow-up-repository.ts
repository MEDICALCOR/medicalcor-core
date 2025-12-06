/**
 * @fileoverview Follow-up Task Repository Interface (M13)
 *
 * Repository interface for follow-up task persistence.
 * Follows the Repository pattern from DDD.
 *
 * @module domain/follow-up/repositories/follow-up-repository
 */

import type {
  FollowUpTask,
  FollowUpTemplate,
  FollowUpAutomationRule,
  FollowUpTaskHistory,
  FollowUpTaskQuery,
  CreateFollowUpTask,
  UpdateFollowUpTask,
  FollowUpTaskPriority,
  FollowUpStatus,
  FollowUpType,
} from '@medicalcor/types';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type FollowUpRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'CONCURRENCY_ERROR'
  | 'UNKNOWN';

export interface FollowUpRepositoryError {
  readonly code: FollowUpRepositoryErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type FollowUpRepositoryResult<T> =
  | { success: true; data: T }
  | { success: false; error: FollowUpRepositoryError };

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface FollowUpTaskListResult {
  readonly tasks: FollowUpTask[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

export interface TasksByAgentQuery {
  readonly agentId: string;
  readonly status?: FollowUpStatus[];
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

export interface OverdueTasksQuery {
  readonly asOf?: Date;
  readonly priority?: FollowUpTaskPriority[];
  readonly assignedTo?: string;
  readonly limit?: number;
}

export interface TasksForEscalationQuery {
  readonly overdueMinutes: number;
  readonly maxAttempts: number;
  readonly excludeEscalated?: boolean;
  readonly limit?: number;
}

export interface TaskCountByStatus {
  readonly pending: number;
  readonly in_progress: number;
  readonly completed: number;
  readonly escalated: number;
  readonly skipped: number;
  readonly failed: number;
}

// ============================================================================
// FOLLOW-UP TASK REPOSITORY INTERFACE
// ============================================================================

export interface IFollowUpTaskRepository {
  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Create a new follow-up task
   */
  create(task: CreateFollowUpTask): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Get a follow-up task by ID
   */
  getById(id: string): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Get a follow-up task by idempotency key
   */
  getByIdempotencyKey(key: string): Promise<FollowUpRepositoryResult<FollowUpTask | null>>;

  /**
   * Update a follow-up task
   */
  update(id: string, updates: UpdateFollowUpTask): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Soft delete a follow-up task
   */
  softDelete(id: string, deletedBy: string, reason?: string): Promise<FollowUpRepositoryResult<void>>;

  // ============================================
  // Query Operations
  // ============================================

  /**
   * List follow-up tasks with filtering and pagination
   */
  list(query: FollowUpTaskQuery): Promise<FollowUpRepositoryResult<FollowUpTaskListResult>>;

  /**
   * Get tasks assigned to a specific agent
   */
  getByAgent(query: TasksByAgentQuery): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get tasks for a specific lead/contact
   */
  getByLead(leadId: string, includeCompleted?: boolean): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get tasks for a specific HubSpot contact
   */
  getByHubspotContact(contactId: string, includeCompleted?: boolean): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get tasks for a specific phone number
   */
  getByPhone(phone: string, includeCompleted?: boolean): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get overdue tasks
   */
  getOverdue(query: OverdueTasksQuery): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get tasks ready for escalation
   */
  getForEscalation(query: TasksForEscalationQuery): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get pending tasks scheduled for a time window
   */
  getScheduledInWindow(
    from: Date,
    to: Date,
    taskType?: FollowUpType[]
  ): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Count tasks by status for an agent or overall
   */
  countByStatus(agentId?: string): Promise<FollowUpRepositoryResult<TaskCountByStatus>>;

  // ============================================
  // Task Actions
  // ============================================

  /**
   * Mark task as started
   */
  markStarted(id: string, agentId: string): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Record an attempt on a task
   */
  recordAttempt(
    id: string,
    outcome: string,
    notes?: string,
    nextAttemptAt?: Date
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Mark task as completed
   */
  markCompleted(
    id: string,
    outcome: string,
    notes?: string,
    agentId?: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Mark task as escalated
   */
  markEscalated(
    id: string,
    reason: string,
    escalatedTo?: string,
    newPriority?: FollowUpTaskPriority
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Mark task as skipped
   */
  markSkipped(
    id: string,
    reason: string,
    skippedBy: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Mark task as failed
   */
  markFailed(id: string, reason: string): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Reschedule a task
   */
  reschedule(
    id: string,
    newScheduledFor: Date,
    newDueBy: Date,
    rescheduledBy: string,
    reason?: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Reassign a task to a different agent
   */
  reassign(
    id: string,
    newAgentId: string,
    assignedBy: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Bulk update task status
   */
  bulkUpdateStatus(
    taskIds: string[],
    status: FollowUpStatus,
    metadata?: { outcome?: string; notes?: string; performedBy?: string }
  ): Promise<FollowUpRepositoryResult<number>>;

  /**
   * Bulk reassign tasks
   */
  bulkReassign(
    taskIds: string[],
    newAgentId: string,
    assignedBy: string
  ): Promise<FollowUpRepositoryResult<number>>;

  // ============================================
  // History
  // ============================================

  /**
   * Get task history
   */
  getHistory(taskId: string): Promise<FollowUpRepositoryResult<FollowUpTaskHistory[]>>;
}

// ============================================================================
// FOLLOW-UP TEMPLATE REPOSITORY INTERFACE
// ============================================================================

export interface IFollowUpTemplateRepository {
  /**
   * Get a template by ID
   */
  getById(id: string): Promise<FollowUpRepositoryResult<FollowUpTemplate>>;

  /**
   * Get a template by name
   */
  getByName(name: string): Promise<FollowUpRepositoryResult<FollowUpTemplate | null>>;

  /**
   * List all active templates
   */
  listActive(): Promise<FollowUpRepositoryResult<FollowUpTemplate[]>>;

  /**
   * Get templates applicable to a classification
   */
  getForClassification(classification: string): Promise<FollowUpRepositoryResult<FollowUpTemplate[]>>;

  /**
   * Create a template
   */
  create(template: Omit<FollowUpTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<FollowUpRepositoryResult<FollowUpTemplate>>;

  /**
   * Update a template
   */
  update(id: string, updates: Partial<FollowUpTemplate>): Promise<FollowUpRepositoryResult<FollowUpTemplate>>;

  /**
   * Deactivate a template
   */
  deactivate(id: string): Promise<FollowUpRepositoryResult<void>>;
}

// ============================================================================
// FOLLOW-UP AUTOMATION RULE REPOSITORY INTERFACE
// ============================================================================

export interface IFollowUpAutomationRuleRepository {
  /**
   * Get a rule by ID
   */
  getById(id: string): Promise<FollowUpRepositoryResult<FollowUpAutomationRule>>;

  /**
   * Get a rule by name
   */
  getByName(name: string): Promise<FollowUpRepositoryResult<FollowUpAutomationRule | null>>;

  /**
   * Get rules triggered by a specific event
   */
  getByTriggerEvent(triggerEvent: string): Promise<FollowUpRepositoryResult<FollowUpAutomationRule[]>>;

  /**
   * List all active rules ordered by priority
   */
  listActive(): Promise<FollowUpRepositoryResult<FollowUpAutomationRule[]>>;

  /**
   * Create a rule
   */
  create(rule: Omit<FollowUpAutomationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<FollowUpRepositoryResult<FollowUpAutomationRule>>;

  /**
   * Update a rule
   */
  update(id: string, updates: Partial<FollowUpAutomationRule>): Promise<FollowUpRepositoryResult<FollowUpAutomationRule>>;

  /**
   * Deactivate a rule
   */
  deactivate(id: string): Promise<FollowUpRepositoryResult<void>>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function createNotFoundError(entity: string, id: string): FollowUpRepositoryError {
  return {
    code: 'NOT_FOUND',
    message: `${entity} with ID ${id} not found`,
    details: { entityType: entity, entityId: id },
  };
}

export function createDatabaseError(message: string, details?: Record<string, unknown>): FollowUpRepositoryError {
  return {
    code: 'DATABASE_ERROR',
    message,
    details,
  };
}

export function createDuplicateError(key: string, value: string): FollowUpRepositoryError {
  return {
    code: 'DUPLICATE',
    message: `Duplicate ${key}: ${value}`,
    details: { key, value },
  };
}

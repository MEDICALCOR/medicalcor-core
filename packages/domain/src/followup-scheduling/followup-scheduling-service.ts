/**
 * @fileoverview Follow-up Scheduling Domain Service
 *
 * M9 Feature: Automated follow-up task creation after call dispositions.
 * Provides post-disposition follow-up task scheduling and management.
 *
 * ## Hexagonal Architecture
 *
 * This module defines:
 * - Port Interface (IFollowUpSchedulingRepository) - what domain needs from infrastructure
 * - Domain Service (FollowUpSchedulingService) - business logic
 * - Factory Function - for dependency injection
 *
 * @module @medicalcor/domain/followup-scheduling
 *
 * @example
 * ```typescript
 * import {
 *   IFollowUpSchedulingRepository,
 *   FollowUpSchedulingService,
 *   createFollowUpSchedulingService
 * } from '@medicalcor/domain';
 *
 * // Dependency injection
 * const service = createFollowUpSchedulingService({
 *   repository,
 *   config: myConfig,
 * });
 *
 * // Schedule a follow-up from disposition
 * const task = await service.scheduleFromDisposition({
 *   clinicId: 'clinic-123',
 *   leadId: 'lead-456',
 *   dispositionId: 'disp-789',
 *   dispositionCode: 'CALLBACK_REQUESTED',
 *   followUpDays: 1,
 *   leadPhone: '+40712345678',
 *   leadName: 'Ion Popescu',
 *   leadScore: 'HOT',
 *   agentId: 'agent-abc',
 * });
 * ```
 */

import type {
  FollowUpTask,
  CreateFollowUpTask,
  UpdateFollowUpTask,
  FollowUpTaskStatus,
  FollowUpTaskType,
  FollowUpTaskPriority,
  FollowUpTaskFilters,
  FollowUpTaskPagination,
  FollowUpTaskPaginatedResult,
  FollowUpSchedulingConfig,
  SnoozeFollowUpTask,
  CompleteFollowUpTask,
  RecordFollowUpAttempt,
  FollowUpTaskSummary,
  AgentFollowUpPerformance,
} from '@medicalcor/types';

import {
  FollowUpSchedulingConfigSchema,
  CreateFollowUpTaskSchema,
  getPriorityForLeadScore,
  getFollowUpTypeForDisposition,
  isTaskOverdue,
  canSnoozeTask,
  canAttemptTask,
  adjustToBusinessHours,
} from '@medicalcor/types';

// ============================================================================
// DOMAIN ERRORS
// ============================================================================

/**
 * Error thrown when a follow-up task is not found
 */
export class FollowUpTaskNotFoundError extends Error {
  public readonly code = 'FOLLOWUP_TASK_NOT_FOUND';
  public readonly taskId: string;

  constructor(taskId: string) {
    super(`Follow-up task not found: ${taskId}`);
    this.name = 'FollowUpTaskNotFoundError';
    this.taskId = taskId;
  }
}

/**
 * Error thrown when a follow-up task cannot be snoozed
 */
export class SnoozeNotAllowedError extends Error {
  public readonly code = 'SNOOZE_NOT_ALLOWED';
  public readonly taskId: string;
  public readonly snoozeCount: number;
  public readonly maxSnoozes: number;

  constructor(taskId: string, snoozeCount: number, maxSnoozes: number) {
    super(
      `Cannot snooze task ${taskId}. Snooze count (${snoozeCount}) has reached maximum (${maxSnoozes})`
    );
    this.name = 'SnoozeNotAllowedError';
    this.taskId = taskId;
    this.snoozeCount = snoozeCount;
    this.maxSnoozes = maxSnoozes;
  }
}

/**
 * Error thrown when no more attempts are allowed
 */
export class MaxAttemptsReachedError extends Error {
  public readonly code = 'MAX_ATTEMPTS_REACHED';
  public readonly taskId: string;
  public readonly attemptCount: number;
  public readonly maxAttempts: number;

  constructor(taskId: string, attemptCount: number, maxAttempts: number) {
    super(
      `Cannot attempt task ${taskId}. Attempt count (${attemptCount}) has reached maximum (${maxAttempts})`
    );
    this.name = 'MaxAttemptsReachedError';
    this.taskId = taskId;
    this.attemptCount = attemptCount;
    this.maxAttempts = maxAttempts;
  }
}

/**
 * Error thrown when task is in invalid state for operation
 */
export class InvalidTaskStateError extends Error {
  public readonly code = 'INVALID_TASK_STATE';
  public readonly taskId: string;
  public readonly currentStatus: FollowUpTaskStatus;
  public readonly operation: string;

  constructor(taskId: string, currentStatus: FollowUpTaskStatus, operation: string) {
    super(`Cannot perform '${operation}' on task ${taskId} in status '${currentStatus}'`);
    this.name = 'InvalidTaskStateError';
    this.taskId = taskId;
    this.currentStatus = currentStatus;
    this.operation = operation;
  }
}

// ============================================================================
// PORT INTERFACE (Hexagonal Architecture)
// ============================================================================

/**
 * Follow-up Scheduling Repository Port
 *
 * This interface defines what the domain layer needs from the infrastructure
 * for follow-up task scheduling operations.
 */
export interface IFollowUpSchedulingRepository {
  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new follow-up task
   */
  create(input: CreateFollowUpTask): Promise<FollowUpTask>;

  /**
   * Find a follow-up task by ID
   */
  findById(id: string): Promise<FollowUpTask | null>;

  /**
   * Find follow-up tasks by lead ID
   */
  findByLeadId(leadId: string): Promise<FollowUpTask[]>;

  /**
   * Find follow-up tasks matching filters with pagination
   */
  findMany(
    filters: FollowUpTaskFilters,
    pagination?: FollowUpTaskPagination
  ): Promise<FollowUpTaskPaginatedResult>;

  /**
   * Update a follow-up task
   */
  update(id: string, updates: UpdateFollowUpTask): Promise<FollowUpTask>;

  /**
   * Delete a follow-up task
   */
  delete(id: string): Promise<void>;

  // ============================================================================
  // STATUS OPERATIONS
  // ============================================================================

  /**
   * Update task status
   */
  updateStatus(id: string, status: FollowUpTaskStatus): Promise<FollowUpTask>;

  /**
   * Get pending tasks for an agent
   */
  getPendingForAgent(agentId: string, limit?: number): Promise<FollowUpTask[]>;

  /**
   * Get due tasks (scheduled time has passed, still pending)
   */
  getDueTasks(clinicId: string | null, limit?: number): Promise<FollowUpTask[]>;

  /**
   * Get overdue tasks
   */
  getOverdueTasks(clinicId: string | null, limit?: number): Promise<FollowUpTask[]>;

  /**
   * Mark tasks as overdue (batch operation)
   */
  markOverdue(taskIds: string[]): Promise<number>;

  // ============================================================================
  // ASSIGNMENT OPERATIONS
  // ============================================================================

  /**
   * Assign task to an agent
   */
  assignToAgent(taskId: string, agentId: string): Promise<FollowUpTask>;

  /**
   * Unassign task from agent (return to queue)
   */
  unassign(taskId: string): Promise<FollowUpTask>;

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================

  /**
   * Get task summary statistics
   */
  getSummary(clinicId: string, startDate: Date, endDate: Date): Promise<FollowUpTaskSummary>;

  /**
   * Get agent performance metrics
   */
  getAgentPerformance(
    clinicId: string,
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AgentFollowUpPerformance>;

  /**
   * Count tasks by status for a clinic
   */
  countByStatus(
    clinicId: string,
    status: FollowUpTaskStatus | FollowUpTaskStatus[]
  ): Promise<number>;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Input for scheduling a follow-up from a disposition
 */
export interface ScheduleFromDispositionInput {
  clinicId: string;
  leadId: string;
  dispositionId: string;
  dispositionCode: string;
  requiresFollowUp: boolean;
  followUpDays?: number | null;
  leadPhone: string;
  leadName?: string | null;
  leadScore?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | null;
  leadLanguage?: 'ro' | 'en' | 'de';
  agentId?: string | null;
  notes?: string;
  correlationId?: string;
}

/**
 * Input for scheduling a manual follow-up
 */
export interface ScheduleManualFollowUpInput {
  clinicId: string;
  leadId: string;
  type: FollowUpTaskType;
  scheduledAt: Date;
  reason: string;
  leadPhone: string;
  leadName?: string | null;
  leadScore?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | null;
  leadLanguage?: 'ro' | 'en' | 'de';
  priority?: FollowUpTaskPriority;
  assignedAgentId?: string | null;
  notes?: string;
  tags?: string[];
  correlationId?: string;
}

/**
 * Result of processing due follow-ups
 */
export interface ProcessDueFollowUpsResult {
  processedAt: Date;
  clinicId: string | null;
  totalDue: number;
  totalOverdue: number;
  markedOverdue: number;
  remindersSent: number;
  errors: number;
  correlationId: string;
}

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

/**
 * Configuration options for FollowUpSchedulingService
 */
export interface FollowUpSchedulingServiceConfig {
  /** Follow-up scheduling configuration */
  config?: Partial<FollowUpSchedulingConfig>;
}

/**
 * Dependencies for FollowUpSchedulingService
 */
export interface FollowUpSchedulingServiceDeps {
  /** Repository for persistence */
  repository: IFollowUpSchedulingRepository;
  /** Logger instance */
  logger?: FollowUpSchedulingLogger;
}

/**
 * Logger interface for follow-up scheduling
 */
export interface FollowUpSchedulingLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

// No-op logger for default
const noopLogger: FollowUpSchedulingLogger = {
  debug: () => {
    /* intentionally empty */
  },
  info: () => {
    /* intentionally empty */
  },
  warn: () => {
    /* intentionally empty */
  },
  error: () => {
    /* intentionally empty */
  },
};

// ============================================================================
// DOMAIN SERVICE
// ============================================================================

/**
 * Follow-up Scheduling Domain Service
 *
 * Provides business logic for scheduling and managing follow-up tasks
 * after call dispositions.
 */
export class FollowUpSchedulingService {
  private readonly repository: IFollowUpSchedulingRepository;
  private readonly config: FollowUpSchedulingConfig;
  private readonly logger: FollowUpSchedulingLogger;

  constructor(serviceConfig: FollowUpSchedulingServiceConfig, deps: FollowUpSchedulingServiceDeps) {
    this.repository = deps.repository;
    this.logger = deps.logger ?? noopLogger;

    // Parse and validate config with defaults
    const configResult = FollowUpSchedulingConfigSchema.safeParse(serviceConfig.config ?? {});
    if (!configResult.success) {
      throw new Error(`Invalid follow-up scheduling config: ${configResult.error.message}`);
    }
    this.config = configResult.data;
  }

  // ============================================================================
  // SCHEDULING OPERATIONS
  // ============================================================================

  /**
   * Schedule a follow-up task from a call disposition
   *
   * This is the primary method for automatic follow-up creation after dispositions.
   */
  async scheduleFromDisposition(input: ScheduleFromDispositionInput): Promise<FollowUpTask | null> {
    const {
      clinicId,
      leadId,
      dispositionId,
      dispositionCode,
      requiresFollowUp,
      followUpDays,
      leadPhone,
      leadName,
      leadScore,
      leadLanguage = 'ro',
      agentId,
      notes,
      correlationId,
    } = input;

    // Determine if follow-up is needed
    const taskType = getFollowUpTypeForDisposition(dispositionCode, requiresFollowUp);
    if (!taskType) {
      this.logger.debug(
        { dispositionId, dispositionCode, requiresFollowUp },
        'No follow-up required for disposition'
      );
      return null;
    }

    // Calculate scheduled date
    const daysUntilFollowUp = followUpDays ?? this.config.defaultFollowUpDays[taskType] ?? 1;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + daysUntilFollowUp);

    // Adjust to business hours
    const adjustedScheduledAt = adjustToBusinessHours(
      scheduledAt,
      this.config.businessHoursStart,
      this.config.businessHoursEnd,
      this.config.workingDays
    );

    // Determine priority based on lead score
    const priority = getPriorityForLeadScore(leadScore ?? null, this.config);

    // Build task input
    const createInput: CreateFollowUpTask = {
      clinicId,
      leadId,
      dispositionId,
      type: taskType,
      priority,
      preferredChannel: 'phone',
      scheduledAt: adjustedScheduledAt,
      reason: this.getReasonForDisposition(dispositionCode),
      notes: notes ?? undefined,
      leadPhone,
      leadName: leadName ?? undefined,
      leadScore: leadScore ?? undefined,
      leadLanguage,
      maxAttempts: this.config.defaultMaxAttempts,
      maxSnoozes: this.config.defaultMaxSnoozes,
      createdBy: agentId ?? undefined,
      correlationId: correlationId ?? undefined,
    };

    // Assign to original agent if configured
    if (this.config.autoAssignToOriginalAgent && agentId) {
      createInput.assignedAgentId = agentId;
    }

    // Validate input
    const validationResult = CreateFollowUpTaskSchema.safeParse(createInput);
    if (!validationResult.success) {
      this.logger.error(
        { error: validationResult.error.message, input: createInput },
        'Invalid follow-up task input'
      );
      throw new Error(`Invalid follow-up task input: ${validationResult.error.message}`);
    }

    // Create the task
    const task = await this.repository.create(validationResult.data);

    this.logger.info(
      {
        taskId: task.id,
        clinicId,
        leadId,
        dispositionId,
        type: taskType,
        priority,
        scheduledAt: adjustedScheduledAt.toISOString(),
        correlationId,
      },
      'Follow-up task created from disposition'
    );

    return task;
  }

  /**
   * Schedule a manual follow-up task
   */
  async scheduleManual(input: ScheduleManualFollowUpInput): Promise<FollowUpTask> {
    const {
      clinicId,
      leadId,
      type,
      scheduledAt,
      reason,
      leadPhone,
      leadName,
      leadScore,
      leadLanguage = 'ro',
      priority,
      assignedAgentId,
      notes,
      tags,
      correlationId,
    } = input;

    // Adjust to business hours
    const adjustedScheduledAt = adjustToBusinessHours(
      scheduledAt,
      this.config.businessHoursStart,
      this.config.businessHoursEnd,
      this.config.workingDays
    );

    // Determine priority if not provided
    const taskPriority = priority ?? getPriorityForLeadScore(leadScore ?? null, this.config);

    const createInput: CreateFollowUpTask = {
      clinicId,
      leadId,
      type,
      priority: taskPriority,
      preferredChannel: 'phone',
      scheduledAt: adjustedScheduledAt,
      reason,
      notes: notes ?? undefined,
      tags: tags ?? [],
      leadPhone,
      leadName: leadName ?? undefined,
      leadScore: leadScore ?? undefined,
      leadLanguage,
      assignedAgentId: assignedAgentId ?? undefined,
      maxAttempts: this.config.defaultMaxAttempts,
      maxSnoozes: this.config.defaultMaxSnoozes,
      correlationId: correlationId ?? undefined,
    };

    // Validate input
    const validationResult = CreateFollowUpTaskSchema.safeParse(createInput);
    if (!validationResult.success) {
      throw new Error(`Invalid follow-up task input: ${validationResult.error.message}`);
    }

    const task = await this.repository.create(validationResult.data);

    this.logger.info(
      {
        taskId: task.id,
        clinicId,
        leadId,
        type,
        priority: taskPriority,
        scheduledAt: adjustedScheduledAt.toISOString(),
        correlationId,
      },
      'Manual follow-up task created'
    );

    return task;
  }

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  /**
   * Get a follow-up task by ID
   */
  async getTask(taskId: string): Promise<FollowUpTask> {
    const task = await this.repository.findById(taskId);
    if (!task) {
      throw new FollowUpTaskNotFoundError(taskId);
    }
    return task;
  }

  /**
   * Get follow-up tasks for a lead
   */
  async getTasksForLead(leadId: string): Promise<FollowUpTask[]> {
    return this.repository.findByLeadId(leadId);
  }

  /**
   * Query follow-up tasks with filters
   */
  async queryTasks(
    filters: FollowUpTaskFilters,
    pagination?: FollowUpTaskPagination
  ): Promise<FollowUpTaskPaginatedResult> {
    return this.repository.findMany(filters, pagination);
  }

  /**
   * Snooze a follow-up task
   */
  async snoozeTask(taskId: string, input: SnoozeFollowUpTask): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check if snooze is allowed
    if (!canSnoozeTask(task)) {
      throw new SnoozeNotAllowedError(taskId, task.snoozeCount, task.maxSnoozes);
    }

    // Check task state
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new InvalidTaskStateError(taskId, task.status, 'snooze');
    }

    // Adjust snooze time to business hours
    const adjustedSnoozedUntil = adjustToBusinessHours(
      input.snoozedUntil,
      this.config.businessHoursStart,
      this.config.businessHoursEnd,
      this.config.workingDays
    );

    const updates: UpdateFollowUpTask = {
      status: 'snoozed',
      dueAt: adjustedSnoozedUntil,
    };

    const updatedTask = await this.repository.update(taskId, updates);

    this.logger.info(
      {
        taskId,
        snoozeCount: updatedTask.snoozeCount,
        newDueAt: adjustedSnoozedUntil.toISOString(),
        reason: input.reason,
      },
      'Follow-up task snoozed'
    );

    return updatedTask;
  }

  /**
   * Record an attempt on a follow-up task
   */
  async recordAttempt(taskId: string, input: RecordFollowUpAttempt): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check if attempts are allowed
    if (!canAttemptTask(task)) {
      throw new MaxAttemptsReachedError(taskId, task.attemptCount, task.maxAttempts);
    }

    // Check task state
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new InvalidTaskStateError(taskId, task.status, 'record attempt');
    }

    // Update task - the repository should increment attemptCount
    const updates: UpdateFollowUpTask = {
      status: 'pending', // Reset to pending after attempt
    };

    const updatedTask = await this.repository.update(taskId, updates);

    this.logger.info(
      {
        taskId,
        attemptCount: updatedTask.attemptCount,
        outcome: input.outcome,
        channel: input.channel,
      },
      'Follow-up attempt recorded'
    );

    return updatedTask;
  }

  /**
   * Complete a follow-up task
   */
  async completeTask(taskId: string, input: CompleteFollowUpTask): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check task state
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new InvalidTaskStateError(taskId, task.status, 'complete');
    }

    const updates: UpdateFollowUpTask = {
      status: 'completed',
    };

    const updatedTask = await this.repository.update(taskId, updates);

    this.logger.info(
      {
        taskId,
        outcome: input.outcome,
        attemptCount: updatedTask.attemptCount,
      },
      'Follow-up task completed'
    );

    // Create follow-up task if requested
    if (input.createFollowUp && input.nextFollowUp) {
      const nextTask = await this.scheduleManual({
        clinicId: task.clinicId,
        leadId: task.leadId,
        type: input.nextFollowUp.type ?? 'follow_up_call',
        scheduledAt: input.nextFollowUp.scheduledAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
        reason: input.nextFollowUp.reason ?? `Follow-up from task ${taskId}`,
        leadPhone: task.leadPhone,
        leadName: task.leadName,
        leadScore: task.leadScore,
        leadLanguage: task.leadLanguage,
        priority: input.nextFollowUp.priority,
        notes: input.nextFollowUp.notes,
        correlationId: task.correlationId ?? undefined,
      });

      this.logger.info(
        { originalTaskId: taskId, newTaskId: nextTask.id },
        'Created follow-up task from completion'
      );
    }

    return updatedTask;
  }

  /**
   * Cancel a follow-up task
   */
  async cancelTask(taskId: string, reason?: string): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check task state
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new InvalidTaskStateError(taskId, task.status, 'cancel');
    }

    const updates: UpdateFollowUpTask = {
      status: 'cancelled',
      notes: reason ? `${task.notes ?? ''}\nCancelled: ${reason}`.trim() : task.notes,
    };

    const updatedTask = await this.repository.update(taskId, updates);

    this.logger.info({ taskId, reason }, 'Follow-up task cancelled');

    return updatedTask;
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(taskId: string, agentId: string): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check task state
    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new InvalidTaskStateError(taskId, task.status, 'assign');
    }

    const updatedTask = await this.repository.assignToAgent(taskId, agentId);

    this.logger.info({ taskId, agentId }, 'Follow-up task assigned to agent');

    return updatedTask;
  }

  /**
   * Start working on a task
   */
  async startTask(taskId: string): Promise<FollowUpTask> {
    const task = await this.getTask(taskId);

    // Check task state - can only start pending/due/overdue tasks
    const allowedStatuses: FollowUpTaskStatus[] = ['pending', 'due', 'overdue', 'snoozed'];
    if (!allowedStatuses.includes(task.status)) {
      throw new InvalidTaskStateError(taskId, task.status, 'start');
    }

    const updatedTask = await this.repository.updateStatus(taskId, 'in_progress');

    this.logger.info({ taskId }, 'Follow-up task started');

    return updatedTask;
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Process due follow-up tasks
   *
   * This method is typically called by a cron job to:
   * 1. Mark overdue tasks
   * 2. Update task statuses
   * 3. Trigger reminders (when integrated with notification service)
   */
  async processDueTasks(
    clinicId: string | null,
    correlationId: string
  ): Promise<ProcessDueFollowUpsResult> {
    const processedAt = new Date();
    let totalDue = 0;
    let totalOverdue = 0;
    let markedOverdue = 0;
    const remindersSent = 0;
    let errors = 0;

    try {
      // Get due tasks
      const dueTasks = await this.repository.getDueTasks(clinicId, 1000);
      totalDue = dueTasks.length;

      // Find overdue tasks
      const overdueTaskIds: string[] = [];
      for (const task of dueTasks) {
        if (isTaskOverdue(task)) {
          overdueTaskIds.push(task.id);
        }
      }
      totalOverdue = overdueTaskIds.length;

      // Mark tasks as overdue
      if (overdueTaskIds.length > 0) {
        markedOverdue = await this.repository.markOverdue(overdueTaskIds);
      }

      this.logger.info(
        {
          clinicId,
          totalDue,
          totalOverdue,
          markedOverdue,
          correlationId,
        },
        'Processed due follow-up tasks'
      );
    } catch (error) {
      errors++;
      this.logger.error({ error, clinicId, correlationId }, 'Error processing due follow-up tasks');
    }

    return {
      processedAt,
      clinicId,
      totalDue,
      totalOverdue,
      markedOverdue,
      remindersSent,
      errors,
      correlationId,
    };
  }

  /**
   * Get pending tasks for an agent's queue
   */
  async getAgentQueue(agentId: string, limit = 20): Promise<FollowUpTask[]> {
    return this.repository.getPendingForAgent(agentId, limit);
  }

  /**
   * Get overdue tasks for escalation
   */
  async getOverdueTasks(clinicId: string | null, limit = 100): Promise<FollowUpTask[]> {
    return this.repository.getOverdueTasks(clinicId, limit);
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get task summary statistics
   */
  async getSummary(clinicId: string, startDate: Date, endDate: Date): Promise<FollowUpTaskSummary> {
    return this.repository.getSummary(clinicId, startDate, endDate);
  }

  /**
   * Get agent performance metrics
   */
  async getAgentPerformance(
    clinicId: string,
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AgentFollowUpPerformance> {
    return this.repository.getAgentPerformance(clinicId, agentId, startDate, endDate);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get a reason string for a disposition code
   */
  private getReasonForDisposition(dispositionCode: string): string {
    const reasons: Record<string, string> = {
      CALLBACK_REQUESTED: 'Customer requested callback',
      DECISION_PENDING: 'Customer needs time to decide',
      INTERESTED: 'Customer interested, needs nurturing',
      INFO_SENT: 'Follow up on sent information/quote',
      NO_ANSWER: 'Previous call not answered',
      BUSY: 'Customer was busy, try again',
      VOICEMAIL: 'Left voicemail, follow up',
      APPT_SCHEDULED: 'Confirm upcoming appointment',
    };

    return reasons[dispositionCode] ?? `Follow-up for disposition: ${dispositionCode}`;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new FollowUpSchedulingService instance
 *
 * @example
 * ```typescript
 * import { createFollowUpSchedulingService } from '@medicalcor/domain';
 *
 * const service = createFollowUpSchedulingService({
 *   repository: myRepository,
 *   config: {
 *     autoAssignToOriginalAgent: true,
 *     businessHoursStart: '09:00',
 *     businessHoursEnd: '18:00',
 *   },
 *   logger: myLogger,
 * });
 * ```
 */
export function createFollowUpSchedulingService(options: {
  repository: IFollowUpSchedulingRepository;
  config?: Partial<FollowUpSchedulingConfig>;
  logger?: FollowUpSchedulingLogger;
}): FollowUpSchedulingService {
  return new FollowUpSchedulingService(
    { config: options.config },
    { repository: options.repository, logger: options.logger }
  );
}

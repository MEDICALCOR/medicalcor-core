/**
 * @fileoverview Follow-up Task Domain Service (M13)
 *
 * Domain service for follow-up task automation and lead nurturing.
 * Orchestrates task creation, scheduling, and escalation.
 *
 * @module domain/follow-up/follow-up-service
 */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */

import type {
  FollowUpTask,
  FollowUpAutomationRule,
  CreateFollowUpTask,
  FollowUpTaskPriority,
  FollowUpTrigger,
  FollowUpChannel,
} from '@medicalcor/types';

import type {
  IFollowUpTaskRepository,
  IFollowUpTemplateRepository,
  IFollowUpAutomationRuleRepository,
  FollowUpRepositoryResult,
} from './repositories/follow-up-repository.js';

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

export interface FollowUpServiceConfig {
  /** Default SLA in minutes for tasks without template */
  defaultSlaMinutes: number;

  /** Default max attempts for tasks */
  defaultMaxAttempts: number;

  /** Hours to wait between automation triggers for same lead (cooldown) */
  defaultCooldownHours: number;

  /** Maximum tasks per lead from automation */
  maxTasksPerLead: number;

  /** Enable automatic task creation from events */
  enableAutomation: boolean;
}

export const DEFAULT_CONFIG: FollowUpServiceConfig = {
  defaultSlaMinutes: 60,
  defaultMaxAttempts: 3,
  defaultCooldownHours: 24,
  maxTasksPerLead: 10,
  enableAutomation: true,
};

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

export interface FollowUpServiceDependencies {
  taskRepository: IFollowUpTaskRepository;
  templateRepository: IFollowUpTemplateRepository;
  ruleRepository: IFollowUpAutomationRuleRepository;
  config?: Partial<FollowUpServiceConfig>;
}

// ============================================================================
// LEAD CONTEXT FOR TASK CREATION
// ============================================================================

export interface LeadContext {
  phone: string;
  hubspotContactId?: string;
  leadId?: string;
  score?: number;
  classification?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  status?: string;
  procedureInterest?: string[];
  channel?: FollowUpChannel;
  preferredLanguage?: 'ro' | 'en' | 'de';
  lastContactAt?: Date;
  name?: string;
}

// ============================================================================
// AUTOMATION TRIGGER CONTEXT
// ============================================================================

export interface AutomationTriggerContext {
  triggerEvent: string;
  leadContext: LeadContext;
  eventPayload?: Record<string, unknown>;
  correlationId: string;
}

// ============================================================================
// SERVICE RESULT TYPES
// ============================================================================

export interface CreateTaskResult {
  success: boolean;
  task?: FollowUpTask;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export interface AutomationResult {
  triggered: boolean;
  tasksCreated: number;
  tasksSkipped: number;
  errors: string[];
  details: Array<{
    ruleName: string;
    ruleId: string;
    result: 'created' | 'skipped' | 'error';
    taskId?: string;
    reason?: string;
  }>;
}

export interface EscalationResult {
  escalated: boolean;
  taskId: string;
  escalationTaskId?: string;
  error?: string;
}

// ============================================================================
// FOLLOW-UP SERVICE
// ============================================================================

export interface IFollowUpService {
  // ============================================
  // Task Creation
  // ============================================

  /**
   * Create a follow-up task from a template
   */
  createFromTemplate(
    templateName: string,
    leadContext: LeadContext,
    options?: {
      priority?: FollowUpTaskPriority;
      delayMinutes?: number;
      assignTo?: string;
      correlationId?: string;
    }
  ): Promise<CreateTaskResult>;

  /**
   * Create a manual follow-up task
   */
  createManual(
    input: Omit<CreateFollowUpTask, 'triggerType'>,
    createdBy: string
  ): Promise<CreateTaskResult>;

  /**
   * Process automation trigger and create tasks based on rules
   */
  processAutomationTrigger(context: AutomationTriggerContext): Promise<AutomationResult>;

  // ============================================
  // Task Lifecycle
  // ============================================

  /**
   * Start working on a task
   */
  startTask(taskId: string, agentId: string): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Record an attempt on a task
   */
  recordAttempt(
    taskId: string,
    outcome: string,
    notes?: string,
    agentId?: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Complete a task
   */
  completeTask(
    taskId: string,
    outcome: string,
    notes?: string,
    agentId?: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Skip a task
   */
  skipTask(
    taskId: string,
    reason: string,
    skippedBy: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Escalate a task
   */
  escalateTask(
    taskId: string,
    reason: string,
    escalatedBy: string,
    escalateTo?: string
  ): Promise<EscalationResult>;

  // ============================================
  // Task Scheduling
  // ============================================

  /**
   * Reschedule a task
   */
  rescheduleTask(
    taskId: string,
    newScheduledFor: Date,
    newDueBy: Date,
    rescheduledBy: string,
    reason?: string
  ): Promise<FollowUpRepositoryResult<FollowUpTask>>;

  /**
   * Get next tasks to process for an agent
   */
  getNextTasksForAgent(agentId: string, limit?: number): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get overdue tasks needing attention
   */
  getOverdueTasks(limit?: number): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  /**
   * Get tasks ready for escalation
   */
  getTasksForEscalation(): Promise<FollowUpRepositoryResult<FollowUpTask[]>>;

  // ============================================
  // Automation Management
  // ============================================

  /**
   * Check if automation should be triggered for a lead
   */
  shouldTriggerAutomation(
    ruleId: string,
    leadContext: LeadContext
  ): Promise<{ shouldTrigger: boolean; reason?: string }>;

  /**
   * Get applicable automation rules for an event
   */
  getApplicableRules(triggerEvent: string, leadContext: LeadContext): Promise<FollowUpAutomationRule[]>;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export function createFollowUpService(deps: FollowUpServiceDependencies): IFollowUpService {
  const config: FollowUpServiceConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const { taskRepository, templateRepository, ruleRepository } = deps;

  /**
   * Generate idempotency key for task creation
   */
  function generateIdempotencyKey(
    triggerType: FollowUpTrigger,
    phone: string,
    templateName?: string,
    correlationId?: string
  ): string {
    const parts = [triggerType, phone, templateName ?? 'manual', correlationId ?? Date.now().toString()];
    return parts.join(':');
  }

  /**
   * Calculate scheduled time based on delay
   */
  function calculateScheduledTime(delayMinutes: number): Date {
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  /**
   * Calculate due time based on SLA
   */
  function calculateDueTime(scheduledFor: Date, slaMinutes: number): Date {
    return new Date(scheduledFor.getTime() + slaMinutes * 60 * 1000);
  }

  /**
   * Apply template variables to a string
   */
  function applyTemplateVariables(template: string, context: LeadContext): string {
    let result = template;
    result = result.replace(/\{\{phone\}\}/g, context.phone);
    result = result.replace(/\{\{name\}\}/g, context.name ?? 'Patient');
    result = result.replace(/\{\{score\}\}/g, context.score?.toString() ?? 'N/A');
    result = result.replace(/\{\{procedures\}\}/g, context.procedureInterest?.join(', ') ?? 'Unknown');
    result = result.replace(/\{\{classification\}\}/g, context.classification ?? 'Unknown');
    return result;
  }

  /**
   * Check if lead matches automation conditions
   */
  function matchesConditions(
    conditions: Record<string, unknown>,
    leadContext: LeadContext
  ): boolean {
    // Check classification
    if (conditions.classification && Array.isArray(conditions.classification)) {
      if (!leadContext.classification || !conditions.classification.includes(leadContext.classification)) {
        return false;
      }
    }

    // Check min score
    if (typeof conditions.minScore === 'number') {
      if (!leadContext.score || leadContext.score < conditions.minScore) {
        return false;
      }
    }

    // Check max score
    if (typeof conditions.maxScore === 'number') {
      if (!leadContext.score || leadContext.score > conditions.maxScore) {
        return false;
      }
    }

    // Check statuses
    if (conditions.statuses && Array.isArray(conditions.statuses)) {
      if (!leadContext.status || !conditions.statuses.includes(leadContext.status)) {
        return false;
      }
    }

    return true;
  }

  return {
    // ============================================
    // Task Creation
    // ============================================

    async createFromTemplate(
      templateName: string,
      leadContext: LeadContext,
      options = {}
    ): Promise<CreateTaskResult> {
      // Get template
      const templateResult = await templateRepository.getByName(templateName);
      if (!templateResult.success || !templateResult.data) {
        return {
          success: false,
          error: `Template '${templateName}' not found`,
        };
      }

      const template = templateResult.data;

      // Check if template applies to this classification
      if (
        leadContext.classification &&
        template.appliesToClassifications &&
        template.appliesToClassifications.length > 0 &&
        !template.appliesToClassifications.includes(leadContext.classification)
      ) {
        return {
          success: false,
          skipped: true,
          skipReason: `Template does not apply to ${leadContext.classification} classification`,
        };
      }

      // Calculate timing
      const delayMinutes = options.delayMinutes ?? template.delayHours * 60;
      const scheduledFor = calculateScheduledTime(delayMinutes);
      const dueBy = calculateDueTime(scheduledFor, template.defaultSlaMinutes);

      // Generate idempotency key
      const idempotencyKey = generateIdempotencyKey(
        'schedule',
        leadContext.phone,
        templateName,
        options.correlationId
      );

      // Check for existing task with same idempotency key
      const existingResult = await taskRepository.getByIdempotencyKey(idempotencyKey);
      if (existingResult.success && existingResult.data) {
        return {
          success: true,
          task: existingResult.data,
          skipped: true,
          skipReason: 'Task already exists (idempotent)',
        };
      }

      // Create task input
      const taskInput: CreateFollowUpTask = {
        phone: leadContext.phone,
        hubspotContactId: leadContext.hubspotContactId,
        leadId: leadContext.leadId,
        taskType: template.taskType,
        triggerType: 'schedule',
        title: applyTemplateVariables(template.titleTemplate, leadContext),
        description: template.descriptionTemplate
          ? applyTemplateVariables(template.descriptionTemplate, leadContext)
          : undefined,
        priority: options.priority ?? template.defaultPriority,
        scheduledFor: scheduledFor,
        dueBy: dueBy,
        slaMinutes: template.defaultSlaMinutes,
        maxAttempts: template.defaultMaxAttempts,
        assignedTo: options.assignTo,
        assignedBy: options.assignTo ? 'auto' : undefined,
        leadScore: leadContext.score,
        leadClassification: leadContext.classification,
        procedureInterest: leadContext.procedureInterest,
        channel: template.preferredChannel as FollowUpChannel,
        preferredLanguage: leadContext.preferredLanguage ?? 'ro',
        correlationId: options.correlationId,
        idempotencyKey,
        createdBy: 'system',
      };

      // Create task
      const createResult = await taskRepository.create(taskInput);
      if (!createResult.success) {
        return {
          success: false,
          error: createResult.error.message,
        };
      }

      return {
        success: true,
        task: createResult.data,
      };
    },

    async createManual(
      input: Omit<CreateFollowUpTask, 'triggerType'>,
      createdBy: string
    ): Promise<CreateTaskResult> {
      const taskInput: CreateFollowUpTask = {
        ...input,
        triggerType: 'manual',
        createdBy,
        idempotencyKey: generateIdempotencyKey('manual', input.phone, undefined, input.correlationId),
      };

      const result = await taskRepository.create(taskInput);
      if (!result.success) {
        return {
          success: false,
          error: result.error.message,
        };
      }

      return {
        success: true,
        task: result.data,
      };
    },

    async processAutomationTrigger(context: AutomationTriggerContext): Promise<AutomationResult> {
      if (!config.enableAutomation) {
        return {
          triggered: false,
          tasksCreated: 0,
          tasksSkipped: 0,
          errors: [],
          details: [],
        };
      }

      const result: AutomationResult = {
        triggered: false,
        tasksCreated: 0,
        tasksSkipped: 0,
        errors: [],
        details: [],
      };

      // Get applicable rules
      const rulesResult = await ruleRepository.getByTriggerEvent(context.triggerEvent);
      if (!rulesResult.success || !rulesResult.data.length) {
        return result;
      }

      const rules = rulesResult.data;
      result.triggered = true;

      for (const rule of rules) {
        // Check if rule conditions match
        if (!matchesConditions(rule.conditions as Record<string, unknown>, context.leadContext)) {
          result.tasksSkipped++;
          result.details.push({
            ruleName: rule.name,
            ruleId: rule.id,
            result: 'skipped',
            reason: 'Conditions not met',
          });
          continue;
        }

        // Check cooldown
        const shouldTriggerResult = await this.shouldTriggerAutomation(rule.id, context.leadContext);
        if (!shouldTriggerResult.shouldTrigger) {
          result.tasksSkipped++;
          result.details.push({
            ruleName: rule.name,
            ruleId: rule.id,
            result: 'skipped',
            reason: shouldTriggerResult.reason ?? 'Automation blocked',
          });
          continue;
        }

        // Get template if specified
        let templateName: string | undefined;
        if (rule.templateId) {
          const templateResult = await templateRepository.getById(rule.templateId);
          if (templateResult.success) {
            templateName = templateResult.data.name;
          }
        }

        if (templateName) {
          // Create from template
          const createResult = await this.createFromTemplate(
            templateName,
            context.leadContext,
            {
              priority: rule.priorityOverride,
              delayMinutes: rule.delayMinutes,
              correlationId: context.correlationId,
            }
          );

          if (createResult.success && !createResult.skipped) {
            result.tasksCreated++;
            result.details.push({
              ruleName: rule.name,
              ruleId: rule.id,
              result: 'created',
              taskId: createResult.task?.id,
            });
          } else if (createResult.skipped) {
            result.tasksSkipped++;
            result.details.push({
              ruleName: rule.name,
              ruleId: rule.id,
              result: 'skipped',
              reason: createResult.skipReason,
            });
          } else {
            result.errors.push(`Rule ${rule.name}: ${createResult.error}`);
            result.details.push({
              ruleName: rule.name,
              ruleId: rule.id,
              result: 'error',
              reason: createResult.error,
            });
          }
        } else {
          result.tasksSkipped++;
          result.details.push({
            ruleName: rule.name,
            ruleId: rule.id,
            result: 'skipped',
            reason: 'No template configured',
          });
        }
      }

      return result;
    },

    // ============================================
    // Task Lifecycle
    // ============================================

    async startTask(taskId: string, agentId: string) {
      return taskRepository.markStarted(taskId, agentId);
    },

    async recordAttempt(taskId: string, outcome: string, notes?: string, _agentId?: string) {
      // Get current task to determine next attempt
      const taskResult = await taskRepository.getById(taskId);
      if (!taskResult.success) {
        return taskResult;
      }

      const task = taskResult.data;
      const newAttemptCount = task.attemptCount + 1;

      // Calculate next attempt if not max
      let nextAttemptAt: Date | undefined;
      if (newAttemptCount < task.maxAttempts) {
        // Exponential backoff: 1h, 4h, 12h, 24h...
        const hoursDelay = Math.pow(2, newAttemptCount) * 0.5;
        nextAttemptAt = new Date(Date.now() + hoursDelay * 60 * 60 * 1000);
      }

      return taskRepository.recordAttempt(taskId, outcome, notes, nextAttemptAt);
    },

    async completeTask(taskId: string, outcome: string, notes?: string, agentId?: string) {
      return taskRepository.markCompleted(taskId, outcome, notes, agentId);
    },

    async skipTask(taskId: string, reason: string, skippedBy: string) {
      return taskRepository.markSkipped(taskId, reason, skippedBy);
    },

    async escalateTask(
      taskId: string,
      reason: string,
      escalatedBy: string,
      escalateTo?: string
    ): Promise<EscalationResult> {
      const escalateResult = await taskRepository.markEscalated(
        taskId,
        reason,
        escalateTo,
        'urgent'
      );

      if (!escalateResult.success) {
        return {
          escalated: false,
          taskId,
          error: escalateResult.error.message,
        };
      }

      return {
        escalated: true,
        taskId,
        escalationTaskId: escalateResult.data.id,
      };
    },

    // ============================================
    // Task Scheduling
    // ============================================

    async rescheduleTask(
      taskId: string,
      newScheduledFor: Date,
      newDueBy: Date,
      rescheduledBy: string,
      reason?: string
    ) {
      return taskRepository.reschedule(taskId, newScheduledFor, newDueBy, rescheduledBy, reason);
    },

    async getNextTasksForAgent(agentId: string, _limit = 10) {
      return taskRepository.getByAgent({
        agentId,
        status: ['pending', 'in_progress'],
      });
    },

    async getOverdueTasks(limit = 50) {
      return taskRepository.getOverdue({ limit });
    },

    async getTasksForEscalation() {
      return taskRepository.getForEscalation({
        overdueMinutes: 60,
        maxAttempts: config.defaultMaxAttempts,
        excludeEscalated: true,
        limit: 100,
      });
    },

    // ============================================
    // Automation Management
    // ============================================

    async shouldTriggerAutomation(
      ruleId: string,
      leadContext: LeadContext
    ): Promise<{ shouldTrigger: boolean; reason?: string }> {
      // Get rule
      const ruleResult = await ruleRepository.getById(ruleId);
      if (!ruleResult.success) {
        return { shouldTrigger: false, reason: 'Rule not found' };
      }

      const rule = ruleResult.data;

      // Check if lead has too many tasks
      const existingTasksResult = await taskRepository.getByPhone(leadContext.phone, true);
      if (existingTasksResult.success && existingTasksResult.data.length >= rule.maxTasksPerLead) {
        return { shouldTrigger: false, reason: 'Max tasks per lead reached' };
      }

      // Check cooldown
      if (existingTasksResult.success) {
        const recentTask = existingTasksResult.data.find((task) => {
          const taskAge = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60);
          return taskAge < rule.cooldownHours && task.automationRuleId === ruleId;
        });

        if (recentTask) {
          return { shouldTrigger: false, reason: 'Cooldown period active' };
        }
      }

      return { shouldTrigger: true };
    },

    async getApplicableRules(
      triggerEvent: string,
      leadContext: LeadContext
    ): Promise<FollowUpAutomationRule[]> {
      const rulesResult = await ruleRepository.getByTriggerEvent(triggerEvent);
      if (!rulesResult.success) {
        return [];
      }

      return rulesResult.data.filter((rule) =>
        matchesConditions(rule.conditions as Record<string, unknown>, leadContext)
      );
    },
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type FollowUpService = IFollowUpService;

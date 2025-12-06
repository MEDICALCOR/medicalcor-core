/**
 * @fileoverview Follow-up Task Domain Events (M13)
 *
 * Strictly typed domain events for follow-up task lifecycle.
 * Used for event sourcing and audit trail.
 *
 * @module domain/follow-up/events/follow-up-events
 */

import type { EventMetadata } from '../../shared-kernel/domain-events/lead-events.js';

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Base domain event interface for follow-up tasks
 */
export interface FollowUpDomainEvent<TType extends string, TPayload> {
  readonly type: TType;
  readonly aggregateId: string;
  readonly aggregateType: 'FollowUpTask';
  readonly metadata: EventMetadata;
  readonly payload: TPayload;
}

// ============================================================================
// FOLLOW-UP TASK LIFECYCLE EVENTS
// ============================================================================

/**
 * FollowUpTaskCreated - Emitted when a new follow-up task is created
 */
export interface FollowUpTaskCreatedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly leadId?: string;
  readonly taskType: string;
  readonly triggerType: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: 'urgent' | 'high' | 'medium' | 'low';
  readonly scheduledFor: string;
  readonly dueBy: string;
  readonly slaMinutes: number;
  readonly assignedTo?: string;
  readonly leadScore?: number;
  readonly leadClassification?: string;
  readonly procedureInterest?: readonly string[];
  readonly channel?: string;
  readonly templateName?: string;
  readonly automationRuleId?: string;
  readonly createdBy: string;
}

export type FollowUpTaskCreatedEvent = FollowUpDomainEvent<
  'follow_up_task.created',
  FollowUpTaskCreatedPayload
>;

/**
 * FollowUpTaskAssigned - Emitted when a task is assigned to an agent
 */
export interface FollowUpTaskAssignedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly previousAssignee?: string;
  readonly newAssignee: string;
  readonly assignedBy: string;
  readonly assignmentStrategy?: string;
  readonly priority: string;
  readonly slaDeadline: string;
}

export type FollowUpTaskAssignedEvent = FollowUpDomainEvent<
  'follow_up_task.assigned',
  FollowUpTaskAssignedPayload
>;

/**
 * FollowUpTaskStarted - Emitted when an agent starts working on a task
 */
export interface FollowUpTaskStartedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly assignedTo: string;
  readonly startedAt: string;
  readonly attemptNumber: number;
}

export type FollowUpTaskStartedEvent = FollowUpDomainEvent<
  'follow_up_task.started',
  FollowUpTaskStartedPayload
>;

/**
 * FollowUpTaskAttempted - Emitted when an attempt is made to complete the task
 */
export interface FollowUpTaskAttemptedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly attemptNumber: number;
  readonly channel: string;
  readonly outcome:
    | 'connected'
    | 'voicemail'
    | 'no_answer'
    | 'busy'
    | 'wrong_number'
    | 'callback_scheduled'
    | 'appointment_booked'
    | 'not_interested'
    | 'opted_out'
    | 'other';
  readonly outcomeNotes?: string;
  readonly nextAttemptScheduled?: string;
  readonly performedBy: string;
}

export type FollowUpTaskAttemptedEvent = FollowUpDomainEvent<
  'follow_up_task.attempted',
  FollowUpTaskAttemptedPayload
>;

/**
 * FollowUpTaskCompleted - Emitted when a task is successfully completed
 */
export interface FollowUpTaskCompletedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly outcome: string;
  readonly outcomeNotes?: string;
  readonly completedAt: string;
  readonly completedBy: string;
  readonly attemptCount: number;
  readonly responseTimeMinutes: number;
  readonly slaMetric: 'met' | 'breached';
  readonly leadEngaged: boolean;
  readonly appointmentBooked: boolean;
  readonly appointmentId?: string;
}

export type FollowUpTaskCompletedEvent = FollowUpDomainEvent<
  'follow_up_task.completed',
  FollowUpTaskCompletedPayload
>;

/**
 * FollowUpTaskEscalated - Emitted when a task is escalated
 */
export interface FollowUpTaskEscalatedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly previousAssignee?: string;
  readonly escalatedTo?: string;
  readonly escalationReason: string;
  readonly escalatedAt: string;
  readonly escalatedBy: string;
  readonly attemptCount: number;
  readonly newTaskId?: string;
  readonly priority: string;
}

export type FollowUpTaskEscalatedEvent = FollowUpDomainEvent<
  'follow_up_task.escalated',
  FollowUpTaskEscalatedPayload
>;

/**
 * FollowUpTaskSkipped - Emitted when a task is skipped
 */
export interface FollowUpTaskSkippedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly skipReason: string;
  readonly skippedBy: string;
  readonly skippedAt: string;
}

export type FollowUpTaskSkippedEvent = FollowUpDomainEvent<
  'follow_up_task.skipped',
  FollowUpTaskSkippedPayload
>;

/**
 * FollowUpTaskFailed - Emitted when a task fails after max attempts
 */
export interface FollowUpTaskFailedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly failureReason: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly failedAt: string;
  readonly lastOutcome?: string;
  readonly createEscalation: boolean;
}

export type FollowUpTaskFailedEvent = FollowUpDomainEvent<
  'follow_up_task.failed',
  FollowUpTaskFailedPayload
>;

/**
 * FollowUpTaskRescheduled - Emitted when a task is rescheduled
 */
export interface FollowUpTaskRescheduledPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly previousScheduledFor: string;
  readonly newScheduledFor: string;
  readonly previousDueBy: string;
  readonly newDueBy: string;
  readonly rescheduledBy: string;
  readonly reason?: string;
}

export type FollowUpTaskRescheduledEvent = FollowUpDomainEvent<
  'follow_up_task.rescheduled',
  FollowUpTaskRescheduledPayload
>;

/**
 * FollowUpTaskDeleted - Emitted when a task is deleted
 */
export interface FollowUpTaskDeletedPayload {
  readonly taskId: string;
  readonly phone: string;
  readonly deletedBy: string;
  readonly deletedAt: string;
  readonly reason?: string;
}

export type FollowUpTaskDeletedEvent = FollowUpDomainEvent<
  'follow_up_task.deleted',
  FollowUpTaskDeletedPayload
>;

// ============================================================================
// AUTOMATION EVENTS
// ============================================================================

/**
 * FollowUpAutomationTriggered - Emitted when automation creates a task
 */
export interface FollowUpAutomationTriggeredPayload {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly triggerEvent: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly leadClassification?: string;
  readonly taskId: string;
  readonly templateName?: string;
  readonly delayMinutes: number;
}

export type FollowUpAutomationTriggeredEvent = FollowUpDomainEvent<
  'follow_up_automation.triggered',
  FollowUpAutomationTriggeredPayload
>;

/**
 * FollowUpAutomationSkipped - Emitted when automation skips task creation
 */
export interface FollowUpAutomationSkippedPayload {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly triggerEvent: string;
  readonly phone: string;
  readonly hubspotContactId?: string;
  readonly skipReason: 'cooldown' | 'max_tasks' | 'condition_not_met' | 'opt_out' | 'converted';
  readonly details?: string;
}

export type FollowUpAutomationSkippedEvent = FollowUpDomainEvent<
  'follow_up_automation.skipped',
  FollowUpAutomationSkippedPayload
>;

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * Union of all follow-up task domain events
 */
export type FollowUpTaskEvent =
  | FollowUpTaskCreatedEvent
  | FollowUpTaskAssignedEvent
  | FollowUpTaskStartedEvent
  | FollowUpTaskAttemptedEvent
  | FollowUpTaskCompletedEvent
  | FollowUpTaskEscalatedEvent
  | FollowUpTaskSkippedEvent
  | FollowUpTaskFailedEvent
  | FollowUpTaskRescheduledEvent
  | FollowUpTaskDeletedEvent
  | FollowUpAutomationTriggeredEvent
  | FollowUpAutomationSkippedEvent;

/**
 * Event type discriminator
 */
export type FollowUpTaskEventType = FollowUpTaskEvent['type'];

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isFollowUpTaskCreatedEvent(
  event: FollowUpTaskEvent
): event is FollowUpTaskCreatedEvent {
  return event.type === 'follow_up_task.created';
}

export function isFollowUpTaskCompletedEvent(
  event: FollowUpTaskEvent
): event is FollowUpTaskCompletedEvent {
  return event.type === 'follow_up_task.completed';
}

export function isFollowUpTaskEscalatedEvent(
  event: FollowUpTaskEvent
): event is FollowUpTaskEscalatedEvent {
  return event.type === 'follow_up_task.escalated';
}

export function isFollowUpTaskFailedEvent(
  event: FollowUpTaskEvent
): event is FollowUpTaskFailedEvent {
  return event.type === 'follow_up_task.failed';
}

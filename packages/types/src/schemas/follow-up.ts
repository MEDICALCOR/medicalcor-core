/**
 * Follow-up Task Automation Schemas (M13)
 *
 * Zod schemas for automated follow-up task management in lead nurturing.
 * Supports task scheduling, escalation, and tracking.
 */
import { z } from 'zod';

import { E164PhoneSchema, TimestampSchema, UUIDSchema } from './common.js';
import { LeadClassificationSchema, LeadStatusSchema } from './lead.js';

// =============================================================================
// Enums
// =============================================================================

/**
 * Task priority levels for M13 follow-up automation
 * (Named FollowUpTaskPrioritySchema to avoid conflict with HubSpot's FollowUpPrioritySchema)
 */
export const FollowUpTaskPrioritySchema = z.enum(['urgent', 'high', 'medium', 'low']);

/** @deprecated Use FollowUpTaskPrioritySchema */
export const FollowUpPrioritySchema = FollowUpTaskPrioritySchema;

/**
 * Task status in the workflow
 */
export const FollowUpStatusSchema = z.enum([
  'pending', // Task created, not yet started
  'in_progress', // Agent is working on it
  'completed', // Successfully completed
  'escalated', // Escalated to supervisor
  'skipped', // Skipped (lead converted/lost/opted out)
  'failed', // Failed after max attempts
]);

/**
 * Types of follow-up activities
 */
export const FollowUpTypeSchema = z.enum([
  'initial_contact', // First contact after lead creation
  'follow_up_call', // Scheduled follow-up call
  'follow_up_message', // WhatsApp/SMS follow-up
  'nurture_check', // Check engagement during nurture
  'appointment_booking', // Attempt to book appointment
  'post_consultation', // Follow-up after consultation
  'recall', // Patient recall (6+ months)
  'win_back', // Re-engage lost lead
  'escalation', // Escalated task requiring attention
  'custom', // Custom task type
]);

/**
 * Trigger types for automation
 */
export const FollowUpTriggerSchema = z.enum([
  'lead_created', // New lead came in
  'lead_scored', // Lead was scored/re-scored
  'no_response', // Lead didn't respond in time
  'message_received', // Lead sent a message
  'appointment_missed', // Lead missed appointment
  'appointment_cancelled', // Appointment was cancelled
  'nurture_stage', // Nurture sequence milestone
  'manual', // Manually created
  'escalation', // Created by escalation
  'schedule', // Scheduled/recurring
]);

/**
 * Communication channel for follow-up
 */
export const FollowUpChannelSchema = z.enum(['whatsapp', 'voice', 'sms', 'email']);

/**
 * Task outcome types
 */
export const FollowUpOutcomeSchema = z.enum([
  'connected', // Successfully contacted lead
  'voicemail', // Left voicemail
  'no_answer', // No answer
  'busy', // Line busy
  'wrong_number', // Wrong number
  'callback_scheduled', // Lead asked for callback
  'appointment_booked', // Appointment was booked
  'not_interested', // Lead not interested
  'opted_out', // Lead opted out
  'converted', // Lead converted
  'escalated', // Task was escalated
  'other', // Other outcome
]);

// =============================================================================
// Follow-up Task Entity
// =============================================================================

/**
 * Complete Follow-up Task schema
 */
export const FollowUpTaskSchema = z.object({
  id: UUIDSchema,

  // Lead/Contact reference
  leadId: UUIDSchema.optional(),
  hubspotContactId: z.string().optional(),
  phone: E164PhoneSchema,

  // Task details
  taskType: FollowUpTypeSchema,
  triggerType: FollowUpTriggerSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),

  // Priority and status
  priority: FollowUpPrioritySchema,
  status: FollowUpStatusSchema,

  // Scheduling
  scheduledFor: TimestampSchema,
  dueBy: TimestampSchema,
  slaMinutes: z.number().int().positive().default(60),

  // Assignment
  assignedTo: UUIDSchema.optional(),
  assignedAt: TimestampSchema.optional(),
  assignedBy: z.string().optional(),

  // Execution tracking
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  outcome: FollowUpOutcomeSchema.optional(),
  outcomeNotes: z.string().max(2000).optional(),

  // Attempt tracking
  attemptCount: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().positive().default(3),
  lastAttemptAt: TimestampSchema.optional(),
  nextAttemptAt: TimestampSchema.optional(),

  // Escalation
  isEscalated: z.boolean().default(false),
  escalatedAt: TimestampSchema.optional(),
  escalatedTo: UUIDSchema.optional(),
  escalationReason: z.string().max(1000).optional(),
  parentTaskId: UUIDSchema.optional(),

  // Context
  leadScore: z.number().int().min(1).max(5).optional(),
  leadClassification: LeadClassificationSchema.optional(),
  procedureInterest: z.array(z.string()).optional(),
  channel: FollowUpChannelSchema.optional(),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),

  // Automation
  automationRuleId: UUIDSchema.optional(),
  workflowId: z.string().optional(),
  correlationId: z.string().optional(),
  idempotencyKey: z.string().optional(),

  // Metadata
  metadata: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdBy: z.string().optional(),

  // Soft delete
  deletedAt: TimestampSchema.optional(),
  deletedBy: z.string().optional(),
});

/**
 * Follow-up Task creation input
 */
export const CreateFollowUpTaskSchema = FollowUpTaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  attemptCount: true,
  isEscalated: true,
}).partial({
  status: true,
  assignedTo: true,
  assignedAt: true,
  assignedBy: true,
  startedAt: true,
  completedAt: true,
  outcome: true,
  outcomeNotes: true,
  lastAttemptAt: true,
  nextAttemptAt: true,
  escalatedAt: true,
  escalatedTo: true,
  escalationReason: true,
  parentTaskId: true,
  automationRuleId: true,
  workflowId: true,
  correlationId: true,
  idempotencyKey: true,
  metadata: true,
  tags: true,
  createdBy: true,
});

/**
 * Follow-up Task update input
 */
export const UpdateFollowUpTaskSchema = FollowUpTaskSchema.partial().omit({
  id: true,
  createdAt: true,
  phone: true,
  leadId: true,
  hubspotContactId: true,
  taskType: true,
  triggerType: true,
  automationRuleId: true,
  idempotencyKey: true,
});

// =============================================================================
// Follow-up Template Schema
// =============================================================================

/**
 * Message template for different languages
 */
export const FollowUpMessageTemplatesSchema = z.record(
  z.enum(['ro', 'en', 'de']),
  z.object({
    initial: z.string().optional(),
    follow_up: z.string().optional(),
    final: z.string().optional(),
  })
);

/**
 * Follow-up Task Template schema
 */
export const FollowUpTemplateSchema = z.object({
  id: UUIDSchema,

  // Template identification
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),

  // Task configuration
  taskType: FollowUpTypeSchema,
  defaultPriority: FollowUpPrioritySchema.default('medium'),
  defaultSlaMinutes: z.number().int().positive().default(60),
  defaultMaxAttempts: z.number().int().positive().max(10).default(3),

  // Content templates
  titleTemplate: z.string().min(1).max(500),
  descriptionTemplate: z.string().max(2000).optional(),

  // Channel configuration
  preferredChannel: FollowUpChannelSchema.default('whatsapp'),

  // Message templates
  messageTemplates: FollowUpMessageTemplatesSchema.optional(),

  // Timing
  delayHours: z.number().int().min(0).default(0),
  retryDelayHours: z.number().int().min(0).default(24),

  // Conditions
  appliesToClassifications: z.array(LeadClassificationSchema).default(['HOT', 'WARM', 'COLD']),
  appliesToStatuses: z.array(LeadStatusSchema).default(['new', 'contacted', 'qualified', 'nurturing']),

  // Active flag
  isActive: z.boolean().default(true),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdBy: z.string().optional(),
});

/**
 * Follow-up Template creation input
 */
export const CreateFollowUpTemplateSchema = FollowUpTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// =============================================================================
// Follow-up Automation Rule Schema
// =============================================================================

/**
 * Automation rule conditions
 */
export const AutomationConditionsSchema = z.object({
  classification: z.array(LeadClassificationSchema).optional(),
  minScore: z.number().int().min(1).max(5).optional(),
  maxScore: z.number().int().min(1).max(5).optional(),
  statuses: z.array(LeadStatusSchema).optional(),
  channels: z.array(FollowUpChannelSchema).optional(),
  hoursSinceContact: z.number().int().min(0).optional(),
  monthsSinceVisit: z.number().int().min(0).optional(),
  lifecycleStage: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
});

/**
 * Assignment strategy for task distribution
 */
export const AssignmentStrategySchema = z.enum([
  'round_robin', // Distribute evenly among agents
  'least_loaded', // Assign to agent with fewest tasks
  'skill_based', // Match based on agent skills
  'fixed', // Always assign to specific agent
]);

/**
 * Follow-up Automation Rule schema
 */
export const FollowUpAutomationRuleSchema = z.object({
  id: UUIDSchema,

  // Rule identification
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),

  // Trigger configuration
  triggerEvent: z.string().min(1).max(100),

  // Conditions
  conditions: AutomationConditionsSchema,

  // Action configuration
  templateId: UUIDSchema.optional(),
  priorityOverride: FollowUpPrioritySchema.optional(),
  delayMinutes: z.number().int().min(0).default(0),

  // Assignment rules
  autoAssign: z.boolean().default(true),
  assignmentStrategy: AssignmentStrategySchema.default('round_robin'),
  fixedAssigneeId: UUIDSchema.optional(),

  // Execution limits
  maxTasksPerLead: z.number().int().positive().default(10),
  cooldownHours: z.number().int().min(0).default(24),

  // Active and ordering
  isActive: z.boolean().default(true),
  priorityOrder: z.number().int().default(100),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdBy: z.string().optional(),
});

/**
 * Automation Rule creation input
 */
export const CreateFollowUpAutomationRuleSchema = FollowUpAutomationRuleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// =============================================================================
// Follow-up Task History Schema
// =============================================================================

/**
 * History action types
 */
export const FollowUpHistoryActionSchema = z.enum([
  'created',
  'assigned',
  'started',
  'attempted',
  'completed',
  'escalated',
  'skipped',
  'failed',
  'updated',
]);

/**
 * Follow-up Task History entry
 */
export const FollowUpTaskHistorySchema = z.object({
  id: UUIDSchema,
  taskId: UUIDSchema,

  // Change tracking
  action: FollowUpHistoryActionSchema,
  previousStatus: FollowUpStatusSchema.optional(),
  newStatus: FollowUpStatusSchema.optional(),

  // Details
  details: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(2000).optional(),

  // Actor
  performedBy: z.string().optional(),
  performedAt: TimestampSchema,

  // Correlation
  correlationId: z.string().optional(),
});

// =============================================================================
// Follow-up Task Metrics Schema
// =============================================================================

/**
 * Follow-up Task Metrics for reporting
 */
export const FollowUpTaskMetricsSchema = z.object({
  id: UUIDSchema,

  // Time period
  periodStart: TimestampSchema,
  periodEnd: TimestampSchema,
  periodType: z.enum(['hourly', 'daily', 'weekly']),

  // Task counts
  tasksCreated: z.number().int().min(0).default(0),
  tasksCompleted: z.number().int().min(0).default(0),
  tasksEscalated: z.number().int().min(0).default(0),
  tasksFailed: z.number().int().min(0).default(0),
  tasksSkipped: z.number().int().min(0).default(0),

  // Response metrics
  avgResponseTimeMinutes: z.number().min(0).optional(),
  avgCompletionTimeMinutes: z.number().min(0).optional(),
  slaMetCount: z.number().int().min(0).default(0),
  slaBreachedCount: z.number().int().min(0).default(0),

  // Conversion metrics
  leadsContacted: z.number().int().min(0).default(0),
  leadsEngaged: z.number().int().min(0).default(0),
  leadsConverted: z.number().int().min(0).default(0),

  // Breakdowns
  byType: z.record(z.string(), z.number()).default({}),
  byPriority: z.record(z.string(), z.number()).default({}),
  byAgent: z.record(z.string(), z.number()).default({}),

  // Audit
  createdAt: TimestampSchema,
});

// =============================================================================
// API Request/Response Schemas
// =============================================================================

/**
 * Query parameters for listing follow-up tasks
 */
export const FollowUpTaskQuerySchema = z.object({
  // Filters
  status: z.array(FollowUpStatusSchema).optional(),
  priority: z.array(FollowUpPrioritySchema).optional(),
  taskType: z.array(FollowUpTypeSchema).optional(),
  assignedTo: UUIDSchema.optional(),
  leadId: UUIDSchema.optional(),
  hubspotContactId: z.string().optional(),
  isEscalated: z.boolean().optional(),

  // Date ranges
  scheduledFrom: TimestampSchema.optional(),
  scheduledTo: TimestampSchema.optional(),
  dueFrom: TimestampSchema.optional(),
  dueTo: TimestampSchema.optional(),

  // Sorting
  sortBy: z.enum(['scheduledFor', 'dueBy', 'priority', 'createdAt', 'updatedAt']).default('scheduledFor'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),

  // Pagination
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),

  // Include soft-deleted
  includeDeleted: z.boolean().default(false),
});

/**
 * Task action request (start, complete, escalate, etc.)
 */
export const FollowUpTaskActionSchema = z.object({
  action: z.enum(['start', 'complete', 'escalate', 'skip', 'fail', 'reschedule', 'reassign']),
  outcome: FollowUpOutcomeSchema.optional(),
  notes: z.string().max(2000).optional(),
  escalationReason: z.string().max(1000).optional(),
  newAssigneeId: UUIDSchema.optional(),
  newScheduledFor: TimestampSchema.optional(),
  newDueBy: TimestampSchema.optional(),
});

/**
 * Bulk action request for multiple tasks
 */
export const FollowUpBulkActionSchema = z.object({
  taskIds: z.array(UUIDSchema).min(1).max(100),
  action: z.enum(['complete', 'skip', 'escalate', 'reassign', 'reschedule']),
  outcome: FollowUpOutcomeSchema.optional(),
  notes: z.string().max(2000).optional(),
  newAssigneeId: UUIDSchema.optional(),
  newScheduledFor: TimestampSchema.optional(),
});

// =============================================================================
// Workflow Payload Schemas
// =============================================================================

/**
 * Payload for follow-up task creation workflow
 */
export const CreateFollowUpTaskWorkflowPayloadSchema = z.object({
  phone: E164PhoneSchema,
  hubspotContactId: z.string().optional(),
  leadId: UUIDSchema.optional(),
  triggerType: FollowUpTriggerSchema,
  triggerEvent: z.string().optional(),
  templateName: z.string().optional(),
  priority: FollowUpPrioritySchema.optional(),
  delayMinutes: z.number().int().min(0).optional(),
  assignTo: UUIDSchema.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string(),
});

/**
 * Payload for follow-up task execution workflow
 */
export const ExecuteFollowUpTaskWorkflowPayloadSchema = z.object({
  taskId: UUIDSchema,
  attemptNumber: z.number().int().positive().default(1),
  channel: FollowUpChannelSchema.optional(),
  correlationId: z.string(),
});

/**
 * Payload for escalation workflow
 */
export const EscalateFollowUpTaskWorkflowPayloadSchema = z.object({
  taskId: UUIDSchema,
  reason: z.string().min(1).max(1000),
  escalateTo: UUIDSchema.optional(),
  priority: FollowUpPrioritySchema.optional(),
  correlationId: z.string(),
});

// =============================================================================
// Type exports
// =============================================================================

export type FollowUpPriority = z.infer<typeof FollowUpPrioritySchema>;
export type FollowUpStatus = z.infer<typeof FollowUpStatusSchema>;
export type FollowUpType = z.infer<typeof FollowUpTypeSchema>;
export type FollowUpTrigger = z.infer<typeof FollowUpTriggerSchema>;
export type FollowUpChannel = z.infer<typeof FollowUpChannelSchema>;
export type FollowUpOutcome = z.infer<typeof FollowUpOutcomeSchema>;
export type FollowUpTask = z.infer<typeof FollowUpTaskSchema>;
export type CreateFollowUpTask = z.infer<typeof CreateFollowUpTaskSchema>;
export type UpdateFollowUpTask = z.infer<typeof UpdateFollowUpTaskSchema>;
export type FollowUpMessageTemplates = z.infer<typeof FollowUpMessageTemplatesSchema>;
export type FollowUpTemplate = z.infer<typeof FollowUpTemplateSchema>;
export type CreateFollowUpTemplate = z.infer<typeof CreateFollowUpTemplateSchema>;
export type AutomationConditions = z.infer<typeof AutomationConditionsSchema>;
export type AssignmentStrategy = z.infer<typeof AssignmentStrategySchema>;
export type FollowUpAutomationRule = z.infer<typeof FollowUpAutomationRuleSchema>;
export type CreateFollowUpAutomationRule = z.infer<typeof CreateFollowUpAutomationRuleSchema>;
export type FollowUpHistoryAction = z.infer<typeof FollowUpHistoryActionSchema>;
export type FollowUpTaskHistory = z.infer<typeof FollowUpTaskHistorySchema>;
export type FollowUpTaskMetrics = z.infer<typeof FollowUpTaskMetricsSchema>;
export type FollowUpTaskQuery = z.infer<typeof FollowUpTaskQuerySchema>;
export type FollowUpTaskAction = z.infer<typeof FollowUpTaskActionSchema>;
export type FollowUpBulkAction = z.infer<typeof FollowUpBulkActionSchema>;
export type CreateFollowUpTaskWorkflowPayload = z.infer<typeof CreateFollowUpTaskWorkflowPayloadSchema>;
export type ExecuteFollowUpTaskWorkflowPayload = z.infer<typeof ExecuteFollowUpTaskWorkflowPayloadSchema>;
export type EscalateFollowUpTaskWorkflowPayload = z.infer<typeof EscalateFollowUpTaskWorkflowPayloadSchema>;

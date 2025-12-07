/**
 * @fileoverview Follow-up Scheduling Schemas
 *
 * M9 Feature: Automated follow-up task creation after call dispositions.
 * Defines types for scheduling callbacks, follow-up tasks, and automated reminders.
 *
 * @module types/schemas/followup-scheduling
 */

import { z } from 'zod';

// ============================================================================
// FOLLOW-UP TASK STATUS
// ============================================================================

/**
 * Status of a follow-up task
 */
export const FollowUpTaskStatusSchema = z.enum([
  'pending', // Scheduled but not yet due
  'due', // Due for action
  'in_progress', // Currently being worked on
  'completed', // Successfully completed
  'cancelled', // Cancelled (e.g., lead converted or lost)
  'overdue', // Past due date without completion
  'snoozed', // Temporarily delayed
]);

export type FollowUpTaskStatus = z.infer<typeof FollowUpTaskStatusSchema>;

// ============================================================================
// FOLLOW-UP TASK TYPE
// ============================================================================

/**
 * Type of follow-up action required
 */
export const FollowUpTaskTypeSchema = z.enum([
  'callback', // Phone callback requested
  'follow_up_call', // Proactive follow-up call
  'nurture', // Nurture sequence (email/WhatsApp)
  'check_in', // Simple check-in call
  'decision_follow_up', // Follow up on pending decision
  'appointment_reminder', // Appointment confirmation/reminder
  'quote_follow_up', // Follow up on sent quote
  'post_treatment', // Post-treatment satisfaction check
  'reactivation', // Win-back attempt for inactive lead
  'custom', // Custom follow-up type
]);

export type FollowUpTaskType = z.infer<typeof FollowUpTaskTypeSchema>;

// ============================================================================
// FOLLOW-UP PRIORITY
// ============================================================================

/**
 * Priority level for follow-up tasks
 */
export const FollowUpTaskPrioritySchema = z.enum([
  'urgent', // Must be done ASAP (e.g., hot lead callback)
  'high', // Should be done today
  'medium', // Should be done within 2-3 days
  'low', // Can be done within a week
]);

export type FollowUpTaskPriority = z.infer<typeof FollowUpTaskPrioritySchema>;

// ============================================================================
// FOLLOW-UP CHANNEL
// ============================================================================

/**
 * Preferred channel for follow-up contact
 */
export const FollowUpChannelSchema = z.enum([
  'phone', // Voice call
  'whatsapp', // WhatsApp message
  'sms', // SMS message
  'email', // Email
  'any', // Agent's choice
]);

export type FollowUpChannel = z.infer<typeof FollowUpChannelSchema>;

// ============================================================================
// FOLLOW-UP TASK ENTITY
// ============================================================================

/**
 * A scheduled follow-up task
 */
export const FollowUpTaskSchema = z.object({
  /** Unique task identifier */
  id: z.string().uuid(),

  /** Clinic ID for multi-tenant filtering */
  clinicId: z.string().uuid(),

  /** Lead ID to follow up with */
  leadId: z.string().uuid(),

  /** Associated call disposition ID (if created from disposition) */
  dispositionId: z.string().uuid().nullable(),

  /** Associated case ID (if applicable) */
  caseId: z.string().uuid().nullable(),

  // Task details
  /** Type of follow-up */
  type: FollowUpTaskTypeSchema,

  /** Priority level */
  priority: FollowUpTaskPrioritySchema,

  /** Current status */
  status: FollowUpTaskStatusSchema,

  /** Preferred contact channel */
  preferredChannel: FollowUpChannelSchema,

  // Scheduling
  /** Scheduled date for follow-up */
  scheduledAt: z.coerce.date(),

  /** Due date (may differ from scheduled if snoozed) */
  dueAt: z.coerce.date(),

  /** Time window start (optional) */
  timeWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),

  /** Time window end (optional) */
  timeWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),

  // Assignment
  /** Assigned agent ID (null for queue-based assignment) */
  assignedAgentId: z.string().uuid().nullable(),

  /** Required skills for routing */
  requiredSkills: z.array(z.string()).default([]),

  // Context
  /** Reason for follow-up */
  reason: z.string().min(1).max(500),

  /** Detailed notes for agent */
  notes: z.string().max(2000).nullable(),

  /** Script/guidance ID to use */
  guidanceId: z.string().uuid().nullable(),

  /** Tags for filtering */
  tags: z.array(z.string()).default([]),

  // Lead context snapshot (for quick reference)
  /** Lead's phone number */
  leadPhone: z.string().min(1),

  /** Lead's name */
  leadName: z.string().nullable(),

  /** Lead's score classification */
  leadScore: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).nullable(),

  /** Lead's preferred language */
  leadLanguage: z.enum(['ro', 'en', 'de']).default('ro'),

  // Attempt tracking
  /** Number of attempts made */
  attemptCount: z.number().int().min(0).default(0),

  /** Maximum attempts before auto-close */
  maxAttempts: z.number().int().min(1).default(3),

  /** Last attempt timestamp */
  lastAttemptAt: z.coerce.date().nullable(),

  /** Outcome of last attempt */
  lastAttemptOutcome: z.string().nullable(),

  // Reminder tracking
  /** Reminder sent to agent? */
  reminderSent: z.boolean().default(false),

  /** When reminder was sent */
  reminderSentAt: z.coerce.date().nullable(),

  // Completion
  /** When task was completed */
  completedAt: z.coerce.date().nullable(),

  /** Completion outcome */
  completionOutcome: z.string().nullable(),

  /** Notes on completion */
  completionNotes: z.string().nullable(),

  /** New disposition ID if call was made */
  resultDispositionId: z.string().uuid().nullable(),

  // Snooze tracking
  /** Snooze count */
  snoozeCount: z.number().int().min(0).default(0),

  /** Maximum snoozes allowed */
  maxSnoozes: z.number().int().min(0).default(2),

  /** Original due date before snooze */
  originalDueAt: z.coerce.date().nullable(),

  // HubSpot integration
  /** HubSpot task ID if synced */
  hubspotTaskId: z.string().nullable(),

  // Audit
  /** Who created this task */
  createdBy: z.string().nullable(),

  /** Creation timestamp */
  createdAt: z.coerce.date(),

  /** Last update timestamp */
  updatedAt: z.coerce.date(),

  /** Correlation ID for tracing */
  correlationId: z.string().nullable(),

  /** Additional metadata */
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

export type FollowUpTask = z.infer<typeof FollowUpTaskSchema>;

// ============================================================================
// CREATE FOLLOW-UP TASK INPUT
// ============================================================================

/**
 * Input for creating a follow-up task
 */
export const CreateFollowUpTaskSchema = z.object({
  clinicId: z.string().uuid(),
  leadId: z.string().uuid(),
  dispositionId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  type: FollowUpTaskTypeSchema,
  priority: FollowUpTaskPrioritySchema.optional().default('medium'),
  preferredChannel: FollowUpChannelSchema.optional().default('phone'),
  scheduledAt: z.coerce.date(),
  timeWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  timeWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  assignedAgentId: z.string().uuid().optional(),
  requiredSkills: z.array(z.string()).optional(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
  guidanceId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  leadPhone: z.string().min(1),
  leadName: z.string().optional(),
  leadScore: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  leadLanguage: z.enum(['ro', 'en', 'de']).optional(),
  maxAttempts: z.number().int().min(1).optional(),
  maxSnoozes: z.number().int().min(0).optional(),
  hubspotTaskId: z.string().optional(),
  createdBy: z.string().optional(),
  correlationId: z.string().optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export type CreateFollowUpTask = z.infer<typeof CreateFollowUpTaskSchema>;

// ============================================================================
// UPDATE FOLLOW-UP TASK INPUT
// ============================================================================

/**
 * Input for updating a follow-up task
 */
export const UpdateFollowUpTaskSchema = z.object({
  priority: FollowUpTaskPrioritySchema.optional(),
  status: FollowUpTaskStatusSchema.optional(),
  preferredChannel: FollowUpChannelSchema.optional(),
  scheduledAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  timeWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),
  timeWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .nullable()
    .optional(),
  assignedAgentId: z.string().uuid().nullable().optional(),
  requiredSkills: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  guidanceId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  hubspotTaskId: z.string().nullable().optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export type UpdateFollowUpTask = z.infer<typeof UpdateFollowUpTaskSchema>;

// ============================================================================
// FOLLOW-UP SCHEDULING CONFIGURATION
// ============================================================================

/**
 * Configuration for automatic follow-up scheduling
 */
export const FollowUpSchedulingConfigSchema = z.object({
  /** Default days until follow-up by task type */
  defaultFollowUpDays: z.record(FollowUpTaskTypeSchema, z.number().int().min(0)).default({
    callback: 0, // Same day
    follow_up_call: 1,
    nurture: 3,
    check_in: 7,
    decision_follow_up: 2,
    appointment_reminder: 1,
    quote_follow_up: 2,
    post_treatment: 7,
    reactivation: 30,
    custom: 3,
  }),

  /** Priority by lead score */
  priorityByLeadScore: z
    .record(z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']), FollowUpTaskPrioritySchema)
    .default({
      HOT: 'urgent',
      WARM: 'high',
      COLD: 'medium',
      UNQUALIFIED: 'low',
    }),

  /** Default max attempts by task type */
  defaultMaxAttempts: z.number().int().min(1).default(3),

  /** Default max snoozes */
  defaultMaxSnoozes: z.number().int().min(0).default(2),

  /** Hours to add for snooze */
  snoozeHours: z.number().int().min(1).default(24),

  /** Auto-assign to original agent */
  autoAssignToOriginalAgent: z.boolean().default(true),

  /** Create HubSpot task on creation */
  syncToHubspot: z.boolean().default(true),

  /** Send agent reminder before due */
  sendAgentReminder: z.boolean().default(true),

  /** Hours before due to send reminder */
  reminderHoursBeforeDue: z.number().int().min(1).default(2),

  /** Business hours start */
  businessHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('09:00'),

  /** Business hours end */
  businessHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('18:00'),

  /** Working days (0=Sunday, 6=Saturday) */
  workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
});

export type FollowUpSchedulingConfig = z.infer<typeof FollowUpSchedulingConfigSchema>;

// ============================================================================
// FOLLOW-UP TASK FILTERS
// ============================================================================

/**
 * Filter options for querying follow-up tasks
 */
export const FollowUpTaskFiltersSchema = z.object({
  clinicId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().nullable().optional(),
  type: z.union([FollowUpTaskTypeSchema, z.array(FollowUpTaskTypeSchema)]).optional(),
  status: z.union([FollowUpTaskStatusSchema, z.array(FollowUpTaskStatusSchema)]).optional(),
  priority: z.union([FollowUpTaskPrioritySchema, z.array(FollowUpTaskPrioritySchema)]).optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  scheduledBefore: z.coerce.date().optional(),
  scheduledAfter: z.coerce.date().optional(),
  tags: z.array(z.string()).optional(),
  hasAssignment: z.boolean().optional(),
  isOverdue: z.boolean().optional(),
});

export type FollowUpTaskFilters = z.infer<typeof FollowUpTaskFiltersSchema>;

// ============================================================================
// FOLLOW-UP TASK PAGINATION
// ============================================================================

/**
 * Pagination options for follow-up task queries
 */
export const FollowUpTaskPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['dueAt', 'scheduledAt', 'createdAt', 'priority']).default('dueAt'),
  orderDirection: z.enum(['asc', 'desc']).default('asc'),
});

export type FollowUpTaskPagination = z.infer<typeof FollowUpTaskPaginationSchema>;

// ============================================================================
// PAGINATED RESULT
// ============================================================================

/**
 * Paginated result for follow-up task queries
 */
export const FollowUpTaskPaginatedResultSchema = z.object({
  data: z.array(FollowUpTaskSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
  hasMore: z.boolean(),
});

export type FollowUpTaskPaginatedResult = z.infer<typeof FollowUpTaskPaginatedResultSchema>;

// ============================================================================
// SNOOZE INPUT
// ============================================================================

/**
 * Input for snoozing a follow-up task
 */
export const SnoozeFollowUpTaskSchema = z.object({
  /** New due date/time */
  snoozedUntil: z.coerce.date(),
  /** Reason for snooze */
  reason: z.string().max(500).optional(),
});

export type SnoozeFollowUpTask = z.infer<typeof SnoozeFollowUpTaskSchema>;

// ============================================================================
// COMPLETE TASK INPUT
// ============================================================================

/**
 * Input for completing a follow-up task
 */
export const CompleteFollowUpTaskSchema = z.object({
  /** Outcome of the follow-up */
  outcome: z.string().min(1).max(200),
  /** Detailed notes */
  notes: z.string().max(2000).optional(),
  /** New disposition ID if a call was made */
  dispositionId: z.string().uuid().optional(),
  /** Create another follow-up? */
  createFollowUp: z.boolean().optional(),
  /** Next follow-up details if createFollowUp is true */
  nextFollowUp: CreateFollowUpTaskSchema.partial().optional(),
});

export type CompleteFollowUpTask = z.infer<typeof CompleteFollowUpTaskSchema>;

// ============================================================================
// RECORD ATTEMPT INPUT
// ============================================================================

/**
 * Input for recording a follow-up attempt
 */
export const RecordFollowUpAttemptSchema = z.object({
  /** Outcome of the attempt */
  outcome: z.string().min(1).max(200),
  /** Detailed notes */
  notes: z.string().max(2000).optional(),
  /** Channel used */
  channel: FollowUpChannelSchema.optional(),
  /** Duration in seconds (for calls) */
  durationSeconds: z.number().int().min(0).optional(),
});

export type RecordFollowUpAttempt = z.infer<typeof RecordFollowUpAttemptSchema>;

// ============================================================================
// WORKFLOW PAYLOADS
// ============================================================================

/**
 * Payload for follow-up task creation workflow
 */
export const FollowUpTaskCreationPayloadSchema = z.object({
  /** Task creation input */
  task: CreateFollowUpTaskSchema,
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Create HubSpot task? */
  syncToHubspot: z.boolean().default(false),
});

export type FollowUpTaskCreationPayload = z.infer<typeof FollowUpTaskCreationPayloadSchema>;

/**
 * Payload for follow-up reminder workflow
 */
export const FollowUpReminderPayloadSchema = z.object({
  /** Task ID to remind about */
  taskId: z.string().uuid(),
  /** Agent ID to notify */
  agentId: z.string().uuid(),
  /** Reminder channel */
  channel: z.enum(['push', 'email', 'sms']).default('push'),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

export type FollowUpReminderPayload = z.infer<typeof FollowUpReminderPayloadSchema>;

/**
 * Payload for due tasks processing workflow (cron job)
 */
export const ProcessDueFollowUpsPayloadSchema = z.object({
  /** Clinic ID to process (null for all) */
  clinicId: z.string().uuid().nullable(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
  /** Dry run mode */
  dryRun: z.boolean().default(false),
});

export type ProcessDueFollowUpsPayload = z.infer<typeof ProcessDueFollowUpsPayloadSchema>;

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

/**
 * Event: Follow-up task created
 */
export const FollowUpTaskCreatedEventSchema = z.object({
  type: z.literal('followup.task_created'),
  taskId: z.string().uuid(),
  clinicId: z.string().uuid(),
  leadId: z.string().uuid(),
  taskType: FollowUpTaskTypeSchema,
  priority: FollowUpTaskPrioritySchema,
  scheduledAt: z.coerce.date(),
  assignedAgentId: z.string().uuid().nullable(),
  dispositionId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  correlationId: z.string(),
});

export type FollowUpTaskCreatedEvent = z.infer<typeof FollowUpTaskCreatedEventSchema>;

/**
 * Event: Follow-up task completed
 */
export const FollowUpTaskCompletedEventSchema = z.object({
  type: z.literal('followup.task_completed'),
  taskId: z.string().uuid(),
  clinicId: z.string().uuid(),
  leadId: z.string().uuid(),
  taskType: FollowUpTaskTypeSchema,
  outcome: z.string(),
  attemptCount: z.number().int().min(0),
  completedAt: z.coerce.date(),
  resultDispositionId: z.string().uuid().nullable(),
  correlationId: z.string(),
});

export type FollowUpTaskCompletedEvent = z.infer<typeof FollowUpTaskCompletedEventSchema>;

/**
 * Event: Follow-up task overdue
 */
export const FollowUpTaskOverdueEventSchema = z.object({
  type: z.literal('followup.task_overdue'),
  taskId: z.string().uuid(),
  clinicId: z.string().uuid(),
  leadId: z.string().uuid(),
  taskType: FollowUpTaskTypeSchema,
  priority: FollowUpTaskPrioritySchema,
  dueAt: z.coerce.date(),
  hoursOverdue: z.number().min(0),
  assignedAgentId: z.string().uuid().nullable(),
  correlationId: z.string(),
});

export type FollowUpTaskOverdueEvent = z.infer<typeof FollowUpTaskOverdueEventSchema>;

/**
 * Event: Follow-up task snoozed
 */
export const FollowUpTaskSnoozedEventSchema = z.object({
  type: z.literal('followup.task_snoozed'),
  taskId: z.string().uuid(),
  clinicId: z.string().uuid(),
  leadId: z.string().uuid(),
  snoozeCount: z.number().int().min(1),
  previousDueAt: z.coerce.date(),
  newDueAt: z.coerce.date(),
  reason: z.string().nullable(),
  correlationId: z.string(),
});

export type FollowUpTaskSnoozedEvent = z.infer<typeof FollowUpTaskSnoozedEventSchema>;

/**
 * Event: Agent reminder sent
 */
export const FollowUpReminderSentEventSchema = z.object({
  type: z.literal('followup.reminder_sent'),
  taskId: z.string().uuid(),
  agentId: z.string().uuid(),
  channel: z.enum(['push', 'email', 'sms']),
  sentAt: z.coerce.date(),
  correlationId: z.string(),
});

export type FollowUpReminderSentEvent = z.infer<typeof FollowUpReminderSentEventSchema>;

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Follow-up task summary statistics
 */
export const FollowUpTaskSummarySchema = z.object({
  clinicId: z.string().uuid(),
  period: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  totalTasks: z.number().int().min(0),
  byStatus: z.object({
    pending: z.number().int().min(0),
    due: z.number().int().min(0),
    in_progress: z.number().int().min(0),
    completed: z.number().int().min(0),
    cancelled: z.number().int().min(0),
    overdue: z.number().int().min(0),
    snoozed: z.number().int().min(0),
  }),
  byType: z.record(FollowUpTaskTypeSchema, z.number().int().min(0)),
  byPriority: z.object({
    urgent: z.number().int().min(0),
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
  }),
  completionRate: z.number().min(0).max(1),
  avgCompletionTimeHours: z.number().min(0).nullable(),
  overdueRate: z.number().min(0).max(1),
});

export type FollowUpTaskSummary = z.infer<typeof FollowUpTaskSummarySchema>;

/**
 * Agent follow-up performance metrics
 */
export const AgentFollowUpPerformanceSchema = z.object({
  clinicId: z.string().uuid(),
  agentId: z.string().uuid(),
  period: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  tasksAssigned: z.number().int().min(0),
  tasksCompleted: z.number().int().min(0),
  tasksOverdue: z.number().int().min(0),
  avgCompletionTimeHours: z.number().min(0).nullable(),
  completionRate: z.number().min(0).max(1),
  onTimeRate: z.number().min(0).max(1),
  avgAttemptsPerTask: z.number().min(0),
});

export type AgentFollowUpPerformance = z.infer<typeof AgentFollowUpPerformanceSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate due date based on task type and configuration
 */
export function calculateDueDate(
  scheduledAt: Date,
  taskType: FollowUpTaskType,
  config: FollowUpSchedulingConfig
): Date {
  const daysToAdd = config.defaultFollowUpDays[taskType] ?? 3;
  const dueDate = new Date(scheduledAt);
  dueDate.setDate(dueDate.getDate() + daysToAdd);
  return dueDate;
}

/**
 * Determine priority based on lead score
 */
export function getPriorityForLeadScore(
  leadScore: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | null,
  config: FollowUpSchedulingConfig
): FollowUpTaskPriority {
  if (!leadScore) return 'medium';
  return config.priorityByLeadScore[leadScore] ?? 'medium';
}

/**
 * Check if a task is overdue
 */
export function isTaskOverdue(task: FollowUpTask): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  return new Date() > task.dueAt;
}

/**
 * Check if snooze is allowed
 */
export function canSnoozeTask(task: FollowUpTask): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  return task.snoozeCount < task.maxSnoozes;
}

/**
 * Check if more attempts are allowed
 */
export function canAttemptTask(task: FollowUpTask): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  return task.attemptCount < task.maxAttempts;
}

/**
 * Get next business day date
 */
export function getNextBusinessDay(date: Date, workingDays: number[]): Date {
  const result = new Date(date);
  let attempts = 0;
  const maxAttempts = 14; // Prevent infinite loop

  while (!workingDays.includes(result.getDay()) && attempts < maxAttempts) {
    result.setDate(result.getDate() + 1);
    attempts++;
  }

  return result;
}

/**
 * Adjust time to business hours
 */
export function adjustToBusinessHours(
  date: Date,
  businessHoursStart: string,
  businessHoursEnd: string,
  workingDays: number[]
): Date {
  const result = new Date(date);

  // Parse business hours with defaults
  const startParts = businessHoursStart.split(':').map(Number);
  const endParts = businessHoursEnd.split(':').map(Number);
  const startHour = startParts[0] ?? 9;
  const startMin = startParts[1] ?? 0;
  const endHour = endParts[0] ?? 18;
  const endMin = endParts[1] ?? 0;

  const currentHour = result.getHours();
  const currentMin = result.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMin;
  const startTimeInMinutes = startHour * 60 + startMin;
  const endTimeInMinutes = endHour * 60 + endMin;

  // If before business hours, set to start of business hours
  if (currentTimeInMinutes < startTimeInMinutes) {
    result.setHours(startHour, startMin, 0, 0);
  }

  // If after business hours, set to start of next business day
  if (currentTimeInMinutes >= endTimeInMinutes) {
    result.setDate(result.getDate() + 1);
    result.setHours(startHour, startMin, 0, 0);
  }

  // Ensure it's a working day
  return getNextBusinessDay(result, workingDays);
}

/**
 * Map disposition code to follow-up task type
 */
export function getFollowUpTypeForDisposition(
  dispositionCode: string,
  requiresFollowUp: boolean
): FollowUpTaskType | null {
  if (!requiresFollowUp) return null;

  const typeMap: Record<string, FollowUpTaskType> = {
    CALLBACK_REQUESTED: 'callback',
    DECISION_PENDING: 'decision_follow_up',
    INTERESTED: 'nurture',
    INFO_SENT: 'quote_follow_up',
    NO_ANSWER: 'follow_up_call',
    BUSY: 'follow_up_call',
    VOICEMAIL: 'follow_up_call',
    APPT_SCHEDULED: 'appointment_reminder',
  };

  return typeMap[dispositionCode] ?? 'follow_up_call';
}

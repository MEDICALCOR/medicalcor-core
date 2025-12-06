/**
 * Supervisor/Call Monitoring schemas for Twilio Flex integration
 * W3 Milestone: Voice AI + Realtime Supervisor
 */
import { z } from 'zod';

import { E164PhoneSchema, TimestampSchema, UUIDSchema } from './common.js';

// =============================================================================
// Supervisor Role & Permissions
// =============================================================================

/**
 * Supervisor permission levels
 */
export const SupervisorPermissionSchema = z.enum([
  'listen', // Listen to calls silently
  'whisper', // Whisper to agent (caller can't hear)
  'barge', // Join the call (both parties can hear)
  'coach', // Full coaching capabilities
]);

/**
 * Supervisor role with permissions
 */
export const SupervisorRoleSchema = z.enum([
  'supervisor', // Can listen/whisper
  'manager', // Can barge
  'admin', // Full access including coach
]);

// =============================================================================
// Active Call State
// =============================================================================

/**
 * Real-time call state for monitoring
 */
export const MonitoredCallStateSchema = z.enum([
  'ringing',
  'in-progress',
  'on-hold',
  'transferring',
  'wrapping-up',
  'completed',
]);

/**
 * Active call being monitored
 */
export const MonitoredCallSchema = z.object({
  callSid: z.string(),
  conferenceSid: z.string().optional(),
  participantSid: z.string().optional(),

  // Call participants
  customerPhone: E164PhoneSchema,
  agentId: z.string().optional(),
  agentName: z.string().optional(),

  // Call state
  state: MonitoredCallStateSchema,
  direction: z.enum(['inbound', 'outbound']),
  startedAt: TimestampSchema,
  duration: z.number().default(0),

  // AI assistant info
  vapiCallId: z.string().optional(),
  assistantId: z.string().optional(),

  // Real-time metrics
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  urgencyLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),

  // Flags for supervisor attention
  flags: z
    .array(
      z.enum([
        'escalation-requested',
        'high-value-lead',
        'complaint',
        'long-hold',
        'silence-detected',
        'ai-handoff-needed',
      ])
    )
    .default([]),

  // Live transcript (last N messages)
  recentTranscript: z
    .array(
      z.object({
        speaker: z.enum(['customer', 'agent', 'assistant']),
        text: z.string(),
        timestamp: z.number(),
      })
    )
    .default([]),
});

// =============================================================================
// Supervisor Session
// =============================================================================

/**
 * Supervisor monitoring action
 */
export const SupervisorActionSchema = z.enum([
  'start-listening',
  'stop-listening',
  'start-whisper',
  'stop-whisper',
  'barge-in',
  'leave-call',
  'request-handoff',
  'flag-call',
  'unflag-call',
  'add-note',
]);

/**
 * Supervisor session state
 */
export const SupervisorSessionSchema = z.object({
  sessionId: UUIDSchema,
  supervisorId: z.string(),
  supervisorName: z.string(),
  role: SupervisorRoleSchema,
  permissions: z.array(SupervisorPermissionSchema),

  // Currently monitoring
  activeCallSid: z.string().optional(),
  monitoringMode: z.enum(['none', 'listen', 'whisper', 'barge']).default('none'),

  // Session stats
  startedAt: TimestampSchema,
  callsMonitored: z.number().default(0),
  interventions: z.number().default(0),
});

// =============================================================================
// Supervisor Commands
// =============================================================================

/**
 * Start monitoring a call
 */
export const StartMonitoringCommandSchema = z.object({
  supervisorId: z.string(),
  callSid: z.string(),
  mode: z.enum(['listen', 'whisper', 'barge']).default('listen'),
});

/**
 * Stop monitoring
 */
export const StopMonitoringCommandSchema = z.object({
  supervisorId: z.string(),
  callSid: z.string(),
});

/**
 * Whisper to agent
 */
export const WhisperCommandSchema = z.object({
  supervisorId: z.string(),
  callSid: z.string(),
  message: z.string().max(500),
});

/**
 * Barge into call
 */
export const BargeCommandSchema = z.object({
  supervisorId: z.string(),
  callSid: z.string(),
  announcement: z.string().max(200).optional(),
});

/**
 * Request AI-to-human handoff
 */
export const HandoffRequestSchema = z.object({
  callSid: z.string(),
  vapiCallId: z.string(),
  reason: z.enum([
    'customer-request',
    'escalation',
    'complex-query',
    'ai-confidence-low',
    'supervisor-initiated',
  ]),
  targetAgentId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Add supervisor note to call
 */
export const SupervisorNoteSchema = z.object({
  callSid: z.string(),
  supervisorId: z.string(),
  note: z.string().max(1000),
  timestamp: TimestampSchema,
  isPrivate: z.boolean().default(true),
});

// =============================================================================
// Supervisor Events (WebSocket)
// =============================================================================

/**
 * WebSocket event types for real-time updates
 */
export const SupervisorEventTypeSchema = z.enum([
  // Call lifecycle
  'call.started',
  'call.updated',
  'call.ended',

  // Transcript updates
  'transcript.message',
  'transcript.sentiment-change',

  // Alerts
  'alert.escalation',
  'alert.long-hold',
  'alert.silence',
  'alert.high-value',

  // Supervisor actions
  'supervisor.joined',
  'supervisor.left',
  'supervisor.whisper',
  'supervisor.barge',

  // System
  'connection.established',
  'connection.error',
  'heartbeat',
]);

/**
 * Base WebSocket event
 */
export const SupervisorEventBaseSchema = z.object({
  eventId: UUIDSchema,
  eventType: SupervisorEventTypeSchema,
  timestamp: TimestampSchema,
  callSid: z.string().optional(),
});

/**
 * Call started event
 */
export const CallStartedEventSchema = SupervisorEventBaseSchema.extend({
  eventType: z.literal('call.started'),
  call: MonitoredCallSchema,
});

/**
 * Call updated event
 */
export const CallUpdatedEventSchema = SupervisorEventBaseSchema.extend({
  eventType: z.literal('call.updated'),
  callSid: z.string(),
  changes: z.record(z.unknown()),
});

/**
 * Call ended event
 */
export const CallEndedEventSchema = SupervisorEventBaseSchema.extend({
  eventType: z.literal('call.ended'),
  callSid: z.string(),
  duration: z.number(),
  outcome: z.enum(['completed', 'transferred', 'abandoned', 'failed', 'voicemail']),
});

/**
 * Transcript message event
 */
export const TranscriptMessageEventSchema = SupervisorEventBaseSchema.extend({
  eventType: z.literal('transcript.message'),
  callSid: z.string(),
  speaker: z.enum(['customer', 'agent', 'assistant']),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Alert event
 */
export const AlertEventSchema = SupervisorEventBaseSchema.extend({
  eventType: z.enum(['alert.escalation', 'alert.long-hold', 'alert.silence', 'alert.high-value']),
  callSid: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Union of all supervisor events
 */
export const SupervisorEventSchema = z.discriminatedUnion('eventType', [
  CallStartedEventSchema,
  CallUpdatedEventSchema,
  CallEndedEventSchema,
  TranscriptMessageEventSchema,
  AlertEventSchema.extend({ eventType: z.literal('alert.escalation') }),
  AlertEventSchema.extend({ eventType: z.literal('alert.long-hold') }),
  AlertEventSchema.extend({ eventType: z.literal('alert.silence') }),
  AlertEventSchema.extend({ eventType: z.literal('alert.high-value') }),
]);

// =============================================================================
// Flex Worker/Queue Schemas
// =============================================================================

/**
 * Flex worker activity states
 */
export const FlexWorkerActivitySchema = z.enum([
  'available',
  'unavailable',
  'offline',
  'break',
  'busy',
  'wrap-up',
]);

/**
 * Flex worker representation
 */
export const FlexWorkerSchema = z.object({
  workerSid: z.string(),
  friendlyName: z.string(),
  activityName: FlexWorkerActivitySchema,
  available: z.boolean(),
  attributes: z.record(z.unknown()).optional(),

  // Skills for routing
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),

  // Current state
  currentCallSid: z.string().optional(),
  tasksInProgress: z.number().default(0),
});

/**
 * Flex task queue
 */
export const FlexQueueSchema = z.object({
  queueSid: z.string(),
  friendlyName: z.string(),

  // Queue metrics
  currentSize: z.number().default(0),
  longestWaitTime: z.number().default(0),
  averageWaitTime: z.number().default(0),

  // Target workers
  targetWorkers: z.string().optional(),
});

/**
 * Flex task for routing
 */
export const FlexTaskSchema = z.object({
  taskSid: z.string(),
  queueSid: z.string(),
  workerSid: z.string().optional(),

  // Task attributes
  callSid: z.string().optional(),
  customerPhone: E164PhoneSchema.optional(),
  priority: z.number().int().min(0).max(100).default(50),

  // Task state
  assignmentStatus: z.enum([
    'pending',
    'reserved',
    'assigned',
    'wrapping',
    'completed',
    'canceled',
  ]),
  reason: z.string().optional(),

  // Timing
  dateCreated: TimestampSchema,
  dateUpdated: TimestampSchema,
  timeout: z.number().default(120),
});

// =============================================================================
// Dashboard Stats
// =============================================================================

/**
 * Real-time supervisor dashboard stats
 */
export const SupervisorDashboardStatsSchema = z.object({
  // Active calls
  activeCalls: z.number().default(0),
  callsInQueue: z.number().default(0),
  averageWaitTime: z.number().default(0),

  // Agent stats
  agentsAvailable: z.number().default(0),
  agentsBusy: z.number().default(0),
  agentsOnBreak: z.number().default(0),
  agentsOffline: z.number().default(0),

  // AI stats
  aiHandledCalls: z.number().default(0),
  aiHandoffRate: z.number().min(0).max(100).default(0),
  averageAiConfidence: z.number().min(0).max(100).default(0),

  // Alerts
  activeAlerts: z.number().default(0),
  escalationsToday: z.number().default(0),
  handoffsToday: z.number().default(0),

  // Performance (today)
  callsHandledToday: z.number().default(0),
  averageHandleTime: z.number().default(0),
  customerSatisfaction: z.number().min(0).max(100).optional(),

  // Timestamp
  lastUpdated: TimestampSchema,
});

// =============================================================================
// Queue SLA Configuration (H6)
// =============================================================================

/**
 * SLA threshold configuration for a queue
 */
export const QueueSLAConfigSchema = z.object({
  queueSid: z.string(),
  queueName: z.string(),

  // Wait time thresholds (in seconds)
  targetAnswerTime: z.number().int().min(0).default(30), // Target time to answer calls
  maxWaitTime: z.number().int().min(0).default(120), // Max acceptable wait time
  criticalWaitTime: z.number().int().min(0).default(300), // Critical threshold

  // Queue size thresholds
  maxQueueSize: z.number().int().min(0).default(10),
  criticalQueueSize: z.number().int().min(0).default(20),

  // Abandonment thresholds
  maxAbandonRate: z.number().min(0).max(100).default(5), // Max acceptable abandon rate %

  // Agent availability thresholds
  minAvailableAgents: z.number().int().min(0).default(1),
  targetAgentUtilization: z.number().min(0).max(100).default(80), // Target utilization %

  // Service level target
  serviceLevelTarget: z.number().min(0).max(100).default(80), // % of calls answered within target time

  // Alert settings
  alertEnabled: z.boolean().default(true),
  escalationEnabled: z.boolean().default(true),
});

/**
 * Real-time SLA status for a queue
 */
export const QueueSLAStatusSchema = z.object({
  queueSid: z.string(),
  queueName: z.string(),

  // Current metrics
  currentQueueSize: z.number().int().min(0),
  longestWaitTime: z.number().int().min(0), // seconds
  averageWaitTime: z.number().min(0), // seconds
  averageHandleTime: z.number().min(0), // seconds

  // Agent metrics
  availableAgents: z.number().int().min(0),
  busyAgents: z.number().int().min(0),
  totalAgents: z.number().int().min(0),
  agentUtilization: z.number().min(0).max(100),

  // Performance metrics (rolling window)
  callsHandledToday: z.number().int().min(0).default(0),
  callsAbandonedToday: z.number().int().min(0).default(0),
  abandonRate: z.number().min(0).max(100).default(0),
  serviceLevel: z.number().min(0).max(100), // % of calls answered within target

  // SLA compliance
  isCompliant: z.boolean(),
  breaches: z.array(z.enum([
    'wait_time_exceeded',
    'queue_size_exceeded',
    'abandon_rate_exceeded',
    'agent_availability_low',
    'service_level_missed',
  ])).default([]),

  // Severity
  severity: z.enum(['ok', 'warning', 'critical']).default('ok'),

  // Timestamp
  lastUpdated: TimestampSchema,
});

/**
 * SLA breach event
 */
export const SLABreachEventSchema = z.object({
  eventId: UUIDSchema,
  queueSid: z.string(),
  queueName: z.string(),
  breachType: z.enum([
    'wait_time_exceeded',
    'queue_size_exceeded',
    'abandon_rate_exceeded',
    'agent_availability_low',
    'service_level_missed',
  ]),
  severity: z.enum(['warning', 'critical']),

  // Breach details
  threshold: z.number(),
  currentValue: z.number(),

  // Context
  affectedCalls: z.number().int().min(0).optional(),
  affectedAgents: z.array(z.string()).optional(),

  // Timing
  detectedAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional(),
  durationSeconds: z.number().int().min(0).optional(),

  // Actions taken
  alertSent: z.boolean().default(false),
  escalated: z.boolean().default(false),
  notes: z.string().optional(),
});

/**
 * SLA report for a time period
 */
export const SLAReportSchema = z.object({
  reportId: UUIDSchema,
  queueSid: z.string(),
  queueName: z.string(),

  // Report period
  periodStart: TimestampSchema,
  periodEnd: TimestampSchema,
  periodType: z.enum(['hourly', 'daily', 'weekly', 'monthly']),

  // Summary metrics
  totalCalls: z.number().int().min(0),
  callsAnswered: z.number().int().min(0),
  callsAbandoned: z.number().int().min(0),
  callsWithinSLA: z.number().int().min(0),

  // Performance
  overallServiceLevel: z.number().min(0).max(100),
  averageWaitTime: z.number().min(0),
  averageHandleTime: z.number().min(0),
  maxWaitTime: z.number().min(0),
  abandonRate: z.number().min(0).max(100),

  // Agent metrics
  averageAgentUtilization: z.number().min(0).max(100),
  peakQueueSize: z.number().int().min(0),

  // Breach summary
  totalBreaches: z.number().int().min(0),
  criticalBreaches: z.number().int().min(0),
  breachesByType: z.record(z.number().int().min(0)).optional(),

  // Comparison
  complianceRate: z.number().min(0).max(100), // % of time in compliance
  trend: z.enum(['improving', 'stable', 'declining']).optional(),

  generatedAt: TimestampSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type QueueSLAConfig = z.infer<typeof QueueSLAConfigSchema>;
export type QueueSLAStatus = z.infer<typeof QueueSLAStatusSchema>;
export type SLABreachEvent = z.infer<typeof SLABreachEventSchema>;
export type SLAReport = z.infer<typeof SLAReportSchema>;
export type SupervisorPermission = z.infer<typeof SupervisorPermissionSchema>;
export type SupervisorRole = z.infer<typeof SupervisorRoleSchema>;
export type MonitoredCallState = z.infer<typeof MonitoredCallStateSchema>;
export type MonitoredCall = z.infer<typeof MonitoredCallSchema>;
export type SupervisorAction = z.infer<typeof SupervisorActionSchema>;
export type SupervisorSession = z.infer<typeof SupervisorSessionSchema>;
export type StartMonitoringCommand = z.infer<typeof StartMonitoringCommandSchema>;
export type StopMonitoringCommand = z.infer<typeof StopMonitoringCommandSchema>;
export type WhisperCommand = z.infer<typeof WhisperCommandSchema>;
export type BargeCommand = z.infer<typeof BargeCommandSchema>;
export type HandoffRequest = z.infer<typeof HandoffRequestSchema>;
export type SupervisorNote = z.infer<typeof SupervisorNoteSchema>;
export type SupervisorEventType = z.infer<typeof SupervisorEventTypeSchema>;
export type SupervisorEventBase = z.infer<typeof SupervisorEventBaseSchema>;
export type CallStartedEvent = z.infer<typeof CallStartedEventSchema>;
export type CallUpdatedEvent = z.infer<typeof CallUpdatedEventSchema>;
export type CallEndedEvent = z.infer<typeof CallEndedEventSchema>;
export type TranscriptMessageEvent = z.infer<typeof TranscriptMessageEventSchema>;
export type AlertEvent = z.infer<typeof AlertEventSchema>;
export type SupervisorEvent = z.infer<typeof SupervisorEventSchema>;
export type FlexWorkerActivity = z.infer<typeof FlexWorkerActivitySchema>;
export type FlexWorker = z.infer<typeof FlexWorkerSchema>;
export type FlexQueue = z.infer<typeof FlexQueueSchema>;
export type FlexTask = z.infer<typeof FlexTaskSchema>;
export type SupervisorDashboardStats = z.infer<typeof SupervisorDashboardStatsSchema>;

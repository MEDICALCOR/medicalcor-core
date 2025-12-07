/**
 * Agent Presence Schemas (M2 Milestone)
 * WebSocket-based real-time presence tracking for call center agents
 *
 * Provides online/offline/busy status tracking with heartbeat mechanism
 * for supervisor dashboard and routing decisions.
 *
 * @module types/schemas/agent-presence
 */
import { z } from 'zod';

import { TimestampSchema, UUIDSchema } from './common.js';

// =============================================================================
// AGENT PRESENCE STATUS
// =============================================================================

/**
 * Agent presence status values
 * - online: Agent is connected and available for calls
 * - offline: Agent is disconnected or logged out
 * - busy: Agent is handling a call or task
 * - away: Agent is temporarily away (break, meeting)
 * - dnd: Do Not Disturb - agent should not receive calls
 */
export const AgentPresenceStatusSchema = z.enum(['online', 'offline', 'busy', 'away', 'dnd']);

/**
 * Reason for status change (for audit/analytics)
 */
export const PresenceChangeReasonSchema = z.enum([
  'manual', // Agent manually changed status
  'call_started', // Automatically set to busy when call starts
  'call_ended', // Automatically set to online when call ends
  'heartbeat_timeout', // Set to offline due to missed heartbeats
  'connection_lost', // WebSocket connection lost
  'connection_restored', // WebSocket connection restored
  'scheduled_break', // Scheduled break time
  'login', // Agent logged in
  'logout', // Agent logged out
  'system', // System-initiated change
]);

// =============================================================================
// AGENT PRESENCE STATE
// =============================================================================

/**
 * Agent presence state
 */
export const AgentPresenceSchema = z.object({
  /** Unique agent identifier */
  agentId: z.string().min(1),

  /** Agent display name */
  agentName: z.string().optional(),

  /** Current presence status */
  status: AgentPresenceStatusSchema,

  /** Previous status (for tracking transitions) */
  previousStatus: AgentPresenceStatusSchema.optional(),

  /** Reason for current status */
  statusReason: PresenceChangeReasonSchema.optional(),

  /** Custom status message (e.g., "In a meeting") */
  statusMessage: z.string().max(100).optional(),

  /** Current call SID if agent is on a call */
  activeCallSid: z.string().optional(),

  /** Current task/ticket ID if handling non-call work */
  activeTaskId: z.string().optional(),

  /** WebSocket connection ID for this session */
  connectionId: z.string().optional(),

  /** Device/client identifier */
  deviceId: z.string().optional(),

  /** Client type (web, desktop, mobile) */
  clientType: z.enum(['web', 'desktop', 'mobile', 'api']).optional(),

  /** Agent's queue assignments */
  queueSids: z.array(z.string()).default([]),

  /** Agent's skill set for routing */
  skills: z.array(z.string()).default([]),

  /** When the agent came online */
  onlineSince: TimestampSchema.optional(),

  /** Last status change timestamp */
  statusChangedAt: TimestampSchema,

  /** Last heartbeat received */
  lastHeartbeat: TimestampSchema,

  /** Session start time */
  sessionStartedAt: TimestampSchema.optional(),

  /** Geographic location (for distributed teams) */
  location: z.string().optional(),

  /** Timezone for the agent */
  timezone: z.string().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// HEARTBEAT
// =============================================================================

/**
 * Heartbeat configuration
 */
export const HeartbeatConfigSchema = z.object({
  /** Interval between heartbeats in milliseconds */
  intervalMs: z.number().int().min(1000).max(60000).default(15000),

  /** Number of missed heartbeats before marking offline */
  missedThreshold: z.number().int().min(1).max(10).default(3),

  /** Grace period after connection loss before marking offline (ms) */
  gracePeriodMs: z.number().int().min(0).max(60000).default(5000),
});

/**
 * Heartbeat message from client
 */
export const HeartbeatMessageSchema = z.object({
  /** Agent ID */
  agentId: z.string().min(1),

  /** Connection ID */
  connectionId: z.string().min(1),

  /** Client timestamp */
  timestamp: TimestampSchema,

  /** Current status (for sync check) */
  status: AgentPresenceStatusSchema.optional(),

  /** Sequence number for ordering */
  sequence: z.number().int().min(0).optional(),

  /** Client health metrics */
  metrics: z
    .object({
      /** CPU usage percentage */
      cpuUsage: z.number().min(0).max(100).optional(),
      /** Memory usage percentage */
      memoryUsage: z.number().min(0).max(100).optional(),
      /** Network latency in ms */
      latencyMs: z.number().int().min(0).optional(),
    })
    .optional(),
});

/**
 * Heartbeat acknowledgment from server
 */
export const HeartbeatAckSchema = z.object({
  /** Server timestamp */
  serverTime: TimestampSchema,

  /** Confirmed status */
  status: AgentPresenceStatusSchema,

  /** Next heartbeat expected at */
  nextHeartbeatDue: TimestampSchema,

  /** Round-trip time in ms */
  rttMs: z.number().int().min(0).optional(),
});

// =============================================================================
// WEBSOCKET PRESENCE EVENTS
// =============================================================================

/**
 * Presence event types for WebSocket communication
 */
export const PresenceEventTypeSchema = z.enum([
  // Connection lifecycle
  'presence.connect', // Agent connecting
  'presence.connected', // Connection established
  'presence.disconnect', // Agent disconnecting
  'presence.disconnected', // Connection lost

  // Status changes
  'presence.status_change', // Status changed
  'presence.status_sync', // Sync status with server

  // Heartbeat
  'presence.heartbeat', // Client heartbeat
  'presence.heartbeat_ack', // Server acknowledgment

  // Queries
  'presence.query', // Query agent(s) status
  'presence.query_response', // Query response

  // Bulk operations
  'presence.bulk_update', // Multiple agents changed
  'presence.roster', // Full roster update
]);

/**
 * Base presence event
 */
export const PresenceEventBaseSchema = z.object({
  /** Unique event ID */
  eventId: UUIDSchema,

  /** Event type */
  eventType: PresenceEventTypeSchema,

  /** Event timestamp */
  timestamp: TimestampSchema,

  /** Correlation ID for tracing */
  correlationId: z.string().optional(),
});

/**
 * Connect event - agent requesting connection
 */
export const PresenceConnectEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.connect'),
  agentId: z.string().min(1),
  agentName: z.string().optional(),
  deviceId: z.string().optional(),
  clientType: z.enum(['web', 'desktop', 'mobile', 'api']).optional(),
  requestedStatus: AgentPresenceStatusSchema.default('online'),
});

/**
 * Connected event - connection confirmed
 */
export const PresenceConnectedEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.connected'),
  agentId: z.string().min(1),
  connectionId: z.string().min(1),
  status: AgentPresenceStatusSchema,
  heartbeatConfig: HeartbeatConfigSchema,
  serverTime: TimestampSchema,
});

/**
 * Disconnect event - agent requesting disconnect
 */
export const PresenceDisconnectEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.disconnect'),
  agentId: z.string().min(1),
  connectionId: z.string().min(1),
  reason: PresenceChangeReasonSchema.optional(),
});

/**
 * Disconnected event - connection terminated
 */
export const PresenceDisconnectedEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.disconnected'),
  agentId: z.string().min(1),
  connectionId: z.string().min(1),
  reason: PresenceChangeReasonSchema,
  wasClean: z.boolean().default(false),
});

/**
 * Status change event
 */
export const PresenceStatusChangeEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.status_change'),
  agentId: z.string().min(1),
  previousStatus: AgentPresenceStatusSchema,
  newStatus: AgentPresenceStatusSchema,
  reason: PresenceChangeReasonSchema,
  statusMessage: z.string().max(100).optional(),
  activeCallSid: z.string().optional(),
  activeTaskId: z.string().optional(),
});

/**
 * Heartbeat event from client
 */
export const PresenceHeartbeatEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.heartbeat'),
  heartbeat: HeartbeatMessageSchema,
});

/**
 * Heartbeat acknowledgment from server
 */
export const PresenceHeartbeatAckEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.heartbeat_ack'),
  agentId: z.string().min(1),
  ack: HeartbeatAckSchema,
});

/**
 * Query event - request status of one or more agents
 */
export const PresenceQueryEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.query'),
  /** Query all agents if not specified */
  agentIds: z.array(z.string()).optional(),
  /** Filter by status */
  statusFilter: z.array(AgentPresenceStatusSchema).optional(),
  /** Filter by queue */
  queueSid: z.string().optional(),
  /** Include offline agents */
  includeOffline: z.boolean().default(false),
});

/**
 * Query response event
 */
export const PresenceQueryResponseEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.query_response'),
  agents: z.array(AgentPresenceSchema),
  totalCount: z.number().int().min(0),
});

/**
 * Bulk update event - multiple agents changed
 */
export const PresenceBulkUpdateEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.bulk_update'),
  updates: z.array(
    z.object({
      agentId: z.string().min(1),
      status: AgentPresenceStatusSchema,
      previousStatus: AgentPresenceStatusSchema.optional(),
      reason: PresenceChangeReasonSchema.optional(),
    })
  ),
});

/**
 * Roster event - full list of online agents
 */
export const PresenceRosterEventSchema = PresenceEventBaseSchema.extend({
  eventType: z.literal('presence.roster'),
  agents: z.array(AgentPresenceSchema),
  summary: z.object({
    online: z.number().int().min(0),
    offline: z.number().int().min(0),
    busy: z.number().int().min(0),
    away: z.number().int().min(0),
    dnd: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
});

/**
 * Union of all presence events
 */
export const PresenceEventSchema = z.discriminatedUnion('eventType', [
  PresenceConnectEventSchema,
  PresenceConnectedEventSchema,
  PresenceDisconnectEventSchema,
  PresenceDisconnectedEventSchema,
  PresenceStatusChangeEventSchema,
  PresenceHeartbeatEventSchema,
  PresenceHeartbeatAckEventSchema,
  PresenceQueryEventSchema,
  PresenceQueryResponseEventSchema,
  PresenceBulkUpdateEventSchema,
  PresenceRosterEventSchema,
]);

// =============================================================================
// PRESENCE METRICS & ANALYTICS
// =============================================================================

/**
 * Agent presence metrics for dashboard
 */
export const AgentPresenceMetricsSchema = z.object({
  agentId: z.string().min(1),

  /** Total time online today (seconds) */
  onlineTimeToday: z.number().int().min(0),

  /** Total time busy today (seconds) */
  busyTimeToday: z.number().int().min(0),

  /** Total time away today (seconds) */
  awayTimeToday: z.number().int().min(0),

  /** Number of status changes today */
  statusChangesToday: z.number().int().min(0),

  /** Number of calls handled today */
  callsHandledToday: z.number().int().min(0),

  /** Average handle time (seconds) */
  avgHandleTime: z.number().min(0).optional(),

  /** Utilization percentage */
  utilizationPercent: z.number().min(0).max(100),

  /** Last activity timestamp */
  lastActivity: TimestampSchema,

  /** Session duration (seconds) */
  sessionDuration: z.number().int().min(0),
});

/**
 * Team presence summary for supervisor dashboard
 */
export const TeamPresenceSummarySchema = z.object({
  /** Total agents in team */
  totalAgents: z.number().int().min(0),

  /** Agents by status */
  byStatus: z.object({
    online: z.number().int().min(0),
    offline: z.number().int().min(0),
    busy: z.number().int().min(0),
    away: z.number().int().min(0),
    dnd: z.number().int().min(0),
  }),

  /** Agents available for calls */
  availableForCalls: z.number().int().min(0),

  /** Agents currently on calls */
  onCalls: z.number().int().min(0),

  /** Average utilization */
  avgUtilization: z.number().min(0).max(100),

  /** Queue coverage (queues with at least one online agent) */
  queueCoverage: z.record(z.boolean()).optional(),

  /** Last update timestamp */
  lastUpdated: TimestampSchema,
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AgentPresenceStatus = z.infer<typeof AgentPresenceStatusSchema>;
export type PresenceChangeReason = z.infer<typeof PresenceChangeReasonSchema>;
export type AgentPresence = z.infer<typeof AgentPresenceSchema>;
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type HeartbeatAck = z.infer<typeof HeartbeatAckSchema>;
export type PresenceEventType = z.infer<typeof PresenceEventTypeSchema>;
export type PresenceEventBase = z.infer<typeof PresenceEventBaseSchema>;
export type PresenceConnectEvent = z.infer<typeof PresenceConnectEventSchema>;
export type PresenceConnectedEvent = z.infer<typeof PresenceConnectedEventSchema>;
export type PresenceDisconnectEvent = z.infer<typeof PresenceDisconnectEventSchema>;
export type PresenceDisconnectedEvent = z.infer<typeof PresenceDisconnectedEventSchema>;
export type PresenceStatusChangeEvent = z.infer<typeof PresenceStatusChangeEventSchema>;
export type PresenceHeartbeatEvent = z.infer<typeof PresenceHeartbeatEventSchema>;
export type PresenceHeartbeatAckEvent = z.infer<typeof PresenceHeartbeatAckEventSchema>;
export type PresenceQueryEvent = z.infer<typeof PresenceQueryEventSchema>;
export type PresenceQueryResponseEvent = z.infer<typeof PresenceQueryResponseEventSchema>;
export type PresenceBulkUpdateEvent = z.infer<typeof PresenceBulkUpdateEventSchema>;
export type PresenceRosterEvent = z.infer<typeof PresenceRosterEventSchema>;
export type PresenceEvent = z.infer<typeof PresenceEventSchema>;
export type AgentPresenceMetrics = z.infer<typeof AgentPresenceMetricsSchema>;
export type TeamPresenceSummary = z.infer<typeof TeamPresenceSummarySchema>;

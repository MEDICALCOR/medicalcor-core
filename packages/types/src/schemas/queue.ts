/**
 * Queue Event Validation Schemas
 *
 * Zod schemas for validating queue webhook/event payloads.
 * Provides type-safe validation for queue breach events, SLA monitoring,
 * and queue action handlers.
 *
 * @module @medicalcor/types/schemas/queue
 */
import { z } from 'zod';

import { TimestampSchema, UUIDSchema } from './common.js';

// =============================================================================
// Queue Breach Types
// =============================================================================

/**
 * Queue breach type enumeration
 * Aligned with SLABreachEventSchema breach types from supervisor.ts
 */
export const QueueBreachTypeSchema = z.enum([
  'wait_time_exceeded',
  'queue_size_exceeded',
  'abandon_rate_exceeded',
  'agent_availability_low',
  'service_level_missed',
]);

/**
 * Queue breach severity levels
 */
export const QueueBreachSeveritySchema = z.enum(['warning', 'critical']);

/**
 * Queue event status for processing lifecycle
 */
export const QueueEventStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
]);

// =============================================================================
// Queue Event Payload Schema
// =============================================================================

/**
 * Queue event payload schema for webhook/event validation
 *
 * This schema validates incoming queue event payloads from various sources
 * (webhooks, internal events, etc.) with proper type coercion and defaults.
 *
 * @example
 * ```typescript
 * const result = QueueEventPayloadSchema.safeParse(rawPayload);
 * if (result.success) {
 *   const payload = result.data;
 *   // payload is fully typed
 * }
 * ```
 */
export const QueueEventPayloadSchema = z.object({
  /** Unique identifier for this queue event */
  id: UUIDSchema,

  /** Twilio/Flex queue SID (optional for internal events) */
  queueSid: z.string().min(1).optional(),

  /** Human-readable queue name */
  queueName: z.string().min(1).optional(),

  /** Type of breach that occurred */
  breachType: QueueBreachTypeSchema.optional(),

  /** Severity level of the breach */
  severity: QueueBreachSeveritySchema.optional(),

  /** Configured threshold value that was exceeded */
  thresholdValue: z.number().nullable().optional(),

  /** Current measured value that triggered the breach */
  currentValue: z.number().nullable().optional(),

  /** When the breach was first detected */
  detectedAt: TimestampSchema.optional(),

  /** When the breach was resolved (if applicable) */
  resolvedAt: TimestampSchema.optional(),

  /** Duration of the breach in seconds */
  durationSeconds: z.number().int().min(0).optional(),

  /** Whether an alert was sent for this event */
  alertSent: z.boolean().default(false),

  /** Whether this event was escalated */
  escalated: z.boolean().default(false),

  /** Number of calls affected by this breach */
  affectedCalls: z.number().int().min(0).optional(),

  /** Additional metadata for extensibility */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Create queue event input schema (without auto-generated fields)
 */
export const CreateQueueEventSchema = QueueEventPayloadSchema.omit({
  id: true,
}).extend({
  id: UUIDSchema.optional(),
});

/**
 * Update queue event schema (all fields optional except id)
 */
export const UpdateQueueEventSchema = QueueEventPayloadSchema.partial().required({
  id: true,
});

// =============================================================================
// Queue Action Handler Schemas
// =============================================================================

/**
 * Queue action types for processing
 */
export const QueueActionTypeSchema = z.enum([
  'record_breach',
  'send_alert',
  'escalate',
  'resolve',
  'acknowledge',
]);

/**
 * Queue action request schema
 */
export const QueueActionRequestSchema = z.object({
  /** Action to perform */
  action: QueueActionTypeSchema,

  /** Queue event ID to act upon */
  eventId: UUIDSchema,

  /** Actor performing the action (agent/system ID) */
  actorId: z.string().min(1).optional(),

  /** Optional notes for the action */
  notes: z.string().max(1000).optional(),

  /** Correlation ID for distributed tracing */
  correlationId: z.string().min(1).max(64).optional(),
});

// =============================================================================
// Queue Event Processing Result Schemas
// =============================================================================

/**
 * Success result for queue event processing
 */
export const QueueEventSuccessResultSchema = z.object({
  ok: z.literal(true),
  eventId: UUIDSchema.optional(),
  processedAt: TimestampSchema.optional(),
});

/**
 * Failure reasons for queue event processing
 */
export const QueueEventFailureReasonSchema = z.enum([
  'invalid-payload',
  'invalid-json',
  'processing-error',
  'validation-error',
  'not-found',
  'duplicate',
  'rate-limited',
]);

/**
 * Failure result for queue event processing
 */
export const QueueEventFailureResultSchema = z.object({
  ok: z.literal(false),
  reason: QueueEventFailureReasonSchema,
  details: z.string().optional(),
});

/**
 * Union type for queue event processing results
 */
export const QueueEventResultSchema = z.discriminatedUnion('ok', [
  QueueEventSuccessResultSchema,
  QueueEventFailureResultSchema,
]);

// =============================================================================
// Batch Processing Schemas
// =============================================================================

/**
 * Batch queue event processing request
 */
export const BatchQueueEventRequestSchema = z.object({
  /** Array of queue events to process */
  events: z.array(QueueEventPayloadSchema).min(1).max(100),

  /** Processing options */
  options: z
    .object({
      /** Stop on first error */
      failFast: z.boolean().default(false),
      /** Skip invalid payloads instead of failing */
      skipInvalid: z.boolean().default(true),
      /** Maximum concurrent processing */
      concurrency: z.number().int().min(1).max(10).default(5),
    })
    .optional(),
});

/**
 * Individual result in batch processing
 */
export const BatchQueueEventItemResultSchema = z.object({
  /** Index of the event in the batch */
  index: z.number().int().min(0),
  /** Event ID if available */
  eventId: z.string().optional(),
  /** Processing result */
  result: QueueEventResultSchema,
});

/**
 * Batch queue event processing result
 */
export const BatchQueueEventResultSchema = z.object({
  /** Total events in batch */
  total: z.number().int().min(0),
  /** Successfully processed count */
  succeeded: z.number().int().min(0),
  /** Failed count */
  failed: z.number().int().min(0),
  /** Skipped count (invalid payloads when skipInvalid=true) */
  skipped: z.number().int().min(0),
  /** Individual results */
  results: z.array(BatchQueueEventItemResultSchema),
  /** Processing duration in milliseconds */
  durationMs: z.number().min(0),
});

// =============================================================================
// Queue Statistics Schemas
// =============================================================================

/**
 * Queue breach statistics for a time period
 */
export const QueueBreachStatsSchema = z.object({
  /** Time period start */
  periodStart: TimestampSchema,
  /** Time period end */
  periodEnd: TimestampSchema,

  /** Total breaches in period */
  totalBreaches: z.number().int().min(0),
  /** Critical breaches count */
  criticalBreaches: z.number().int().min(0),
  /** Warning breaches count */
  warningBreaches: z.number().int().min(0),

  /** Breaches by type */
  byType: z.record(QueueBreachTypeSchema, z.number().int().min(0)).optional(),

  /** Average breach duration in seconds */
  avgDurationSeconds: z.number().min(0).optional(),
  /** Maximum breach duration in seconds */
  maxDurationSeconds: z.number().min(0).optional(),

  /** Total affected calls */
  totalAffectedCalls: z.number().int().min(0).optional(),

  /** Alerts sent count */
  alertsSent: z.number().int().min(0).optional(),
  /** Escalations count */
  escalations: z.number().int().min(0).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type QueueBreachType = z.infer<typeof QueueBreachTypeSchema>;
export type QueueBreachSeverity = z.infer<typeof QueueBreachSeveritySchema>;
export type QueueEventStatus = z.infer<typeof QueueEventStatusSchema>;
export type QueueEventPayload = z.infer<typeof QueueEventPayloadSchema>;
export type CreateQueueEvent = z.infer<typeof CreateQueueEventSchema>;
export type UpdateQueueEvent = z.infer<typeof UpdateQueueEventSchema>;
export type QueueActionType = z.infer<typeof QueueActionTypeSchema>;
export type QueueActionRequest = z.infer<typeof QueueActionRequestSchema>;
export type QueueEventSuccessResult = z.infer<typeof QueueEventSuccessResultSchema>;
export type QueueEventFailureReason = z.infer<typeof QueueEventFailureReasonSchema>;
export type QueueEventFailureResult = z.infer<typeof QueueEventFailureResultSchema>;
export type QueueEventResult = z.infer<typeof QueueEventResultSchema>;
export type BatchQueueEventRequest = z.infer<typeof BatchQueueEventRequestSchema>;
export type BatchQueueEventItemResult = z.infer<typeof BatchQueueEventItemResultSchema>;
export type BatchQueueEventResult = z.infer<typeof BatchQueueEventResultSchema>;
export type QueueBreachStats = z.infer<typeof QueueBreachStatsSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse and validate a queue event payload with detailed error reporting
 *
 * @param raw - Raw input data to validate
 * @returns Validated payload or null with logged warnings
 *
 * @example
 * ```typescript
 * const payload = parseQueueEventPayload(requestBody);
 * if (payload) {
 *   await processQueueEvent(payload);
 * }
 * ```
 */
export function parseQueueEventPayload(raw: unknown): QueueEventPayload | null {
  const result = QueueEventPayloadSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Create a success result for queue event processing
 *
 * @param eventId - Optional event ID that was processed
 * @returns Typed success result
 */
export function createQueueEventSuccess(eventId?: string): QueueEventSuccessResult {
  return {
    ok: true as const,
    eventId,
    processedAt: new Date(),
  };
}

/**
 * Create a failure result for queue event processing
 *
 * @param reason - Failure reason code
 * @param details - Optional human-readable details
 * @returns Typed failure result
 */
export function createQueueEventFailure(
  reason: QueueEventFailureReason,
  details?: string
): QueueEventFailureResult {
  return {
    ok: false as const,
    reason,
    details,
  };
}

/**
 * Check if a breach type is critical by default
 *
 * @param breachType - The breach type to check
 * @param currentValue - Current measured value
 * @param thresholdValue - Configured threshold
 * @returns true if the breach should be treated as critical
 */
export function isBreachCritical(
  breachType: QueueBreachType,
  currentValue?: number | null,
  thresholdValue?: number | null
): boolean {
  // Service level and agent availability breaches are always critical
  if (breachType === 'service_level_missed' || breachType === 'agent_availability_low') {
    return true;
  }

  // For other types, critical if exceeded by more than 50%
  if (
    currentValue !== null &&
    currentValue !== undefined &&
    thresholdValue !== null &&
    thresholdValue !== undefined &&
    thresholdValue > 0
  ) {
    const exceedanceRatio = currentValue / thresholdValue;
    return exceedanceRatio > 1.5;
  }

  return false;
}

/**
 * Calculate breach duration from detection to resolution
 *
 * @param detectedAt - When the breach was detected
 * @param resolvedAt - When the breach was resolved (optional)
 * @returns Duration in seconds, or undefined if not resolvable
 */
export function calculateBreachDuration(detectedAt?: Date, resolvedAt?: Date): number | undefined {
  if (!detectedAt) {
    return undefined;
  }

  const endTime = resolvedAt ?? new Date();
  const durationMs = endTime.getTime() - detectedAt.getTime();

  if (durationMs < 0) {
    return undefined;
  }

  return Math.floor(durationMs / 1000);
}

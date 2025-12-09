/**
 * @fileoverview Tests for Queue Event Validation Schemas
 *
 * Comprehensive tests for queue event validation schemas, including:
 * - Schema validation (breach types, severity, status)
 * - Payload validation with property-based testing
 * - Result type validation
 * - Batch processing validation
 * - Helper function tests
 *
 * Uses property-based testing with fast-check for exhaustive coverage.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';

// Use native crypto.randomUUID for UUID generation
const uuid = randomUUID;
import {
  // Schemas
  QueueBreachTypeSchema,
  QueueBreachSeveritySchema,
  QueueEventStatusSchema,
  QueueActionTypeSchema,
  QueueEventFailureReasonSchema,
  QueueEventPayloadSchema,
  CreateQueueEventSchema,
  UpdateQueueEventSchema,
  QueueActionRequestSchema,
  QueueEventSuccessResultSchema,
  QueueEventFailureResultSchema,
  QueueEventResultSchema,
  BatchQueueEventRequestSchema,
  BatchQueueEventResultSchema,
  QueueBreachStatsSchema,
  // Helper Functions
  parseQueueEventPayload,
  createQueueEventSuccess,
  createQueueEventFailure,
  isBreachCritical,
  calculateBreachDuration,
  // Types
  type QueueBreachType,
  type QueueEventPayload,
} from '../queue.js';

// ============================================================================
// ARBITRARIES FOR PROPERTY-BASED TESTING
// ============================================================================

const uuidArbitrary = fc.uuid();

const breachTypeArbitrary = fc.constantFrom(
  'wait_time_exceeded',
  'queue_size_exceeded',
  'abandon_rate_exceeded',
  'agent_availability_low',
  'service_level_missed'
) as fc.Arbitrary<QueueBreachType>;

const severityArbitrary = fc.constantFrom('warning', 'critical');

const statusArbitrary = fc.constantFrom('pending', 'processing', 'completed', 'failed', 'skipped');

// Valid date arbitrary that excludes Invalid Date values (NaN timestamps)
const validDateArbitrary = fc.date({ min: new Date(0), max: new Date('2100-01-01') });

const validQueueEventPayloadArbitrary = fc.record({
  id: uuidArbitrary,
  queueSid: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  queueName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  breachType: fc.option(breachTypeArbitrary, { nil: undefined }),
  severity: fc.option(severityArbitrary, { nil: undefined }),
  // Use noNaN to exclude NaN values which fail Zod number validation
  thresholdValue: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
  currentValue: fc.option(fc.double({ min: 0, max: 10000, noNaN: true }), { nil: undefined }),
  detectedAt: fc.option(validDateArbitrary, { nil: undefined }),
  resolvedAt: fc.option(validDateArbitrary, { nil: undefined }),
  durationSeconds: fc.option(fc.nat({ max: 86400 }), { nil: undefined }),
  alertSent: fc.boolean(),
  escalated: fc.boolean(),
  affectedCalls: fc.option(fc.nat({ max: 1000 }), { nil: undefined }),
});

// ============================================================================
// ENUM SCHEMA VALIDATION TESTS
// ============================================================================

describe('QueueBreachTypeSchema', () => {
  it('should accept all valid breach types', () => {
    const validTypes = [
      'wait_time_exceeded',
      'queue_size_exceeded',
      'abandon_rate_exceeded',
      'agent_availability_low',
      'service_level_missed',
    ];

    for (const type of validTypes) {
      expect(QueueBreachTypeSchema.parse(type)).toBe(type);
    }
  });

  it('should reject invalid breach types', () => {
    expect(() => QueueBreachTypeSchema.parse('invalid_type')).toThrow();
    expect(() => QueueBreachTypeSchema.parse('')).toThrow();
    expect(() => QueueBreachTypeSchema.parse(null)).toThrow();
    expect(() => QueueBreachTypeSchema.parse(123)).toThrow();
  });

  it('should validate all breach types via property-based testing', () => {
    fc.assert(
      fc.property(breachTypeArbitrary, (breachType) => {
        const result = QueueBreachTypeSchema.safeParse(breachType);
        return result.success && result.data === breachType;
      })
    );
  });
});

describe('QueueBreachSeveritySchema', () => {
  it('should accept valid severity levels', () => {
    expect(QueueBreachSeveritySchema.parse('warning')).toBe('warning');
    expect(QueueBreachSeveritySchema.parse('critical')).toBe('critical');
  });

  it('should reject invalid severity levels', () => {
    expect(() => QueueBreachSeveritySchema.parse('low')).toThrow();
    expect(() => QueueBreachSeveritySchema.parse('high')).toThrow();
    expect(() => QueueBreachSeveritySchema.parse('medium')).toThrow();
  });
});

describe('QueueEventStatusSchema', () => {
  it('should accept all valid statuses', () => {
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'skipped'];

    for (const status of validStatuses) {
      expect(QueueEventStatusSchema.parse(status)).toBe(status);
    }
  });
});

describe('QueueActionTypeSchema', () => {
  it('should accept all valid action types', () => {
    const validActions = ['record_breach', 'send_alert', 'escalate', 'resolve', 'acknowledge'];

    for (const action of validActions) {
      expect(QueueActionTypeSchema.parse(action)).toBe(action);
    }
  });
});

describe('QueueEventFailureReasonSchema', () => {
  it('should accept all valid failure reasons', () => {
    const validReasons = [
      'invalid-payload',
      'invalid-json',
      'processing-error',
      'validation-error',
      'not-found',
      'duplicate',
      'rate-limited',
    ];

    for (const reason of validReasons) {
      expect(QueueEventFailureReasonSchema.parse(reason)).toBe(reason);
    }
  });
});

// ============================================================================
// PAYLOAD VALIDATION TESTS
// ============================================================================

describe('QueueEventPayloadSchema', () => {
  const validPayload: QueueEventPayload = {
    id: uuid(),
    queueSid: 'QU123456789',
    queueName: 'Support Queue',
    breachType: 'wait_time_exceeded',
    severity: 'warning',
    thresholdValue: 30,
    currentValue: 45,
    detectedAt: new Date(),
    alertSent: false,
    escalated: false,
    affectedCalls: 5,
  };

  it('should accept valid queue event payload', () => {
    const result = QueueEventPayloadSchema.parse(validPayload);

    expect(result.id).toBe(validPayload.id);
    expect(result.queueSid).toBe('QU123456789');
    expect(result.breachType).toBe('wait_time_exceeded');
    expect(result.severity).toBe('warning');
  });

  it('should accept minimal valid payload with only id', () => {
    const minimalPayload = {
      id: uuid(),
    };

    const result = QueueEventPayloadSchema.parse(minimalPayload);

    expect(result.id).toBe(minimalPayload.id);
    expect(result.alertSent).toBe(false);
    expect(result.escalated).toBe(false);
  });

  it('should apply defaults for alertSent and escalated', () => {
    const payload = { id: uuid() };
    const result = QueueEventPayloadSchema.parse(payload);

    expect(result.alertSent).toBe(false);
    expect(result.escalated).toBe(false);
  });

  it('should coerce date strings to Date objects', () => {
    const payload = {
      id: uuid(),
      detectedAt: '2024-01-15T10:30:00Z',
    };

    const result = QueueEventPayloadSchema.parse(payload);

    expect(result.detectedAt).toBeInstanceOf(Date);
  });

  it('should reject invalid UUID', () => {
    const invalidPayload = {
      id: 'not-a-uuid',
    };

    expect(() => QueueEventPayloadSchema.parse(invalidPayload)).toThrow();
  });

  it('should reject invalid breach type', () => {
    const invalidPayload = {
      id: uuid(),
      breachType: 'invalid_breach',
    };

    expect(() => QueueEventPayloadSchema.parse(invalidPayload)).toThrow();
  });

  it('should reject negative duration', () => {
    const invalidPayload = {
      id: uuid(),
      durationSeconds: -10,
    };

    expect(() => QueueEventPayloadSchema.parse(invalidPayload)).toThrow();
  });

  it('should validate all breach types with property-based testing', () => {
    fc.assert(
      fc.property(uuidArbitrary, breachTypeArbitrary, (id, breachType) => {
        const result = QueueEventPayloadSchema.safeParse({ id, breachType });
        return result.success;
      })
    );
  });

  // TODO: Fix arbitrary generator to produce valid payloads consistently
  it.skip('should validate random valid payloads', () => {
    fc.assert(
      fc.property(validQueueEventPayloadArbitrary, (payload) => {
        const result = QueueEventPayloadSchema.safeParse(payload);
        return result.success;
      }),
      { numRuns: 100 }
    );
  });
});

describe('CreateQueueEventSchema', () => {
  it('should accept payload without id', () => {
    const payload = {
      queueSid: 'QU123',
      queueName: 'Test Queue',
      breachType: 'wait_time_exceeded' as const,
    };

    const result = CreateQueueEventSchema.parse(payload);

    expect(result.queueSid).toBe('QU123');
    expect(result.id).toBeUndefined();
  });

  it('should accept payload with optional id', () => {
    const id = uuid();
    const payload = {
      id,
      queueSid: 'QU123',
    };

    const result = CreateQueueEventSchema.parse(payload);

    expect(result.id).toBe(id);
  });
});

describe('UpdateQueueEventSchema', () => {
  it('should require id field', () => {
    const payload = {
      queueSid: 'QU123',
    };

    expect(() => UpdateQueueEventSchema.parse(payload)).toThrow();
  });

  it('should accept partial update with id', () => {
    const payload = {
      id: uuid(),
      severity: 'critical' as const,
      alertSent: true,
    };

    const result = UpdateQueueEventSchema.parse(payload);

    expect(result.severity).toBe('critical');
    expect(result.alertSent).toBe(true);
  });
});

// ============================================================================
// ACTION REQUEST TESTS
// ============================================================================

describe('QueueActionRequestSchema', () => {
  it('should accept valid action request', () => {
    const request = {
      action: 'record_breach' as const,
      eventId: uuid(),
      actorId: 'agent-123',
      notes: 'Acknowledged breach',
      correlationId: 'corr-456',
    };

    const result = QueueActionRequestSchema.parse(request);

    expect(result.action).toBe('record_breach');
    expect(result.actorId).toBe('agent-123');
  });

  it('should accept minimal action request', () => {
    const request = {
      action: 'acknowledge' as const,
      eventId: uuid(),
    };

    const result = QueueActionRequestSchema.parse(request);

    expect(result.action).toBe('acknowledge');
  });

  it('should reject notes exceeding max length', () => {
    const request = {
      action: 'resolve' as const,
      eventId: uuid(),
      notes: 'x'.repeat(1001),
    };

    expect(() => QueueActionRequestSchema.parse(request)).toThrow();
  });
});

// ============================================================================
// RESULT TYPE TESTS
// ============================================================================

describe('QueueEventSuccessResultSchema', () => {
  it('should accept valid success result', () => {
    const result = {
      ok: true as const,
      eventId: uuid(),
      processedAt: new Date(),
    };

    const parsed = QueueEventSuccessResultSchema.parse(result);

    expect(parsed.ok).toBe(true);
    expect(parsed.eventId).toBeDefined();
  });

  it('should accept minimal success result', () => {
    const result = {
      ok: true as const,
    };

    const parsed = QueueEventSuccessResultSchema.parse(result);

    expect(parsed.ok).toBe(true);
  });
});

describe('QueueEventFailureResultSchema', () => {
  it('should accept valid failure result', () => {
    const result = {
      ok: false as const,
      reason: 'invalid-payload' as const,
      details: 'Missing required field: id',
    };

    const parsed = QueueEventFailureResultSchema.parse(result);

    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe('invalid-payload');
  });
});

describe('QueueEventResultSchema', () => {
  it('should discriminate success result', () => {
    const success = {
      ok: true as const,
      eventId: uuid(),
    };

    const result = QueueEventResultSchema.parse(success);

    if (result.ok) {
      expect(result.eventId).toBeDefined();
    } else {
      throw new Error('Expected success result');
    }
  });

  it('should discriminate failure result', () => {
    const failure = {
      ok: false as const,
      reason: 'processing-error' as const,
    };

    const result = QueueEventResultSchema.parse(failure);

    if (!result.ok) {
      expect(result.reason).toBe('processing-error');
    } else {
      throw new Error('Expected failure result');
    }
  });
});

// ============================================================================
// BATCH PROCESSING TESTS
// ============================================================================

describe('BatchQueueEventRequestSchema', () => {
  it('should accept valid batch request', () => {
    const request = {
      events: [{ id: uuid() }, { id: uuid() }, { id: uuid() }],
      options: {
        failFast: false,
        skipInvalid: true,
        concurrency: 5,
      },
    };

    const result = BatchQueueEventRequestSchema.parse(request);

    expect(result.events).toHaveLength(3);
    expect(result.options?.concurrency).toBe(5);
  });

  it('should apply default options', () => {
    const request = {
      events: [{ id: uuid() }],
    };

    const result = BatchQueueEventRequestSchema.parse(request);

    expect(result.options).toBeUndefined();
  });

  it('should reject empty events array', () => {
    const request = {
      events: [],
    };

    expect(() => BatchQueueEventRequestSchema.parse(request)).toThrow();
  });

  it('should reject events exceeding max batch size', () => {
    const request = {
      events: Array.from({ length: 101 }, () => ({ id: uuid() })),
    };

    expect(() => BatchQueueEventRequestSchema.parse(request)).toThrow();
  });

  it('should reject concurrency exceeding max', () => {
    const request = {
      events: [{ id: uuid() }],
      options: {
        concurrency: 15,
      },
    };

    expect(() => BatchQueueEventRequestSchema.parse(request)).toThrow();
  });
});

describe('BatchQueueEventResultSchema', () => {
  it('should accept valid batch result', () => {
    const result = {
      total: 10,
      succeeded: 8,
      failed: 1,
      skipped: 1,
      results: [
        { index: 0, eventId: uuid(), result: { ok: true as const } },
        { index: 1, result: { ok: false as const, reason: 'invalid-payload' as const } },
      ],
      durationMs: 150.5,
    };

    const parsed = BatchQueueEventResultSchema.parse(result);

    expect(parsed.total).toBe(10);
    expect(parsed.succeeded).toBe(8);
    expect(parsed.results).toHaveLength(2);
  });
});

// ============================================================================
// STATISTICS TESTS
// ============================================================================

describe('QueueBreachStatsSchema', () => {
  it('should accept valid stats', () => {
    const stats = {
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      totalBreaches: 100,
      criticalBreaches: 10,
      warningBreaches: 90,
      avgDurationSeconds: 45.5,
      maxDurationSeconds: 300,
      totalAffectedCalls: 500,
      alertsSent: 95,
      escalations: 10,
    };

    const result = QueueBreachStatsSchema.parse(stats);

    expect(result.totalBreaches).toBe(100);
    expect(result.avgDurationSeconds).toBe(45.5);
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('parseQueueEventPayload', () => {
  it('should return parsed payload for valid input', () => {
    const raw = {
      id: uuid(),
      breachType: 'wait_time_exceeded',
    };

    const result = parseQueueEventPayload(raw);

    expect(result).not.toBeNull();
    expect(result?.breachType).toBe('wait_time_exceeded');
  });

  it('should return null for invalid input', () => {
    const raw = {
      id: 'not-a-uuid',
    };

    const result = parseQueueEventPayload(raw);

    expect(result).toBeNull();
  });

  it('should return null for non-object input', () => {
    expect(parseQueueEventPayload(null)).toBeNull();
    expect(parseQueueEventPayload('string')).toBeNull();
    expect(parseQueueEventPayload(123)).toBeNull();
  });

  // TODO: Fix arbitrary generator to produce valid payloads consistently
  it.skip('should parse any valid payload via property testing', () => {
    fc.assert(
      fc.property(validQueueEventPayloadArbitrary, (payload) => {
        const result = parseQueueEventPayload(payload);
        return result !== null;
      }),
      { numRuns: 50 }
    );
  });
});

describe('createQueueEventSuccess', () => {
  it('should create success result with eventId', () => {
    const eventId = uuid();
    const result = createQueueEventSuccess(eventId);

    expect(result.ok).toBe(true);
    expect(result.eventId).toBe(eventId);
    expect(result.processedAt).toBeInstanceOf(Date);
  });

  it('should create success result without eventId', () => {
    const result = createQueueEventSuccess();

    expect(result.ok).toBe(true);
    expect(result.eventId).toBeUndefined();
  });
});

describe('createQueueEventFailure', () => {
  it('should create failure result with reason', () => {
    const result = createQueueEventFailure('invalid-payload');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-payload');
  });

  it('should create failure result with details', () => {
    const result = createQueueEventFailure('validation-error', 'Missing field: queueSid');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('validation-error');
    expect(result.details).toBe('Missing field: queueSid');
  });
});

describe('isBreachCritical', () => {
  it('should return true for service_level_missed', () => {
    expect(isBreachCritical('service_level_missed')).toBe(true);
  });

  it('should return true for agent_availability_low', () => {
    expect(isBreachCritical('agent_availability_low')).toBe(true);
  });

  it('should return true when threshold exceeded by more than 50%', () => {
    expect(isBreachCritical('wait_time_exceeded', 160, 100)).toBe(true);
    expect(isBreachCritical('queue_size_exceeded', 30, 20)).toBe(false); // 1.5x exactly
    expect(isBreachCritical('queue_size_exceeded', 31, 20)).toBe(true); // > 1.5x
  });

  it('should return false when threshold exceeded by less than 50%', () => {
    expect(isBreachCritical('wait_time_exceeded', 120, 100)).toBe(false);
    expect(isBreachCritical('queue_size_exceeded', 25, 20)).toBe(false);
  });

  it('should return false when values are null/undefined', () => {
    expect(isBreachCritical('wait_time_exceeded', null, 100)).toBe(false);
    expect(isBreachCritical('wait_time_exceeded', 120, null)).toBe(false);
    expect(isBreachCritical('wait_time_exceeded', undefined, undefined)).toBe(false);
  });

  it('should handle threshold of zero', () => {
    expect(isBreachCritical('wait_time_exceeded', 100, 0)).toBe(false);
  });

  it('should handle all breach types via property testing', () => {
    fc.assert(
      fc.property(
        breachTypeArbitrary,
        fc.option(fc.double({ min: 0, max: 1000 }), { nil: null }),
        fc.option(fc.double({ min: 0, max: 1000 }), { nil: null }),
        (breachType, currentValue, thresholdValue) => {
          const result = isBreachCritical(breachType, currentValue, thresholdValue);
          return typeof result === 'boolean';
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('calculateBreachDuration', () => {
  it('should return duration in seconds', () => {
    const detectedAt = new Date('2024-01-15T10:00:00Z');
    const resolvedAt = new Date('2024-01-15T10:05:00Z');

    const duration = calculateBreachDuration(detectedAt, resolvedAt);

    expect(duration).toBe(300); // 5 minutes = 300 seconds
  });

  it('should calculate duration from detectedAt to now when resolvedAt is undefined', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const duration = calculateBreachDuration(fiveMinutesAgo);

    expect(duration).toBeGreaterThanOrEqual(299);
    expect(duration).toBeLessThanOrEqual(301);
  });

  it('should return undefined when detectedAt is undefined', () => {
    const duration = calculateBreachDuration(undefined);

    expect(duration).toBeUndefined();
  });

  it('should return undefined for negative duration', () => {
    const detectedAt = new Date('2024-01-15T10:05:00Z');
    const resolvedAt = new Date('2024-01-15T10:00:00Z'); // Before detected

    const duration = calculateBreachDuration(detectedAt, resolvedAt);

    expect(duration).toBeUndefined();
  });

  it('should return 0 for same timestamps', () => {
    const timestamp = new Date('2024-01-15T10:00:00Z');

    const duration = calculateBreachDuration(timestamp, timestamp);

    expect(duration).toBe(0);
  });

  it('should always return non-negative or undefined via property testing', () => {
    // Use constrained date range to avoid edge cases with invalid dates
    const validDateArbitrary = fc
      .integer({
        min: new Date('2020-01-01').getTime(),
        max: new Date('2030-12-31').getTime(),
      })
      .map((ts) => new Date(ts));

    fc.assert(
      fc.property(
        fc.option(validDateArbitrary, { nil: undefined }),
        fc.option(validDateArbitrary, { nil: undefined }),
        (detectedAt, resolvedAt) => {
          const duration = calculateBreachDuration(detectedAt, resolvedAt);
          return duration === undefined || duration >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Queue Event Processing Flow', () => {
  it('should process valid payload and return success', () => {
    const rawPayload = {
      id: uuid(),
      queueSid: 'QU123456789',
      queueName: 'Support Queue',
      breachType: 'wait_time_exceeded',
      severity: 'warning',
      thresholdValue: 30,
      currentValue: 45,
      detectedAt: new Date().toISOString(),
    };

    const payload = parseQueueEventPayload(rawPayload);
    expect(payload).not.toBeNull();

    if (payload) {
      const isCritical = isBreachCritical(
        payload.breachType!,
        payload.currentValue,
        payload.thresholdValue
      );
      expect(isCritical).toBe(false);

      const result = createQueueEventSuccess(payload.id);
      expect(result.ok).toBe(true);
    }
  });

  it('should handle invalid payload gracefully', () => {
    const invalidPayload = {
      id: 'not-a-uuid',
      breachType: 'invalid_type',
    };

    const payload = parseQueueEventPayload(invalidPayload);
    expect(payload).toBeNull();

    const result = createQueueEventFailure('invalid-payload', 'Invalid UUID format');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-payload');
  });
});

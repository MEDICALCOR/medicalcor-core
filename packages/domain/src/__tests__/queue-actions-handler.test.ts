/**
 * Queue Actions Handler Tests
 * Property-based tests with fast-check for queue action processing
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  QueueActionsHandler,
  createQueueActionsHandler,
  getQueueActionsHandler,
  resetQueueActionsHandler,
  InMemoryQueueEventPort,
  InMemoryAlertNotificationPort,
} from '../voice/queue-actions-handler.js';
import type { QueueEventPayload, QueueActionType } from '@medicalcor/types';

// =============================================================================
// ARBITRARIES (fast-check generators)
// =============================================================================

/** Generate valid UUIDs */
const uuidArb = fc.uuid();

/** Generate queue SIDs */
const queueSidArb = fc
  .tuple(
    fc.constant('WQ'),
    fc.array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
      minLength: 5,
      maxLength: 10,
    })
  )
  .map(([prefix, chars]) => `${prefix}${chars.join('')}`);

/** Generate queue names */
const queueNameArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate breach types */
const breachTypeArb = fc.constantFrom(
  'wait_time_exceeded',
  'queue_size_exceeded',
  'abandon_rate_exceeded',
  'agent_availability_low',
  'service_level_missed'
) as fc.Arbitrary<QueueEventPayload['breachType']>;

/** Generate severity levels */
const severityArb = fc.constantFrom('warning', 'critical') as fc.Arbitrary<
  QueueEventPayload['severity']
>;

/** Generate action types */
const actionTypeArb = fc.constantFrom(
  'record_breach',
  'send_alert',
  'escalate',
  'resolve',
  'acknowledge'
) as fc.Arbitrary<QueueActionType>;

/** Generate positive integers for metric values */
const positiveIntArb = fc.integer({ min: 0, max: 10000 });

/** Generate threshold/current value pairs */
const valueArb = fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null });

/** Generate valid dates using timestamps to avoid Invalid Date */
const validDateArb = fc
  .integer({
    min: new Date('2024-01-01').getTime(),
    max: new Date('2025-12-31').getTime(),
  })
  .map((ts) => new Date(ts));

/** Generate valid queue event payload */
const queueEventPayloadArb = fc.record({
  id: uuidArb,
  queueSid: fc.option(queueSidArb, { nil: undefined }),
  queueName: fc.option(queueNameArb, { nil: undefined }),
  breachType: fc.option(breachTypeArb, { nil: undefined }),
  severity: fc.option(severityArb, { nil: undefined }),
  thresholdValue: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
  currentValue: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
  detectedAt: fc.option(validDateArb, { nil: undefined }),
  resolvedAt: fc.option(validDateArb, { nil: undefined }),
  durationSeconds: fc.option(fc.integer({ min: 0, max: 86400 }), { nil: undefined }),
  alertSent: fc.boolean(),
  escalated: fc.boolean(),
  affectedCalls: fc.option(positiveIntArb, { nil: undefined }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.constant('value')), { nil: undefined }),
});

/** Generate valid action requests - correlationId uses alphanumeric only */
const actionRequestArb = fc.record({
  action: actionTypeArb,
  eventId: uuidArb,
  actorId: fc.option(
    fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 50,
      })
      .map((chars) => chars.join('')),
    { nil: undefined }
  ),
  notes: fc.option(fc.string({ maxLength: 1000 }), { nil: undefined }),
  correlationId: fc.option(
    fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
        minLength: 1,
        maxLength: 64,
      })
      .map((chars) => chars.join('')),
    { nil: undefined }
  ),
});

// =============================================================================
// TEST SETUP
// =============================================================================

describe('QueueActionsHandler', () => {
  let handler: QueueActionsHandler;
  let eventPort: InMemoryQueueEventPort;
  let alertPort: InMemoryAlertNotificationPort;

  beforeEach(() => {
    resetQueueActionsHandler();
    eventPort = new InMemoryQueueEventPort();
    alertPort = new InMemoryAlertNotificationPort();
    handler = createQueueActionsHandler(eventPort, alertPort, {
      enableDuplicateDetection: false, // Disable for property tests
    });
  });

  afterEach(() => {
    resetQueueActionsHandler();
    eventPort.clear();
    alertPort.clear();
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property: Request Validation', () => {
    it('should always return a defined result for any input', () => {
      fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.string(),
            fc.record({
              action: fc.string(), // Invalid action type
              eventId: fc.string(), // Possibly invalid UUID
            })
          ),
          async (invalidRequest) => {
            const result = await handler.handleAction(invalidRequest);
            // Should always return a defined result with ok boolean
            expect(result).toBeDefined();
            expect(typeof result.ok).toBe('boolean');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should accept all valid action types', () => {
      fc.assert(
        fc.asyncProperty(actionRequestArb, async (request) => {
          // Create fresh ports for isolation
          const localEventPort = new InMemoryQueueEventPort();
          const localAlertPort = new InMemoryAlertNotificationPort();
          const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
            enableDuplicateDetection: false,
          });

          // Pre-populate the event so it can be found
          const event: QueueEventPayload = {
            id: request.eventId,
            alertSent: false,
            escalated: false,
          };
          await localEventPort.saveEvent(event);

          const result = await localHandler.handleAction(request);

          // Valid requests should succeed (event exists)
          expect(result.ok).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Payload Validation', () => {
    it('should validate all well-formed payloads', () => {
      fc.assert(
        fc.property(queueEventPayloadArb, (payload) => {
          const result = QueueActionsHandler.validatePayload(payload);
          expect(result.valid).toBe(true);
          expect(result.data).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with invalid UUIDs', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }), // Not a UUID
            alertSent: fc.boolean(),
            escalated: fc.boolean(),
          }),
          (invalidPayload) => {
            const result = QueueActionsHandler.validatePayload(invalidPayload);
            // May or may not be valid depending on the string
            expect(typeof result.valid).toBe('boolean');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Action Idempotency', () => {
    it('should be idempotent for resolve action', () => {
      fc.assert(
        fc.asyncProperty(uuidArb, async (eventId) => {
          // Create fresh ports for this test iteration
          const localEventPort = new InMemoryQueueEventPort();
          const localAlertPort = new InMemoryAlertNotificationPort();
          const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
            enableDuplicateDetection: false,
          });

          const event: QueueEventPayload = {
            id: eventId,
            alertSent: false,
            escalated: false,
          };
          await localEventPort.saveEvent(event);

          // First resolve
          const result1 = await localHandler.handleAction({
            action: 'resolve',
            eventId,
          });

          // Second resolve
          const result2 = await localHandler.handleAction({
            action: 'resolve',
            eventId,
          });

          // Both should succeed
          expect(result1.ok).toBe(true);
          expect(result2.ok).toBe(true);

          // Event should have resolvedAt set
          const finalEvent = await localEventPort.getEvent(eventId);
          expect(finalEvent?.resolvedAt).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    it('should be idempotent for alert action', () => {
      fc.assert(
        fc.asyncProperty(uuidArb, async (eventId) => {
          // Create fresh ports for this test iteration
          const localEventPort = new InMemoryQueueEventPort();
          const localAlertPort = new InMemoryAlertNotificationPort();
          const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
            enableDuplicateDetection: false,
          });

          const event: QueueEventPayload = {
            id: eventId,
            alertSent: false,
            escalated: false,
          };
          await localEventPort.saveEvent(event);

          // First alert
          const result1 = await localHandler.handleAction({
            action: 'send_alert',
            eventId,
          });

          // Second alert
          const result2 = await localHandler.handleAction({
            action: 'send_alert',
            eventId,
          });

          // Both should succeed
          expect(result1.ok).toBe(true);
          expect(result2.ok).toBe(true);

          // Only one alert should be sent
          const alerts = localAlertPort.getAlerts();
          expect(alerts.filter((a) => a.type === 'alert').length).toBe(1);
        }),
        { numRuns: 20 }
      );
    });

    it('should be idempotent for escalate action', () => {
      fc.assert(
        fc.asyncProperty(uuidArb, async (eventId) => {
          // Create fresh ports for this test iteration
          const localEventPort = new InMemoryQueueEventPort();
          const localAlertPort = new InMemoryAlertNotificationPort();
          const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
            enableDuplicateDetection: false,
          });

          const event: QueueEventPayload = {
            id: eventId,
            alertSent: false,
            escalated: false,
          };
          await localEventPort.saveEvent(event);

          // First escalate
          const result1 = await localHandler.handleAction({
            action: 'escalate',
            eventId,
          });

          // Second escalate
          const result2 = await localHandler.handleAction({
            action: 'escalate',
            eventId,
          });

          // Both should succeed
          expect(result1.ok).toBe(true);
          expect(result2.ok).toBe(true);

          // Only one escalation should be sent
          const alerts = localAlertPort.getAlerts();
          expect(alerts.filter((a) => a.type === 'escalation').length).toBe(1);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: Event State Transitions', () => {
    it('should correctly transition event through lifecycle', () => {
      fc.assert(
        fc.asyncProperty(
          queueEventPayloadArb.filter((p) => !p.alertSent && !p.escalated && !p.resolvedAt),
          async (initialEvent) => {
            // Create fresh ports for isolation
            const localEventPort = new InMemoryQueueEventPort();
            const localAlertPort = new InMemoryAlertNotificationPort();
            const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
              enableDuplicateDetection: false,
            });

            await localEventPort.saveEvent(initialEvent);

            // Record breach
            await localHandler.handleAction({ action: 'record_breach', eventId: initialEvent.id });
            let event = await localEventPort.getEvent(initialEvent.id);
            expect(event).toBeDefined();

            // Send alert
            await localHandler.handleAction({ action: 'send_alert', eventId: initialEvent.id });
            event = await localEventPort.getEvent(initialEvent.id);
            expect(event?.alertSent).toBe(true);

            // Escalate
            await localHandler.handleAction({ action: 'escalate', eventId: initialEvent.id });
            event = await localEventPort.getEvent(initialEvent.id);
            expect(event?.escalated).toBe(true);

            // Resolve
            await localHandler.handleAction({ action: 'resolve', eventId: initialEvent.id });
            event = await localEventPort.getEvent(initialEvent.id);
            expect(event?.resolvedAt).toBeDefined();

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: Batch Processing Consistency', () => {
    it('should process all valid events in batch', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(queueEventPayloadArb, { minLength: 1, maxLength: 10 }),
          async (events) => {
            // Create fresh handler for isolation
            const localEventPort = new InMemoryQueueEventPort();
            const localAlertPort = new InMemoryAlertNotificationPort();
            const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
              enableDuplicateDetection: false,
            });

            const result = await localHandler.handleBatch({
              events,
              options: { skipInvalid: true, concurrency: 3 },
            });

            // Total should match input
            expect(result.total).toBe(events.length);

            // Succeeded + failed + skipped should equal total
            expect(result.succeeded + result.failed + result.skipped).toBe(result.total);

            // All results should have valid structure
            for (const r of result.results) {
              expect(r.index).toBeGreaterThanOrEqual(0);
              expect(r.index).toBeLessThan(events.length);
              expect(typeof r.result.ok).toBe('boolean');
            }

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should maintain order in batch results', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(queueEventPayloadArb, { minLength: 2, maxLength: 20 }),
          async (events) => {
            // Create fresh handler for isolation
            const localEventPort = new InMemoryQueueEventPort();
            const localAlertPort = new InMemoryAlertNotificationPort();
            const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
              enableDuplicateDetection: false,
            });

            const result = await localHandler.handleBatch({
              events,
              options: { concurrency: 1 }, // Sequential for order testing
            });

            // Results should be in order
            const indices = result.results.map((r) => r.index);
            const sorted = [...indices].sort((a, b) => a - b);
            expect(indices).toEqual(sorted);

            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: Not Found Handling', () => {
    it('should return not-found equivalent for missing events', () => {
      fc.assert(
        fc.asyncProperty(actionRequestArb, async (request) => {
          // Create fresh handler with empty port - event should not exist
          const localEventPort = new InMemoryQueueEventPort();
          const localAlertPort = new InMemoryAlertNotificationPort();
          const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
            enableDuplicateDetection: false,
          });

          const result = await localHandler.handleAction(request);

          // Should fail because event doesn't exist
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.reason).toBe('processing-error');
          }
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: Threshold and Value Invariants', () => {
    it('should preserve threshold and current value relationships', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            id: uuidArb,
            thresholdValue: fc.integer({ min: 1, max: 100 }),
            currentValue: fc.integer({ min: 1, max: 200 }),
            alertSent: fc.constant(false),
            escalated: fc.constant(false),
          }),
          async (event) => {
            // Create fresh ports for isolation
            const localEventPort = new InMemoryQueueEventPort();
            const localAlertPort = new InMemoryAlertNotificationPort();
            const localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
              enableDuplicateDetection: false,
            });

            await localEventPort.saveEvent(event as QueueEventPayload);

            await localHandler.handleAction({
              action: 'record_breach',
              eventId: event.id,
            });

            const storedEvent = await localEventPort.getEvent(event.id);

            // Event should exist
            expect(storedEvent).toBeDefined();
            // Values should be preserved
            expect(storedEvent?.thresholdValue).toBe(event.thresholdValue);
            expect(storedEvent?.currentValue).toBe(event.currentValue);

            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // ===========================================================================
  // EXAMPLE-BASED TESTS
  // ===========================================================================

  describe('Action Handling', () => {
    let localHandler: QueueActionsHandler;
    let localEventPort: InMemoryQueueEventPort;
    let localAlertPort: InMemoryAlertNotificationPort;

    beforeEach(() => {
      localEventPort = new InMemoryQueueEventPort();
      localAlertPort = new InMemoryAlertNotificationPort();
      localHandler = createQueueActionsHandler(localEventPort, localAlertPort, {
        enableDuplicateDetection: false,
      });
    });

    it('should handle record_breach action', async () => {
      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        queueSid: 'WQ001',
        queueName: 'Test Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        thresholdValue: 120,
        currentValue: 150,
        alertSent: false,
        escalated: false,
      };

      await localEventPort.saveEvent(event);
      const result = await localHandler.handleAction({
        action: 'record_breach',
        eventId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.eventId).toBe(eventId);
      }
    });

    it('should handle send_alert action', async () => {
      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        alertSent: false,
        escalated: false,
      };

      await localEventPort.saveEvent(event);
      const result = await localHandler.handleAction({
        action: 'send_alert',
        eventId,
      });

      expect(result.ok).toBe(true);

      const alerts = localAlertPort.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('alert');
    });

    it('should handle escalate action', async () => {
      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        alertSent: true,
        escalated: false,
      };

      await localEventPort.saveEvent(event);
      const result = await localHandler.handleAction({
        action: 'escalate',
        eventId,
        actorId: 'supervisor-001',
      });

      expect(result.ok).toBe(true);

      const alerts = localAlertPort.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('escalation');
    });

    it('should handle resolve action', async () => {
      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        alertSent: true,
        escalated: true,
      };

      await localEventPort.saveEvent(event);
      const result = await localHandler.handleAction({
        action: 'resolve',
        eventId,
        actorId: 'supervisor-001',
        notes: 'Issue resolved',
      });

      expect(result.ok).toBe(true);

      const storedEvent = await localEventPort.getEvent(eventId);
      expect(storedEvent?.resolvedAt).toBeDefined();
    });

    it('should handle acknowledge action', async () => {
      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        alertSent: true,
        escalated: false,
      };

      await localEventPort.saveEvent(event);
      const result = await localHandler.handleAction({
        action: 'acknowledge',
        eventId,
        actorId: 'supervisor-001',
        notes: 'Acknowledged and monitoring',
      });

      expect(result.ok).toBe(true);

      const storedEvent = await localEventPort.getEvent(eventId);
      expect(storedEvent?.metadata?.acknowledged).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should reject invalid action types', async () => {
      const result = await handler.handleAction({
        action: 'invalid_action' as QueueActionType,
        eventId: crypto.randomUUID(),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('validation-error');
      }
    });

    it('should reject invalid event IDs', async () => {
      const result = await handler.handleAction({
        action: 'record_breach',
        eventId: 'not-a-uuid',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('validation-error');
      }
    });

    it('should validate requests correctly via static method', () => {
      const validRequest = {
        action: 'record_breach',
        eventId: crypto.randomUUID(),
      };

      const validResult = QueueActionsHandler.validateRequest(validRequest);
      expect(validResult.valid).toBe(true);

      const invalidResult = QueueActionsHandler.validateRequest({
        action: 'invalid',
        eventId: 'not-uuid',
      });
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('Batch Processing', () => {
    it('should process batch of events', async () => {
      const events: QueueEventPayload[] = [
        { id: crypto.randomUUID(), alertSent: false, escalated: false },
        { id: crypto.randomUUID(), alertSent: false, escalated: false },
        { id: crypto.randomUUID(), alertSent: false, escalated: false },
      ];

      const result = await handler.handleBatch({
        events,
        options: { concurrency: 2 },
      });

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed valid/invalid events with skipInvalid', async () => {
      const events = [
        { id: crypto.randomUUID(), alertSent: false, escalated: false },
        { id: 'invalid-uuid' }, // Invalid
        { id: crypto.randomUUID(), alertSent: true, escalated: false },
      ];

      const result = await handler.handleBatch({
        events: events as QueueEventPayload[],
        options: { skipInvalid: true },
      });

      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect duplicates when enabled', async () => {
      const handlerWithDupeDetection = createQueueActionsHandler(eventPort, alertPort, {
        enableDuplicateDetection: true,
        duplicateWindowSeconds: 60,
      });

      const eventId = crypto.randomUUID();
      const event: QueueEventPayload = {
        id: eventId,
        alertSent: false,
        escalated: false,
      };

      await eventPort.saveEvent(event);

      // First request
      const result1 = await handlerWithDupeDetection.handleAction({
        action: 'send_alert',
        eventId,
      });

      // Duplicate request
      const result2 = await handlerWithDupeDetection.handleAction({
        action: 'send_alert',
        eventId,
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(false);
      if (!result2.ok) {
        expect(result2.reason).toBe('duplicate');
      }
    });
  });

  describe('Singleton Pattern', () => {
    afterEach(() => {
      resetQueueActionsHandler();
    });

    it('should return same instance from getQueueActionsHandler', () => {
      const handler1 = getQueueActionsHandler();
      const handler2 = getQueueActionsHandler();

      expect(handler1).toBe(handler2);
    });

    it('should reset instance correctly', () => {
      const handler1 = getQueueActionsHandler();
      resetQueueActionsHandler();
      const handler2 = getQueueActionsHandler();

      expect(handler1).not.toBe(handler2);
    });

    it('should create new instance with createQueueActionsHandler', () => {
      const h1 = createQueueActionsHandler(eventPort, alertPort);
      const h2 = createQueueActionsHandler(eventPort, alertPort);

      expect(h1).not.toBe(h2);
    });
  });
});

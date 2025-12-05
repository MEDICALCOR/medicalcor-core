/**
 * Schema-Validated Event Store Unit Tests
 *
 * Comprehensive tests for schema-validated event store including:
 * - Event validation before storage
 * - Automatic schema version tagging
 * - Event upcasting during replay
 * - Schema violation tracking
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  SchemaValidatedEventStore,
  createSchemaValidatedEventStore,
  withSchemaValidation,
  EventSchemaValidationError,
  type SchemaViolation,
} from '../schema-validated-event-store.js';
import type { EventStore, EventPublisher, StoredEvent } from '../../event-store.js';
import { EventSchemaRegistry } from '../event-schema-registry.js';
import { z } from 'zod';

/**
 * Create a mock event store
 */
function createMockEventStore(): EventStore & {
  emitMock: Mock;
  getByCorrelationIdMock: Mock;
  getByAggregateIdMock: Mock;
  getByTypeMock: Mock;
  addPublisherMock: Mock;
} {
  return {
    emitMock: vi.fn(),
    getByCorrelationIdMock: vi.fn(),
    getByAggregateIdMock: vi.fn(),
    getByTypeMock: vi.fn(),
    addPublisherMock: vi.fn(),
    emit: vi.fn(async function (this: { emitMock: Mock }, input) {
      return this.emitMock(input);
    }),
    getByCorrelationId: vi.fn(async function (this: { getByCorrelationIdMock: Mock }, id) {
      return this.getByCorrelationIdMock(id);
    }),
    getByAggregateId: vi.fn(async function (
      this: { getByAggregateIdMock: Mock },
      id,
      afterVersion
    ) {
      return this.getByAggregateIdMock(id, afterVersion);
    }),
    getByType: vi.fn(async function (this: { getByTypeMock: Mock }, type, limit) {
      return this.getByTypeMock(type, limit);
    }),
    addPublisher: vi.fn(function (this: { addPublisherMock: Mock }, publisher) {
      return this.addPublisherMock(publisher);
    }),
  } as unknown as EventStore & {
    emitMock: Mock;
    getByCorrelationIdMock: Mock;
    getByAggregateIdMock: Mock;
    getByTypeMock: Mock;
    addPublisherMock: Mock;
  };
}

describe('SchemaValidatedEventStore', () => {
  let mockEventStore: ReturnType<typeof createMockEventStore>;
  let registry: EventSchemaRegistry;
  let validatedStore: SchemaValidatedEventStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventStore = createMockEventStore();
    registry = new EventSchemaRegistry();
    validatedStore = new SchemaValidatedEventStore(mockEventStore, registry);

    // Register a simple test schema
    registry.register('TestEvent', {
      version: 1,
      schema: z.object({
        message: z.string(),
        count: z.number().int().min(0),
      }),
    });
  });

  describe('Constructor and Configuration', () => {
    it('should create store with default configuration', () => {
      expect(validatedStore).toBeDefined();
    });

    it('should create store with custom configuration', () => {
      const customStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
        autoVersionTag: false,
        upcastOnRead: false,
        logViolations: false,
      });

      expect(customStore).toBeDefined();
    });

    it('should use global registry when not provided', () => {
      const storeWithGlobalRegistry = new SchemaValidatedEventStore(mockEventStore);

      expect(storeWithGlobalRegistry).toBeDefined();
    });
  });

  describe('emit - Validation', () => {
    it('should emit valid event successfully', async () => {
      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: 'agg-123',
        aggregateType: 'TestAggregate',
        version: 1,
        payload: {
          message: 'Hello',
          count: 5,
          __schemaVersion: 1,
        },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      const result = await validatedStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { message: 'Hello', count: 5 },
      });

      expect(result).toBeDefined();
      expect(mockEventStore.emitMock).toHaveBeenCalled();
    });

    it('should add schema version to payload when autoVersionTag enabled', async () => {
      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { message: 'Test', count: 1, __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await validatedStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { message: 'Test', count: 1 },
      });

      const emitCall = mockEventStore.emitMock.mock.calls[0]?.[0];
      expect(emitCall.payload).toHaveProperty('__schemaVersion', 1);
    });

    it('should not add schema version when autoVersionTag disabled', async () => {
      const customStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        autoVersionTag: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { message: 'Test', count: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await customStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { message: 'Test', count: 1 },
      });

      const emitCall = mockEventStore.emitMock.mock.calls[0]?.[0];
      expect(emitCall.payload).not.toHaveProperty('__schemaVersion');
    });

    it('should throw error for invalid payload in strict mode', async () => {
      await expect(
        validatedStore.emit({
          type: 'TestEvent',
          correlationId: 'corr-123',
          payload: { message: 'Test', count: -1 }, // Negative count is invalid
        })
      ).rejects.toThrow(EventSchemaValidationError);
    });

    it('should not throw error for invalid payload in non-strict mode', async () => {
      const nonStrictStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { message: 'Test', count: -1, __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await expect(
        nonStrictStore.emit({
          type: 'TestEvent',
          correlationId: 'corr-123',
          payload: { message: 'Test', count: -1 },
        })
      ).resolves.toBeDefined();
    });

    it('should record validation violation', async () => {
      const nonStrictStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { message: 'Test', count: -1, __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await nonStrictStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { message: 'Test', count: -1 },
      });

      const violations = nonStrictStore.getViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.eventType).toBe('TestEvent');
    });

    it('should handle unknown event types gracefully', async () => {
      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'UnknownEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { anything: 'goes', __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      // Unknown event types should pass through
      await expect(
        validatedStore.emit({
          type: 'UnknownEvent',
          correlationId: 'corr-123',
          payload: { anything: 'goes' },
        })
      ).resolves.toBeDefined();
    });
  });

  describe('getByCorrelationId - Upcasting', () => {
    it('should return events with upcasting enabled', async () => {
      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: undefined,
          aggregateType: undefined,
          version: undefined,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByCorrelationIdMock.mockResolvedValue(events);

      const result = await validatedStore.getByCorrelationId('corr-123');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should not upcast when upcastOnRead disabled', async () => {
      const noUpcastStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        upcastOnRead: false,
      });

      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: undefined,
          aggregateType: undefined,
          version: undefined,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByCorrelationIdMock.mockResolvedValue(events);

      const result = await noUpcastStore.getByCorrelationId('corr-123');

      expect(result[0]?.payload).toEqual(events[0]?.payload);
    });

    it('should upcast events to latest version', async () => {
      // Register version 2 with migration
      registry.register('TestEvent', {
        version: 2,
        schema: z.object({
          message: z.string(),
          count: z.number().int().min(0),
          timestamp: z.string(),
        }),
      });

      // Add migration from v1 to v2
      const versions = registry.getSchemaInfo('TestEvent');
      if (versions && versions[0]) {
        versions[0].migrateTo = (v1: { message: string; count: number }) => ({
          ...v1,
          timestamp: new Date().toISOString(),
        });
      }

      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: undefined,
          aggregateType: undefined,
          version: undefined,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByCorrelationIdMock.mockResolvedValue(events);

      const result = await validatedStore.getByCorrelationId('corr-123');

      expect(result[0]?.payload).toHaveProperty('__schemaVersion', 2);
      expect(result[0]?.payload).toHaveProperty('timestamp');
      expect(result[0]?.payload).toHaveProperty('__migratedFrom', 1);
    });

    it('should handle migration failures gracefully', async () => {
      // Register version 2 without migration function
      registry.register('TestEvent', {
        version: 2,
        schema: z.object({
          message: z.string(),
          count: z.number().int().min(0),
          newField: z.string(),
        }),
      });

      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: undefined,
          aggregateType: undefined,
          version: undefined,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByCorrelationIdMock.mockResolvedValue(events);

      const result = await validatedStore.getByCorrelationId('corr-123');

      // Should return original payload on migration failure
      expect(result[0]?.payload).toEqual(events[0]?.payload);
    });
  });

  describe('getByAggregateId - Upcasting', () => {
    it('should return events for aggregate with upcasting', async () => {
      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: 'agg-123',
          aggregateType: 'TestAggregate',
          version: 1,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByAggregateIdMock.mockResolvedValue(events);

      const result = await validatedStore.getByAggregateId('agg-123');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should support afterVersion parameter', async () => {
      mockEventStore.getByAggregateIdMock.mockResolvedValue([]);

      await validatedStore.getByAggregateId('agg-123', 5);

      expect(mockEventStore.getByAggregateIdMock).toHaveBeenCalledWith('agg-123', 5);
    });

    it('should upcast multiple events', async () => {
      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: 'agg-123',
          aggregateType: 'TestAggregate',
          version: 1,
          payload: { message: 'First', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-1',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
        {
          id: 'event-2',
          type: 'TestEvent',
          aggregateId: 'agg-123',
          aggregateType: 'TestAggregate',
          version: 2,
          payload: { message: 'Second', count: 2, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-2',
            causationId: undefined,
            idempotencyKey: 'idem-2',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByAggregateIdMock.mockResolvedValue(events);

      const result = await validatedStore.getByAggregateId('agg-123');

      expect(result.length).toBe(2);
    });
  });

  describe('getByType', () => {
    it('should return events by type with upcasting', async () => {
      const events: StoredEvent[] = [
        {
          id: 'event-1',
          type: 'TestEvent',
          aggregateId: undefined,
          aggregateType: undefined,
          version: undefined,
          payload: { message: 'Test', count: 1, __schemaVersion: 1 },
          metadata: {
            correlationId: 'corr-123',
            causationId: undefined,
            idempotencyKey: 'idem-1',
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        },
      ];

      mockEventStore.getByTypeMock.mockResolvedValue(events);

      const result = await validatedStore.getByType('TestEvent');

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });

    it('should support limit parameter', async () => {
      mockEventStore.getByTypeMock.mockResolvedValue([]);

      await validatedStore.getByType('TestEvent', 100);

      expect(mockEventStore.getByTypeMock).toHaveBeenCalledWith('TestEvent', 100);
    });
  });

  describe('Violation Management', () => {
    it('should track violations', async () => {
      const nonStrictStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { invalid: 'data', __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await nonStrictStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { invalid: 'data' },
      });

      const violations = nonStrictStore.getViolations();
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should clear violations', async () => {
      const nonStrictStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { invalid: 'data', __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      await nonStrictStore.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { invalid: 'data' },
      });

      nonStrictStore.clearViolations();

      const violations = nonStrictStore.getViolations();
      expect(violations.length).toBe(0);
    });

    it('should limit violations to 1000', async () => {
      const nonStrictStore = new SchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      const storedEvent: StoredEvent = {
        id: 'event-123',
        type: 'TestEvent',
        aggregateId: undefined,
        aggregateType: undefined,
        version: undefined,
        payload: { invalid: 'data', __schemaVersion: 1 },
        metadata: {
          correlationId: 'corr-123',
          causationId: undefined,
          idempotencyKey: 'idem-123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      mockEventStore.emitMock.mockResolvedValue(storedEvent);

      // Generate more than 1000 violations
      for (let i = 0; i < 1100; i++) {
        await nonStrictStore.emit({
          type: 'TestEvent',
          correlationId: `corr-${i}`,
          payload: { invalid: 'data' },
        });
      }

      const violations = nonStrictStore.getViolations();
      expect(violations.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Publisher Management', () => {
    it('should add publisher to underlying store', () => {
      const mockPublisher: EventPublisher = {
        publish: vi.fn(),
      };

      validatedStore.addPublisher(mockPublisher);

      expect(mockEventStore.addPublisherMock).toHaveBeenCalledWith(mockPublisher);
    });
  });

  describe('Store Access', () => {
    it('should get underlying event store', () => {
      const underlyingStore = validatedStore.getUnderlyingStore();

      expect(underlyingStore).toBe(mockEventStore);
    });

    it('should get schema registry', () => {
      const returnedRegistry = validatedStore.getRegistry();

      expect(returnedRegistry).toBe(registry);
    });
  });

  describe('EventSchemaValidationError', () => {
    it('should create error with correct properties', () => {
      const error = new EventSchemaValidationError(
        'Validation failed',
        'TestEvent',
        1,
        'Invalid field'
      );

      expect(error.message).toBe('Validation failed');
      expect(error.eventType).toBe('TestEvent');
      expect(error.schemaVersion).toBe(1);
      expect(error.validationError).toBe('Invalid field');
      expect(error.code).toBe('EVENT_SCHEMA_VALIDATION_ERROR');
      expect(error.name).toBe('EventSchemaValidationError');
    });
  });

  describe('Factory Functions', () => {
    it('should create store with factory function', () => {
      const factoryStore = createSchemaValidatedEventStore(mockEventStore, registry, {
        strictValidation: false,
      });

      expect(factoryStore).toBeDefined();
    });

    it('should wrap store with withSchemaValidation', () => {
      const wrappedStore = withSchemaValidation(mockEventStore, {
        registry,
        strictValidation: true,
        upcastOnRead: true,
      });

      expect(wrappedStore).toBeDefined();
    });

    it('should use default options in withSchemaValidation', () => {
      const wrappedStore = withSchemaValidation(mockEventStore);

      expect(wrappedStore).toBeDefined();
    });
  });
});

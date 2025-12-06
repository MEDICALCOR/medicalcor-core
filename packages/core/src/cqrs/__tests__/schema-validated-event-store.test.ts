/**
 * Schema-Validated Event Store Tests
 *
 * Tests for event store wrapper with schema validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  SchemaValidatedEventStore,
  EventSchemaValidationError,
  createSchemaValidatedEventStore,
  withSchemaValidation,
} from '../schema-validated-event-store.js';
import { EventSchemaRegistry } from '../event-schema-registry.js';
import type { StoredEvent, EventStore } from '../../event-store.js';

describe('SchemaValidatedEventStore', () => {
  let mockEventStore: {
    emit: ReturnType<typeof vi.fn>;
    getByCorrelationId: ReturnType<typeof vi.fn>;
    getByAggregateId: ReturnType<typeof vi.fn>;
    getByType: ReturnType<typeof vi.fn>;
    addPublisher: ReturnType<typeof vi.fn>;
  };
  let registry: EventSchemaRegistry;
  let store: SchemaValidatedEventStore;

  const createStoredEvent = (
    type: string,
    payload: Record<string, unknown>,
    overrides: Partial<StoredEvent> = {}
  ): StoredEvent => ({
    id: crypto.randomUUID(),
    type,
    payload,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    },
    ...overrides,
  });

  beforeEach(() => {
    mockEventStore = {
      emit: vi
        .fn()
        .mockImplementation(async (input) => createStoredEvent(input.type, input.payload)),
      getByCorrelationId: vi.fn().mockResolvedValue([]),
      getByAggregateId: vi.fn().mockResolvedValue([]),
      getByType: vi.fn().mockResolvedValue([]),
      addPublisher: vi.fn(),
    };

    registry = new EventSchemaRegistry();
    store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry);
  });

  describe('emit', () => {
    it('should emit valid events', async () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { value: 'test' },
      });

      expect(mockEventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TestEvent',
          payload: expect.objectContaining({
            value: 'test',
            __schemaVersion: 1,
          }),
        })
      );
    });

    it('should throw on invalid payload in strict mode', async () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await expect(
        store.emit({
          type: 'TestEvent',
          correlationId: 'corr-123',
          payload: { value: 123 }, // Should be string
        })
      ).rejects.toThrow(EventSchemaValidationError);
    });

    it('should allow invalid payload in non-strict mode', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        strictValidation: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { value: 123 },
      });

      expect(mockEventStore.emit).toHaveBeenCalled();
    });

    it('should pass through unknown event types', async () => {
      await store.emit({
        type: 'UnknownEvent',
        correlationId: 'corr-123',
        payload: { anything: 'goes' },
      });

      expect(mockEventStore.emit).toHaveBeenCalled();
    });

    it('should not add schema version when disabled', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        autoVersionTag: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { value: 'test' },
      });

      expect(mockEventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { value: 'test' },
        })
      );
    });

    it('should record violations', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        strictValidation: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-123',
        payload: { value: 123 },
      });

      const violations = store.getViolations();
      expect(violations).toHaveLength(1);
      expect(violations[0]?.eventType).toBe('TestEvent');
    });
  });

  describe('getByCorrelationId', () => {
    it('should return events', async () => {
      mockEventStore.getByCorrelationId.mockResolvedValue([
        createStoredEvent('TestEvent', { value: 'test' }),
      ]);

      const events = await store.getByCorrelationId('corr-123');
      expect(events).toHaveLength(1);
    });
  });

  describe('getByAggregateId', () => {
    it('should return events', async () => {
      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('TestEvent', { value: 'test' }),
      ]);

      const events = await store.getByAggregateId('agg-123');
      expect(events).toHaveLength(1);
    });

    it('should pass afterVersion parameter', async () => {
      mockEventStore.getByAggregateId.mockResolvedValue([]);

      await store.getByAggregateId('agg-123', 5);

      expect(mockEventStore.getByAggregateId).toHaveBeenCalledWith('agg-123', 5);
    });
  });

  describe('getByType', () => {
    it('should return events', async () => {
      mockEventStore.getByType.mockResolvedValue([
        createStoredEvent('TestEvent', { value: 'test' }),
      ]);

      const events = await store.getByType('TestEvent');
      expect(events).toHaveLength(1);
    });

    it('should pass limit parameter', async () => {
      mockEventStore.getByType.mockResolvedValue([]);

      await store.getByType('TestEvent', 10);

      expect(mockEventStore.getByType).toHaveBeenCalledWith('TestEvent', 10);
    });
  });

  describe('upcasting', () => {
    beforeEach(() => {
      registry.register('MigratableEvent', {
        version: 1,
        schema: z.object({ field1: z.string() }),
        migrateTo: (v1) => ({ ...(v1 as object), field2: 'added' }),
      });

      registry.register('MigratableEvent', {
        version: 2,
        schema: z.object({ field1: z.string(), field2: z.string() }),
      });
    });

    it('should upcast events on read', async () => {
      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('MigratableEvent', { field1: 'test', __schemaVersion: 1 }),
      ]);

      const events = await store.getByAggregateId('agg-123');

      expect(events[0]?.payload).toEqual({
        field1: 'test',
        field2: 'added',
        __schemaVersion: 2,
        __migratedFrom: 1,
      });
    });

    it('should not upcast when disabled', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        upcastOnRead: false,
      });

      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('MigratableEvent', { field1: 'test', __schemaVersion: 1 }),
      ]);

      const events = await store.getByAggregateId('agg-123');

      expect(events[0]?.payload).toEqual({ field1: 'test', __schemaVersion: 1 });
    });

    it('should not upcast events already at latest version', async () => {
      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('MigratableEvent', {
          field1: 'test',
          field2: 'value',
          __schemaVersion: 2,
        }),
      ]);

      const events = await store.getByAggregateId('agg-123');

      expect((events[0]?.payload as { __migratedFrom?: number }).__migratedFrom).toBeUndefined();
    });

    it('should handle migration failures gracefully', async () => {
      registry.register('FailingEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
        migrateTo: () => {
          throw new Error('Migration failed');
        },
      });

      registry.register('FailingEvent', {
        version: 2,
        schema: z.object({ value: z.string() }),
      });

      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('FailingEvent', { value: 'test', __schemaVersion: 1 }),
      ]);

      const events = await store.getByAggregateId('agg-123');

      // Should return original event on migration failure
      expect(events[0]?.payload).toEqual({ value: 'test', __schemaVersion: 1 });
    });

    it('should default to version 1 when no schema version in payload', async () => {
      mockEventStore.getByAggregateId.mockResolvedValue([
        createStoredEvent('MigratableEvent', { field1: 'test' }),
      ]);

      const events = await store.getByAggregateId('agg-123');

      expect(events[0]?.payload).toEqual({
        field1: 'test',
        field2: 'added',
        __schemaVersion: 2,
        __migratedFrom: 1,
      });
    });
  });

  describe('violations', () => {
    it('should track violations', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        strictValidation: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-1',
        payload: { value: 123 },
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-2',
        payload: { value: 456 },
      });

      expect(store.getViolations()).toHaveLength(2);
    });

    it('should clear violations', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        strictValidation: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      await store.emit({
        type: 'TestEvent',
        correlationId: 'corr-1',
        payload: { value: 123 },
      });

      store.clearViolations();

      expect(store.getViolations()).toHaveLength(0);
    });

    it('should limit violations to 1000', async () => {
      store = new SchemaValidatedEventStore(mockEventStore as unknown as EventStore, registry, {
        strictValidation: false,
        logViolations: false,
      });

      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      // Emit more than 1000 violations
      for (let i = 0; i < 1010; i++) {
        await store.emit({
          type: 'TestEvent',
          correlationId: `corr-${i}`,
          payload: { value: i },
        });
      }

      expect(store.getViolations().length).toBeLessThanOrEqual(1000);
    });
  });

  describe('addPublisher', () => {
    it('should delegate to underlying store', () => {
      const publisher = { publish: vi.fn() };
      store.addPublisher(publisher);

      expect(mockEventStore.addPublisher).toHaveBeenCalledWith(publisher);
    });
  });

  describe('getUnderlyingStore', () => {
    it('should return underlying store', () => {
      expect(store.getUnderlyingStore()).toBe(mockEventStore);
    });
  });

  describe('getRegistry', () => {
    it('should return schema registry', () => {
      expect(store.getRegistry()).toBe(registry);
    });
  });

  describe('EventSchemaValidationError', () => {
    it('should have correct properties', () => {
      const error = new EventSchemaValidationError(
        'Validation failed',
        'TestEvent',
        2,
        'value must be string'
      );

      expect(error.name).toBe('EventSchemaValidationError');
      expect(error.code).toBe('EVENT_SCHEMA_VALIDATION_ERROR');
      expect(error.eventType).toBe('TestEvent');
      expect(error.schemaVersion).toBe(2);
      expect(error.validationError).toBe('value must be string');
      expect(error.message).toBe('Validation failed');
    });
  });

  describe('createSchemaValidatedEventStore', () => {
    it('should create store with default options', () => {
      const store = createSchemaValidatedEventStore(mockEventStore as unknown as EventStore);
      expect(store).toBeInstanceOf(SchemaValidatedEventStore);
    });

    it('should create store with custom registry', () => {
      const customRegistry = new EventSchemaRegistry();
      const store = createSchemaValidatedEventStore(
        mockEventStore as unknown as EventStore,
        customRegistry
      );

      expect(store.getRegistry()).toBe(customRegistry);
    });

    it('should create store with custom config', () => {
      const store = createSchemaValidatedEventStore(
        mockEventStore as unknown as EventStore,
        registry,
        { strictValidation: false }
      );

      expect(store).toBeInstanceOf(SchemaValidatedEventStore);
    });
  });

  describe('withSchemaValidation', () => {
    it('should wrap event store', () => {
      const store = withSchemaValidation(mockEventStore as unknown as EventStore);
      expect(store).toBeInstanceOf(SchemaValidatedEventStore);
    });

    it('should use custom options', () => {
      const customRegistry = new EventSchemaRegistry();
      const store = withSchemaValidation(mockEventStore as unknown as EventStore, {
        registry: customRegistry,
        strictValidation: false,
        upcastOnRead: false,
      });

      expect(store.getRegistry()).toBe(customRegistry);
    });
  });
});

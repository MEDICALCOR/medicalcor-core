/**
 * Event Schema Registry Tests
 *
 * Tests for versioned schema management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  EventSchemaRegistry,
  createEventSchemaRegistry,
  registerCommonEventSchemas,
  eventSchemaRegistry,
} from '../event-schema-registry.js';

describe('EventSchemaRegistry', () => {
  let registry: EventSchemaRegistry;

  beforeEach(() => {
    registry = new EventSchemaRegistry();
  });

  describe('register', () => {
    it('should register a schema version', () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
        description: 'Test event v1',
      });

      expect(registry.hasEventType('TestEvent')).toBe(true);
      expect(registry.getLatestVersion('TestEvent')).toBe(1);
    });

    it('should register multiple versions', () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      registry.register('TestEvent', {
        version: 2,
        schema: z.object({ value: z.string(), extra: z.number() }),
        migrateTo: (v1) => ({ ...(v1 as object), extra: 0 }),
      });

      expect(registry.getVersions('TestEvent')).toEqual([1, 2]);
      expect(registry.getLatestVersion('TestEvent')).toBe(2);
    });

    it('should throw when registering duplicate version', () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      expect(() =>
        registry.register('TestEvent', {
          version: 1,
          schema: z.object({ value: z.string() }),
        })
      ).toThrow('Schema version 1 already registered');
    });

    it('should throw when registering out-of-order version', () => {
      registry.register('TestEvent', {
        version: 2,
        schema: z.object({ value: z.string() }),
      });

      expect(() =>
        registry.register('TestEvent', {
          version: 1,
          schema: z.object({ value: z.string() }),
        })
      ).toThrow('Cannot register version 1 after version 2');
    });

    it('should warn but allow skipped versions', () => {
      registry.register('TestEvent', {
        version: 1,
        schema: z.object({ value: z.string() }),
      });

      // Skip version 2 and register version 3
      registry.register('TestEvent', {
        version: 3,
        schema: z.object({ value: z.string() }),
      });

      expect(registry.getVersions('TestEvent')).toEqual([1, 3]);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      registry.register('ValidateTest', {
        version: 1,
        schema: z.object({
          id: z.string().uuid(),
          value: z.number().min(0).max(100),
        }),
      });
    });

    it('should validate correct payload', () => {
      const result = registry.validate('ValidateTest', 1, {
        id: '550e8400-e29b-41d4-a716-446655440000',
        value: 50,
      });

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should fail on invalid payload', () => {
      const result = registry.validate('ValidateTest', 1, {
        id: 'not-a-uuid',
        value: 50,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('id');
    });

    it('should fail on missing required field', () => {
      const result = registry.validate('ValidateTest', 1, {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('value');
    });

    it('should pass through unknown event types', () => {
      const result = registry.validate('UnknownEvent', 1, {
        anything: 'goes',
      });

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ anything: 'goes' });
    });

    it('should fail on unknown version', () => {
      const result = registry.validate('ValidateTest', 99, {
        id: '550e8400-e29b-41d4-a716-446655440000',
        value: 50,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown version 99');
    });
  });

  describe('validateLatest', () => {
    it('should validate against latest version', () => {
      registry.register('LatestTest', {
        version: 1,
        schema: z.object({ v1Field: z.string() }),
        migrateTo: (v1) => ({ ...(v1 as object), v2Field: 'default' }),
      });

      registry.register('LatestTest', {
        version: 2,
        schema: z.object({ v1Field: z.string(), v2Field: z.string() }),
      });

      const result = registry.validateLatest('LatestTest', {
        v1Field: 'test',
        v2Field: 'value',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('migrate', () => {
    beforeEach(() => {
      registry.register('MigrateTest', {
        version: 1,
        schema: z.object({ field1: z.string() }),
        migrateTo: (v1) => ({ ...(v1 as object), field2: 'added-in-v2' }),
      });

      registry.register('MigrateTest', {
        version: 2,
        schema: z.object({ field1: z.string(), field2: z.string() }),
        migrateTo: (v2) => ({ ...(v2 as object), field3: 'added-in-v3' }),
      });

      registry.register('MigrateTest', {
        version: 3,
        schema: z.object({
          field1: z.string(),
          field2: z.string(),
          field3: z.string(),
        }),
      });
    });

    it('should migrate from v1 to v2', () => {
      const result = registry.migrate('MigrateTest', 1, 2, { field1: 'test' });

      expect(result.success).toBe(true);
      expect(result.payload).toEqual({
        field1: 'test',
        field2: 'added-in-v2',
      });
      expect(result.migrationPath).toEqual([1, 2]);
    });

    it('should migrate from v1 to v3', () => {
      const result = registry.migrate('MigrateTest', 1, 3, { field1: 'test' });

      expect(result.success).toBe(true);
      expect(result.payload).toEqual({
        field1: 'test',
        field2: 'added-in-v2',
        field3: 'added-in-v3',
      });
      expect(result.migrationPath).toEqual([1, 2, 3]);
    });

    it('should return same payload for same version', () => {
      const payload = { field1: 'test' };
      const result = registry.migrate('MigrateTest', 1, 1, payload);

      expect(result.success).toBe(true);
      expect(result.payload).toBe(payload);
      expect(result.migrationPath).toEqual([]);
    });

    it('should fail on backwards migration', () => {
      const result = registry.migrate('MigrateTest', 3, 1, {
        field1: 'test',
        field2: 'v2',
        field3: 'v3',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot migrate backwards');
    });

    it('should pass through unknown event types', () => {
      const result = registry.migrate('UnknownEvent', 1, 2, { any: 'data' });

      expect(result.success).toBe(true);
      expect(result.payload).toEqual({ any: 'data' });
    });

    it('should handle migration errors', () => {
      registry.register('ErrorTest', {
        version: 1,
        schema: z.object({ value: z.string() }),
        migrateTo: () => {
          throw new Error('Migration failed');
        },
      });

      registry.register('ErrorTest', {
        version: 2,
        schema: z.object({ value: z.string() }),
      });

      const result = registry.migrate('ErrorTest', 1, 2, { value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');
    });

    it('should fail when migration function is missing', () => {
      registry.register('NoMigration', {
        version: 1,
        schema: z.object({ value: z.string() }),
        // No migrateTo function
      });

      registry.register('NoMigration', {
        version: 2,
        schema: z.object({ value: z.string(), extra: z.string() }),
      });

      const result = registry.migrate('NoMigration', 1, 2, { value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No migration function');
    });
  });

  describe('migrateToLatest', () => {
    it('should migrate to latest version', () => {
      registry.register('LatestMigration', {
        version: 1,
        schema: z.object({ v: z.number() }),
        migrateTo: (v1) => ({ ...(v1 as object), extra: true }),
      });

      registry.register('LatestMigration', {
        version: 2,
        schema: z.object({ v: z.number(), extra: z.boolean() }),
      });

      const result = registry.migrateToLatest('LatestMigration', 1, { v: 1 });

      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(2);
    });
  });

  describe('getLatestVersion', () => {
    it('should return 1 for unknown events', () => {
      expect(registry.getLatestVersion('Unknown')).toBe(1);
    });

    it('should return highest registered version', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      registry.register('Test', { version: 2, schema: z.object({}) });

      expect(registry.getLatestVersion('Test')).toBe(2);
    });
  });

  describe('getVersions', () => {
    it('should return empty array for unknown events', () => {
      expect(registry.getVersions('Unknown')).toEqual([]);
    });

    it('should return all registered versions', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      registry.register('Test', { version: 2, schema: z.object({}) });
      registry.register('Test', { version: 3, schema: z.object({}) });

      expect(registry.getVersions('Test')).toEqual([1, 2, 3]);
    });
  });

  describe('getSchema', () => {
    it('should return null for unknown events', () => {
      expect(registry.getSchema('Unknown', 1)).toBeNull();
    });

    it('should return null for unknown version', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      expect(registry.getSchema('Test', 2)).toBeNull();
    });

    it('should return schema for valid event and version', () => {
      const schema = z.object({ value: z.string() });
      registry.register('Test', { version: 1, schema });

      expect(registry.getSchema('Test', 1)).toBeDefined();
    });
  });

  describe('deprecate', () => {
    it('should mark version as deprecated', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      registry.deprecate('Test', 1, 'Use v2 instead');

      expect(registry.isDeprecated('Test', 1)).toBe(true);
    });

    it('should not throw for unknown events', () => {
      expect(() => registry.deprecate('Unknown', 1, 'reason')).not.toThrow();
    });
  });

  describe('isDeprecated', () => {
    it('should return false for unknown events', () => {
      expect(registry.isDeprecated('Unknown', 1)).toBe(false);
    });

    it('should return false for non-deprecated versions', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      expect(registry.isDeprecated('Test', 1)).toBe(false);
    });
  });

  describe('getEventTypes', () => {
    it('should return all registered event types', () => {
      registry.register('EventA', { version: 1, schema: z.object({}) });
      registry.register('EventB', { version: 1, schema: z.object({}) });
      registry.register('EventC', { version: 1, schema: z.object({}) });

      const types = registry.getEventTypes();
      expect(types).toContain('EventA');
      expect(types).toContain('EventB');
      expect(types).toContain('EventC');
    });
  });

  describe('hasEventType', () => {
    it('should return true for registered events', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      expect(registry.hasEventType('Test')).toBe(true);
    });

    it('should return false for unknown events', () => {
      expect(registry.hasEventType('Unknown')).toBe(false);
    });
  });

  describe('getSchemaInfo', () => {
    it('should return null for unknown events', () => {
      expect(registry.getSchemaInfo('Unknown')).toBeNull();
    });

    it('should return schema info for registered events', () => {
      registry.register('Test', {
        version: 1,
        schema: z.object({}),
        description: 'Test description',
      });

      const info = registry.getSchemaInfo('Test');
      expect(info).toHaveLength(1);
      expect(info?.[0]?.version).toBe(1);
      expect(info?.[0]?.description).toBe('Test description');
    });
  });

  describe('clear', () => {
    it('should remove all schemas', () => {
      registry.register('Test', { version: 1, schema: z.object({}) });
      registry.clear();

      expect(registry.hasEventType('Test')).toBe(false);
      expect(registry.getEventTypes()).toEqual([]);
    });
  });

  describe('createEventSchemaRegistry', () => {
    it('should create a new registry', () => {
      const newRegistry = createEventSchemaRegistry();
      expect(newRegistry).toBeInstanceOf(EventSchemaRegistry);
    });
  });

  describe('registerCommonEventSchemas', () => {
    it('should register common event schemas', () => {
      registerCommonEventSchemas(registry);

      expect(registry.hasEventType('LeadCreated')).toBe(true);
      expect(registry.hasEventType('LeadScored')).toBe(true);
      expect(registry.hasEventType('LeadQualified')).toBe(true);
      expect(registry.hasEventType('LeadAssigned')).toBe(true);
      expect(registry.hasEventType('LeadConverted')).toBe(true);
      expect(registry.hasEventType('LeadLost')).toBe(true);
      expect(registry.hasEventType('AppointmentScheduled')).toBe(true);
      expect(registry.hasEventType('AppointmentCancelled')).toBe(true);
      expect(registry.hasEventType('MessageSent')).toBe(true);
      expect(registry.hasEventType('ConsentRecorded')).toBe(true);
    });

    it('should register LeadScored with migrations', () => {
      registerCommonEventSchemas(registry);

      expect(registry.getVersions('LeadScored')).toEqual([1, 2]);

      const result = registry.migrate('LeadScored', 1, 2, {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        score: 4,
        classification: 'HOT',
      });

      expect(result.success).toBe(true);
      expect((result.payload as { confidence: number }).confidence).toBe(0.5);
    });

    it('should register LeadConverted with migrations', () => {
      registerCommonEventSchemas(registry);

      expect(registry.getVersions('LeadConverted')).toEqual([1, 2]);

      const result = registry.migrate('LeadConverted', 1, 2, {
        hubspotContactId: 'contact-123',
      });

      expect(result.success).toBe(true);
      expect((result.payload as { convertedAt: string }).convertedAt).toBeDefined();
    });

    it('should use global registry by default', () => {
      // Clear global registry first
      eventSchemaRegistry.clear();

      registerCommonEventSchemas();

      expect(eventSchemaRegistry.hasEventType('LeadCreated')).toBe(true);

      // Clean up
      eventSchemaRegistry.clear();
    });
  });
});

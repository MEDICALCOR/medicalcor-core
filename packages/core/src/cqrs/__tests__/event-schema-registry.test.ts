/**
 * Event Schema Registry Unit Tests
 *
 * Comprehensive tests for event schema registry including:
 * - Schema registration and versioning
 * - Payload validation
 * - Event migration (upcasting)
 * - Deprecation tracking
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  EventSchemaRegistry,
  createEventSchemaRegistry,
  registerCommonEventSchemas,
  eventSchemaRegistry,
  type EventMigrationFn,
} from '../event-schema-registry.js';

describe('EventSchemaRegistry', () => {
  let registry: EventSchemaRegistry;

  beforeEach(() => {
    registry = new EventSchemaRegistry();
  });

  afterEach(() => {
    // Clean up global registry
    eventSchemaRegistry.clear();
  });

  describe('Schema Registration', () => {
    it('should register a schema successfully', () => {
      const schema = z.object({
        userId: z.string().uuid(),
        action: z.string(),
      });

      registry.register('UserAction', {
        version: 1,
        schema,
        description: 'User performed an action',
      });

      expect(registry.hasEventType('UserAction')).toBe(true);
      expect(registry.getLatestVersion('UserAction')).toBe(1);
    });

    it('should register multiple versions of same event', () => {
      const schemaV1 = z.object({
        userId: z.string().uuid(),
        action: z.string(),
      });

      const schemaV2 = z.object({
        userId: z.string().uuid(),
        action: z.string(),
        timestamp: z.string().datetime(),
      });

      registry.register('UserAction', {
        version: 1,
        schema: schemaV1,
      });

      registry.register('UserAction', {
        version: 2,
        schema: schemaV2,
      });

      expect(registry.getVersions('UserAction')).toEqual([1, 2]);
      expect(registry.getLatestVersion('UserAction')).toBe(2);
    });

    it('should prevent duplicate version registration', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 1, schema });

      expect(() => {
        registry.register('TestEvent', { version: 1, schema });
      }).toThrow(/already registered/);
    });

    it('should warn when skipping version numbers', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 1, schema });
      registry.register('TestEvent', { version: 3, schema }); // Skip version 2

      expect(registry.getVersions('TestEvent')).toEqual([1, 3]);
    });

    it('should prevent registering lower version after higher', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 2, schema });

      expect(() => {
        registry.register('TestEvent', { version: 1, schema });
      }).toThrow(/Cannot register version 1 after version 2/);
    });

    it('should sort versions correctly', () => {
      const schema = z.object({ data: z.string() });

      // Register in order to avoid backwards registration error
      registry.register('TestEvent', { version: 1, schema });
      registry.register('TestEvent', { version: 2, schema });
      registry.register('TestEvent', { version: 3, schema });

      expect(registry.getVersions('TestEvent')).toEqual([1, 2, 3]);
    });

    it('should store registration metadata', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', {
        version: 1,
        schema,
        description: 'Test event v1',
      });

      const info = registry.getSchemaInfo('TestEvent');
      expect(info?.[0]?.description).toBe('Test event v1');
      expect(info?.[0]?.registeredAt).toBeInstanceOf(Date);
      expect(info?.[0]?.deprecated).toBe(false);
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      registry.register('UserCreated', {
        version: 1,
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email(),
          name: z.string().min(1),
        }),
      });
    });

    it('should validate correct payload', () => {
      const payload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'John Doe',
      };

      const result = registry.validate('UserCreated', 1, payload);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(payload);
    });

    it('should reject invalid payload', () => {
      const payload = {
        userId: 'not-a-uuid',
        email: 'invalid-email',
        name: '',
      };

      const result = registry.validate('UserCreated', 1, payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error details for invalid fields', () => {
      const payload = {
        userId: 'not-a-uuid',
        email: 'test@example.com',
        name: 'John',
      };

      const result = registry.validate('UserCreated', 1, payload);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('userId');
    });

    it('should validate against latest version', () => {
      registry.register('UserCreated', {
        version: 2,
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email(),
          name: z.string().min(1),
          createdAt: z.string().datetime(),
        }),
      });

      const payload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'John Doe',
        createdAt: new Date().toISOString(),
      };

      const result = registry.validateLatest('UserCreated', payload);

      expect(result.valid).toBe(true);
    });

    it('should pass through unknown event types', () => {
      const payload = { anything: 'goes' };

      const result = registry.validate('UnknownEvent', 1, payload);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(payload);
    });

    it('should reject unknown version for known event', () => {
      const payload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'John',
      };

      const result = registry.validate('UserCreated', 99, payload);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown version');
    });
  });

  describe('Migration', () => {
    beforeEach(() => {
      // Version 1: Basic user data
      registry.register('UserCreated', {
        version: 1,
        schema: z.object({
          userId: z.string(),
          email: z.string(),
        }),
        migrateTo: (v1: { userId: string; email: string }) => ({
          ...v1,
          name: 'Unknown',
        }),
      });

      // Version 2: Add name field
      registry.register('UserCreated', {
        version: 2,
        schema: z.object({
          userId: z.string(),
          email: z.string(),
          name: z.string(),
        }),
        migrateTo: (v2: { userId: string; email: string; name: string }) => ({
          ...v2,
          createdAt: new Date().toISOString(),
        }),
      });

      // Version 3: Add timestamp
      registry.register('UserCreated', {
        version: 3,
        schema: z.object({
          userId: z.string(),
          email: z.string(),
          name: z.string(),
          createdAt: z.string(),
        }),
      });
    });

    it('should migrate from v1 to v2', () => {
      const v1Payload = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      const result = registry.migrate('UserCreated', 1, 2, v1Payload);

      expect(result.success).toBe(true);
      expect(result.payload).toHaveProperty('name', 'Unknown');
      expect(result.migrationPath).toEqual([1, 2]);
    });

    it('should migrate from v1 to v3', () => {
      const v1Payload = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      const result = registry.migrate('UserCreated', 1, 3, v1Payload);

      expect(result.success).toBe(true);
      expect(result.payload).toHaveProperty('name');
      expect(result.payload).toHaveProperty('createdAt');
      expect(result.migrationPath).toEqual([1, 2, 3]);
    });

    it('should migrate to latest version', () => {
      const v1Payload = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      const result = registry.migrateToLatest('UserCreated', 1, v1Payload);

      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(3);
    });

    it('should not migrate when versions are the same', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'John',
      };

      const result = registry.migrate('UserCreated', 2, 2, payload);

      expect(result.success).toBe(true);
      expect(result.payload).toEqual(payload);
      expect(result.migrationPath).toEqual([]);
    });

    it('should fail to migrate backwards', () => {
      const v3Payload = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'John',
        createdAt: new Date().toISOString(),
      };

      const result = registry.migrate('UserCreated', 3, 1, v3Payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot migrate backwards');
    });

    it('should handle missing migration function', () => {
      registry.register('NoMigration', {
        version: 1,
        schema: z.object({ data: z.string() }),
        // No migrateTo function
      });

      registry.register('NoMigration', {
        version: 2,
        schema: z.object({ data: z.string(), extra: z.string() }),
      });

      const result = registry.migrate('NoMigration', 1, 2, { data: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No migration function');
    });

    it('should handle migration errors', () => {
      registry.register('ErrorMigration', {
        version: 1,
        schema: z.object({ value: z.number() }),
        migrateTo: () => {
          throw new Error('Migration failed');
        },
      });

      registry.register('ErrorMigration', {
        version: 2,
        schema: z.object({ value: z.number(), doubled: z.number() }),
      });

      const result = registry.migrate('ErrorMigration', 1, 2, { value: 5 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed');
    });

    it('should pass through unknown event types', () => {
      const payload = { anything: 'goes' };

      const result = registry.migrate('UnknownEvent', 1, 2, payload);

      expect(result.success).toBe(true);
      expect(result.payload).toEqual(payload);
      expect(result.migrationPath).toEqual([]);
    });
  });

  describe('Version Management', () => {
    it('should return latest version', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 1, schema });
      registry.register('TestEvent', { version: 2, schema });
      registry.register('TestEvent', { version: 3, schema });

      expect(registry.getLatestVersion('TestEvent')).toBe(3);
    });

    it('should return 1 for unknown event types', () => {
      expect(registry.getLatestVersion('UnknownEvent')).toBe(1);
    });

    it('should return all versions', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 1, schema });
      registry.register('TestEvent', { version: 3, schema });

      expect(registry.getVersions('TestEvent')).toEqual([1, 3]);
    });

    it('should return empty array for unknown event', () => {
      expect(registry.getVersions('UnknownEvent')).toEqual([]);
    });

    it('should get schema for specific version', () => {
      const schemaV1 = z.object({ data: z.string() });
      const schemaV2 = z.object({ data: z.string(), extra: z.number() });

      registry.register('TestEvent', { version: 1, schema: schemaV1 });
      registry.register('TestEvent', { version: 2, schema: schemaV2 });

      const retrievedSchema = registry.getSchema('TestEvent', 1);
      expect(retrievedSchema).toBeDefined();
    });

    it('should return null for unknown schema version', () => {
      const schema = registry.getSchema('UnknownEvent', 1);
      expect(schema).toBeNull();
    });
  });

  describe('Deprecation', () => {
    beforeEach(() => {
      const schema = z.object({ data: z.string() });
      registry.register('TestEvent', { version: 1, schema });
      registry.register('TestEvent', { version: 2, schema });
    });

    it('should deprecate a schema version', () => {
      registry.deprecate('TestEvent', 1, 'Use version 2 instead');

      expect(registry.isDeprecated('TestEvent', 1)).toBe(true);
      expect(registry.isDeprecated('TestEvent', 2)).toBe(false);
    });

    it('should store deprecation reason', () => {
      const reason = 'Security vulnerability fixed in v2';
      registry.deprecate('TestEvent', 1, reason);

      const info = registry.getSchemaInfo('TestEvent');
      const v1 = info?.find((v) => v.version === 1);

      expect(v1?.deprecated).toBe(true);
      expect(v1?.deprecationReason).toBe(reason);
    });

    it('should return false for non-deprecated versions', () => {
      expect(registry.isDeprecated('TestEvent', 2)).toBe(false);
    });

    it('should return false for unknown events', () => {
      expect(registry.isDeprecated('UnknownEvent', 1)).toBe(false);
    });

    it('should handle deprecating unknown version gracefully', () => {
      registry.deprecate('TestEvent', 99, 'Does not exist');

      const info = registry.getSchemaInfo('TestEvent');
      const v99 = info?.find((v) => v.version === 99);

      expect(v99).toBeUndefined();
    });
  });

  describe('Event Type Management', () => {
    it('should return all registered event types', () => {
      const schema = z.object({ data: z.string() });

      registry.register('Event1', { version: 1, schema });
      registry.register('Event2', { version: 1, schema });
      registry.register('Event3', { version: 1, schema });

      const types = registry.getEventTypes();

      expect(types).toContain('Event1');
      expect(types).toContain('Event2');
      expect(types).toContain('Event3');
      expect(types.length).toBe(3);
    });

    it('should check if event type exists', () => {
      const schema = z.object({ data: z.string() });

      registry.register('ExistingEvent', { version: 1, schema });

      expect(registry.hasEventType('ExistingEvent')).toBe(true);
      expect(registry.hasEventType('NonExistingEvent')).toBe(false);
    });

    it('should return empty array when no events registered', () => {
      expect(registry.getEventTypes()).toEqual([]);
    });
  });

  describe('Schema Info', () => {
    it('should return schema information', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', {
        version: 1,
        schema,
        description: 'First version',
      });

      const info = registry.getSchemaInfo('TestEvent');

      expect(info).toBeDefined();
      expect(info?.length).toBe(1);
      expect(info?.[0]?.version).toBe(1);
      expect(info?.[0]?.description).toBe('First version');
    });

    it('should return null for unknown event', () => {
      const info = registry.getSchemaInfo('UnknownEvent');
      expect(info).toBeNull();
    });

    it('should return all versions in info', () => {
      const schema = z.object({ data: z.string() });

      registry.register('TestEvent', { version: 1, schema, description: 'V1' });
      registry.register('TestEvent', { version: 2, schema, description: 'V2' });

      const info = registry.getSchemaInfo('TestEvent');

      expect(info?.length).toBe(2);
    });
  });

  describe('Clear', () => {
    it('should clear all registered schemas', () => {
      const schema = z.object({ data: z.string() });

      registry.register('Event1', { version: 1, schema });
      registry.register('Event2', { version: 1, schema });

      registry.clear();

      expect(registry.getEventTypes()).toEqual([]);
      expect(registry.hasEventType('Event1')).toBe(false);
      expect(registry.hasEventType('Event2')).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('should create registry with factory function', () => {
      const newRegistry = createEventSchemaRegistry();

      expect(newRegistry).toBeDefined();
      expect(newRegistry).toBeInstanceOf(EventSchemaRegistry);
    });
  });

  describe('Common Event Schemas', () => {
    it('should register common event schemas', () => {
      registerCommonEventSchemas(registry);

      expect(registry.hasEventType('LeadCreated')).toBe(true);
      expect(registry.hasEventType('LeadScored')).toBe(true);
      expect(registry.hasEventType('LeadQualified')).toBe(true);
      expect(registry.hasEventType('LeadAssigned')).toBe(true);
      expect(registry.hasEventType('LeadConverted')).toBe(true);
    });

    it('should register LeadScored with multiple versions', () => {
      registerCommonEventSchemas(registry);

      const versions = registry.getVersions('LeadScored');
      expect(versions).toContain(1);
      expect(versions).toContain(2);
    });

    it('should register LeadConverted with migration', () => {
      registerCommonEventSchemas(registry);

      const v1Payload = { hubspotContactId: 'contact-123' };
      const result = registry.migrate('LeadConverted', 1, 2, v1Payload);

      expect(result.success).toBe(true);
      expect(result.payload).toHaveProperty('convertedAt');
      expect(result.payload).toHaveProperty('conversionSource');
    });

    it('should validate LeadCreated event', () => {
      registerCommonEventSchemas(registry);

      const payload = {
        phone: '+40712345678',
        channel: 'whatsapp' as const,
      };

      const result = registry.validateLatest('LeadCreated', payload);

      expect(result.valid).toBe(true);
    });

    it('should validate LeadScored v2 event', () => {
      registerCommonEventSchemas(registry);

      const payload = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 4,
        classification: 'WARM' as const,
        confidence: 0.85,
      };

      const result = registry.validate('LeadScored', 2, payload);

      expect(result.valid).toBe(true);
    });

    it('should migrate LeadScored from v1 to v2', () => {
      registerCommonEventSchemas(registry);

      const v1Payload = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        score: 4,
        classification: 'WARM',
      };

      const result = registry.migrate('LeadScored', 1, 2, v1Payload);

      expect(result.success).toBe(true);
      expect(result.payload).toHaveProperty('confidence', 0.5);
      expect(result.payload).toHaveProperty('scoredAt');
    });

    it('should register appointment events', () => {
      registerCommonEventSchemas(registry);

      expect(registry.hasEventType('AppointmentScheduled')).toBe(true);
      expect(registry.hasEventType('AppointmentCancelled')).toBe(true);
    });

    it('should register messaging events', () => {
      registerCommonEventSchemas(registry);

      expect(registry.hasEventType('MessageSent')).toBe(true);
    });

    it('should register consent events', () => {
      registerCommonEventSchemas(registry);

      expect(registry.hasEventType('ConsentRecorded')).toBe(true);
    });
  });

  describe('Global Registry Instance', () => {
    it('should provide global registry instance', () => {
      expect(eventSchemaRegistry).toBeDefined();
      expect(eventSchemaRegistry).toBeInstanceOf(EventSchemaRegistry);
    });

    it('should share state across imports', () => {
      const schema = z.object({ test: z.string() });

      eventSchemaRegistry.register('GlobalTest', { version: 1, schema });

      expect(eventSchemaRegistry.hasEventType('GlobalTest')).toBe(true);
    });
  });

  describe('Complex Migration Scenarios', () => {
    it('should handle multi-step migration chain', () => {
      type V1 = { count: number };
      type V2 = { count: number; doubled: number };
      type V3 = { count: number; doubled: number; tripled: number };

      registry.register('ComplexEvent', {
        version: 1,
        schema: z.object({ count: z.number() }),
        migrateTo: ((v1: V1) => ({ ...v1, doubled: v1.count * 2 })) as EventMigrationFn,
      });

      registry.register('ComplexEvent', {
        version: 2,
        schema: z.object({ count: z.number(), doubled: z.number() }),
        migrateTo: ((v2: V2) => ({ ...v2, tripled: v2.count * 3 })) as EventMigrationFn,
      });

      registry.register('ComplexEvent', {
        version: 3,
        schema: z.object({ count: z.number(), doubled: z.number(), tripled: z.number() }),
      });

      const result = registry.migrate('ComplexEvent', 1, 3, { count: 5 });

      expect(result.success).toBe(true);
      expect(result.payload).toEqual({ count: 5, doubled: 10, tripled: 15 });
    });

    it('should validate after migration', () => {
      type V1 = { value: string };
      type V2 = { value: string; timestamp: string };

      registry.register('ValidatedMigration', {
        version: 1,
        schema: z.object({ value: z.string() }),
        migrateTo: ((v1: V1) => ({
          ...v1,
          timestamp: new Date().toISOString(),
        })) as EventMigrationFn,
      });

      registry.register('ValidatedMigration', {
        version: 2,
        schema: z.object({ value: z.string(), timestamp: z.string().datetime() }),
      });

      const migrationResult = registry.migrate('ValidatedMigration', 1, 2, { value: 'test' });

      expect(migrationResult.success).toBe(true);

      const validationResult = registry.validate('ValidatedMigration', 2, migrationResult.payload);

      expect(validationResult.valid).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDomainEvent,
  type DomainEvent,
} from '../ports/secondary/messaging/EventPublisher.js';

/**
 * Tests for EventPublisher Factory Functions
 *
 * Covers:
 * - createDomainEvent factory function
 * - Event structure validation
 * - Timestamp generation
 * - Default values
 * - Edge cases
 */

describe('createDomainEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Event Creation', () => {
    it('should create event with all required fields', () => {
      const mockDate = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(mockDate);

      const event = createDomainEvent(
        'case.created',
        'case-123',
        'Case',
        1,
        { caseNumber: 'CASE-2025-00001' },
        'corr-456',
        'user-789'
      );

      expect(event.eventType).toBe('case.created');
      expect(event.aggregateId).toBe('case-123');
      expect(event.aggregateType).toBe('Case');
      expect(event.aggregateVersion).toBe(1);
      expect(event.eventData).toEqual({ caseNumber: 'CASE-2025-00001' });
      expect(event.correlationId).toBe('corr-456');
      expect(event.actorId).toBe('user-789');
      expect(event.causationId).toBeNull();
      expect(event.occurredAt).toEqual(mockDate);
    });

    it('should set causationId to null when not provided', () => {
      const event = createDomainEvent(
        'test.event',
        'id-1',
        'TestAggregate',
        1,
        {},
        'corr-1',
        'actor-1'
      );

      expect(event.causationId).toBeNull();
    });

    it('should set causationId to null when explicitly passed as null', () => {
      const event = createDomainEvent(
        'test.event',
        'id-1',
        'TestAggregate',
        1,
        {},
        'corr-1',
        'actor-1',
        null
      );

      expect(event.causationId).toBeNull();
    });

    it('should set causationId when provided', () => {
      const event = createDomainEvent(
        'test.event',
        'id-1',
        'TestAggregate',
        1,
        {},
        'corr-1',
        'actor-1',
        'cause-123'
      );

      expect(event.causationId).toBe('cause-123');
    });

    it('should generate timestamp at creation time', () => {
      const before = new Date();
      vi.useRealTimers();
      const event = createDomainEvent('test', 'id', 'Type', 1, {}, 'corr', 'actor');
      const after = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Event Type Variations', () => {
    it('should handle different event types', () => {
      const eventTypes = [
        'case.created',
        'case.updated',
        'case.deleted',
        'case.scored',
        'case.verified',
      ];

      eventTypes.forEach((eventType) => {
        const event = createDomainEvent(eventType, 'id', 'Case', 1, {}, 'corr', 'actor');
        expect(event.eventType).toBe(eventType);
      });
    });

    it('should handle custom event type format', () => {
      const event = createDomainEvent(
        'custom.domain.event.v1',
        'id',
        'Custom',
        1,
        {},
        'corr',
        'actor'
      );

      expect(event.eventType).toBe('custom.domain.event.v1');
    });
  });

  describe('Aggregate Information', () => {
    it('should handle different aggregate types', () => {
      const aggregateTypes = ['Case', 'Patient', 'User', 'Appointment'];

      aggregateTypes.forEach((aggregateType) => {
        const event = createDomainEvent('test', 'id', aggregateType, 1, {}, 'corr', 'actor');
        expect(event.aggregateType).toBe(aggregateType);
      });
    });

    it('should handle various aggregate versions', () => {
      const versions = [1, 5, 10, 100, 1000];

      versions.forEach((version) => {
        const event = createDomainEvent('test', 'id', 'Type', version, {}, 'corr', 'actor');
        expect(event.aggregateVersion).toBe(version);
      });
    });

    it('should handle UUID aggregate IDs', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      ];

      uuids.forEach((uuid) => {
        const event = createDomainEvent('test', uuid, 'Type', 1, {}, 'corr', 'actor');
        expect(event.aggregateId).toBe(uuid);
      });
    });

    it('should handle non-UUID aggregate IDs', () => {
      const ids = ['case-123', 'patient-abc', 'usr_12345', '1234567890'];

      ids.forEach((id) => {
        const event = createDomainEvent('test', id, 'Type', 1, {}, 'corr', 'actor');
        expect(event.aggregateId).toBe(id);
      });
    });
  });

  describe('Event Data Handling', () => {
    it('should handle empty event data', () => {
      const event = createDomainEvent('test', 'id', 'Type', 1, {}, 'corr', 'actor');

      expect(event.eventData).toEqual({});
    });

    it('should handle simple event data', () => {
      const data = { message: 'Test message', count: 42, active: true };
      const event = createDomainEvent('test', 'id', 'Type', 1, data, 'corr', 'actor');

      expect(event.eventData).toEqual(data);
    });

    it('should handle complex nested event data', () => {
      const data = {
        caseId: 'case-123',
        patient: {
          id: 'patient-456',
          name: 'John Doe',
          metadata: {
            age: 45,
            tags: ['urgent', 'high-risk'],
          },
        },
        scores: [
          { type: 'clinical', value: 85 },
          { type: 'financial', value: 60 },
        ],
      };

      const event = createDomainEvent('test', 'id', 'Type', 1, data, 'corr', 'actor');

      expect(event.eventData).toEqual(data);
    });

    it('should handle array as event data', () => {
      const data = [1, 2, 3, 4, 5];
      const event = createDomainEvent('test', 'id', 'Type', 1, data, 'corr', 'actor');

      expect(event.eventData).toEqual(data);
    });

    it('should handle string as event data', () => {
      const data = 'Simple string data';
      const event = createDomainEvent('test', 'id', 'Type', 1, data, 'corr', 'actor');

      expect(event.eventData).toBe(data);
    });

    it('should handle number as event data', () => {
      const data = 42;
      const event = createDomainEvent('test', 'id', 'Type', 1, data, 'corr', 'actor');

      expect(event.eventData).toBe(data);
    });

    it('should handle null as event data', () => {
      const event = createDomainEvent('test', 'id', 'Type', 1, null, 'corr', 'actor');

      expect(event.eventData).toBeNull();
    });

    it('should handle undefined as event data', () => {
      const event = createDomainEvent('test', 'id', 'Type', 1, undefined, 'corr', 'actor');

      expect(event.eventData).toBeUndefined();
    });
  });

  describe('Actor and Correlation Tracking', () => {
    it('should track different actor types', () => {
      const actors = [
        'user-123',
        'service-worker-456',
        'SYSTEM',
        'cron-job-daily',
        'api-key-abc123',
      ];

      actors.forEach((actorId) => {
        const event = createDomainEvent('test', 'id', 'Type', 1, {}, 'corr', actorId);
        expect(event.actorId).toBe(actorId);
      });
    });

    it('should track different correlation IDs', () => {
      const correlationIds = [
        'corr-123',
        '550e8400-e29b-41d4-a716-446655440000',
        'req_abc123',
        'trace-xyz',
      ];

      correlationIds.forEach((correlationId) => {
        const event = createDomainEvent('test', 'id', 'Type', 1, {}, correlationId, 'actor');
        expect(event.correlationId).toBe(correlationId);
      });
    });

    it('should handle causation chains', () => {
      const event1 = createDomainEvent('test.1', 'id-1', 'Type', 1, {}, 'corr-1', 'actor-1');
      const event2 = createDomainEvent(
        'test.2',
        'id-2',
        'Type',
        2,
        {},
        'corr-1',
        'actor-1',
        'event-1-id'
      );
      const event3 = createDomainEvent(
        'test.3',
        'id-3',
        'Type',
        3,
        {},
        'corr-1',
        'actor-1',
        'event-2-id'
      );

      expect(event1.causationId).toBeNull();
      expect(event2.causationId).toBe('event-1-id');
      expect(event3.causationId).toBe('event-2-id');
    });
  });

  describe('Event Structure Validation', () => {
    it('should create event conforming to DomainEvent interface', () => {
      const event = createDomainEvent(
        'test.event',
        'id-123',
        'TestType',
        1,
        { data: 'test' },
        'corr-456',
        'actor-789',
        'cause-000'
      );

      // Verify all required fields exist
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('aggregateId');
      expect(event).toHaveProperty('aggregateType');
      expect(event).toHaveProperty('aggregateVersion');
      expect(event).toHaveProperty('eventData');
      expect(event).toHaveProperty('correlationId');
      expect(event).toHaveProperty('causationId');
      expect(event).toHaveProperty('actorId');
      expect(event).toHaveProperty('occurredAt');
    });

    it('should not include optional fields when not provided', () => {
      const event = createDomainEvent('test', 'id', 'Type', 1, {}, 'corr', 'actor');

      expect(event).not.toHaveProperty('schemaVersion');
      expect(event).not.toHaveProperty('metadata');
    });

    it('should create events that can be serialized to JSON', () => {
      const event = createDomainEvent(
        'test.event',
        'id-123',
        'TestType',
        5,
        { message: 'Test', count: 42 },
        'corr-456',
        'actor-789',
        'cause-000'
      );

      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);

      expect(parsed.eventType).toBe('test.event');
      expect(parsed.aggregateId).toBe('id-123');
      expect(parsed.aggregateType).toBe('TestType');
      expect(parsed.aggregateVersion).toBe(5);
      expect(parsed.eventData).toEqual({ message: 'Test', count: 42 });
      expect(parsed.correlationId).toBe('corr-456');
      expect(parsed.actorId).toBe('actor-789');
      expect(parsed.causationId).toBe('cause-000');
      expect(new Date(parsed.occurredAt)).toBeInstanceOf(Date);
    });
  });

  describe('Real-World Event Scenarios', () => {
    it('should create clinical case created event', () => {
      const mockDate = new Date('2025-01-15T10:30:00Z');
      vi.setSystemTime(mockDate);

      const event = createDomainEvent(
        'case.created',
        'case-550e8400',
        'Case',
        1,
        {
          caseId: 'case-550e8400',
          caseNumber: 'CASE-2025-00042',
          subjectId: 'patient-123',
          subjectType: 'patient',
          priority: 'NORMAL',
          createdBy: 'user-789',
          organizationId: 'org-abc',
        },
        'corr-req-12345',
        'user-789'
      );

      expect(event.eventType).toBe('case.created');
      expect(event.aggregateType).toBe('Case');
      expect(event.aggregateVersion).toBe(1);
      expect(event.eventData).toMatchObject({
        caseNumber: 'CASE-2025-00042',
        priority: 'NORMAL',
      });
    });

    it('should create clinical case scored event with causation', () => {
      const event = createDomainEvent(
        'case.scored',
        'case-123',
        'Case',
        2,
        {
          globalScore: 85,
          riskClass: 'YELLOW',
          scoredBy: 'user-456',
          breakdown: {
            boneQuality: 80,
            softTissue: 85,
            systemicRisk: 90,
          },
        },
        'corr-req-67890',
        'user-456',
        'event-case-created-123'
      );

      expect(event.eventType).toBe('case.scored');
      expect(event.aggregateVersion).toBe(2);
      expect(event.causationId).toBe('event-case-created-123');
      expect(event.eventData).toMatchObject({
        globalScore: 85,
        riskClass: 'YELLOW',
      });
    });

    it('should create system-generated event', () => {
      const event = createDomainEvent(
        'case.reminder.scheduled',
        'case-789',
        'Case',
        3,
        {
          reminderType: 'FOLLOW_UP',
          scheduledFor: '2025-02-01T09:00:00Z',
        },
        'corr-cron-job',
        'SYSTEM'
      );

      expect(event.actorId).toBe('SYSTEM');
      expect(event.eventData).toMatchObject({
        reminderType: 'FOLLOW_UP',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const event = createDomainEvent('', '', '', 1, {}, '', '');

      expect(event.eventType).toBe('');
      expect(event.aggregateId).toBe('');
      expect(event.aggregateType).toBe('');
      expect(event.correlationId).toBe('');
      expect(event.actorId).toBe('');
    });

    it('should handle version 0', () => {
      const event = createDomainEvent('test', 'id', 'Type', 0, {}, 'corr', 'actor');

      expect(event.aggregateVersion).toBe(0);
    });

    it('should handle very large version numbers', () => {
      const largeVersion = 999999999;
      const event = createDomainEvent('test', 'id', 'Type', largeVersion, {}, 'corr', 'actor');

      expect(event.aggregateVersion).toBe(largeVersion);
    });

    it('should handle special characters in strings', () => {
      const event = createDomainEvent(
        'test.event/with-special@chars#123',
        'id-with-special!@#$%',
        'Type-With-Dashes_And_Underscores',
        1,
        { key: 'value with spaces and symbols: !@#$%^&*()' },
        'corr-special-<>?/\\',
        'actor-email@domain.com'
      );

      expect(event.eventType).toBe('test.event/with-special@chars#123');
      expect(event.aggregateId).toBe('id-with-special!@#$%');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const event = createDomainEvent(
        longString,
        longString,
        longString,
        1,
        { longField: longString },
        longString,
        longString
      );

      expect(event.eventType).toHaveLength(10000);
      expect(event.aggregateId).toHaveLength(10000);
    });
  });

  describe('Timestamp Behavior', () => {
    it('should create events with unique timestamps when created in quick succession', () => {
      vi.useRealTimers();

      const event1 = createDomainEvent('test', 'id-1', 'Type', 1, {}, 'corr', 'actor');
      const event2 = createDomainEvent('test', 'id-2', 'Type', 1, {}, 'corr', 'actor');
      const event3 = createDomainEvent('test', 'id-3', 'Type', 1, {}, 'corr', 'actor');

      // Timestamps should be very close or equal
      const diff1 = Math.abs(event2.occurredAt.getTime() - event1.occurredAt.getTime());
      const diff2 = Math.abs(event3.occurredAt.getTime() - event2.occurredAt.getTime());

      expect(diff1).toBeLessThan(100); // Within 100ms
      expect(diff2).toBeLessThan(100);
    });

    it('should use current time for occurredAt', () => {
      const fixedDate = new Date('2025-06-15T14:30:45.123Z');
      vi.setSystemTime(fixedDate);

      const event = createDomainEvent('test', 'id', 'Type', 1, {}, 'corr', 'actor');

      expect(event.occurredAt).toEqual(fixedDate);
      expect(event.occurredAt.toISOString()).toBe('2025-06-15T14:30:45.123Z');
    });
  });
});

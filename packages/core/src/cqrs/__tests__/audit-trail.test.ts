/**
 * Audit Trail Service Tests
 *
 * Tests for:
 * - AuditTrailService functionality
 * - InMemoryAuditStore operations
 * - Compliance logging and querying
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditTrailService,
  InMemoryAuditStore,
  createAuditTrailService,
  createInMemoryAuditStore,
  type AuditActor,
  type AuditEntry,
  type AuditQueryOptions,
} from '../audit-trail.js';
import type { StoredEvent } from '../../event-store.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockStoredEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: crypto.randomUUID(),
    type: 'LeadCreated',
    payload: { phone: '+1234567890', channel: 'whatsapp' },
    aggregateId: crypto.randomUUID(),
    aggregateType: 'Lead',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      correlationId: crypto.randomUUID(),
    },
    ...overrides,
  };
}

function createMockActor(overrides: Partial<AuditActor> = {}): AuditActor {
  return {
    id: 'user-123',
    type: 'user',
    name: 'Test User',
    email: 'test@example.com',
    ipAddress: '192.168.1.1',
    clinicId: 'clinic-456',
    ...overrides,
  };
}

// ============================================================================
// IN-MEMORY AUDIT STORE TESTS
// ============================================================================

describe('InMemoryAuditStore', () => {
  let store: InMemoryAuditStore;

  beforeEach(() => {
    store = createInMemoryAuditStore();
  });

  describe('save', () => {
    it('should save an audit entry', async () => {
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'LeadCreated',
        eventId: crypto.randomUUID(),
        aggregateId: crypto.randomUUID(),
        aggregateType: 'Lead',
        actor: createMockActor(),
        action: 'create',
        correlationId: crypto.randomUUID(),
        severity: 'low',
      };

      await store.save(entry);

      expect(store.size()).toBe(1);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple audit entries', async () => {
      const entries: AuditEntry[] = [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Lead',
          actor: createMockActor(),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadScored',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Lead',
          actor: createMockActor(),
          action: 'score',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
      ];

      await store.saveBatch(entries);

      expect(store.size()).toBe(2);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const aggregateId = crypto.randomUUID();
      const actorId = 'user-123';
      const correlationId = crypto.randomUUID();

      const entries: AuditEntry[] = [
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId,
          aggregateType: 'Lead',
          actor: createMockActor({ id: actorId }),
          action: 'create',
          correlationId,
          severity: 'low',
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
          eventType: 'LeadScored',
          eventId: crypto.randomUUID(),
          aggregateId,
          aggregateType: 'Lead',
          actor: createMockActor({ id: actorId }),
          action: 'score',
          correlationId,
          severity: 'medium',
          complianceTags: ['HIPAA'],
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T12:00:00Z').toISOString(),
          eventType: 'PatientCreated',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Patient',
          actor: createMockActor({ id: 'user-456', type: 'system' }),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'high',
          complianceTags: ['HIPAA', 'GDPR'],
        },
      ];

      await store.saveBatch(entries);
    });

    it('should query all entries with default options', async () => {
      const result = await store.query({});

      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by aggregate type', async () => {
      const result = await store.query({ aggregateType: 'Lead' });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.aggregateType === 'Lead')).toBe(true);
    });

    it('should filter by actor ID', async () => {
      const result = await store.query({ actorId: 'user-123' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by actor type', async () => {
      const result = await store.query({ actorType: 'system' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by action', async () => {
      const result = await store.query({ action: 'create' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by severity', async () => {
      const result = await store.query({ severity: 'high' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by compliance tags', async () => {
      const result = await store.query({ complianceTags: ['GDPR'] });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by time range', async () => {
      const result = await store.query({
        startTime: new Date('2024-01-01T10:30:00Z'),
        endTime: new Date('2024-01-01T11:30:00Z'),
      });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0]?.eventType).toBe('LeadScored');
    });

    it('should apply pagination', async () => {
      const result = await store.query({ limit: 2, offset: 0 });

      expect(result.entries.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should sort by timestamp', async () => {
      const resultAsc = await store.query({ sortOrder: 'asc' });
      const resultDesc = await store.query({ sortOrder: 'desc' });

      expect(resultAsc.entries[0]?.eventType).toBe('LeadCreated');
      expect(resultDesc.entries[0]?.eventType).toBe('PatientCreated');
    });

    it('should filter by aggregateId', async () => {
      // Need to find a known aggregateId from setup
      const allResult = await store.query({});
      const targetAggregateId = allResult.entries[0]?.aggregateId;

      const result = await store.query({ aggregateId: targetAggregateId });

      expect(result.entries.every((e) => e.aggregateId === targetAggregateId)).toBe(true);
    });

    it('should filter by correlationId', async () => {
      const allResult = await store.query({});
      const targetCorrelationId = allResult.entries[0]?.correlationId;

      const result = await store.query({ correlationId: targetCorrelationId });

      expect(result.entries.every((e) => e.correlationId === targetCorrelationId)).toBe(true);
    });

    it('should filter by eventTypes array', async () => {
      const result = await store.query({ eventTypes: ['LeadCreated', 'LeadScored'] });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => ['LeadCreated', 'LeadScored'].includes(e.eventType))).toBe(
        true
      );
    });

    it('should filter by startTime only', async () => {
      const result = await store.query({
        startTime: new Date('2024-01-01T11:00:00Z'),
      });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by endTime only', async () => {
      const result = await store.query({
        endTime: new Date('2024-01-01T11:00:00Z'),
      });

      expect(result.entries.length).toBe(2);
    });

    it('should handle offset pagination', async () => {
      const result = await store.query({ limit: 2, offset: 1 });

      expect(result.entries.length).toBe(2);
      expect(result.total).toBe(3);
    });

    it('should return empty results when no matches', async () => {
      const result = await store.query({ actorId: 'non-existent-user' });

      expect(result.entries.length).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getSummary', () => {
    beforeEach(async () => {
      const entries: AuditEntry[] = [
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId: 'agg-1',
          aggregateType: 'Lead',
          actor: createMockActor({ id: 'user-1' }),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
          complianceTags: ['HIPAA'],
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId: 'agg-2',
          aggregateType: 'Lead',
          actor: createMockActor({ id: 'user-1' }),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
          complianceTags: ['HIPAA'],
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date('2024-01-01T12:00:00Z').toISOString(),
          eventType: 'ConsentGranted',
          eventId: crypto.randomUUID(),
          aggregateId: 'agg-1',
          aggregateType: 'Lead',
          actor: createMockActor({ id: 'user-2' }),
          action: 'consent',
          correlationId: crypto.randomUUID(),
          severity: 'high',
          complianceTags: ['GDPR', 'HIPAA'],
        },
      ];

      await store.saveBatch(entries);
    });

    it('should return correct summary', async () => {
      const summary = await store.getSummary(
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-02T00:00:00Z')
      );

      expect(summary.totals.totalEntries).toBe(3);
      expect(summary.totals.byAction.create).toBe(2);
      expect(summary.totals.byAction.consent).toBe(1);
      expect(summary.totals.bySeverity.low).toBe(2);
      expect(summary.totals.bySeverity.high).toBe(1);
      expect(summary.topActors.length).toBe(2);
      expect(summary.complianceAlerts.length).toBe(2);
    });
  });

  describe('getAggregateAuditTrail', () => {
    it('should return audit trail for specific aggregate', async () => {
      const aggregateId = crypto.randomUUID();

      await store.saveBatch([
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId,
          aggregateType: 'Lead',
          actor: createMockActor(),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadScored',
          eventId: crypto.randomUUID(),
          aggregateId,
          aggregateType: 'Lead',
          actor: createMockActor(),
          action: 'score',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
      ]);

      const trail = await store.getAggregateAuditTrail(aggregateId, 'Lead');

      expect(trail.length).toBe(2);
    });

    it('should return empty array for non-existent aggregate', async () => {
      const trail = await store.getAggregateAuditTrail('non-existent', 'Lead');

      expect(trail.length).toBe(0);
    });
  });

  describe('getActorAuditTrail', () => {
    it('should return audit trail for specific actor', async () => {
      const actorId = 'test-actor-123';

      await store.saveBatch([
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Lead',
          actor: createMockActor({ id: actorId }),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadScored',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Lead',
          actor: createMockActor({ id: actorId }),
          action: 'score',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventType: 'LeadCreated',
          eventId: crypto.randomUUID(),
          aggregateId: crypto.randomUUID(),
          aggregateType: 'Lead',
          actor: createMockActor({ id: 'other-actor' }),
          action: 'create',
          correlationId: crypto.randomUUID(),
          severity: 'low',
        },
      ]);

      const trail = await store.getActorAuditTrail(actorId);

      expect(trail.length).toBe(2);
      expect(trail.every((e) => e.actor.id === actorId)).toBe(true);
    });

    it('should return empty array for non-existent actor', async () => {
      const trail = await store.getActorAuditTrail('non-existent-actor');

      expect(trail.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await store.save({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'LeadCreated',
        eventId: crypto.randomUUID(),
        aggregateId: crypto.randomUUID(),
        aggregateType: 'Lead',
        actor: createMockActor(),
        action: 'create',
        correlationId: crypto.randomUUID(),
        severity: 'low',
      });

      expect(store.size()).toBe(1);

      store.clear();

      expect(store.size()).toBe(0);
    });
  });

  describe('exportToJson', () => {
    it('should export entries as JSON', async () => {
      await store.save({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'LeadCreated',
        eventId: crypto.randomUUID(),
        aggregateId: crypto.randomUUID(),
        aggregateType: 'Lead',
        actor: createMockActor(),
        action: 'create',
        correlationId: crypto.randomUUID(),
        severity: 'low',
      });

      const json = await store.exportToJson({});
      const parsed = JSON.parse(json);

      expect(parsed.entries.length).toBe(1);
      expect(parsed.exportedAt).toBeDefined();
    });
  });
});

// ============================================================================
// AUDIT TRAIL SERVICE TESTS
// ============================================================================

describe('AuditTrailService', () => {
  let service: AuditTrailService;
  let store: InMemoryAuditStore;

  beforeEach(() => {
    store = createInMemoryAuditStore();
    service = createAuditTrailService(store, {
      id: 'system',
      type: 'system',
      name: 'Test System',
    });
  });

  describe('recordFromEvent', () => {
    it('should record audit entry from stored event', async () => {
      const event = createMockStoredEvent();
      const actor = createMockActor();

      const entry = await service.recordFromEvent(event, actor);

      expect(entry.eventId).toBe(event.id);
      expect(entry.eventType).toBe(event.type);
      expect(entry.aggregateId).toBe(event.aggregateId);
      expect(entry.actor.id).toBe(actor.id);
    });

    it('should use default actor if none provided', async () => {
      const event = createMockStoredEvent();

      const entry = await service.recordFromEvent(event);

      expect(entry.actor.id).toBe('system');
      expect(entry.actor.type).toBe('system');
    });

    it('should set correct action based on event type', async () => {
      const createEvent = createMockStoredEvent({ type: 'LeadCreated' });
      const scoreEvent = createMockStoredEvent({ type: 'LeadScored' });
      const consentEvent = createMockStoredEvent({ type: 'ConsentGranted' });

      const createEntry = await service.recordFromEvent(createEvent);
      const scoreEntry = await service.recordFromEvent(scoreEvent);
      const consentEntry = await service.recordFromEvent(consentEvent);

      expect(createEntry.action).toBe('create');
      expect(scoreEntry.action).toBe('score');
      expect(consentEntry.action).toBe('consent');
    });

    it('should set correct action for all mapped event types', async () => {
      const eventTypeMappings = [
        { type: 'LeadQualified', expectedAction: 'update' },
        { type: 'LeadAssigned', expectedAction: 'assign' },
        { type: 'LeadConverted', expectedAction: 'update' },
        { type: 'LeadLost', expectedAction: 'update' },
        { type: 'PatientUpdated', expectedAction: 'update' },
        { type: 'PatientMerged', expectedAction: 'update' },
        { type: 'AppointmentScheduled', expectedAction: 'schedule' },
        { type: 'AppointmentRescheduled', expectedAction: 'update' },
        { type: 'AppointmentCancelled', expectedAction: 'cancel' },
        { type: 'AppointmentCompleted', expectedAction: 'complete' },
        { type: 'ConsentWithdrawn', expectedAction: 'consent' },
        { type: 'MessageSent', expectedAction: 'create' },
        { type: 'MessageReceived', expectedAction: 'create' },
        { type: 'DataExported', expectedAction: 'export' },
        { type: 'DataImported', expectedAction: 'import' },
        { type: 'UserLoggedIn', expectedAction: 'authenticate' },
        { type: 'UserLoggedOut', expectedAction: 'authenticate' },
        { type: 'PermissionGranted', expectedAction: 'authorize' },
        { type: 'PermissionRevoked', expectedAction: 'authorize' },
      ];

      for (const { type, expectedAction } of eventTypeMappings) {
        const event = createMockStoredEvent({ type });
        const entry = await service.recordFromEvent(event);
        expect(entry.action).toBe(expectedAction);
      }
    });

    it('should default to update action for unknown event types', async () => {
      const unknownEvent = createMockStoredEvent({ type: 'UnknownEventType' });
      const entry = await service.recordFromEvent(unknownEvent);
      expect(entry.action).toBe('update');
    });

    it('should set correct severity for event types', async () => {
      const patientMergedEvent = createMockStoredEvent({ type: 'PatientMerged' });
      const consentWithdrawnEvent = createMockStoredEvent({ type: 'ConsentWithdrawn' });
      const dataExportedEvent = createMockStoredEvent({ type: 'DataExported' });

      const mergedEntry = await service.recordFromEvent(patientMergedEvent);
      const consentEntry = await service.recordFromEvent(consentWithdrawnEvent);
      const exportEntry = await service.recordFromEvent(dataExportedEvent);

      expect(mergedEntry.severity).toBe('high');
      expect(consentEntry.severity).toBe('critical');
      expect(exportEntry.severity).toBe('high');
    });

    it('should handle events with empty aggregateId', async () => {
      const event = createMockStoredEvent({ aggregateId: undefined });
      const entry = await service.recordFromEvent(event);
      expect(entry.aggregateId).toBe('');
    });

    it('should handle events with empty aggregateType', async () => {
      const event = createMockStoredEvent({ aggregateType: undefined });
      const entry = await service.recordFromEvent(event);
      expect(entry.aggregateType).toBe('');
    });

    it('should set compliance tags for relevant events', async () => {
      const patientEvent = createMockStoredEvent({ type: 'PatientCreated' });
      const consentEvent = createMockStoredEvent({ type: 'ConsentGranted' });

      const patientEntry = await service.recordFromEvent(patientEvent);
      const consentEntry = await service.recordFromEvent(consentEvent);

      expect(patientEntry.complianceTags).toContain('HIPAA');
      expect(patientEntry.complianceTags).toContain('GDPR');
      expect(consentEntry.complianceTags).toContain('GDPR');
    });

    it('should include reason and metadata when provided', async () => {
      const event = createMockStoredEvent();

      const entry = await service.recordFromEvent(event, createMockActor(), {
        reason: 'Manual lead creation',
        metadata: { source: 'admin-panel' },
      });

      expect(entry.reason).toBe('Manual lead creation');
      expect(entry.metadata).toEqual({ source: 'admin-panel' });
    });

    it('should include state changes when provided', async () => {
      const event = createMockStoredEvent({ type: 'LeadScored' });

      const entry = await service.recordFromEvent(event, createMockActor(), {
        previousState: { score: 1 },
        newState: { score: 5 },
        changedFields: ['score'],
      });

      expect(entry.previousState).toEqual({ score: 1 });
      expect(entry.newState).toEqual({ score: 5 });
      expect(entry.changedFields).toEqual(['score']);
    });
  });

  describe('recordBatchFromEvents', () => {
    it('should record multiple events', async () => {
      const events = [
        createMockStoredEvent({ type: 'LeadCreated' }),
        createMockStoredEvent({ type: 'LeadScored' }),
        createMockStoredEvent({ type: 'LeadQualified' }),
      ];

      const entries = await service.recordBatchFromEvents(events, createMockActor());

      expect(entries.length).toBe(3);
      expect(store.size()).toBe(3);
    });
  });

  describe('query', () => {
    it('should query entries through service', async () => {
      await service.recordFromEvent(createMockStoredEvent());
      await service.recordFromEvent(createMockStoredEvent());

      const result = await service.query({});

      expect(result.entries.length).toBe(2);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report', async () => {
      const events = [
        createMockStoredEvent({ type: 'PatientCreated' }),
        createMockStoredEvent({ type: 'ConsentGranted' }),
        createMockStoredEvent({ type: 'DataExported' }),
      ];

      await service.recordBatchFromEvents(events, createMockActor());

      const report = await service.generateComplianceReport(
        new Date(Date.now() - 3600000),
        new Date()
      );

      expect(report.entries.length).toBe(3);
      expect(report.summary.totals.totalEntries).toBe(3);
      expect(report.generatedAt).toBeDefined();
    });

    it('should filter by compliance tags', async () => {
      const events = [
        createMockStoredEvent({ type: 'PatientCreated' }), // HIPAA, GDPR
        createMockStoredEvent({ type: 'LeadCreated' }), // No compliance tags
      ];

      await service.recordBatchFromEvents(events, createMockActor());

      const report = await service.generateComplianceReport(
        new Date(Date.now() - 3600000),
        new Date(),
        ['GDPR']
      );

      expect(report.entries.length).toBe(1);
      expect(report.period.start).toBeDefined();
      expect(report.period.end).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should get summary through service', async () => {
      const events = [
        createMockStoredEvent({ type: 'LeadCreated' }),
        createMockStoredEvent({ type: 'LeadScored' }),
      ];

      await service.recordBatchFromEvents(events, createMockActor());

      const summary = await service.getSummary(new Date(Date.now() - 3600000), new Date());

      expect(summary.totals.totalEntries).toBe(2);
    });
  });

  describe('getAggregateAuditTrail', () => {
    it('should get aggregate audit trail through service', async () => {
      const aggregateId = crypto.randomUUID();
      const event = createMockStoredEvent({ aggregateId, aggregateType: 'Lead' });

      await service.recordFromEvent(event, createMockActor());

      const trail = await service.getAggregateAuditTrail(aggregateId, 'Lead');

      expect(trail.length).toBe(1);
    });
  });

  describe('getActorAuditTrail', () => {
    it('should get actor audit trail through service', async () => {
      const actorId = 'specific-actor-456';
      const actor = createMockActor({ id: actorId });

      await service.recordFromEvent(createMockStoredEvent(), actor);

      const trail = await service.getActorAuditTrail(actorId);

      expect(trail.length).toBe(1);
    });
  });

  describe('exportToJson', () => {
    it('should export entries through service', async () => {
      await service.recordFromEvent(createMockStoredEvent(), createMockActor());

      const json = await service.exportToJson({});
      const parsed = JSON.parse(json);

      expect(parsed.entries.length).toBe(1);
    });
  });

  describe('createEntryFromEvent', () => {
    it('should create entry without saving', () => {
      const event = createMockStoredEvent();
      const actor = createMockActor();

      const entry = service.createEntryFromEvent(event, actor);

      expect(entry.eventId).toBe(event.id);
      expect(store.size()).toBe(0); // Not saved
    });

    it('should use event payload as newState when not provided', () => {
      const event = createMockStoredEvent({ payload: { testData: 'value' } });

      const entry = service.createEntryFromEvent(event);

      expect(entry.newState).toEqual({ testData: 'value' });
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('Factory Functions', () => {
  describe('createAuditTrailService', () => {
    it('should create service with default store', () => {
      const service = createAuditTrailService();

      expect(service).toBeInstanceOf(AuditTrailService);
    });

    it('should create service with custom store and actor', () => {
      const store = createInMemoryAuditStore();
      const service = createAuditTrailService(store, {
        id: 'custom-system',
        type: 'integration',
      });

      expect(service).toBeInstanceOf(AuditTrailService);
    });
  });

  describe('createInMemoryAuditStore', () => {
    it('should create empty store', () => {
      const store = createInMemoryAuditStore();

      expect(store.size()).toBe(0);
    });
  });
});

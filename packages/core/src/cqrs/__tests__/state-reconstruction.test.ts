/**
 * State Reconstruction Service Tests
 *
 * Tests for:
 * - Point-in-time state reconstruction
 * - State diffing between timestamps
 * - State timeline generation
 * - Field history tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StateReconstructionService,
  buildAggregateHistoryView,
  createStateReconstructionService,
} from '../state-reconstruction.js';
import { LeadAggregate, type LeadState } from '../aggregate.js';
import { InMemoryEventStore, EventStore } from '../../event-store.js';
import { InMemorySnapshotStore } from '../snapshot-store.js';

// ============================================================================
// TEST SETUP
// ============================================================================

function createLeadFactory(id: string): LeadAggregate {
  return new LeadAggregate(id, '', 'whatsapp');
}

describe('StateReconstructionService', () => {
  let eventStore: EventStore;
  let snapshotStore: InMemorySnapshotStore;
  let service: StateReconstructionService<LeadAggregate, LeadState>;
  let leadId: string;

  beforeEach(async () => {
    const repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
    snapshotStore = new InMemorySnapshotStore();
    leadId = crypto.randomUUID();

    service = createStateReconstructionService(
      eventStore,
      createLeadFactory,
      'Lead',
      snapshotStore
    );

    // Create a lead with several events over time
    // Using repository.append directly to control timestamps for testing
    const baseTime = new Date('2024-01-01T10:00:00Z').getTime();

    // Event 1: Lead Created
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadCreated',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 1,
      payload: { phone: '+1234567890', channel: 'whatsapp' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime).toISOString(),
        source: 'test',
      },
    });

    // Event 2: Lead Scored (1 hour later)
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadScored',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 2,
      payload: { score: 3, classification: 'WARM' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 3600000).toISOString(),
        source: 'test',
      },
    });

    // Event 3: Lead Qualified (2 hours later)
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadQualified',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 3,
      payload: { classification: 'HOT' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 7200000).toISOString(),
        source: 'test',
      },
    });

    // Event 4: Lead Assigned (3 hours later)
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadAssigned',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 4,
      payload: { assignedTo: 'user-123' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date(baseTime + 10800000).toISOString(),
        source: 'test',
      },
    });
  });

  describe('getStateAtTime', () => {
    it('should return null for non-existent aggregate', async () => {
      const result = await service.getStateAtTime('non-existent-id', new Date());

      expect(result).toBeNull();
    });

    it('should return null for time before aggregate creation', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2023-12-31T00:00:00Z'));

      expect(result).toBeNull();
    });

    it('should return state at creation time', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T10:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.state.status).toBe('new');
      expect(result!.eventsApplied).toBe(1);
    });

    it('should return state after scoring', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T11:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.state.score).toBe(3);
      expect(result!.state.classification).toBe('WARM');
      expect(result!.eventsApplied).toBe(2);
    });

    it('should return state after qualification', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T12:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
      expect(result!.state.status).toBe('qualified');
      expect(result!.state.classification).toBe('HOT');
    });

    it('should return final state after all events', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T14:00:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(4);
      expect(result!.state.assignedTo).toBe('user-123');
      expect(result!.state.status).toBe('contacted');
    });

    it('should include reconstruction time metric', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T14:00:00Z'));

      expect(result!.reconstructionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStateAtVersion', () => {
    it('should return state at specific version', async () => {
      const result = await service.getStateAtVersion(leadId, 2);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.state.score).toBe(3);
    });

    it('should return null for version 0', async () => {
      const result = await service.getStateAtVersion(leadId, 0);

      expect(result).toBeNull();
    });

    it('should return latest state for high version', async () => {
      const result = await service.getStateAtVersion(leadId, 100);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(4);
    });
  });

  describe('diffStates', () => {
    it('should compute diff between two time points', async () => {
      const diff = await service.diffStates(
        leadId,
        new Date('2024-01-01T10:30:00Z'),
        new Date('2024-01-01T13:30:00Z')
      );

      expect(diff).not.toBeNull();
      expect(diff!.before.version).toBe(1);
      expect(diff!.after.version).toBe(4);
      expect(diff!.eventsBetween.length).toBe(3);
    });

    it('should identify changed fields', async () => {
      const diff = await service.diffStates(
        leadId,
        new Date('2024-01-01T10:30:00Z'),
        new Date('2024-01-01T11:30:00Z')
      );

      expect(diff).not.toBeNull();
      expect(diff!.changedFields).toContain('score');
      expect(diff!.changedFields).toContain('classification');
    });

    it('should return null if aggregate does not exist at either time', async () => {
      const diff = await service.diffStates(
        leadId,
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-01-02T00:00:00Z')
      );

      expect(diff).toBeNull();
    });
  });

  describe('getStateTimeline', () => {
    it('should generate complete timeline', async () => {
      const timeline = await service.getStateTimeline(leadId);

      expect(timeline).not.toBeNull();
      expect(timeline!.entries.length).toBe(4);
      expect(timeline!.totalEvents).toBe(4);
    });

    it('should include initial and current state', async () => {
      const timeline = await service.getStateTimeline(leadId);

      expect(timeline!.initialState).toBeDefined();
      expect(timeline!.currentState).toBeDefined();
      expect(timeline!.currentState.version).toBe(4);
    });

    it('should track changed fields for each entry', async () => {
      const timeline = await service.getStateTimeline(leadId);

      // LeadScored should change score and classification
      const scoredEntry = timeline!.entries.find((e) => e.event.type === 'LeadScored');
      expect(scoredEntry).toBeDefined();
      expect(scoredEntry!.changedFields).toContain('score');
    });

    it('should include previous values', async () => {
      const timeline = await service.getStateTimeline(leadId);

      // LeadAssigned should show previous assignedTo as undefined
      const assignedEntry = timeline!.entries.find((e) => e.event.type === 'LeadAssigned');
      expect(assignedEntry).toBeDefined();
      expect(assignedEntry!.stateAfter.assignedTo).toBe('user-123');
    });

    it('should filter by time range', async () => {
      const timeline = await service.getStateTimeline(
        leadId,
        new Date('2024-01-01T10:30:00Z'),
        new Date('2024-01-01T12:00:00Z')
      );

      expect(timeline).not.toBeNull();
      expect(timeline!.entries.length).toBe(2); // Scored and Qualified only
    });
  });

  describe('findFieldChange', () => {
    it('should find when field changed to specific value', async () => {
      const entry = await service.findFieldChange(leadId, 'classification', 'HOT');

      expect(entry).not.toBeNull();
      expect(entry!.event.type).toBe('LeadQualified');
    });

    it('should return null if value not found', async () => {
      const entry = await service.findFieldChange(leadId, 'classification', 'COLD');

      expect(entry).toBeNull();
    });
  });

  describe('getFieldHistory', () => {
    it('should return history of field changes', async () => {
      const history = await service.getFieldHistory(leadId, 'classification');

      expect(history.length).toBe(2); // Scored (WARM) and Qualified (HOT)
    });

    it('should include previous and new values', async () => {
      const history = await service.getFieldHistory(leadId, 'classification');

      const hotChange = history.find((h) => h.value === 'HOT');
      expect(hotChange).toBeDefined();
      expect(hotChange!.eventType).toBe('LeadQualified');
    });

    it('should return single entry for field set only at creation', async () => {
      // Phone is set in LeadCreated but never changes after
      const history = await service.getFieldHistory(leadId, 'phone');

      // Expect 1 entry from the initial creation
      expect(history.length).toBe(1);
      expect(history[0]!.eventType).toBe('LeadCreated');
    });
  });

  describe('compareWithCurrent', () => {
    it('should compare past state with current', async () => {
      const diff = await service.compareWithCurrent(leadId, new Date('2024-01-01T10:30:00Z'));

      expect(diff).not.toBeNull();
      expect(diff!.before.version).toBe(1);
      expect(diff!.after.version).toBe(4);
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify aggregate integrity', async () => {
      const result = await service.verifyIntegrity(leadId);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
      expect(result.eventsProcessed).toBe(4);
      expect(result.finalVersion).toBe(4);
    });

    it('should return valid for non-existent aggregate', async () => {
      const result = await service.verifyIntegrity('non-existent');

      expect(result.valid).toBe(true);
      expect(result.eventsProcessed).toBe(0);
    });
  });

  describe('with snapshots', () => {
    beforeEach(async () => {
      // Create a snapshot at version 2
      const lead = new LeadAggregate(leadId, '+1234567890', 'whatsapp');
      const events = await eventStore.getByAggregateId(leadId);
      lead.loadFromHistory(events.slice(0, 2));

      await snapshotStore.save({
        aggregateId: leadId,
        aggregateType: 'Lead',
        version: 2,
        state: lead.getState(),
        createdAt: new Date('2024-01-01T11:00:00Z'),
      });
    });

    it('should use snapshot for reconstruction', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T14:00:00Z'), {
        useSnapshots: true,
      });

      expect(result).not.toBeNull();
      expect(result!.usedSnapshot).toBe(true);
      expect(result!.snapshotVersion).toBe(2);
    });

    it('should skip snapshot when disabled', async () => {
      const result = await service.getStateAtTime(leadId, new Date('2024-01-01T14:00:00Z'), {
        useSnapshots: false,
      });

      expect(result).not.toBeNull();
      expect(result!.usedSnapshot).toBe(false);
      expect(result!.eventsApplied).toBe(4);
    });
  });
});

// ============================================================================
// AGGREGATE HISTORY VIEW TESTS
// ============================================================================

describe('buildAggregateHistoryView', () => {
  let eventStore: EventStore;
  let service: StateReconstructionService<LeadAggregate, LeadState>;
  let leadId: string;

  beforeEach(async () => {
    const repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
    leadId = crypto.randomUUID();

    service = createStateReconstructionService(eventStore, createLeadFactory, 'Lead');

    // Create events
    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadCreated',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 1,
      payload: { phone: '+1234567890', channel: 'whatsapp' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: 'test',
      },
    });

    await repository.append({
      id: crypto.randomUUID(),
      type: 'LeadScored',
      aggregateId: leadId,
      aggregateType: 'Lead',
      version: 2,
      payload: { score: 5, classification: 'HOT' },
      metadata: {
        correlationId: crypto.randomUUID(),
        causationId: undefined,
        idempotencyKey: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: 'test',
      },
    });
  });

  it('should build user-friendly history view', async () => {
    const view = await buildAggregateHistoryView(service, leadId);

    expect(view).not.toBeNull();
    expect(view!.aggregateId).toBe(leadId);
    expect(view!.aggregateType).toBe('Lead');
    expect(view!.eventCount).toBe(2);
    expect(view!.timeline.length).toBe(2);
  });

  it('should include change details in timeline', async () => {
    const view = await buildAggregateHistoryView(service, leadId);

    const scoredEntry = view!.timeline.find((t) => t.eventType === 'LeadScored');
    expect(scoredEntry).toBeDefined();
    expect(scoredEntry!.changes.score).toBeDefined();
  });

  it('should return null for non-existent aggregate', async () => {
    const view = await buildAggregateHistoryView(service, 'non-existent');

    expect(view).toBeNull();
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createStateReconstructionService', () => {
  it('should create service without snapshot store', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const service = createStateReconstructionService(eventStore, createLeadFactory, 'Lead');

    expect(service).toBeInstanceOf(StateReconstructionService);
  });

  it('should create service with snapshot store', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const snapshotStore = new InMemorySnapshotStore();
    const service = createStateReconstructionService(
      eventStore,
      createLeadFactory,
      'Lead',
      snapshotStore
    );

    expect(service).toBeInstanceOf(StateReconstructionService);
  });
});

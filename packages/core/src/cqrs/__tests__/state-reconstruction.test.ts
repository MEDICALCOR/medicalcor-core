/**
 * State Reconstruction Service Tests
 *
 * Tests for:
 * - Point-in-time state reconstruction
 * - State diffing between timestamps
 * - Event timeline generation
 * - State verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StateReconstructionService,
  createStateReconstructionService,
} from '../state-reconstruction.js';
import { LeadAggregate, type LeadState } from '../aggregate.js';
import { InMemoryEventStore, EventStore } from '../../event-store.js';
import { InMemorySnapshotStore, SnapshotManager } from '../snapshot-store.js';

// ============================================================================
// TEST SETUP
// ============================================================================

function createLeadFactory(id: string): LeadAggregate {
  return new LeadAggregate(id, '', 'whatsapp');
}

describe('StateReconstructionService', () => {
  let eventStore: EventStore;
  let snapshotStore: InMemorySnapshotStore;
  let snapshotManager: SnapshotManager;
  let service: StateReconstructionService<LeadAggregate, LeadState>;
  let leadId: string;

  beforeEach(async () => {
    const repository = new InMemoryEventStore();
    eventStore = new EventStore(repository, { source: 'test' });
    snapshotStore = new InMemorySnapshotStore();
    snapshotManager = new SnapshotManager(snapshotStore);
    leadId = crypto.randomUUID();

    // Note: createStateReconstructionService takes (eventStore, aggregateType, factory, snapshotManager)
    service = createStateReconstructionService(
      eventStore,
      'Lead',
      createLeadFactory,
      snapshotManager
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

  describe('reconstructAsOf', () => {
    it('should return null for non-existent aggregate', async () => {
      const result = await service.reconstructAsOf('non-existent-id', new Date());

      expect(result).toBeNull();
    });

    it('should return null for time before aggregate creation', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2023-12-31T00:00:00Z'));

      expect(result).toBeNull();
    });

    it('should return state at creation time', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2024-01-01T10:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.state.status).toBe('new');
      expect(result!.eventsApplied).toBe(1);
    });

    it('should return state after scoring', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2024-01-01T11:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.state.score).toBe(3);
      expect(result!.state.classification).toBe('WARM');
      expect(result!.eventsApplied).toBe(2);
    });

    it('should return state after qualification', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2024-01-01T12:30:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
      expect(result!.state.status).toBe('qualified');
      expect(result!.state.classification).toBe('HOT');
    });

    it('should return final state after all events', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2024-01-01T14:00:00Z'));

      expect(result).not.toBeNull();
      expect(result!.version).toBe(4);
      expect(result!.state.assignedTo).toBe('user-123');
      expect(result!.state.status).toBe('contacted');
    });

    it('should include reconstruction duration metric', async () => {
      const result = await service.reconstructAsOf(leadId, new Date('2024-01-01T14:00:00Z'));

      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reconstructAtVersion', () => {
    it('should return state at specific version', async () => {
      const result = await service.reconstructAtVersion(leadId, 2);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.state.score).toBe(3);
    });

    it('should return null for version 0', async () => {
      const result = await service.reconstructAtVersion(leadId, 0);

      expect(result).toBeNull();
    });

    it('should return latest available state for high version', async () => {
      const result = await service.reconstructAtVersion(leadId, 100);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(4);
    });
  });

  describe('getStateDiffByTime', () => {
    it('should compute diff between two time points', async () => {
      const diff = await service.getStateDiffByTime(
        leadId,
        new Date('2024-01-01T10:30:00Z'),
        new Date('2024-01-01T13:30:00Z')
      );

      expect(diff).not.toBeNull();
      expect(diff!.fromVersion).toBe(1);
      expect(diff!.toVersion).toBe(4);
      expect(diff!.eventsBetween.length).toBe(3);
    });

    it('should identify changed fields', async () => {
      const diff = await service.getStateDiffByTime(
        leadId,
        new Date('2024-01-01T10:30:00Z'),
        new Date('2024-01-01T11:30:00Z')
      );

      expect(diff).not.toBeNull();
      const changedPaths = diff!.changes.map((c) => c.path);
      expect(changedPaths).toContain('score');
      expect(changedPaths).toContain('classification');
    });

    it('should return null if aggregate does not exist at either time', async () => {
      const diff = await service.getStateDiffByTime(
        leadId,
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-01-02T00:00:00Z')
      );

      expect(diff).toBeNull();
    });
  });

  describe('getStateDiff', () => {
    it('should compute diff between two versions', async () => {
      const diff = await service.getStateDiff(leadId, 1, 4);

      expect(diff).not.toBeNull();
      expect(diff!.fromVersion).toBe(1);
      expect(diff!.toVersion).toBe(4);
    });

    it('should return null for non-existent aggregate', async () => {
      const diff = await service.getStateDiff('non-existent', 1, 2);

      expect(diff).toBeNull();
    });
  });

  describe('getEventTimeline', () => {
    it('should return complete event timeline', async () => {
      const timeline = await service.getEventTimeline(leadId);

      expect(timeline.events.length).toBe(4);
      expect(timeline.total).toBe(4);
      expect(timeline.hasMore).toBe(false);
    });

    it('should support pagination', async () => {
      const timeline = await service.getEventTimeline(leadId, { limit: 2, offset: 0 });

      expect(timeline.events.length).toBe(2);
      expect(timeline.total).toBe(4);
      expect(timeline.hasMore).toBe(true);
    });

    it('should filter by time range', async () => {
      const timeline = await service.getEventTimeline(leadId, {
        startTime: new Date('2024-01-01T10:30:00Z'),
        endTime: new Date('2024-01-01T12:00:00Z'),
      });

      // Should include events from 11:00 (LeadScored) and 12:00 (LeadQualified)
      expect(timeline.events.length).toBe(2);
    });

    it('should return events in version order', async () => {
      const timeline = await service.getEventTimeline(leadId);

      for (let i = 1; i < timeline.events.length; i++) {
        const prev = timeline.events[i - 1];
        const curr = timeline.events[i];
        expect(curr?.version ?? 0).toBeGreaterThan(prev?.version ?? 0);
      }
    });
  });

  describe('verifyStateConsistency', () => {
    it('should verify consistent state', async () => {
      // Reconstruct the current state
      const reconstructed = await service.reconstructAt(leadId);
      expect(reconstructed).not.toBeNull();

      const result = await service.verifyStateConsistency(leadId, reconstructed!.state);

      expect(result.isConsistent).toBe(true);
      expect(result.differences.length).toBe(0);
    });

    it('should detect state drift', async () => {
      const modifiedState: LeadState = {
        id: leadId,
        phone: '+1234567890',
        channel: 'whatsapp',
        status: 'contacted',
        score: 999, // Different from actual score
        classification: 'HOT',
        assignedTo: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 4,
      };

      const result = await service.verifyStateConsistency(leadId, modifiedState);

      expect(result.isConsistent).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should return not consistent for non-existent aggregate', async () => {
      const dummyState: LeadState = {
        id: 'non-existent',
        phone: '+1234567890',
        channel: 'whatsapp',
        status: 'new',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      const result = await service.verifyStateConsistency('non-existent', dummyState);

      expect(result.isConsistent).toBe(false);
      expect(result.recommendation).toContain('not found');
    });
  });

  describe('reconstructAt with options', () => {
    it('should include events when requested', async () => {
      const result = await service.reconstructAt(leadId, { includeEvents: true });

      expect(result).not.toBeNull();
      expect(result!.events).toBeDefined();
      expect(result!.events!.length).toBe(4);
    });

    it('should reconstruct until specific version', async () => {
      const result = await service.reconstructAt(leadId, { untilVersion: 2 });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
    });

    it('should reconstruct as of specific time', async () => {
      const result = await service.reconstructAt(leadId, {
        asOf: new Date('2024-01-01T11:30:00Z'),
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
    });
  });

  describe('with snapshots', () => {
    beforeEach(async () => {
      // Create a snapshot at version 2
      const lead = new LeadAggregate(leadId, '+1234567890', 'whatsapp');
      const events = await eventStore.getByAggregateId(leadId);
      lead.loadFromHistory(events.slice(0, 2));

      await snapshotManager.saveSnapshot({
        aggregateId: leadId,
        aggregateType: 'Lead',
        version: 2,
        state: lead.getState(),
        createdAt: new Date('2024-01-01T11:00:00Z'),
      });
    });

    it('should use snapshot for reconstruction', async () => {
      const result = await service.reconstructAt(leadId, {
        useSnapshots: true,
      });

      expect(result).not.toBeNull();
      expect(result!.snapshotUsed).toBe(true);
      expect(result!.snapshotVersion).toBe(2);
    });

    it('should skip snapshot when disabled', async () => {
      const result = await service.reconstructAt(leadId, {
        useSnapshots: false,
      });

      expect(result).not.toBeNull();
      expect(result!.snapshotUsed).toBe(false);
      expect(result!.eventsApplied).toBe(4);
    });

    it('should include metadata about reconstruction method', async () => {
      const result = await service.reconstructAt(leadId, { useSnapshots: true });

      expect(result).not.toBeNull();
      expect(result!.metadata.reconstructionMethod).toBe('snapshot-replay');
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createStateReconstructionService', () => {
  it('should create service without snapshot manager', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const service = createStateReconstructionService(eventStore, 'Lead', createLeadFactory);

    expect(service).toBeInstanceOf(StateReconstructionService);
  });

  it('should create service with snapshot manager', () => {
    const repository = new InMemoryEventStore();
    const eventStore = new EventStore(repository, { source: 'test' });
    const snapshotStore = new InMemorySnapshotStore();
    const snapshotManager = new SnapshotManager(snapshotStore);
    const service = createStateReconstructionService(
      eventStore,
      'Lead',
      createLeadFactory,
      snapshotManager
    );

    expect(service).toBeInstanceOf(StateReconstructionService);
  });
});

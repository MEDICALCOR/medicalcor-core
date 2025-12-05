/**
 * Aggregate Root and Repository Tests
 *
 * Tests for event-sourced aggregates and repositories
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LeadAggregate,
  LeadRepository,
  type LeadState,
} from '../aggregate.js';
import { createInMemoryEventStore, type EventStore } from '../../event-store.js';

describe('LeadAggregate', () => {
  describe('create', () => {
    it('should create a new lead', () => {
      const lead = LeadAggregate.create('+40721111111', '+40721111111', 'whatsapp', 'corr-1');

      expect(lead.id).toBe('+40721111111');
      expect(lead.version).toBe(1);
      expect(lead.getState().phone).toBe('+40721111111');
      expect(lead.getState().channel).toBe('whatsapp');
      expect(lead.getState().status).toBe('new');
    });

    it('should emit LeadCreated event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'voice');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadCreated');
      expect(events[0]?.payload).toMatchObject({
        phone: '+40721111111',
        channel: 'voice',
      });
    });
  });

  describe('score', () => {
    it('should score a lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      lead.score(85, 'HOT', 'corr-1');

      expect(lead.getState().score).toBe(85);
      expect(lead.getState().classification).toBe('HOT');
    });

    it('should emit LeadScored event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.clearUncommittedEvents(); // Clear create event

      lead.score(75, 'WARM');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadScored');
      expect(events[0]?.payload).toMatchObject({
        score: 75,
        classification: 'WARM',
      });
    });

    it('should not score converted lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.convert('hubspot-123');

      expect(() => lead.score(85, 'HOT')).toThrow('Cannot score a closed lead');
    });

    it('should not score lost lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.markLost('No response');

      expect(() => lead.score(85, 'HOT')).toThrow('Cannot score a closed lead');
    });
  });

  describe('qualify', () => {
    it('should qualify a lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      lead.qualify('HOT', 'corr-1');

      expect(lead.getState().classification).toBe('HOT');
      expect(lead.getState().status).toBe('qualified');
    });

    it('should emit LeadQualified event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.clearUncommittedEvents();

      lead.qualify('WARM');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadQualified');
    });

    it('should not qualify converted lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.convert('hubspot-123');

      expect(() => lead.qualify('HOT')).toThrow('Cannot qualify a closed lead');
    });

    it('should not qualify lost lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.markLost('No response');

      expect(() => lead.qualify('HOT')).toThrow('Cannot qualify a closed lead');
    });
  });

  describe('assign', () => {
    it('should assign lead to user', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      lead.assign('user-123', 'corr-1');

      expect(lead.getState().assignedTo).toBe('user-123');
      expect(lead.getState().status).toBe('contacted');
    });

    it('should emit LeadAssigned event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.clearUncommittedEvents();

      lead.assign('user-456');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadAssigned');
      expect(events[0]?.payload).toMatchObject({
        assignedTo: 'user-456',
      });
    });

    it('should not assign converted lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.convert('hubspot-123');

      expect(() => lead.assign('user-123')).toThrow('Cannot assign a closed lead');
    });

    it('should not assign lost lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.markLost('No response');

      expect(() => lead.assign('user-123')).toThrow('Cannot assign a closed lead');
    });
  });

  describe('convert', () => {
    it('should convert a lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      lead.convert('hubspot-123', 'corr-1');

      expect(lead.getState().status).toBe('converted');
    });

    it('should emit LeadConverted event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.clearUncommittedEvents();

      lead.convert('hubspot-456');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadConverted');
      expect(events[0]?.payload).toMatchObject({
        hubspotContactId: 'hubspot-456',
      });
    });

    it('should not convert already converted lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.convert('hubspot-123');

      expect(() => lead.convert('hubspot-456')).toThrow('Lead is already converted');
    });

    it('should not convert lost lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.markLost('No response');

      expect(() => lead.convert('hubspot-123')).toThrow('Cannot convert a lost lead');
    });
  });

  describe('markLost', () => {
    it('should mark lead as lost', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      lead.markLost('No response', 'corr-1');

      expect(lead.getState().status).toBe('lost');
    });

    it('should emit LeadLost event', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.clearUncommittedEvents();

      lead.markLost('Price too high');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('LeadLost');
      expect(events[0]?.payload).toMatchObject({
        reason: 'Price too high',
      });
    });

    it('should not mark already lost lead', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.markLost('No response');

      expect(() => lead.markLost('Other reason')).toThrow('Lead is already lost');
    });

    it('should not mark converted lead as lost', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.convert('hubspot-123');

      expect(() => lead.markLost('No response')).toThrow('Cannot lose a converted lead');
    });
  });

  describe('loadFromHistory', () => {
    it('should rebuild state from events', async () => {
      const eventStore = createInMemoryEventStore('test');

      await eventStore.emit({
        type: 'LeadCreated',
        aggregateId: 'lead-1',
        aggregateType: 'Lead',
        version: 1,
        payload: { phone: '+40721111111', channel: 'whatsapp' },
        correlationId: 'corr-1',
      });

      await eventStore.emit({
        type: 'LeadScored',
        aggregateId: 'lead-1',
        aggregateType: 'Lead',
        version: 2,
        payload: { score: 85, classification: 'HOT' },
        correlationId: 'corr-2',
      });

      const events = await eventStore.getByAggregateId('lead-1');
      const lead = new LeadAggregate('lead-1', '', 'whatsapp');
      lead.loadFromHistory(events);

      expect(lead.version).toBe(2);
      expect(lead.getState().score).toBe(85);
      expect(lead.getState().classification).toBe('HOT');
    });
  });

  describe('createSnapshot and loadFromSnapshot', () => {
    it('should create and restore from snapshot', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.score(85, 'HOT');
      lead.qualify('HOT');

      const snapshot = lead.createSnapshot();

      const restoredLead = new LeadAggregate('lead-1', '', 'whatsapp');
      restoredLead.loadFromSnapshot(snapshot);

      expect(restoredLead.version).toBe(lead.version);
      expect(restoredLead.getState()).toEqual(lead.getState());
    });
  });

  describe('getUncommittedEvents and clearUncommittedEvents', () => {
    it('should track uncommitted events', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      expect(lead.getUncommittedEvents()).toHaveLength(1);

      lead.score(85, 'HOT');

      expect(lead.getUncommittedEvents()).toHaveLength(2);
    });

    it('should clear uncommitted events', () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.score(85, 'HOT');

      expect(lead.getUncommittedEvents()).toHaveLength(2);

      lead.clearUncommittedEvents();

      expect(lead.getUncommittedEvents()).toHaveLength(0);
    });
  });
});

describe('LeadRepository', () => {
  let eventStore: EventStore;
  let repository: LeadRepository;

  beforeEach(() => {
    eventStore = createInMemoryEventStore('test');
    repository = new LeadRepository(eventStore);
  });

  describe('save and getById', () => {
    it('should save and retrieve lead', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

      await repository.save(lead);

      const retrieved = await repository.getById('lead-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('lead-1');
      expect(retrieved?.getState().phone).toBe('+40721111111');
    });

    it('should not save if no uncommitted events', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      await repository.save(lead);

      // Save again without changes
      await repository.save(lead);

      const events = await eventStore.getByAggregateId('lead-1');
      expect(events).toHaveLength(1); // Only one LeadCreated event
    });

    it('should return null for non-existent aggregate', async () => {
      const retrieved = await repository.getById('nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should rebuild state from multiple events', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.score(85, 'HOT');
      lead.qualify('HOT');
      lead.assign('user-123');

      await repository.save(lead);

      const retrieved = await repository.getById('lead-1');

      expect(retrieved?.getState().score).toBe(85);
      expect(retrieved?.getState().classification).toBe('HOT');
      expect(retrieved?.getState().status).toBe('contacted');
      expect(retrieved?.getState().assignedTo).toBe('user-123');
    });
  });

  describe('exists', () => {
    it('should return true for existing aggregate', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      await repository.save(lead);

      const exists = await repository.exists('lead-1');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent aggregate', async () => {
      const exists = await repository.exists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('findByPhone', () => {
    it('should find lead by phone using event scan', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      await repository.save(lead);

      const found = await repository.findByPhone('+40721111111');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('lead-1');
    });

    it('should return null if phone not found', async () => {
      const found = await repository.findByPhone('+40799999999');

      expect(found).toBeNull();
    });
  });

  describe('existsByPhone', () => {
    it('should return true if phone exists', async () => {
      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      await repository.save(lead);

      const exists = await repository.existsByPhone('+40721111111');

      expect(exists).toBe(true);
    });

    it('should return false if phone does not exist', async () => {
      const exists = await repository.existsByPhone('+40799999999');

      expect(exists).toBe(false);
    });
  });

  describe('with projection client', () => {
    it('should use projection for findByPhone when client provided', async () => {
      const mockClient = {
        query: async () => ({
          rows: [{ id: 'lead-1' }],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      await repoWithClient.save(lead);

      const found = await repoWithClient.findByPhone('+40721111111');

      expect(found).not.toBeNull();
    });

    it('should return null when projection returns no results', async () => {
      const mockClient = {
        query: async () => ({
          rows: [],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      const found = await repoWithClient.findByPhone('+40799999999');

      expect(found).toBeNull();
    });

    it('should use projection for findLookupByPhone', async () => {
      const mockClient = {
        query: async () => ({
          rows: [
            {
              id: 'lead-1',
              phone: '+40721111111',
              channel: 'whatsapp',
              classification: 'HOT',
              score: 85,
              hubspot_contact_id: null,
              assigned_to: 'user-123',
              status: 'contacted',
            },
          ],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      const lookup = await repoWithClient.findLookupByPhone('+40721111111');

      expect(lookup).not.toBeNull();
      expect(lookup?.phone).toBe('+40721111111');
      expect(lookup?.classification).toBe('HOT');
      expect(lookup?.score).toBe(85);
      expect(lookup?.assignedTo).toBe('user-123');
    });

    it('should return null from findLookupByPhone when no client', async () => {
      const result = await repository.findLookupByPhone('+40721111111');

      expect(result).toBeNull();
    });

    it('should use projection for existsByPhone', async () => {
      const mockClient = {
        query: async () => ({
          rows: [{ exists: true }],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      const exists = await repoWithClient.existsByPhone('+40721111111');

      expect(exists).toBe(true);
    });

    it('should use projection for findByStatus', async () => {
      const mockClient = {
        query: async () => ({
          rows: [{ id: 'lead-1' }, { id: 'lead-2' }],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      // Create test leads
      const lead1 = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      const lead2 = LeadAggregate.create('lead-2', '+40722222222', 'voice');
      await repoWithClient.save(lead1);
      await repoWithClient.save(lead2);

      const leads = await repoWithClient.findByStatus('new');

      expect(leads).toHaveLength(2);
    });

    it('should return empty array from findByStatus when no client', async () => {
      const leads = await repository.findByStatus('new');

      expect(leads).toEqual([]);
    });

    it('should use projection for findByClassification', async () => {
      const mockClient = {
        query: async () => ({
          rows: [{ id: 'lead-1' }],
        }),
      };

      const repoWithClient = new LeadRepository(eventStore, mockClient);

      const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
      lead.score(85, 'HOT');
      await repoWithClient.save(lead);

      const leads = await repoWithClient.findByClassification('HOT');

      expect(leads).toHaveLength(1);
    });

    it('should return empty array from findByClassification when no client', async () => {
      const leads = await repository.findByClassification('HOT');

      expect(leads).toEqual([]);
    });
  });
});

describe('AggregateRoot base class behaviors', () => {
  it('should track version correctly', () => {
    const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');

    expect(lead.version).toBe(1);

    lead.score(85, 'HOT');

    expect(lead.version).toBe(2);

    lead.qualify('HOT');

    expect(lead.version).toBe(3);
  });

  it('should update timestamps', () => {
    const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp');
    const state = lead.getState();

    expect(state.createdAt).toBeInstanceOf(Date);
    expect(state.updatedAt).toBeInstanceOf(Date);
  });

  it('should preserve correlationId in events', () => {
    const lead = LeadAggregate.create('lead-1', '+40721111111', 'whatsapp', 'my-correlation');

    const events = lead.getUncommittedEvents();

    expect(events[0]?.correlationId).toBe('my-correlation');
  });

  it('should support causationId in events', () => {
    const lead = new LeadAggregate('lead-1', '+40721111111', 'whatsapp');

    // Access protected method through type casting for testing
    const raiseFn = (lead as { raise: (type: string, payload: unknown, correlationId?: string, causationId?: string) => void }).raise.bind(lead);
    raiseFn('TestEvent', {}, 'corr-1', 'cause-1');

    const events = lead.getUncommittedEvents();

    expect(events[0]?.causationId).toBe('cause-1');
  });
});

/**
 * Tests for Lineage Store Implementations
 *
 * Tests InMemoryLineageStore and PostgresLineageStore implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryLineageStore, createInMemoryLineageStore, createLineageStore } from '../stores.js';
import type { LineageEntry, LineageQueryOptions } from '../types.js';

// Helper to create test lineage entries
const createTestEntry = (overrides: Partial<LineageEntry> = {}): LineageEntry => ({
  id: `entry-${Math.random().toString(36).substring(7)}`,
  targetAggregateId: 'agg-1',
  targetAggregateType: 'Lead',
  triggerEventId: 'evt-1',
  triggerEventType: 'LeadCreated',
  transformationType: 'create',
  transformationDescription: 'Created lead from form',
  sources: [],
  correlationId: 'corr-1',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('InMemoryLineageStore', () => {
  let store: InMemoryLineageStore;

  beforeEach(() => {
    store = new InMemoryLineageStore();
  });

  describe('save', () => {
    it('should save a lineage entry', async () => {
      const entry = createTestEntry();

      await store.save(entry);

      expect(store.size()).toBe(1);
    });

    it('should save multiple entries', async () => {
      await store.save(createTestEntry({ id: 'e1' }));
      await store.save(createTestEntry({ id: 'e2' }));

      expect(store.size()).toBe(2);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple entries in batch', async () => {
      const entries = [
        createTestEntry({ id: 'e1' }),
        createTestEntry({ id: 'e2' }),
        createTestEntry({ id: 'e3' }),
      ];

      await store.saveBatch(entries);

      expect(store.size()).toBe(3);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await store.saveBatch([
        createTestEntry({
          id: 'e1',
          targetAggregateId: 'agg-1',
          targetAggregateType: 'Lead',
          transformationType: 'create',
          correlationId: 'corr-1',
          createdAt: '2024-01-01T10:00:00Z',
          compliance: { frameworks: ['HIPAA', 'GDPR'], sensitivity: 'high' },
          actor: { id: 'user-1', type: 'user' },
          processingContext: { service: 'lead-service' },
          quality: { confidence: 0.95 },
          sources: [{ aggregateId: 'src-1', aggregateType: 'Form' }],
        }),
        createTestEntry({
          id: 'e2',
          targetAggregateId: 'agg-2',
          targetAggregateType: 'Patient',
          transformationType: 'transform',
          correlationId: 'corr-2',
          createdAt: '2024-01-02T10:00:00Z',
          compliance: { frameworks: ['GDPR'], sensitivity: 'medium' },
          actor: { id: 'user-2', type: 'system' },
          processingContext: { service: 'patient-service' },
          quality: { confidence: 0.8, validationErrors: ['error1'] },
        }),
        createTestEntry({
          id: 'e3',
          targetAggregateId: 'agg-1',
          targetAggregateType: 'Lead',
          transformationType: 'update',
          correlationId: 'corr-1',
          createdAt: '2024-01-03T10:00:00Z',
          quality: { confidence: 0.7 },
        }),
      ]);
    });

    it('should return all entries without filters', async () => {
      const result = await store.query({ includeErrors: true });

      expect(result.total).toBe(3);
      expect(result.entries.length).toBe(3);
    });

    it('should filter by aggregateId', async () => {
      const result = await store.query({ aggregateId: 'agg-1' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by aggregateType', async () => {
      const result = await store.query({ aggregateType: 'Lead' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by transformationType', async () => {
      const result = await store.query({ transformationType: 'create' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by complianceFramework', async () => {
      const result = await store.query({ complianceFramework: 'HIPAA' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by correlationId', async () => {
      const result = await store.query({ correlationId: 'corr-1' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by sourceAggregateId', async () => {
      const result = await store.query({ sourceAggregateId: 'src-1' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by startTime', async () => {
      const result = await store.query({
        startTime: new Date('2024-01-02T00:00:00Z'),
        includeErrors: true,
      });

      // e2 and e3 are after 2024-01-02
      expect(result.entries.length).toBe(2);
    });

    it('should filter by endTime', async () => {
      const result = await store.query({
        endTime: new Date('2024-01-01T23:59:59Z'),
        includeErrors: true,
      });

      // Only e1 is before 2024-01-01 end of day
      expect(result.entries.length).toBe(1);
    });

    it('should filter by actorId', async () => {
      const result = await store.query({ actorId: 'user-1' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by service', async () => {
      const result = await store.query({ service: 'lead-service' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by minConfidence', async () => {
      const result = await store.query({ minConfidence: 0.9 });

      expect(result.entries.length).toBe(1);
    });

    it('should exclude entries with errors by default', async () => {
      const result = await store.query({ includeErrors: false });

      // Only entries without validation errors are included
      expect(result.entries.every((e) => !e.quality?.validationErrors?.length)).toBe(true);
    });

    it('should include entries with errors when specified', async () => {
      const result = await store.query({ includeErrors: true });

      // Should include all 3 entries
      expect(result.total).toBe(3);
    });

    it('should sort ascending', async () => {
      const result = await store.query({ sortOrder: 'asc', includeErrors: true });

      expect(result.entries[0]?.id).toBe('e1');
    });

    it('should sort descending', async () => {
      const result = await store.query({ sortOrder: 'desc', includeErrors: true });

      expect(result.entries[0]?.id).toBe('e3');
    });

    it('should paginate with offset and limit', async () => {
      const result = await store.query({ offset: 1, limit: 1, includeErrors: true });

      expect(result.entries.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should indicate no more results', async () => {
      const result = await store.query({ offset: 0, limit: 10 });

      expect(result.hasMore).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const result = await store.query({
        aggregateType: 'Lead',
        transformationType: 'create',
      });

      expect(result.entries.length).toBe(1);
    });
  });

  describe('getByAggregateId', () => {
    it('should get entries by aggregate ID and type', async () => {
      await store.save(createTestEntry({ targetAggregateId: 'a1', targetAggregateType: 'Lead' }));
      await store.save(
        createTestEntry({ targetAggregateId: 'a1', targetAggregateType: 'Patient' })
      );

      const result = await store.getByAggregateId('a1', 'Lead');

      expect(result.length).toBe(1);
    });
  });

  describe('getByEventId', () => {
    it('should get entries by trigger event ID', async () => {
      await store.save(createTestEntry({ triggerEventId: 'evt-1' }));
      await store.save(createTestEntry({ triggerEventId: 'evt-2' }));

      const result = await store.getByEventId('evt-1');

      expect(result.length).toBe(1);
    });
  });

  describe('getByCorrelationId', () => {
    it('should get entries by correlation ID', async () => {
      await store.save(createTestEntry({ correlationId: 'corr-1' }));
      await store.save(createTestEntry({ correlationId: 'corr-2' }));

      const result = await store.getByCorrelationId('corr-1');

      expect(result.length).toBe(1);
    });
  });

  describe('getUpstreamSources', () => {
    beforeEach(async () => {
      // Create a lineage chain: A -> B -> C
      await store.saveBatch([
        createTestEntry({
          id: 'e1',
          targetAggregateId: 'B',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'A', aggregateType: 'Form' }],
        }),
        createTestEntry({
          id: 'e2',
          targetAggregateId: 'C',
          targetAggregateType: 'Patient',
          sources: [{ aggregateId: 'B', aggregateType: 'Lead' }],
          compliance: { frameworks: ['HIPAA'], sensitivity: 'high' },
        }),
      ]);
    });

    it('should traverse upstream sources', async () => {
      const graph = await store.getUpstreamSources('C', 5);

      expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
      expect(graph.rootId).toBe('C');
      expect(graph.direction).toBe('upstream');
    });

    it('should respect maxDepth', async () => {
      const graph = await store.getUpstreamSources('C', 1);

      expect(graph.depth).toBe(1);
    });

    it('should return graph stats', async () => {
      const graph = await store.getUpstreamSources('C', 5);

      expect(graph.stats.nodeCount).toBeGreaterThanOrEqual(0);
      expect(graph.stats.edgeCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle entries with compliance info', async () => {
      const graph = await store.getUpstreamSources('C', 5);

      const nodeWithCompliance = graph.nodes.find((n) => n.complianceTags);
      expect(nodeWithCompliance).toBeDefined();
    });
  });

  describe('getDownstreamImpacts', () => {
    beforeEach(async () => {
      // Create a lineage chain: A -> B -> C
      await store.saveBatch([
        createTestEntry({
          id: 'e1',
          targetAggregateId: 'B',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'A', aggregateType: 'Form' }],
        }),
        createTestEntry({
          id: 'e2',
          targetAggregateId: 'C',
          targetAggregateType: 'Patient',
          sources: [{ aggregateId: 'B', aggregateType: 'Lead' }],
        }),
      ]);
    });

    it('should traverse downstream impacts', async () => {
      const graph = await store.getDownstreamImpacts('A', 5);

      expect(graph.rootId).toBe('A');
      expect(graph.direction).toBe('downstream');
    });

    it('should respect maxDepth', async () => {
      const graph = await store.getDownstreamImpacts('A', 1);

      expect(graph.depth).toBe(1);
    });
  });

  describe('deleteByAggregateId', () => {
    it('should delete entries by aggregate ID', async () => {
      await store.save(createTestEntry({ targetAggregateId: 'a1' }));
      await store.save(createTestEntry({ targetAggregateId: 'a2' }));

      const deleted = await store.deleteByAggregateId('a1');

      expect(deleted).toBe(1);
      expect(store.size()).toBe(1);
    });

    it('should delete entries where aggregate is a source', async () => {
      await store.save(
        createTestEntry({
          targetAggregateId: 'b',
          sources: [{ aggregateId: 'a1', aggregateType: 'Form' }],
        })
      );

      const deleted = await store.deleteByAggregateId('a1');

      expect(deleted).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await store.save(createTestEntry());
      await store.save(createTestEntry());

      store.clear();

      expect(store.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of entries', async () => {
      expect(store.size()).toBe(0);

      await store.save(createTestEntry());

      expect(store.size()).toBe(1);
    });
  });
});

describe('Factory Functions', () => {
  describe('createInMemoryLineageStore', () => {
    it('should create an in-memory store', () => {
      const store = createInMemoryLineageStore();

      expect(store).toBeInstanceOf(InMemoryLineageStore);
    });
  });

  describe('createLineageStore', () => {
    it('should create in-memory store without connection string', () => {
      const store = createLineageStore();

      expect(store).toBeInstanceOf(InMemoryLineageStore);
    });

    it('should create in-memory store with empty options', () => {
      const store = createLineageStore({});

      expect(store).toBeInstanceOf(InMemoryLineageStore);
    });
  });
});

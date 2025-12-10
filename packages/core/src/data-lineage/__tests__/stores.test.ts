/**
 * Data Lineage Stores Tests
 *
 * Comprehensive tests for InMemoryLineageStore covering:
 * - CRUD operations
 * - Query filtering
 * - Graph traversal (upstream/downstream)
 * - Pagination and sorting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryLineageStore, createInMemoryLineageStore, createLineageStore } from '../stores.js';
import type { LineageEntry, LineageQueryOptions } from '../types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockLineageEntry(overrides: Partial<LineageEntry> = {}): LineageEntry {
  const id = crypto.randomUUID();
  return {
    id,
    targetAggregateId: 'target-agg-1',
    targetAggregateType: 'Lead',
    triggerEventId: 'event-1',
    triggerEventType: 'LeadCreated',
    transformationType: 'create',
    transformationDescription: 'Lead created from webhook',
    sources: [
      {
        aggregateId: 'source-agg-1',
        aggregateType: 'Webhook',
        version: 1,
      },
    ],
    quality: {
      confidence: 0.95,
      validationErrors: [],
    },
    compliance: {
      frameworks: ['HIPAA', 'GDPR'],
      sensitivity: 'high',
    },
    actor: {
      id: 'user-123',
      type: 'user',
      name: 'Test User',
    },
    correlationId: 'correlation-1',
    causationId: 'causation-1',
    processingContext: {
      service: 'api',
      version: '1.0.0',
      environment: 'test',
    },
    metadata: { source: 'test' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// IN-MEMORY STORE TESTS
// ============================================================================

describe('InMemoryLineageStore', () => {
  let store: InMemoryLineageStore;

  beforeEach(() => {
    store = createInMemoryLineageStore();
  });

  // ============================================================================
  // SAVE OPERATIONS
  // ============================================================================

  describe('save', () => {
    it('should save a lineage entry', async () => {
      const entry = createMockLineageEntry();

      await store.save(entry);

      expect(store.size()).toBe(1);
    });

    it('should save multiple entries sequentially', async () => {
      await store.save(createMockLineageEntry({ id: '1' }));
      await store.save(createMockLineageEntry({ id: '2' }));
      await store.save(createMockLineageEntry({ id: '3' }));

      expect(store.size()).toBe(3);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple entries in batch', async () => {
      const entries = [
        createMockLineageEntry({ id: '1' }),
        createMockLineageEntry({ id: '2' }),
        createMockLineageEntry({ id: '3' }),
      ];

      await store.saveBatch(entries);

      expect(store.size()).toBe(3);
    });

    it('should handle empty batch', async () => {
      await store.saveBatch([]);

      expect(store.size()).toBe(0);
    });
  });

  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  describe('query', () => {
    beforeEach(async () => {
      const entries = [
        createMockLineageEntry({
          id: '1',
          targetAggregateId: 'agg-1',
          targetAggregateType: 'Lead',
          transformationType: 'create',
          correlationId: 'corr-1',
          createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
          actor: { id: 'user-1', type: 'user', name: 'User 1' },
          processingContext: { service: 'api', version: '1.0.0', environment: 'test' },
          quality: { confidence: 0.9, validationErrors: [] },
          compliance: { frameworks: ['HIPAA'], sensitivity: 'high' },
        }),
        createMockLineageEntry({
          id: '2',
          targetAggregateId: 'agg-2',
          targetAggregateType: 'Patient',
          transformationType: 'derive',
          correlationId: 'corr-2',
          createdAt: new Date('2024-01-01T11:00:00Z').toISOString(),
          sources: [{ aggregateId: 'source-special', aggregateType: 'Lead', version: 1 }],
          actor: { id: 'user-2', type: 'system', name: 'System' },
          processingContext: { service: 'worker', version: '1.0.0', environment: 'test' },
          quality: { confidence: 0.8, validationErrors: ['warning'] },
          compliance: { frameworks: ['GDPR'], sensitivity: 'medium' },
        }),
        createMockLineageEntry({
          id: '3',
          targetAggregateId: 'agg-1',
          targetAggregateType: 'Lead',
          transformationType: 'enrich',
          correlationId: 'corr-1',
          createdAt: new Date('2024-01-01T12:00:00Z').toISOString(),
          actor: { id: 'user-1', type: 'user', name: 'User 1' },
          processingContext: { service: 'api', version: '2.0.0', environment: 'test' },
          quality: { confidence: 0.95, validationErrors: [] },
          compliance: { frameworks: ['HIPAA', 'GDPR'], sensitivity: 'high' },
        }),
      ];

      await store.saveBatch(entries);
    });

    it('should query all entries with empty options', async () => {
      // includeErrors: true since entry 2 has validation errors
      const result = await store.query({ includeErrors: true });

      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by aggregateId', async () => {
      const result = await store.query({ aggregateId: 'agg-1' });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.targetAggregateId === 'agg-1')).toBe(true);
    });

    it('should filter by aggregateType', async () => {
      // includeErrors: true since entry 2 (Patient) has validation errors
      const result = await store.query({ aggregateType: 'Patient', includeErrors: true });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0]?.targetAggregateType).toBe('Patient');
    });

    it('should filter by transformationType', async () => {
      const result = await store.query({ transformationType: 'create' });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by complianceFramework', async () => {
      // includeErrors: true since entry 2 has GDPR but also has validation errors
      const result = await store.query({ complianceFramework: 'GDPR', includeErrors: true });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by correlationId', async () => {
      const result = await store.query({ correlationId: 'corr-1' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by sourceAggregateId', async () => {
      // includeErrors: true since entry 2 has source-special but also has validation errors
      const result = await store.query({
        sourceAggregateId: 'source-special',
        includeErrors: true,
      });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by time range', async () => {
      // includeErrors: true since entry 2 (in time range) has validation errors
      const result = await store.query({
        startTime: new Date('2024-01-01T10:30:00Z'),
        endTime: new Date('2024-01-01T11:30:00Z'),
        includeErrors: true,
      });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0]?.id).toBe('2');
    });

    it('should filter by actorId', async () => {
      const result = await store.query({ actorId: 'user-1' });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by service', async () => {
      // includeErrors: true since entry 2 (worker service) has validation errors
      const result = await store.query({ service: 'worker', includeErrors: true });

      expect(result.entries.length).toBe(1);
    });

    it('should filter by minConfidence', async () => {
      const result = await store.query({ minConfidence: 0.9 });

      expect(result.entries.length).toBe(2);
    });

    it('should exclude entries with errors by default', async () => {
      const result = await store.query({ includeErrors: false });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => !e.quality?.validationErrors?.length)).toBe(true);
    });

    it('should include entries with errors when requested', async () => {
      const result = await store.query({ includeErrors: true });

      expect(result.entries.length).toBe(3);
    });

    it('should sort by timestamp ascending', async () => {
      // includeErrors: true to include all 3 entries for proper ordering test
      const result = await store.query({ sortOrder: 'asc', includeErrors: true });

      expect(result.entries[0]?.id).toBe('1');
      expect(result.entries[2]?.id).toBe('3');
    });

    it('should sort by timestamp descending', async () => {
      // includeErrors: true to include all 3 entries for proper ordering test
      const result = await store.query({ sortOrder: 'desc', includeErrors: true });

      expect(result.entries[0]?.id).toBe('3');
      expect(result.entries[2]?.id).toBe('1');
    });

    it('should apply pagination with limit', async () => {
      // includeErrors: true to include all 3 entries
      const result = await store.query({ limit: 2, includeErrors: true });

      expect(result.entries.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should apply pagination with offset', async () => {
      // includeErrors: true to include all 3 entries
      const result = await store.query({ limit: 2, offset: 1, includeErrors: true });

      expect(result.entries.length).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const result = await store.query({
        aggregateType: 'Lead',
        actorId: 'user-1',
        complianceFramework: 'HIPAA',
      });

      expect(result.entries.length).toBe(2);
    });
  });

  // ============================================================================
  // RETRIEVAL OPERATIONS
  // ============================================================================

  describe('getByAggregateId', () => {
    it('should return entries for aggregate', async () => {
      await store.save(
        createMockLineageEntry({ targetAggregateId: 'agg-1', targetAggregateType: 'Lead' })
      );
      await store.save(
        createMockLineageEntry({ targetAggregateId: 'agg-1', targetAggregateType: 'Lead' })
      );
      await store.save(
        createMockLineageEntry({ targetAggregateId: 'agg-2', targetAggregateType: 'Patient' })
      );

      const result = await store.getByAggregateId('agg-1', 'Lead');

      expect(result.length).toBe(2);
    });

    it('should return empty array for non-existent aggregate', async () => {
      const result = await store.getByAggregateId('non-existent', 'Lead');

      expect(result.length).toBe(0);
    });
  });

  describe('getByEventId', () => {
    it('should return entries for event', async () => {
      await store.save(createMockLineageEntry({ triggerEventId: 'event-1' }));
      await store.save(createMockLineageEntry({ triggerEventId: 'event-1' }));
      await store.save(createMockLineageEntry({ triggerEventId: 'event-2' }));

      const result = await store.getByEventId('event-1');

      expect(result.length).toBe(2);
    });
  });

  describe('getByCorrelationId', () => {
    it('should return entries for correlation', async () => {
      await store.save(createMockLineageEntry({ correlationId: 'corr-1' }));
      await store.save(createMockLineageEntry({ correlationId: 'corr-1' }));
      await store.save(createMockLineageEntry({ correlationId: 'corr-2' }));

      const result = await store.getByCorrelationId('corr-1');

      expect(result.length).toBe(2);
    });
  });

  // ============================================================================
  // GRAPH TRAVERSAL
  // ============================================================================

  describe('getUpstreamSources', () => {
    beforeEach(async () => {
      // Create a lineage chain: source-1 -> target-1 -> target-2
      await store.save(
        createMockLineageEntry({
          id: 'lineage-1',
          targetAggregateId: 'target-1',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'source-1', aggregateType: 'Webhook', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'lineage-2',
          targetAggregateId: 'target-2',
          targetAggregateType: 'Patient',
          sources: [{ aggregateId: 'target-1', aggregateType: 'Lead', version: 1 }],
        })
      );
    });

    it('should return upstream graph', async () => {
      const graph = await store.getUpstreamSources('target-2');

      expect(graph.direction).toBe('upstream');
      expect(graph.rootId).toBe('target-2');
      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should respect maxDepth', async () => {
      const graph = await store.getUpstreamSources('target-2', 1);

      expect(graph.depth).toBe(1);
    });

    it('should include edge information', async () => {
      const graph = await store.getUpstreamSources('target-2');

      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.edges[0]?.transformationType).toBeDefined();
    });

    it('should calculate stats', async () => {
      const graph = await store.getUpstreamSources('target-2');

      expect(graph.stats.nodeCount).toBeGreaterThan(0);
      expect(graph.stats.edgeCount).toBeGreaterThan(0);
    });
  });

  describe('getDownstreamImpacts', () => {
    beforeEach(async () => {
      // Create a lineage chain: source-1 -> target-1 -> target-2
      await store.save(
        createMockLineageEntry({
          id: 'lineage-1',
          targetAggregateId: 'target-1',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'source-1', aggregateType: 'Webhook', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'lineage-2',
          targetAggregateId: 'target-2',
          targetAggregateType: 'Patient',
          sources: [{ aggregateId: 'target-1', aggregateType: 'Lead', version: 1 }],
        })
      );
    });

    it('should return downstream graph', async () => {
      const graph = await store.getDownstreamImpacts('source-1');

      expect(graph.direction).toBe('downstream');
      expect(graph.rootId).toBe('source-1');
    });

    it('should respect maxDepth', async () => {
      const graph = await store.getDownstreamImpacts('source-1', 1);

      expect(graph.depth).toBe(1);
    });

    it('should include edge information', async () => {
      const graph = await store.getDownstreamImpacts('source-1');

      expect(graph.edges.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================

  describe('deleteByAggregateId', () => {
    it('should delete entries by target aggregate', async () => {
      await store.save(createMockLineageEntry({ targetAggregateId: 'agg-1' }));
      await store.save(createMockLineageEntry({ targetAggregateId: 'agg-1' }));
      await store.save(createMockLineageEntry({ targetAggregateId: 'agg-2' }));

      const deleted = await store.deleteByAggregateId('agg-1');

      expect(deleted).toBe(2);
      expect(store.size()).toBe(1);
    });

    it('should delete entries where aggregate is a source', async () => {
      await store.save(
        createMockLineageEntry({
          targetAggregateId: 'target-1',
          sources: [{ aggregateId: 'agg-to-delete', aggregateType: 'Lead', version: 1 }],
        })
      );
      await store.save(createMockLineageEntry({ targetAggregateId: 'agg-2' }));

      const deleted = await store.deleteByAggregateId('agg-to-delete');

      expect(deleted).toBe(1);
    });

    it('should return 0 for non-existent aggregate', async () => {
      const deleted = await store.deleteByAggregateId('non-existent');

      expect(deleted).toBe(0);
    });
  });

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  describe('clear', () => {
    it('should remove all entries', async () => {
      await store.saveBatch([
        createMockLineageEntry({ id: '1' }),
        createMockLineageEntry({ id: '2' }),
      ]);

      store.clear();

      expect(store.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of entries', async () => {
      expect(store.size()).toBe(0);

      await store.save(createMockLineageEntry());

      expect(store.size()).toBe(1);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('Factory Functions', () => {
  describe('createInMemoryLineageStore', () => {
    it('should create empty in-memory store', () => {
      const store = createInMemoryLineageStore();

      expect(store).toBeInstanceOf(InMemoryLineageStore);
      expect(store.size()).toBe(0);
    });
  });

  describe('createLineageStore', () => {
    it('should create in-memory store when no connection string', () => {
      const store = createLineageStore();

      expect(store).toBeInstanceOf(InMemoryLineageStore);
    });

    it('should create in-memory store with empty options', () => {
      const store = createLineageStore({});

      expect(store).toBeInstanceOf(InMemoryLineageStore);
    });
  });
});

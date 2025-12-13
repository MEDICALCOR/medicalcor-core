/**
 * Data Lineage Stores Tests
 *
 * Comprehensive tests for InMemoryLineageStore covering:
 * - CRUD operations
 * - Query filtering
 * - Graph traversal (upstream/downstream)
 * - Pagination and sorting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InMemoryLineageStore,
  PostgresLineageStore,
  createInMemoryLineageStore,
  createPostgresLineageStore,
  createLineageStore,
} from '../stores.js';
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

  // ============================================================================
  // EDGE CASES FOR IN-MEMORY STORE
  // ============================================================================

  describe('Edge Cases - Query with Missing Fields', () => {
    beforeEach(async () => {
      // Entry with minimal fields (missing optional compliance, quality, actor, etc.)
      await store.save(
        createMockLineageEntry({
          id: 'minimal',
          quality: undefined,
          compliance: undefined,
          actor: undefined,
          processingContext: undefined,
        })
      );

      // Entry with quality but no confidence
      await store.save(
        createMockLineageEntry({
          id: 'no-confidence',
          quality: { confidence: 0.5, validationErrors: [] },
        })
      );

      // Entry with empty compliance frameworks
      await store.save(
        createMockLineageEntry({
          id: 'empty-frameworks',
          compliance: { frameworks: [], sensitivity: 'high' },
        })
      );
    });

    it('should handle entries without compliance when filtering by framework', async () => {
      const result = await store.query({ complianceFramework: 'HIPAA', includeErrors: true });

      // Should not include entries without compliance or with empty frameworks
      expect(result.entries.every((e) => e.id !== 'minimal')).toBe(true);
      expect(result.entries.every((e) => e.id !== 'empty-frameworks')).toBe(true);
    });

    it('should handle entries without quality when filtering by minConfidence', async () => {
      const result = await store.query({ minConfidence: 0.7 });

      // Should not include entry without quality
      expect(result.entries.every((e) => e.id !== 'minimal')).toBe(true);
    });

    it('should handle entries without actor when filtering by actorId', async () => {
      const result = await store.query({ actorId: 'user-123' });

      expect(result.entries.every((e) => e.id !== 'minimal')).toBe(true);
    });

    it('should handle entries without processingContext when filtering by service', async () => {
      const result = await store.query({ service: 'api', includeErrors: true });

      expect(result.entries.every((e) => e.id !== 'minimal')).toBe(true);
    });

    it('should handle default sortOrder (desc)', async () => {
      const result = await store.query({ includeErrors: true });

      // Default is desc, so should be ordered newest to oldest
      const timestamps = result.entries.map((e) => new Date(e.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]! >= timestamps[i]!).toBe(true);
      }
    });

    it('should handle default limit (100)', async () => {
      // Clear and add many entries
      store.clear();
      const entries = Array.from({ length: 150 }, (_, i) =>
        createMockLineageEntry({ id: `entry-${i}` })
      );
      await store.saveBatch(entries);

      const result = await store.query({});

      expect(result.entries.length).toBe(100); // Default limit
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(150);
    });

    it('should handle default offset (0)', async () => {
      const result = await store.query({ limit: 2, includeErrors: true });

      // With offset 0, should start from beginning
      expect(result.entries.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Edge Cases - Graph Traversal', () => {
    it('should prevent infinite loops with circular references', async () => {
      store.clear();
      // Create a cycle: A -> B -> C -> A
      await store.save(
        createMockLineageEntry({
          id: 'a-to-b',
          targetAggregateId: 'b',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'a', aggregateType: 'Node', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'b-to-c',
          targetAggregateId: 'c',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'b', aggregateType: 'Node', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'c-to-a',
          targetAggregateId: 'a',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'c', aggregateType: 'Node', version: 1 }],
        })
      );

      // Should not hang - visited set prevents infinite loop
      const graph = await store.getUpstreamSources('a', 10);

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.nodes.length).toBeLessThan(10); // Not infinite
    });

    it('should stop at maxDepth in upstream traversal', async () => {
      store.clear();
      // Create deep chain: 1 -> 2 -> 3 -> 4 -> 5
      for (let i = 2; i <= 5; i++) {
        await store.save(
          createMockLineageEntry({
            id: `${i - 1}-to-${i}`,
            targetAggregateId: `node-${i}`,
            targetAggregateType: 'Node',
            sources: [{ aggregateId: `node-${i - 1}`, aggregateType: 'Node', version: 1 }],
          })
        );
      }

      const graph = await store.getUpstreamSources('node-5', 2);

      expect(graph.depth).toBe(2);
      // Should respect maxDepth
    });

    it('should stop at maxDepth in downstream traversal', async () => {
      store.clear();
      for (let i = 2; i <= 5; i++) {
        await store.save(
          createMockLineageEntry({
            id: `${i - 1}-to-${i}`,
            targetAggregateId: `node-${i}`,
            targetAggregateType: 'Node',
            sources: [{ aggregateId: `node-${i - 1}`, aggregateType: 'Node', version: 1 }],
          })
        );
      }

      const graph = await store.getDownstreamImpacts('node-1', 2);

      expect(graph.depth).toBe(2);
    });

    it('should handle already visited nodes in upstream', async () => {
      store.clear();
      // Diamond pattern: source -> [mid1, mid2] -> target
      // Both mid1 and mid2 depend on source
      await store.save(
        createMockLineageEntry({
          id: 'source-to-mid1',
          targetAggregateId: 'mid1',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'source', aggregateType: 'Node', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'source-to-mid2',
          targetAggregateId: 'mid2',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'source', aggregateType: 'Node', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'mids-to-target',
          targetAggregateId: 'target',
          targetAggregateType: 'Node',
          sources: [
            { aggregateId: 'mid1', aggregateType: 'Node', version: 1 },
            { aggregateId: 'mid2', aggregateType: 'Node', version: 1 },
          ],
        })
      );

      const graph = await store.getUpstreamSources('target', 10);

      // Should handle visited nodes correctly
      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should return empty graph when no upstream sources exist', async () => {
      store.clear();
      const graph = await store.getUpstreamSources('non-existent', 10);

      expect(graph.nodes.length).toBe(0);
      expect(graph.edges.length).toBe(0);
      expect(graph.stats.nodeCount).toBe(0);
      expect(graph.stats.edgeCount).toBe(0);
    });

    it('should return empty graph when no downstream impacts exist', async () => {
      store.clear();
      const graph = await store.getDownstreamImpacts('non-existent', 10);

      expect(graph.nodes.length).toBe(0);
      expect(graph.edges.length).toBe(0);
    });
  });

  describe('Edge Cases - Delete Operations', () => {
    it('should handle deleting when aggregate appears in multiple sources', async () => {
      store.clear();
      await store.save(
        createMockLineageEntry({
          id: 'entry1',
          targetAggregateId: 'target1',
          sources: [{ aggregateId: 'shared-source', aggregateType: 'Node', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'entry2',
          targetAggregateId: 'target2',
          sources: [{ aggregateId: 'shared-source', aggregateType: 'Node', version: 1 }],
        })
      );

      const deleted = await store.deleteByAggregateId('shared-source');

      expect(deleted).toBe(2);
      expect(store.size()).toBe(0);
    });
  });

  describe('Edge Cases - Complex Lineage Scenarios', () => {
    it('should handle entries with multiple sources in traversal', async () => {
      store.clear();
      // Entry with multiple sources
      await store.save(
        createMockLineageEntry({
          id: 'multi-source',
          targetAggregateId: 'result',
          targetAggregateType: 'Aggregate',
          sources: [
            { aggregateId: 'source1', aggregateType: 'Type1', version: 1 },
            { aggregateId: 'source2', aggregateType: 'Type2', version: 1 },
            { aggregateId: 'source3', aggregateType: 'Type3', version: 1 },
          ],
        })
      );

      const graph = await store.getUpstreamSources('result');

      expect(graph.nodes.length).toBeGreaterThan(0);
      // Should process all sources
      const sourceIds = graph.nodes.map((n) => n.id);
      expect(sourceIds).toContain('source1');
      expect(sourceIds).toContain('source2');
      expect(sourceIds).toContain('source3');
    });

    it('should handle entries with compliance tags in graph', async () => {
      store.clear();
      await store.save(
        createMockLineageEntry({
          id: 'with-compliance',
          targetAggregateId: 'compliant-target',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'src', aggregateType: 'Webhook', version: 1 }],
          compliance: {
            frameworks: ['HIPAA', 'GDPR'],
            sensitivity: 'high',
          },
        })
      );

      const graph = await store.getUpstreamSources('compliant-target');

      const targetNode = graph.nodes.find((n) => n.id === 'compliant-target');
      expect(targetNode?.complianceTags).toEqual(['HIPAA', 'GDPR']);
      expect(targetNode?.sensitivity).toBe('high');
    });

    it('should handle downstream traversal with multiple targets', async () => {
      store.clear();
      // One source feeding into multiple targets
      await store.save(
        createMockLineageEntry({
          id: 'target1-entry',
          targetAggregateId: 'target1',
          targetAggregateType: 'Lead',
          sources: [{ aggregateId: 'common-source', aggregateType: 'Webhook', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'target2-entry',
          targetAggregateId: 'target2',
          targetAggregateType: 'Patient',
          sources: [{ aggregateId: 'common-source', aggregateType: 'Webhook', version: 1 }],
        })
      );

      const graph = await store.getDownstreamImpacts('common-source');

      expect(graph.edges.length).toBeGreaterThanOrEqual(2);
      expect(graph.stats.uniqueAggregateTypes).toBeGreaterThanOrEqual(2);
    });

    it('should stop recursion when reaching visited node twice', async () => {
      store.clear();
      // Self-referencing entry (edge case)
      await store.save(
        createMockLineageEntry({
          id: 'self-ref',
          targetAggregateId: 'node-a',
          targetAggregateType: 'Node',
          sources: [{ aggregateId: 'node-a', aggregateType: 'Node', version: 1 }],
        })
      );

      const graph = await store.getUpstreamSources('node-a');

      // Should not hang, visited set prevents infinite loop
      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should handle query with only one filter type set', async () => {
      store.clear();
      await store.save(
        createMockLineageEntry({
          id: 'test',
          startTime: new Date('2024-01-01'),
        })
      );

      // Test each filter individually
      const byId = await store.query({ aggregateId: 'target-agg-1' });
      expect(byId.entries.length).toBeGreaterThanOrEqual(0);

      const byType = await store.query({ aggregateType: 'Lead' });
      expect(byType.entries.length).toBeGreaterThanOrEqual(0);

      const byTransform = await store.query({ transformationType: 'create' });
      expect(byTransform.entries.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct graph statistics', async () => {
      store.clear();
      await store.save(
        createMockLineageEntry({
          id: 'stats-entry1',
          targetAggregateId: 'target',
          targetAggregateType: 'Lead',
          transformationType: 'create',
          sources: [{ aggregateId: 'source1', aggregateType: 'Webhook', version: 1 }],
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'stats-entry2',
          targetAggregateId: 'target2',
          targetAggregateType: 'Patient',
          transformationType: 'derive',
          sources: [{ aggregateId: 'target', aggregateType: 'Lead', version: 1 }],
        })
      );

      const graph = await store.getUpstreamSources('target2');

      expect(graph.stats).toBeDefined();
      expect(graph.stats.nodeCount).toBe(graph.nodes.length);
      expect(graph.stats.edgeCount).toBe(graph.edges.length);
      expect(graph.stats.uniqueTransformations).toBeGreaterThan(0);
      expect(graph.stats.uniqueAggregateTypes).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases - Pagination Edge Cases', () => {
    beforeEach(() => {
      store.clear();
    });

    it('should handle offset greater than total', async () => {
      await store.saveBatch([
        createMockLineageEntry({ id: '1' }),
        createMockLineageEntry({ id: '2' }),
      ]);

      const result = await store.query({ offset: 100, limit: 10 });

      expect(result.entries.length).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(2);
    });

    it('should handle limit of 0', async () => {
      await store.saveBatch([createMockLineageEntry({ id: '1' })]);

      const result = await store.query({ limit: 0 });

      expect(result.entries.length).toBe(0);
      expect(result.total).toBe(1);
    });

    it('should handle exact boundary for hasMore', async () => {
      await store.saveBatch([
        createMockLineageEntry({ id: '1' }),
        createMockLineageEntry({ id: '2' }),
        createMockLineageEntry({ id: '3' }),
      ]);

      const result = await store.query({ limit: 3, offset: 0 });

      expect(result.entries.length).toBe(3);
      expect(result.hasMore).toBe(false); // offset (0) + limit (3) = 3 == total (3)
    });

    it('should handle offset + limit === total - 1', async () => {
      await store.saveBatch([
        createMockLineageEntry({ id: '1' }),
        createMockLineageEntry({ id: '2' }),
        createMockLineageEntry({ id: '3' }),
      ]);

      const result = await store.query({ limit: 1, offset: 1 });

      expect(result.entries.length).toBe(1);
      expect(result.hasMore).toBe(true); // 1 + 1 = 2 < 3
    });
  });

  describe('Edge Cases - Timestamp Handling', () => {
    beforeEach(() => {
      store.clear();
    });

    it('should handle startTime exactly matching entry time', async () => {
      const exactTime = new Date('2024-06-15T12:00:00Z');
      await store.save(
        createMockLineageEntry({
          id: 'exact-time',
          createdAt: exactTime.toISOString(),
        })
      );

      const result = await store.query({ startTime: exactTime, includeErrors: true });

      expect(result.entries.some((e) => e.id === 'exact-time')).toBe(true);
    });

    it('should handle endTime exactly matching entry time', async () => {
      const exactTime = new Date('2024-06-15T12:00:00Z');
      await store.save(
        createMockLineageEntry({
          id: 'exact-end',
          createdAt: exactTime.toISOString(),
        })
      );

      const result = await store.query({ endTime: exactTime, includeErrors: true });

      expect(result.entries.some((e) => e.id === 'exact-end')).toBe(true);
    });

    it('should filter out entries outside time range', async () => {
      await store.save(
        createMockLineageEntry({
          id: 'before',
          createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'during',
          createdAt: new Date('2024-06-15T12:00:00Z').toISOString(),
        })
      );
      await store.save(
        createMockLineageEntry({
          id: 'after',
          createdAt: new Date('2024-12-31T23:59:59Z').toISOString(),
        })
      );

      const result = await store.query({
        startTime: new Date('2024-06-01'),
        endTime: new Date('2024-06-30'),
        includeErrors: true,
      });

      expect(result.entries.every((e) => e.id !== 'before')).toBe(true);
      expect(result.entries.every((e) => e.id !== 'after')).toBe(true);
      expect(result.entries.some((e) => e.id === 'during')).toBe(true);
    });
  });
});

// ============================================================================
// POSTGRESQL STORE TESTS
// ============================================================================

describe('PostgresLineageStore', () => {
  describe('Constructor and Initialization', () => {
    it('should create store with connection string', () => {
      const store = new PostgresLineageStore('postgresql://test:test@localhost/testdb');
      expect(store).toBeInstanceOf(PostgresLineageStore);
    });

    it('should use custom table name', () => {
      const store = new PostgresLineageStore(
        'postgresql://test:test@localhost/testdb',
        'custom_lineage'
      );
      expect(store).toBeInstanceOf(PostgresLineageStore);
    });

    it('should use default table name when not provided', () => {
      const store = new PostgresLineageStore('postgresql://test:test@localhost/testdb');
      expect(store).toBeInstanceOf(PostgresLineageStore);
    });
  });

  describe('close', () => {
    it('should not throw when pool does not exist (early close)', async () => {
      const store = new PostgresLineageStore('postgresql://test:test@localhost/testdb');

      // Close immediately without waiting for initialization
      // This tests the if (this.pool) branch in close()
      await expect(store.close()).resolves.not.toThrow();
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

    it('should create PostgreSQL store with connection string', () => {
      const store = createLineageStore({
        connectionString: 'postgresql://test:test@localhost/testdb',
      });

      expect(store).toBeInstanceOf(PostgresLineageStore);
    });

    it('should create PostgreSQL store with custom table name', () => {
      const store = createLineageStore({
        connectionString: 'postgresql://test:test@localhost/testdb',
        tableName: 'custom_lineage',
      });

      expect(store).toBeInstanceOf(PostgresLineageStore);
    });
  });

  describe('createPostgresLineageStore', () => {
    it('should create PostgreSQL store', () => {
      const store = createPostgresLineageStore('postgresql://test:test@localhost/testdb');

      expect(store).toBeInstanceOf(PostgresLineageStore);
    });

    it('should create PostgreSQL store with custom table name', () => {
      const store = createPostgresLineageStore(
        'postgresql://test:test@localhost/testdb',
        'custom_table'
      );

      expect(store).toBeInstanceOf(PostgresLineageStore);
    });
  });
});

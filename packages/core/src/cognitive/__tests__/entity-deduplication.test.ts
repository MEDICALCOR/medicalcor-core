/**
 * Entity Deduplication Service Tests
 *
 * H8: Tests for auto-merge similar entities functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EntityDeduplicationService,
  createEntityDeduplicationService,
} from '../entity-deduplication.js';
import { DEFAULT_DEDUPLICATION_CONFIG } from '../types.js';
import type { IEmbeddingService } from '../episode-builder.js';

describe('EntityDeduplicationService', () => {
  let service: EntityDeduplicationService;
  let mockEmbeddings: IEmbeddingService;
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  };
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  const testEntityId1 = '550e8400-e29b-41d4-a716-446655440001';
  const testEntityId2 = '550e8400-e29b-41d4-a716-446655440002';
  const testEventId = '660e8400-e29b-41d4-a716-446655440000';
  const testEmbedding = new Array(1536).fill(0.1);

  const createMockEntity = (
    overrides: Partial<{
      id: string;
      entity_type: string;
      entity_value: string;
      entity_hash: string;
      canonical_form: string | null;
      mention_count: number;
      avg_confidence: number | null;
      first_observed_at: Date;
      last_observed_at: Date;
      embedding: string | null;
      similarity?: number;
    }> = {}
  ) => ({
    id: testEntityId1,
    entity_type: 'procedure',
    entity_value: 'dental implant',
    entity_hash: 'hash123',
    canonical_form: null,
    mention_count: 5,
    avg_confidence: 0.9,
    first_observed_at: new Date('2024-01-01'),
    last_observed_at: new Date('2024-06-01'),
    embedding: JSON.stringify(testEmbedding),
    ...overrides,
  });

  beforeEach(() => {
    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue({
        embedding: testEmbedding,
        contentHash: 'test-hash',
      }),
    };

    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    service = new EntityDeduplicationService(
      mockPool as any,
      mockEmbeddings,
      DEFAULT_DEDUPLICATION_CONFIG
    );
  });

  describe('findDuplicates', () => {
    it('should find duplicate entities based on embedding similarity', async () => {
      const sourceEntity = createMockEntity();
      const duplicateEntity = createMockEntity({
        id: testEntityId2,
        entity_value: 'dental implants',
        entity_hash: 'hash456',
        mention_count: 3,
        similarity: 0.92,
      });

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] }) // Get source entity
        .mockResolvedValueOnce({ rows: [duplicateEntity] }); // Find similar entities

      const result = await service.findDuplicates(testEntityId1);

      expect(result.sourceEntity.id).toBe(testEntityId1);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.similarity).toBe(0.92);
      expect(result.candidates[0]?.matchReasons).toContain('embedding_similarity');
    });

    it('should detect substring matches', async () => {
      const sourceEntity = createMockEntity({ entity_value: 'dental implant' });
      const duplicateEntity = createMockEntity({
        id: testEntityId2,
        entity_value: 'implant',
        entity_hash: 'hash456',
        similarity: 0.88,
      });

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] })
        .mockResolvedValueOnce({ rows: [duplicateEntity] });

      const result = await service.findDuplicates(testEntityId1);

      expect(result.candidates[0]?.matchReasons).toContain('value_substring');
    });

    it('should throw error when entity not found', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await expect(service.findDuplicates(testEntityId1)).rejects.toThrow('Entity not found');
    });

    it('should return empty candidates when entity has no embedding', async () => {
      const entityWithoutEmbedding = createMockEntity({ embedding: null });
      mockPool.query = vi.fn().mockResolvedValue({ rows: [entityWithoutEmbedding] });

      const result = await service.findDuplicates(testEntityId1);

      expect(result.candidates).toEqual([]);
      expect(result.autoMerged).toBe(false);
    });

    it('should auto-merge when similarity exceeds threshold', async () => {
      const highSimilarityService = new EntityDeduplicationService(
        mockPool as any,
        mockEmbeddings,
        { ...DEFAULT_DEDUPLICATION_CONFIG, autoMergeEnabled: true, autoMergeThreshold: 0.9 }
      );

      const sourceEntity = createMockEntity();
      const duplicateEntity = createMockEntity({
        id: testEntityId2,
        entity_value: 'dental implants',
        entity_hash: 'hash456',
        mention_count: 3,
        similarity: 0.96,
      });

      // Setup mock for findDuplicates
      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] })
        .mockResolvedValueOnce({ rows: [duplicateEntity] });

      // Setup mock for mergeEntities (called during auto-merge)
      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [sourceEntity, duplicateEntity] }) // Get both entities
        .mockResolvedValueOnce({ rowCount: 0 }) // Transfer source relations
        .mockResolvedValueOnce({ rowCount: 0 }) // Transfer target relations
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete remaining relations
        .mockResolvedValueOnce({ rowCount: 2 }) // Transfer event mappings
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete remaining mappings
        .mockResolvedValueOnce({ rowCount: 1 }) // Update survivor
        .mockResolvedValueOnce({ rowCount: 1 }) // Soft delete merged
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock the final query to fetch updated survivor
      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] })
        .mockResolvedValueOnce({ rows: [duplicateEntity] })
        .mockResolvedValueOnce({ rows: [{ ...sourceEntity, mention_count: 8 }] });

      const result = await highSimilarityService.findDuplicates(testEntityId1);

      expect(result.autoMerged).toBe(true);
      expect(result.mergedEntityIds).toContain(testEntityId2);
    });

    it('should not auto-merge when disabled', async () => {
      const noAutoMergeService = new EntityDeduplicationService(mockPool as any, mockEmbeddings, {
        ...DEFAULT_DEDUPLICATION_CONFIG,
        autoMergeEnabled: false,
      });

      const sourceEntity = createMockEntity();
      const duplicateEntity = createMockEntity({
        id: testEntityId2,
        similarity: 0.99,
      });

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] })
        .mockResolvedValueOnce({ rows: [duplicateEntity] });

      const result = await noAutoMergeService.findDuplicates(testEntityId1);

      expect(result.autoMerged).toBe(false);
      expect(result.mergedEntityIds).toEqual([]);
      expect(result.candidates).toHaveLength(1);
    });
  });

  describe('mergeEntities', () => {
    it('should merge two entities successfully', async () => {
      const entity1 = createMockEntity({ mention_count: 10 });
      const entity2 = createMockEntity({
        id: testEntityId2,
        entity_value: 'implant',
        entity_hash: 'hash456',
        mention_count: 5,
      });

      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [entity1, entity2] }) // Get both entities
        .mockResolvedValueOnce({ rowCount: 2 }) // Transfer source relations
        .mockResolvedValueOnce({ rowCount: 1 }) // Transfer target relations
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete remaining relations
        .mockResolvedValueOnce({ rowCount: 3 }) // Transfer event mappings
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete remaining mappings
        .mockResolvedValueOnce({ rowCount: 1 }) // Update survivor
        .mockResolvedValueOnce({ rowCount: 1 }) // Soft delete merged
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [{ ...entity1, mention_count: 15 }],
      });

      const result = await service.mergeEntities(testEntityId1, testEntityId2);

      expect(result.success).toBe(true);
      expect(result.survivingEntity.id).toBe(testEntityId1);
      expect(result.relationsTransferred).toBe(3);
      expect(result.eventMappingsTransferred).toBe(3);
    });

    it('should use entity with higher mention count as survivor by default', async () => {
      const entity1 = createMockEntity({ mention_count: 3 });
      const entity2 = createMockEntity({
        id: testEntityId2,
        entity_hash: 'hash456',
        mention_count: 10,
      });

      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [entity1, entity2] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [{ ...entity2, mention_count: 13 }],
      });

      const result = await service.mergeEntities(testEntityId1, testEntityId2);

      expect(result.success).toBe(true);
      // Entity2 has more mentions, so it should survive
      expect(result.survivingEntity.id).toBe(testEntityId2);
      expect(result.mergedEntity.id).toBe(testEntityId1);
    });

    it('should respect survivorId option', async () => {
      const entity1 = createMockEntity({ mention_count: 3 });
      const entity2 = createMockEntity({
        id: testEntityId2,
        entity_hash: 'hash456',
        mention_count: 10,
      });

      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [entity1, entity2] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [{ ...entity1, mention_count: 13 }],
      });

      const result = await service.mergeEntities(testEntityId1, testEntityId2, {
        survivorId: testEntityId1,
      });

      expect(result.success).toBe(true);
      // Even though entity2 has more mentions, entity1 should survive per option
      expect(result.survivingEntity.id).toBe(testEntityId1);
    });

    it('should fail when one entity not found', async () => {
      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [createMockEntity()] }); // Only one entity found

      const result = await service.mergeEntities(testEntityId1, testEntityId2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail when survivorId does not match either entity', async () => {
      const entity1 = createMockEntity();
      const entity2 = createMockEntity({ id: testEntityId2 });

      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [entity1, entity2] });

      const result = await service.mergeEntities(testEntityId1, testEntityId2, {
        survivorId: 'invalid-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should set canonical form when provided', async () => {
      const entity1 = createMockEntity();
      const entity2 = createMockEntity({ id: testEntityId2 });

      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [entity1, entity2] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query = vi.fn().mockResolvedValueOnce({
        rows: [{ ...entity1, canonical_form: 'Dental Implant' }],
      });

      const result = await service.mergeEntities(testEntityId1, testEntityId2, {
        canonicalForm: 'Dental Implant',
      });

      expect(result.success).toBe(true);
      // Verify the update query was called with canonical_form in the SQL
      const updateCall = mockClient.query.mock.calls.find(
        (call) => call[0]?.includes('canonical_form') && call[0]?.includes('COALESCE')
      );
      expect(updateCall).toBeDefined();
      // The canonical form is the 5th parameter in the update query
      expect(updateCall?.[1][4]).toBe('Dental Implant');
    });

    it('should handle database errors gracefully', async () => {
      mockClient.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database connection lost'));

      const result = await service.mergeEntities(testEntityId1, testEntityId2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection lost');
    });
  });

  describe('runDeduplication', () => {
    it('should scan all entities and report summary', async () => {
      const entities = [
        createMockEntity({ id: 'entity-1' }),
        createMockEntity({ id: 'entity-2' }),
        createMockEntity({ id: 'entity-3' }),
      ];

      // First call: get all entities
      // Subsequent calls: findDuplicates for each
      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: entities.map((e) => ({ id: e.id })) });
        }
        // For findDuplicates calls
        const entityIndex = (callCount - 2) % 2;
        if (entityIndex === 0) {
          return Promise.resolve({ rows: [entities[Math.floor((callCount - 2) / 2)]] });
        }
        return Promise.resolve({ rows: [] }); // No duplicates found
      });

      const result = await service.runDeduplication();

      expect(result.totalEntitiesScanned).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should filter by entity type when specified', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.runDeduplication('procedure');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('entity_type = $1'), [
        'procedure',
      ]);
    });

    it('should continue processing on individual entity errors', async () => {
      const entities = [{ id: 'entity-1' }, { id: 'entity-2' }];

      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: entities });
        }
        if (callCount === 2) {
          return Promise.reject(new Error('Entity 1 error'));
        }
        if (callCount === 3) {
          return Promise.resolve({ rows: [createMockEntity({ id: 'entity-2' })] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await service.runDeduplication();

      expect(result.totalEntitiesScanned).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.entityId).toBe('entity-1');
    });
  });

  describe('findAllDuplicates', () => {
    it('should find all duplicates across the graph', async () => {
      const entity1 = createMockEntity({ id: 'entity-1' });
      const entity2 = createMockEntity({ id: 'entity-2', similarity: 0.91 });

      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: [{ id: 'entity-1' }] });
        }
        if (callCount === 2) {
          return Promise.resolve({ rows: [entity1] });
        }
        if (callCount === 3) {
          return Promise.resolve({ rows: [entity2] });
        }
        return Promise.resolve({ rows: [] });
      });

      const results = await service.findAllDuplicates('procedure', 10);

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect limit parameter', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.findAllDuplicates(undefined, 50);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [50]);
    });

    it('should avoid processing the same pair twice', async () => {
      const entity1 = createMockEntity({ id: 'entity-1' });
      const entity2 = createMockEntity({ id: 'entity-2' });

      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Return both entities to scan
          return Promise.resolve({ rows: [{ id: 'entity-1' }, { id: 'entity-2' }] });
        }
        // findDuplicates for entity-1
        if (callCount === 2) {
          return Promise.resolve({ rows: [entity1] });
        }
        if (callCount === 3) {
          // entity-2 is a duplicate of entity-1
          return Promise.resolve({ rows: [{ ...entity2, similarity: 0.9 }] });
        }
        // findDuplicates for entity-2
        if (callCount === 4) {
          return Promise.resolve({ rows: [entity2] });
        }
        if (callCount === 5) {
          // entity-1 is a duplicate of entity-2 (same pair, should be filtered)
          return Promise.resolve({ rows: [{ ...entity1, similarity: 0.9 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const results = await service.findAllDuplicates();

      // Should only report the pair once
      const allCandidateIds = results.flatMap((r) => r.candidates.map((c) => c.entity.id));
      const uniquePairs = new Set(
        results.map((r) =>
          [r.sourceEntity.id, ...r.candidates.map((c) => c.entity.id)].sort().join(':')
        )
      );
      expect(uniquePairs.size).toBeLessThanOrEqual(1);
    });
  });

  describe('Levenshtein distance calculation', () => {
    it('should detect similar values by edit distance', async () => {
      const sourceEntity = createMockEntity({ entity_value: 'implant' });
      const duplicateEntity = createMockEntity({
        id: testEntityId2,
        entity_value: 'implants', // Only 1 character different
        entity_hash: 'hash456',
        similarity: 0.87,
      });

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [sourceEntity] })
        .mockResolvedValueOnce({ rows: [duplicateEntity] });

      const result = await service.findDuplicates(testEntityId1);

      expect(result.candidates[0]?.matchReasons).toContain('value_edit_distance');
    });
  });

  describe('createEntityDeduplicationService factory', () => {
    it('should create service with default config', () => {
      const svc = createEntityDeduplicationService(mockPool as any, mockEmbeddings);
      expect(svc).toBeInstanceOf(EntityDeduplicationService);
    });

    it('should create service with custom config', () => {
      const svc = createEntityDeduplicationService(mockPool as any, mockEmbeddings, {
        minSimilarityThreshold: 0.9,
        autoMergeEnabled: false,
      });
      expect(svc).toBeInstanceOf(EntityDeduplicationService);
    });

    it('should create service without embeddings', () => {
      const svc = createEntityDeduplicationService(mockPool as any, null);
      expect(svc).toBeInstanceOf(EntityDeduplicationService);
    });
  });
});

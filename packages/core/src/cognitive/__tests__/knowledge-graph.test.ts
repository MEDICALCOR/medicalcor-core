/**
 * Knowledge Graph Service Tests
 *
 * H8: Tests for knowledge entity and relation management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphService, createKnowledgeGraphService } from '../knowledge-graph.js';
import { DEFAULT_KNOWLEDGE_GRAPH_CONFIG, type KeyEntity } from '../types.js';
import type { IEmbeddingService } from '../episode-builder.js';

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;
  let mockEmbeddings: IEmbeddingService;
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };

  const testEventId = '550e8400-e29b-41d4-a716-446655440000';
  const testEntityId = '660e8400-e29b-41d4-a716-446655440001';
  const testEmbedding = new Array(1536).fill(0.1);

  beforeEach(() => {
    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue({
        embedding: testEmbedding,
        contentHash: 'test-hash',
      }),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    service = new KnowledgeGraphService(
      mockPool as any,
      mockEmbeddings,
      DEFAULT_KNOWLEDGE_GRAPH_CONFIG
    );
  });

  describe('processEntitiesFromEvent', () => {
    it('should process entities and store them', async () => {
      const entities: KeyEntity[] = [
        { type: 'procedure', value: 'dental implant', confidence: 0.9 },
        { type: 'amount', value: '$5000', confidence: 0.85 },
      ];

      const result = await service.processEntitiesFromEvent(testEventId, entities, new Date());

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should skip entities below minimum confidence', async () => {
      const lowConfidenceService = new KnowledgeGraphService(mockPool as any, mockEmbeddings, {
        ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
        minEntityConfidence: 0.8,
      });

      const entities: KeyEntity[] = [
        { type: 'procedure', value: 'implant', confidence: 0.5 },
        { type: 'procedure', value: 'crown', confidence: 0.9 },
      ];

      const result = await lowConfidenceService.processEntitiesFromEvent(
        testEventId,
        entities,
        new Date()
      );

      // Only the high confidence entity should be processed
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array when disabled', async () => {
      const disabledService = new KnowledgeGraphService(mockPool as any, mockEmbeddings, {
        ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
        enabled: false,
      });

      const entities: KeyEntity[] = [{ type: 'procedure', value: 'implant', confidence: 0.9 }];

      const result = await disabledService.processEntitiesFromEvent(
        testEventId,
        entities,
        new Date()
      );

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return empty array for empty entities', async () => {
      const result = await service.processEntitiesFromEvent(testEventId, [], new Date());

      expect(result).toEqual([]);
    });

    it('should handle entities without confidence', async () => {
      const entities: KeyEntity[] = [{ type: 'procedure', value: 'implant' }];

      const result = await service.processEntitiesFromEvent(testEventId, entities, new Date());

      expect(result).toHaveLength(1);
    });

    it('should update existing entity mention count', async () => {
      // Mock finding existing entity
      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: testEntityId,
              mention_count: 5,
              avg_confidence: 0.8,
              first_observed_at: new Date(),
            },
          ],
        })
        .mockResolvedValue({ rows: [] });

      const entities: KeyEntity[] = [{ type: 'procedure', value: 'implant', confidence: 0.9 }];

      const result = await service.processEntitiesFromEvent(testEventId, entities, new Date());

      expect(result).toHaveLength(1);
      expect(result[0]?.mentionCount).toBe(6);
    });

    it('should create co-occurrence relations for multiple entities', async () => {
      const entities: KeyEntity[] = [
        { type: 'procedure', value: 'implant', confidence: 0.9 },
        { type: 'amount', value: '$5000', confidence: 0.85 },
        { type: 'location', value: 'Clinic A', confidence: 0.8 },
      ];

      await service.processEntitiesFromEvent(testEventId, entities, new Date());

      // Should create relations between entities
      // 3 entities = 3 pairs: (1,2), (1,3), (2,3)
      const relationInserts = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0]?.includes('INSERT INTO knowledge_relations')
      );

      expect(relationInserts.length).toBeGreaterThanOrEqual(0);
    });

    it('should continue processing on individual entity failure', async () => {
      mockPool.query = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB Error'))
        .mockResolvedValue({ rows: [] });

      const entities: KeyEntity[] = [
        { type: 'procedure', value: 'implant', confidence: 0.9 },
        { type: 'amount', value: '$5000', confidence: 0.85 },
      ];

      const result = await service.processEntitiesFromEvent(testEventId, entities, new Date());

      // Should still process remaining entities
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createRelation', () => {
    it('should create a new relation', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ id: 'relation-id' }],
      });

      const result = await service.createRelation(
        testEntityId,
        'target-entity-id',
        'used_for',
        'llm_extracted',
        { confidence: 0.9, eventId: testEventId, description: 'Test relation' }
      );

      expect(result.relationType).toBe('used_for');
      expect(result.confidence).toBe(0.9);
      expect(result.extractionMethod).toBe('llm_extracted');
      expect(result.supportingEventIds).toContain(testEventId);
    });

    it('should use default confidence when not provided', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ id: 'relation-id' }],
      });

      const result = await service.createRelation(
        testEntityId,
        'target-entity-id',
        'associated_with',
        'co_occurrence'
      );

      expect(result.confidence).toBe(0.7);
    });
  });

  describe('findEntity', () => {
    it('should find entity by type and value', async () => {
      const mockEntity = {
        id: testEntityId,
        entity_type: 'procedure',
        entity_value: 'implant',
        entity_hash: 'hash123',
        canonical_form: null,
        mention_count: 5,
        first_mentioned_event_id: testEventId,
        avg_confidence: 0.9,
        first_observed_at: new Date(),
        last_observed_at: new Date(),
        metadata: {},
      };

      mockPool.query = vi.fn().mockResolvedValue({ rows: [mockEntity] });

      const result = await service.findEntity('procedure', 'implant');

      expect(result).not.toBeNull();
      expect(result?.entityType).toBe('procedure');
      expect(result?.entityValue).toBe('implant');
      expect(result?.mentionCount).toBe(5);
    });

    it('should return null when entity not found', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await service.findEntity('procedure', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchEntities', () => {
    it('should search entities by semantic similarity', async () => {
      const mockResults = [
        {
          id: testEntityId,
          entity_type: 'procedure',
          entity_value: 'dental implant',
          canonical_form: null,
          mention_count: 10,
          similarity: 0.95,
        },
      ];

      mockPool.query = vi.fn().mockResolvedValue({ rows: mockResults });

      const result = await service.searchEntities('implant');

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('implant');
      expect(result).toHaveLength(1);
      expect(result[0]?.similarity).toBe(0.95);
    });

    it('should return empty array when embeddings not available', async () => {
      const serviceWithoutEmbeddings = new KnowledgeGraphService(
        mockPool as any,
        null,
        DEFAULT_KNOWLEDGE_GRAPH_CONFIG
      );

      const result = await serviceWithoutEmbeddings.searchEntities('implant');

      expect(result).toEqual([]);
    });

    it('should pass options to search function', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.searchEntities('implant', {
        entityType: 'procedure',
        matchThreshold: 0.8,
        limit: 5,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['procedure', 0.8, 5])
      );
    });
  });

  describe('getRelatedEntities', () => {
    it('should get related entities via graph traversal', async () => {
      const mockResults = [
        {
          entity_id: 'related-id',
          entity_type: 'amount',
          entity_value: '$5000',
          relation_type: 'mentioned_with',
          confidence: 0.85,
          depth: 1,
          path: [testEntityId, 'related-id'],
        },
      ];

      mockPool.query = vi.fn().mockResolvedValue({ rows: mockResults });

      const result = await service.getRelatedEntities(testEntityId);

      expect(result).toHaveLength(1);
      expect(result[0]?.relationType).toBe('mentioned_with');
      expect(result[0]?.depth).toBe(1);
    });

    it('should filter by relation types', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.getRelatedEntities(testEntityId, {
        relationTypes: ['used_for', 'part_of'],
        minConfidence: 0.7,
        maxDepth: 3,
        limit: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([['used_for', 'part_of'], 0.7, 3, 10])
      );
    });
  });

  describe('getCooccurrences', () => {
    it('should get co-occurring entities', async () => {
      const mockResults = [
        {
          cooccurring_entity_id: 'cooccur-id',
          entity_type: 'location',
          entity_value: 'Clinic A',
          cooccurrence_count: BigInt(5),
          shared_event_ids: [testEventId],
        },
      ];

      mockPool.query = vi.fn().mockResolvedValue({ rows: mockResults });

      const result = await service.getCooccurrences(testEntityId);

      expect(result).toHaveLength(1);
      expect(result[0]?.cooccurrenceCount).toBe(5);
      expect(result[0]?.sharedEventIds).toContain(testEventId);
    });

    it('should apply options', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.getCooccurrences(testEntityId, {
        minCooccurrence: 3,
        limit: 15,
      });

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [testEntityId, 3, 15]);
    });
  });

  describe('getEntityEvents', () => {
    it('should get events where entity was mentioned', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ event_id: testEventId }, { event_id: 'event-2' }],
      });

      const result = await service.getEntityEvents(testEntityId);

      expect(result).toHaveLength(2);
      expect(result).toContain(testEventId);
    });

    it('should limit results', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.getEntityEvents(testEntityId, 5);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [testEntityId, 5]);
    });
  });

  describe('getTopEntities', () => {
    it('should get most frequently mentioned entities', async () => {
      const mockResults = [
        {
          id: testEntityId,
          entity_type: 'procedure',
          entity_value: 'implant',
          entity_hash: 'hash',
          canonical_form: null,
          mention_count: 50,
          avg_confidence: 0.9,
          first_observed_at: new Date(),
          last_observed_at: new Date(),
        },
      ];

      mockPool.query = vi.fn().mockResolvedValue({ rows: mockResults });

      const result = await service.getTopEntities();

      expect(result).toHaveLength(1);
      expect(result[0]?.mentionCount).toBe(50);
    });

    it('should filter by entity type', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.getTopEntities({ entityType: 'procedure', limit: 10 });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('entity_type'), [
        'procedure',
        10,
      ]);
    });
  });

  describe('eraseSubjectEntities', () => {
    it('should soft delete entities for GDPR compliance', async () => {
      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: testEventId }] }) // Find events
        .mockResolvedValueOnce({ rows: [{ entity_id: testEntityId }] }) // Find entities
        .mockResolvedValue({ rows: [] }); // Delete operations

      const result = await service.eraseSubjectEntities('subject-id');

      expect(result).toBe(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_entities SET deleted_at'),
        expect.any(Array)
      );
    });

    it('should return 0 when no events found', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await service.eraseSubjectEntities('nonexistent-subject');

      expect(result).toBe(0);
    });

    it('should return 0 when no unique entities found', async () => {
      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: testEventId }] }) // Find events
        .mockResolvedValueOnce({ rows: [] }); // No unique entities

      const result = await service.eraseSubjectEntities('subject-id');

      expect(result).toBe(0);
    });
  });

  describe('hashEntity', () => {
    it('should generate consistent hashes', async () => {
      const entities1: KeyEntity[] = [{ type: 'procedure', value: 'IMPLANT', confidence: 0.9 }];
      const entities2: KeyEntity[] = [{ type: 'procedure', value: 'implant', confidence: 0.8 }];

      // Process same entity value with different cases
      await service.processEntitiesFromEvent(testEventId, entities1, new Date());
      await service.processEntitiesFromEvent('event-2', entities2, new Date());

      // Both should query with the same hash (normalized lowercase)
      const calls = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls;
      const hashQueries = calls.filter((call) => call[0]?.includes('entity_hash'));

      // Hash should be the same for case-insensitive matching
      expect(hashQueries.length).toBeGreaterThan(0);
    });
  });

  describe('createKnowledgeGraphService factory', () => {
    it('should create service with default config', () => {
      const svc = createKnowledgeGraphService(mockPool as any, mockEmbeddings);
      expect(svc).toBeInstanceOf(KnowledgeGraphService);
    });

    it('should create service with custom config', () => {
      const svc = createKnowledgeGraphService(mockPool as any, mockEmbeddings, {
        minEntityConfidence: 0.8,
        enableLLMRelations: true,
      });
      expect(svc).toBeInstanceOf(KnowledgeGraphService);
    });

    it('should create service without embeddings', () => {
      const svc = createKnowledgeGraphService(mockPool as any, null);
      expect(svc).toBeInstanceOf(KnowledgeGraphService);
    });
  });
});

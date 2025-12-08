/**
 * Entity Canonicalization Service Tests
 *
 * L4: Tests for entity canonical form population functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EntityCanonicalizationService,
  createEntityCanonicalizationService,
} from '../entity-canonicalization.js';
import { DEFAULT_CANONICALIZATION_CONFIG } from '../types.js';
import type { IOpenAIClient } from '../episode-builder.js';

describe('EntityCanonicalizationService', () => {
  let service: EntityCanonicalizationService;
  let mockOpenAI: IOpenAIClient;
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };

  const testEntityId1 = '550e8400-e29b-41d4-a716-446655440001';
  const testEntityId2 = '550e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
    mockOpenAI = {
      chatCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({
          results: [{ original: 'test procedure', canonical: 'Test Procedure', confidence: 0.9 }],
        })
      ),
    } as unknown as IOpenAIClient;

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    service = new EntityCanonicalizationService(
      mockPool as any,
      null, // No LLM by default
      DEFAULT_CANONICALIZATION_CONFIG
    );
  });

  describe('Rule-based canonicalization', () => {
    describe('Dental procedure mappings', () => {
      it('should canonicalize "all on 4" to "all-on-4 dental implants"', async () => {
        const result = await service.canonicalize('all on 4', 'procedure');

        expect(result.canonicalForm).toBe('all-on-4 dental implants');
        expect(result.method).toBe('rule_based');
        expect(result.confidence).toBe(1.0);
      });

      it('should canonicalize "all-on-4" to "all-on-4 dental implants"', async () => {
        const result = await service.canonicalize('all-on-4', 'procedure');

        expect(result.canonicalForm).toBe('all-on-4 dental implants');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "dental implant" (singular) to "dental implants"', async () => {
        const result = await service.canonicalize('dental implant', 'procedure');

        expect(result.canonicalForm).toBe('dental implants');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "implants" to "dental implants"', async () => {
        const result = await service.canonicalize('implants', 'procedure');

        expect(result.canonicalForm).toBe('dental implants');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "root canal" to "root canal treatment"', async () => {
        const result = await service.canonicalize('root canal', 'procedure');

        expect(result.canonicalForm).toBe('root canal treatment');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "teeth whitening" variations', async () => {
        const result1 = await service.canonicalize('bleaching', 'procedure');
        const result2 = await service.canonicalize('tooth whitening', 'procedure');

        expect(result1.canonicalForm).toBe('teeth whitening');
        expect(result2.canonicalForm).toBe('teeth whitening');
      });

      it('should canonicalize "invisalign" to "clear aligners"', async () => {
        const result = await service.canonicalize('invisalign', 'procedure');

        expect(result.canonicalForm).toBe('clear aligners');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "cbct" to "cone beam ct scan"', async () => {
        const result = await service.canonicalize('cbct', 'procedure');

        expect(result.canonicalForm).toBe('cone beam ct scan');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize crown variations', async () => {
        const result1 = await service.canonicalize('crown', 'procedure');
        const result2 = await service.canonicalize('porcelain crown', 'procedure');

        expect(result1.canonicalForm).toBe('dental crown');
        expect(result2.canonicalForm).toBe('dental crown');
      });

      it('should canonicalize veneer variations', async () => {
        const result = await service.canonicalize('veneers', 'procedure');

        expect(result.canonicalForm).toBe('dental veneers');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize cleaning variations', async () => {
        const result1 = await service.canonicalize('prophy', 'procedure');
        const result2 = await service.canonicalize('scale and polish', 'procedure');

        expect(result1.canonicalForm).toBe('dental cleaning');
        expect(result2.canonicalForm).toBe('dental cleaning');
      });
    });

    describe('Abbreviation mappings', () => {
      it('should canonicalize "rct" to "root canal treatment"', async () => {
        const result = await service.canonicalize('rct', 'procedure');

        expect(result.canonicalForm).toBe('root canal treatment');
        expect(result.method).toBe('rule_based');
      });

      it('should canonicalize "ao4" to "all-on-4 dental implants"', async () => {
        const result = await service.canonicalize('ao4', 'procedure');

        expect(result.canonicalForm).toBe('all-on-4 dental implants');
      });

      it('should canonicalize "appt" to "appointment" for other types', async () => {
        const result = await service.canonicalize('appt', 'other');

        expect(result.canonicalForm).toBe('appointment');
        expect(result.method).toBe('rule_based');
      });
    });

    describe('Case insensitivity', () => {
      it('should handle uppercase input', async () => {
        const result = await service.canonicalize('ALL ON 4', 'procedure');

        expect(result.canonicalForm).toBe('all-on-4 dental implants');
      });

      it('should handle mixed case input', async () => {
        const result = await service.canonicalize('Dental Implant', 'procedure');

        expect(result.canonicalForm).toBe('dental implants');
      });
    });

    describe('Whitespace handling', () => {
      it('should handle leading/trailing whitespace', async () => {
        const result = await service.canonicalize('  dental implant  ', 'procedure');

        expect(result.canonicalForm).toBe('dental implants');
      });

      it('should handle multiple internal spaces', async () => {
        const result = await service.canonicalize('dental   implant', 'procedure');

        expect(result.canonicalForm).toBe('dental implants');
      });
    });
  });

  describe('Basic normalization', () => {
    it('should apply basic normalization for unknown procedures', async () => {
      const result = await service.canonicalize('some unknown procedure', 'procedure');

      expect(result.canonicalForm).toBe('Some Unknown Procedure');
      expect(result.method).toBe('basic_normalization');
      expect(result.confidence).toBe(0.7);
    });

    it('should apply title case normalization', async () => {
      const result = await service.canonicalize('custom dental work', 'procedure');

      expect(result.canonicalForm).toBe('Custom Dental Work');
    });

    it('should keep lowercase words like "and", "or", "the"', async () => {
      const result = await service.canonicalize('cleaning and polishing', 'procedure');

      expect(result.canonicalForm).toBe('Cleaning and Polishing');
    });
  });

  describe('LLM canonicalization', () => {
    beforeEach(() => {
      service = new EntityCanonicalizationService(mockPool as any, mockOpenAI, {
        ...DEFAULT_CANONICALIZATION_CONFIG,
        enableLLMCanonicalization: true,
      });
    });

    it('should use LLM for unknown procedures when enabled', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          results: [
            {
              original: 'periodontal regeneration therapy',
              canonical: 'Periodontal Regeneration',
              confidence: 0.85,
            },
          ],
        })
      );

      const result = await service.canonicalize('periodontal regeneration therapy', 'procedure');

      expect(result.method).toBe('llm');
      expect(result.canonicalForm).toBe('Periodontal Regeneration');
      expect(result.confidence).toBe(0.85);
    });

    it('should still prefer rule-based for known terms even with LLM enabled', async () => {
      const result = await service.canonicalize('dental implant', 'procedure');

      expect(result.method).toBe('rule_based');
      expect(result.canonicalForm).toBe('dental implants');
      // LLM should not have been called
      expect(mockOpenAI.chatCompletion).not.toHaveBeenCalled();
    });

    it('should fallback to basic normalization when LLM fails', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockRejectedValue(new Error('API Error'));

      const result = await service.canonicalize('rare procedure', 'procedure');

      expect(result.method).toBe('basic_normalization');
      expect(result.canonicalForm).toBe('Rare Procedure');
    });

    it('should only use LLM for procedure entity types', async () => {
      const result = await service.canonicalize('john smith', 'person');

      expect(mockOpenAI.chatCompletion).not.toHaveBeenCalled();
      expect(result.method).toBe('basic_normalization');
    });
  });

  describe('Caching', () => {
    it('should return cached results on subsequent calls', async () => {
      const result1 = await service.canonicalize('dental implant', 'procedure');
      const result2 = await service.canonicalize('dental implant', 'procedure');

      expect(result1.canonicalForm).toBe(result2.canonicalForm);
      expect(result2.method).toBe('cache');
    });

    it('should return correct processing time for cached results', async () => {
      await service.canonicalize('dental implant', 'procedure');
      const result = await service.canonicalize('dental implant', 'procedure');

      expect(result.processingTimeMs).toBeLessThan(5); // Cache should be very fast
    });

    it('should clear cache when requested', async () => {
      await service.canonicalize('dental implant', 'procedure');
      service.clearCache();
      const result = await service.canonicalize('dental implant', 'procedure');

      expect(result.method).toBe('rule_based');
    });

    it('should report cache statistics', async () => {
      await service.canonicalize('dental implant', 'procedure');
      await service.canonicalize('root canal', 'procedure');

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(DEFAULT_CANONICALIZATION_CONFIG.maxCacheSize);
    });
  });

  describe('Batch canonicalization', () => {
    it('should process multiple entities efficiently', async () => {
      const entities = [
        { value: 'dental implant', type: 'procedure' as const },
        { value: 'root canal', type: 'procedure' as const },
        { value: 'crown', type: 'procedure' as const },
      ];

      const results = await service.canonicalizeBatch(entities);

      expect(results).toHaveLength(3);
      expect(results[0]?.canonicalForm).toBe('dental implants');
      expect(results[1]?.canonicalForm).toBe('root canal treatment');
      expect(results[2]?.canonicalForm).toBe('dental crown');
    });

    it('should use cache for repeated values in batch', async () => {
      const entities = [
        { value: 'dental implant', type: 'procedure' as const },
        { value: 'dental implant', type: 'procedure' as const },
      ];

      const results = await service.canonicalizeBatch(entities);

      expect(results[0]?.method).toBe('rule_based');
      expect(results[1]?.method).toBe('cache');
    });

    it('should batch LLM calls when enabled', async () => {
      const llmService = new EntityCanonicalizationService(mockPool as any, mockOpenAI, {
        ...DEFAULT_CANONICALIZATION_CONFIG,
        enableLLMCanonicalization: true,
      });

      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          results: [
            { original: 'procedure a', canonical: 'Procedure A', confidence: 0.9 },
            { original: 'procedure b', canonical: 'Procedure B', confidence: 0.88 },
          ],
        })
      );

      const entities = [
        { value: 'procedure a', type: 'procedure' as const },
        { value: 'procedure b', type: 'procedure' as const },
      ];

      await llmService.canonicalizeBatch(entities);

      // Should make only one LLM call for both entities
      expect(mockOpenAI.chatCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Batch canonicalization of existing entities', () => {
    it('should find entities without canonical forms', async () => {
      const entities = [
        { id: testEntityId1, entity_type: 'procedure', entity_value: 'dental implant' },
        { id: testEntityId2, entity_type: 'procedure', entity_value: 'root canal' },
      ];

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: entities }) // Get entities without canonical form
        .mockResolvedValueOnce({ rowCount: 1 }) // Update first entity
        .mockResolvedValueOnce({ rowCount: 1 }); // Update second entity

      const result = await service.canonicalizeExisting({ batchSize: 10, limit: 100 });

      expect(result.totalProcessed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should filter by entity type when specified', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      await service.canonicalizeExisting({ entityType: 'procedure' });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('entity_type = $1'), [
        'procedure',
        expect.any(Number),
      ]);
    });

    it('should handle database errors gracefully', async () => {
      const entities = [
        { id: testEntityId1, entity_type: 'procedure', entity_value: 'dental implant' },
      ];

      mockPool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: entities })
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.canonicalizeExisting();

      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.entityId).toBe(testEntityId1);
    });

    it('should report duration', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await service.canonicalizeExisting();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateCanonicalForm', () => {
    it('should update entity canonical form in database', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rowCount: 1 });

      await service.updateCanonicalForm(testEntityId1, 'Dental Implants');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge_entities'),
        ['Dental Implants', testEntityId1]
      );
    });
  });

  describe('createEntityCanonicalizationService factory', () => {
    it('should create service with default config', () => {
      const svc = createEntityCanonicalizationService(mockPool as any, null);
      expect(svc).toBeInstanceOf(EntityCanonicalizationService);
    });

    it('should create service with custom config', () => {
      const svc = createEntityCanonicalizationService(mockPool as any, mockOpenAI, {
        enableLLMCanonicalization: true,
        batchSize: 50,
      });
      expect(svc).toBeInstanceOf(EntityCanonicalizationService);
    });

    it('should create service with LLM client', () => {
      const svc = createEntityCanonicalizationService(mockPool as any, mockOpenAI);
      expect(svc).toBeInstanceOf(EntityCanonicalizationService);
    });
  });

  describe('Entity type handling', () => {
    it('should handle procedure type', async () => {
      const result = await service.canonicalize('dental implant', 'procedure');
      expect(result.canonicalForm).toBe('dental implants');
    });

    it('should handle date type', async () => {
      const result = await service.canonicalize('next monday', 'date');
      expect(result.canonicalForm).toBe('Next Monday');
      expect(result.method).toBe('basic_normalization');
    });

    it('should handle amount type', async () => {
      const result = await service.canonicalize('five hundred dollars', 'amount');
      expect(result.canonicalForm).toBe('Five Hundred Dollars');
    });

    it('should handle person type', async () => {
      const result = await service.canonicalize('dr. john smith', 'person');
      expect(result.canonicalForm).toBe('Dr. John Smith');
    });

    it('should handle location type', async () => {
      const result = await service.canonicalize('bucharest romania', 'location');
      expect(result.canonicalForm).toBe('Bucharest Romania');
    });

    it('should handle product type', async () => {
      const result = await service.canonicalize('straumann implant', 'product');
      expect(result.canonicalForm).toBe('Straumann Implant');
    });

    it('should handle other type', async () => {
      const result = await service.canonicalize('some value', 'other');
      expect(result.canonicalForm).toBe('Some Value');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string input', async () => {
      const result = await service.canonicalize('', 'procedure');
      expect(result.canonicalForm).toBe('');
    });

    it('should handle single character input', async () => {
      const result = await service.canonicalize('a', 'procedure');
      expect(result.canonicalForm).toBe('A');
    });

    it('should handle special characters', async () => {
      const result = await service.canonicalize("patient's crown", 'procedure');
      expect(result.canonicalForm).toBe("Patient's Crown");
    });

    it('should handle numeric input', async () => {
      const result = await service.canonicalize('5000', 'amount');
      expect(result.canonicalForm).toBe('5000');
    });
  });
});

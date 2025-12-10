/**
 * Tests for EmbeddingVersionCompatibility
 *
 * Tests version-aware semantic search and model compatibility handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingVersionCompatibility,
  createEmbeddingVersionCompatibility,
  SearchStrategySchema,
  VersionedSearchOptionsSchema,
  type SearchStrategy,
  type VersionedSearchOptions,
} from '../embedding-version-compatibility.js';
import type { Pool } from 'pg';
import type { EmbeddingModelRegistry } from '../embedding-model-registry.js';

// Mock Pool
const createMockPool = (): Pool => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  } as unknown as Pool;
  return mockPool;
};

// Mock Registry
const createMockRegistry = (): EmbeddingModelRegistry =>
  ({
    getModel: vi.fn().mockReturnValue({
      id: 'text-embedding-3-small',
      dimensions: 1536,
      qualityScore: 90,
      status: 'active',
      costPer1MTokens: 0.02,
    }),
    getCurrentModel: vi.fn().mockReturnValue({
      id: 'text-embedding-3-small',
      dimensions: 1536,
      qualityScore: 90,
      status: 'active',
    }),
    getAllModels: vi.fn().mockReturnValue([
      { id: 'text-embedding-3-small', dimensions: 1536, qualityScore: 90, status: 'active' },
      { id: 'text-embedding-ada-002', dimensions: 1536, qualityScore: 85, status: 'deprecated' },
      { id: 'text-embedding-3-large', dimensions: 3072, qualityScore: 95, status: 'active' },
    ]),
    setCurrentModel: vi.fn(),
  }) as unknown as EmbeddingModelRegistry;

describe('EmbeddingVersionCompatibility', () => {
  let mockPool: Pool;
  let mockRegistry: EmbeddingModelRegistry;
  let compatibility: EmbeddingVersionCompatibility;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    mockRegistry = createMockRegistry();
    compatibility = new EmbeddingVersionCompatibility(
      mockPool,
      'text-embedding-3-small',
      mockRegistry
    );
  });

  describe('constructor', () => {
    it('should create instance with default model', () => {
      const comp = new EmbeddingVersionCompatibility(mockPool);
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create instance with custom model', () => {
      const comp = new EmbeddingVersionCompatibility(mockPool, 'text-embedding-3-large');
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create instance with custom registry', () => {
      const comp = new EmbeddingVersionCompatibility(
        mockPool,
        'text-embedding-3-small',
        mockRegistry
      );
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });
  });

  describe('getModelCompatibility', () => {
    it('should return compatibility info for known model', () => {
      const info = compatibility.getModelCompatibility('text-embedding-3-small');

      expect(info.model).toBe('text-embedding-3-small');
      expect(info.dimensions).toBe(1536);
      expect(info.isCompatible).toBe(true);
      expect(info.isCurrent).toBe(true);
      expect(info.qualityFactor).toBe(1);
    });

    it('should return compatibility info for compatible model', () => {
      const info = compatibility.getModelCompatibility('text-embedding-ada-002');

      expect(info.isCompatible).toBe(true);
      expect(info.isCurrent).toBe(false);
    });

    it('should return incompatible info for unknown model', () => {
      vi.mocked(mockRegistry.getModel).mockReturnValueOnce(undefined);

      const info = compatibility.getModelCompatibility('unknown-model' as never);

      expect(info.isCompatible).toBe(false);
      expect(info.dimensions).toBe(0);
      expect(info.qualityFactor).toBe(0);
    });

    it('should mark different dimension model as incompatible', () => {
      vi.mocked(mockRegistry.getModel).mockReturnValueOnce({
        id: 'text-embedding-3-large',
        dimensions: 3072,
        qualityScore: 95,
        status: 'active',
      } as never);

      const info = compatibility.getModelCompatibility('text-embedding-3-large');

      expect(info.isCompatible).toBe(false);
      expect(info.dimensions).toBe(3072);
    });
  });

  describe('getCompatibleModels', () => {
    it('should return models with same dimensions', () => {
      const models = compatibility.getCompatibleModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('text-embedding-3-small');
      expect(models).toContain('text-embedding-ada-002');
      expect(models).not.toContain('text-embedding-3-large');
    });
  });

  describe('getModelDistributionWithCompatibility', () => {
    it('should get distribution for knowledge_base', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '100' },
          { model: 'text-embedding-ada-002', entry_count: '50' },
        ],
      } as never);

      const distribution =
        await compatibility.getModelDistributionWithCompatibility('knowledge_base');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_embedding_model_distribution($1)',
        ['knowledge_base']
      );
      expect(distribution.length).toBe(2);
    });

    it('should get distribution for message_embeddings', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'text-embedding-3-small', entry_count: '200' }],
      } as never);

      const distribution =
        await compatibility.getModelDistributionWithCompatibility('message_embeddings');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_embedding_model_distribution($1)',
        ['message_embeddings']
      );
    });
  });

  describe('search', () => {
    const queryEmbedding = Array(1536).fill(0.1);

    beforeEach(() => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            content: 'Test content',
            title: 'Test Title',
            similarity: '0.95',
            embedding_model: 'text-embedding-3-small',
            embedding_version: 1,
            metadata: { source: 'test' },
          },
        ],
      } as never);
    });

    it('should search with default options', async () => {
      const result = await compatibility.search(queryEmbedding);

      expect(result.results).toBeDefined();
      expect(result.searchModel).toBe('text-embedding-3-small');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should search with current_model_only strategy', async () => {
      const result = await compatibility.search(queryEmbedding, {
        strategy: 'current_model_only',
      });

      expect(result.modelsSearched).toContain('text-embedding-3-small');
    });

    it('should search with compatible_models strategy', async () => {
      const result = await compatibility.search(queryEmbedding, {
        strategy: 'compatible_models',
      });

      expect(result.modelsSearched.length).toBeGreaterThanOrEqual(1);
    });

    it('should search with all_with_fallback strategy', async () => {
      const result = await compatibility.search(queryEmbedding, {
        strategy: 'all_with_fallback',
      });

      expect(result).toBeDefined();
    });

    it('should search with hybrid_rerank strategy', async () => {
      const result = await compatibility.search(queryEmbedding, {
        strategy: 'hybrid_rerank',
      });

      expect(result).toBeDefined();
    });

    it('should search in message_embeddings table', async () => {
      const result = await compatibility.search(queryEmbedding, {
        targetTable: 'message_embeddings',
      });

      expect(result).toBeDefined();
    });

    it('should apply clinic filter', async () => {
      const result = await compatibility.search(queryEmbedding, {
        clinicId: 'clinic-123',
      });

      expect(result).toBeDefined();
    });

    it('should apply language filter', async () => {
      const result = await compatibility.search(queryEmbedding, {
        language: 'en',
      });

      expect(result).toBeDefined();
    });

    it('should apply source type filter', async () => {
      const result = await compatibility.search(queryEmbedding, {
        sourceType: 'faq',
      });

      expect(result).toBeDefined();
    });

    it('should apply all filters together', async () => {
      const result = await compatibility.search(queryEmbedding, {
        clinicId: 'clinic-1',
        language: 'es',
        sourceType: 'procedure',
        topK: 20,
        strategy: 'compatible_models',
      });

      expect(result).toBeDefined();
    });

    it('should warn on mixed models when current model not in results', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            content: 'Test 1',
            title: 'Title 1',
            similarity: '0.9',
            embedding_model: 'text-embedding-ada-002',
            embedding_version: 1,
            metadata: null,
          },
          {
            id: 'doc-2',
            content: 'Test 2',
            title: 'Title 2',
            similarity: '0.85',
            embedding_model: 'old-model',
            embedding_version: 1,
            metadata: null,
          },
        ],
      } as never);

      const result = await compatibility.search(queryEmbedding, {
        warnOnMixedModels: true,
      });

      // Warning is true when: multiple models AND current model not in results
      expect(result.mixedModelsWarning).toBe(true);
    });

    it('should not warn when current model is in results', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            content: 'Test',
            title: 'Title 1',
            similarity: '0.9',
            embedding_model: 'text-embedding-3-small', // Current model
            embedding_version: 1,
            metadata: null,
          },
        ],
      } as never);

      const result = await compatibility.search(queryEmbedding, {
        warnOnMixedModels: true,
      });

      expect(result.mixedModelsWarning).toBe(false);
    });

    it('should apply current model boost', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            content: 'Test',
            title: 'Title',
            similarity: '0.8',
            embedding_model: 'text-embedding-3-small',
            embedding_version: 1,
            metadata: null,
          },
        ],
      } as never);

      const result = await compatibility.search(queryEmbedding, {
        preferCurrentModel: true,
        currentModelBoost: 1.2,
      });

      expect(result.results[0]?.adjustedSimilarity).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('canSearchWithCurrentModel', () => {
    it('should return cannot search when no embeddings', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as never);

      const result = await compatibility.canSearchWithCurrentModel();

      expect(result.canSearch).toBe(false);
      expect(result.recommendation).toContain('No embeddings');
    });

    it('should return optimal when all current model', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'text-embedding-3-small', entry_count: '1000' }],
      } as never);

      const result = await compatibility.canSearchWithCurrentModel();

      expect(result.canSearch).toBe(true);
      expect(result.currentModelCoverage).toBeGreaterThanOrEqual(0.95);
      expect(result.recommendation).toContain('Optimal');
    });

    it('should return good when all compatible', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '500' },
          { model: 'text-embedding-ada-002', entry_count: '500' },
        ],
      } as never);

      const result = await compatibility.canSearchWithCurrentModel();

      expect(result.canSearch).toBe(true);
      expect(result.compatibleCoverage).toBeGreaterThanOrEqual(0.95);
    });

    it('should return warning when partial compatibility', async () => {
      vi.mocked(mockRegistry.getModel).mockImplementation((id: unknown) => {
        if (id === 'text-embedding-3-large') {
          return {
            id: 'text-embedding-3-large',
            dimensions: 3072,
            qualityScore: 95,
            status: 'active',
          } as never;
        }
        return {
          id: 'text-embedding-3-small',
          dimensions: 1536,
          qualityScore: 90,
          status: 'active',
        } as never;
      });

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '700' },
          { model: 'text-embedding-3-large', entry_count: '300' },
        ],
      } as never);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(true);
    });

    it('should return critical when mostly incompatible', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValue({
        id: 'text-embedding-3-large',
        dimensions: 3072,
        qualityScore: 95,
        status: 'active',
      } as never);

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '100' },
          { model: 'text-embedding-3-large', entry_count: '900' },
        ],
      } as never);

      const result = await compatibility.canSearchWithCurrentModel('message_embeddings');

      expect(result.canSearch).toBe(true);
    });
  });

  describe('getUpgradeRecommendations', () => {
    it('should identify urgent migrations for incompatible models', async () => {
      vi.mocked(mockRegistry.getModel).mockImplementation((id: unknown) => {
        if (id === 'text-embedding-3-large') {
          return {
            id: 'text-embedding-3-large',
            dimensions: 3072,
            qualityScore: 95,
            status: 'active',
          } as never;
        }
        return {
          id: 'text-embedding-3-small',
          dimensions: 1536,
          qualityScore: 90,
          status: 'active',
        } as never;
      });

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '500' },
          { model: 'text-embedding-3-large', entry_count: '200' },
        ],
      } as never);

      const result = await compatibility.getUpgradeRecommendations();

      expect(result.healthScore).toBeDefined();
      expect(result.estimatedQualityImprovement).toBeDefined();
    });

    it('should identify deprecated models', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValue({
        id: 'text-embedding-ada-002',
        dimensions: 1536,
        qualityScore: 85,
        status: 'deprecated',
      } as never);

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'text-embedding-ada-002', entry_count: '100' }],
      } as never);

      const result = await compatibility.getUpgradeRecommendations('knowledge_base');

      expect(result.urgentMigrations.length).toBeGreaterThan(0);
    });

    it('should identify retired models', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValue({
        id: 'old-model',
        dimensions: 1536,
        qualityScore: 70,
        status: 'retired',
      } as never);

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'old-model', entry_count: '50' }],
      } as never);

      const result = await compatibility.getUpgradeRecommendations();

      expect(result.urgentMigrations.length).toBeGreaterThan(0);
    });

    it('should identify optional upgrades for lower quality models', async () => {
      vi.mocked(mockRegistry.getModel).mockReturnValue({
        id: 'text-embedding-ada-002',
        dimensions: 1536,
        qualityScore: 80,
        status: 'active',
      } as never);

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'text-embedding-ada-002', entry_count: '200' }],
      } as never);

      const result = await compatibility.getUpgradeRecommendations();

      expect(result.optionalUpgrades.length).toBeGreaterThan(0);
    });

    it('should calculate health score correctly', async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ model: 'text-embedding-3-small', entry_count: '1000' }],
      } as never);

      const result = await compatibility.getUpgradeRecommendations();

      expect(result.healthScore).toBe(100);
    });
  });

  describe('setCurrentModel', () => {
    it('should update current model', () => {
      compatibility.setCurrentModel('text-embedding-3-large');

      expect(mockRegistry.setCurrentModel).toHaveBeenCalledWith('text-embedding-3-large');
    });
  });

  describe('Schema validations', () => {
    it('should validate search strategies', () => {
      const strategies: SearchStrategy[] = [
        'current_model_only',
        'compatible_models',
        'all_with_fallback',
        'hybrid_rerank',
      ];

      for (const strategy of strategies) {
        expect(SearchStrategySchema.parse(strategy)).toBe(strategy);
      }
    });

    it('should reject invalid search strategy', () => {
      expect(() => SearchStrategySchema.parse('invalid')).toThrow();
    });

    it('should validate search options with defaults', () => {
      const options = VersionedSearchOptionsSchema.parse({});

      expect(options.strategy).toBe('compatible_models');
      expect(options.includeModelMetadata).toBe(true);
      expect(options.warnOnMixedModels).toBe(true);
      expect(options.preferCurrentModel).toBe(true);
      expect(options.currentModelBoost).toBe(1.1);
      expect(options.minSimilarityThreshold).toBe(0.7);
    });

    it('should validate search options with custom values', () => {
      const options = VersionedSearchOptionsSchema.parse({
        strategy: 'current_model_only',
        includeModelMetadata: false,
        warnOnMixedModels: false,
        preferCurrentModel: false,
        currentModelBoost: 1.5,
        minSimilarityThreshold: 0.8,
      });

      expect(options.strategy).toBe('current_model_only');
      expect(options.currentModelBoost).toBe(1.5);
    });

    it('should reject invalid boost values', () => {
      expect(() => VersionedSearchOptionsSchema.parse({ currentModelBoost: 3 })).toThrow();
      expect(() => VersionedSearchOptionsSchema.parse({ currentModelBoost: -1 })).toThrow();
    });

    it('should reject invalid similarity threshold', () => {
      expect(() => VersionedSearchOptionsSchema.parse({ minSimilarityThreshold: 1.5 })).toThrow();
      expect(() => VersionedSearchOptionsSchema.parse({ minSimilarityThreshold: -0.1 })).toThrow();
    });
  });

  describe('createEmbeddingVersionCompatibility factory', () => {
    it('should create instance with defaults', () => {
      const comp = createEmbeddingVersionCompatibility(mockPool);
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create instance with custom model', () => {
      const comp = createEmbeddingVersionCompatibility(mockPool, 'text-embedding-3-large');
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create instance with registry', () => {
      const comp = createEmbeddingVersionCompatibility(
        mockPool,
        'text-embedding-3-small',
        mockRegistry
      );
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });
  });
});

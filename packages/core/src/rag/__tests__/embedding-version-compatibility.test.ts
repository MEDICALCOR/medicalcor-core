/**
 * Embedding Version Compatibility Tests
 *
 * Tests for the version compatibility layer:
 * - Compatibility checks between models
 * - Versioned search operations
 * - Search strategy selection
 * - Upgrade recommendations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmbeddingVersionCompatibility,
  createEmbeddingVersionCompatibility,
  SearchStrategySchema,
  VersionedSearchOptionsSchema,
  type SearchStrategy,
  type VersionedSearchOptions,
} from '../embedding-version-compatibility.js';
import {
  EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
  type EmbeddingModelId,
} from '../embedding-model-registry.js';
import type { Pool, QueryResult } from 'pg';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool(): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
}

// ============================================================================
// SCHEMA TESTS
// ============================================================================

describe('SearchStrategySchema', () => {
  it('should validate all strategy values', () => {
    const strategies: SearchStrategy[] = [
      'current_model_only',
      'compatible_models',
      'all_with_fallback',
      'hybrid_rerank',
    ];

    for (const strategy of strategies) {
      const result = SearchStrategySchema.safeParse(strategy);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid strategy', () => {
    const result = SearchStrategySchema.safeParse('invalid_strategy');
    expect(result.success).toBe(false);
  });
});

describe('VersionedSearchOptionsSchema', () => {
  it('should validate complete options', () => {
    const options: VersionedSearchOptions = {
      strategy: 'compatible_models',
      includeModelMetadata: true,
      warnOnMixedModels: true,
      preferCurrentModel: true,
      currentModelBoost: 1.1,
      minSimilarityThreshold: 0.7,
    };

    const result = VersionedSearchOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('should apply defaults', () => {
    const options = {};
    const result = VersionedSearchOptionsSchema.parse(options);

    expect(result.strategy).toBe('compatible_models');
    expect(result.includeModelMetadata).toBe(true);
    expect(result.warnOnMixedModels).toBe(true);
    expect(result.preferCurrentModel).toBe(true);
    expect(result.currentModelBoost).toBe(1.1);
    expect(result.minSimilarityThreshold).toBe(0.7);
  });

  it('should reject boost value out of range', () => {
    const options = { currentModelBoost: 3.0 };
    const result = VersionedSearchOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });

  it('should reject negative similarity threshold', () => {
    const options = { minSimilarityThreshold: -0.1 };
    const result = VersionedSearchOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });

  it('should reject similarity threshold above 1', () => {
    const options = { minSimilarityThreshold: 1.5 };
    const result = VersionedSearchOptionsSchema.safeParse(options);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// COMPATIBILITY CLASS TESTS
// ============================================================================

describe('EmbeddingVersionCompatibility', () => {
  let compatibility: EmbeddingVersionCompatibility;
  let mockPool: Pool;
  let mockRegistry: EmbeddingModelRegistry;

  beforeEach(() => {
    mockPool = createMockPool();
    mockRegistry = createEmbeddingModelRegistry();
    compatibility = new EmbeddingVersionCompatibility(
      mockPool,
      'text-embedding-3-small',
      mockRegistry
    );
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create with default model', () => {
      const comp = new EmbeddingVersionCompatibility(mockPool);
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create with custom model', () => {
      const comp = new EmbeddingVersionCompatibility(mockPool, 'text-embedding-3-large');
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });

    it('should create with custom registry', () => {
      const customRegistry = createEmbeddingModelRegistry('text-embedding-3-large');
      const comp = new EmbeddingVersionCompatibility(
        mockPool,
        'text-embedding-3-small',
        customRegistry
      );
      expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
    });
  });

  // ============================================================================
  // MODEL COMPATIBILITY TESTS
  // ============================================================================

  describe('getModelCompatibility', () => {
    it('should return compatibility for current model', () => {
      const result = compatibility.getModelCompatibility('text-embedding-3-small');

      expect(result.model).toBe('text-embedding-3-small');
      expect(result.isCurrent).toBe(true);
      expect(result.isCompatible).toBe(true);
      expect(result.dimensions).toBe(1536);
    });

    it('should return compatibility for compatible model (same dimensions)', () => {
      const result = compatibility.getModelCompatibility('text-embedding-ada-002');

      expect(result.model).toBe('text-embedding-ada-002');
      expect(result.isCurrent).toBe(false);
      expect(result.isCompatible).toBe(true); // Same dimensions (1536)
      expect(result.dimensions).toBe(1536);
    });

    it('should return incompatibility for different dimensions model', () => {
      const result = compatibility.getModelCompatibility('text-embedding-3-large');

      expect(result.model).toBe('text-embedding-3-large');
      expect(result.isCurrent).toBe(false);
      expect(result.isCompatible).toBe(false); // Different dimensions (3072)
      expect(result.dimensions).toBe(3072);
    });

    it('should return no compatibility for unknown model', () => {
      const result = compatibility.getModelCompatibility('unknown-model' as EmbeddingModelId);

      expect(result.isCompatible).toBe(false);
      expect(result.dimensions).toBe(0);
      expect(result.qualityFactor).toBe(0);
    });

    it('should calculate quality factor correctly', () => {
      const result = compatibility.getModelCompatibility('text-embedding-ada-002');

      // Ada-002 has quality score 70, current (3-small) has 85
      expect(result.qualityFactor).toBeCloseTo(70 / 85, 2);
    });
  });

  describe('getCompatibleModels', () => {
    it('should return models with same dimensions', () => {
      const compatibleModels = compatibility.getCompatibleModels();

      expect(compatibleModels).toContain('text-embedding-3-small');
      expect(compatibleModels).toContain('text-embedding-ada-002');
      expect(compatibleModels).not.toContain('text-embedding-3-large'); // Different dimensions
    });
  });

  describe('getModelDistributionWithCompatibility', () => {
    it('should return distribution with compatibility info', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '500' },
          { model: 'text-embedding-ada-002', entry_count: '200' },
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const distribution =
        await compatibility.getModelDistributionWithCompatibility('knowledge_base');

      expect(distribution).toHaveLength(2);
      expect(distribution[0]?.entryCount).toBe(500);
      expect(distribution[0]?.isCompatible).toBe(true);
      expect(distribution[1]?.entryCount).toBe(200);
      expect(distribution[1]?.isCompatible).toBe(true);
    });
  });

  // ============================================================================
  // SEARCH TESTS
  // ============================================================================

  describe('search', () => {
    const queryEmbedding = new Array(1536).fill(0.1);

    beforeEach(() => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            content: 'Test content 1',
            title: 'Test Title 1',
            similarity: '0.85',
            embedding_model: 'text-embedding-3-small',
            embedding_version: 2,
            metadata: { category: 'test' },
          },
          {
            id: 'doc-2',
            content: 'Test content 2',
            title: 'Test Title 2',
            similarity: '0.75',
            embedding_model: 'text-embedding-ada-002',
            embedding_version: 1,
            metadata: null,
          },
        ],
        rowCount: 2,
      } as QueryResult<{
        id: string;
        content: string;
        title: string;
        similarity: string;
        embedding_model: string;
        embedding_version: number;
        metadata: Record<string, unknown> | null;
      }>);
    });

    it('should perform search with default options', async () => {
      const response = await compatibility.search(queryEmbedding);

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.searchModel).toBe('text-embedding-3-small');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use current_model_only strategy', async () => {
      const response = await compatibility.search(queryEmbedding, {
        strategy: 'current_model_only',
      });

      expect(response.modelsSearched).toContain('text-embedding-3-small');
    });

    it('should use compatible_models strategy', async () => {
      const response = await compatibility.search(queryEmbedding, {
        strategy: 'compatible_models',
      });

      expect(response.modelsSearched.length).toBeGreaterThan(0);
    });

    it('should use all_with_fallback strategy', async () => {
      const response = await compatibility.search(queryEmbedding, {
        strategy: 'all_with_fallback',
      });

      expect(response.modelsSearched.length).toBeGreaterThan(0);
    });

    it('should use hybrid_rerank strategy', async () => {
      const response = await compatibility.search(queryEmbedding, {
        strategy: 'hybrid_rerank',
      });

      expect(response.modelsSearched.length).toBeGreaterThan(0);
    });

    it('should apply custom topK', async () => {
      const response = await compatibility.search(queryEmbedding, {
        topK: 5,
      });

      expect(response.results.length).toBeLessThanOrEqual(5);
    });

    it('should filter by clinicId', async () => {
      await compatibility.search(queryEmbedding, {
        targetTable: 'knowledge_base',
        clinicId: 'clinic-123',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should filter by language', async () => {
      await compatibility.search(queryEmbedding, {
        targetTable: 'knowledge_base',
        language: 'en',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should filter by sourceType', async () => {
      await compatibility.search(queryEmbedding, {
        targetTable: 'knowledge_base',
        sourceType: 'faq',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should search message_embeddings table', async () => {
      await compatibility.search(queryEmbedding, {
        targetTable: 'message_embeddings',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should search message_embeddings with clinicId filter', async () => {
      await compatibility.search(queryEmbedding, {
        targetTable: 'message_embeddings',
        clinicId: 'clinic-123',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should warn on mixed models when enabled', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            content: 'Content 1',
            title: 'Title 1',
            similarity: '0.85',
            embedding_model: 'text-embedding-ada-002', // Not current model
            embedding_version: 1,
            metadata: null,
          },
          {
            id: 'doc-2',
            content: 'Content 2',
            title: 'Title 2',
            similarity: '0.80',
            embedding_model: 'text-embedding-3-large', // Different non-current model
            embedding_version: 1,
            metadata: null,
          },
        ],
        rowCount: 2,
      } as QueryResult<{
        id: string;
        content: string;
        title: string;
        similarity: string;
        embedding_model: string;
        embedding_version: number;
        metadata: Record<string, unknown> | null;
      }>);

      const response = await compatibility.search(queryEmbedding, {
        warnOnMixedModels: true,
      });

      // Warning is triggered when results are from multiple models and none is current
      expect(response.mixedModelsWarning).toBe(true);
    });

    it('should apply current model boost', async () => {
      const response = await compatibility.search(queryEmbedding, {
        preferCurrentModel: true,
        currentModelBoost: 1.2,
      });

      // Find a result from current model
      const currentModelResult = response.results.find((r) => r.isCurrentModel);
      if (currentModelResult) {
        expect(currentModelResult.adjustedSimilarity).toBeGreaterThanOrEqual(
          currentModelResult.similarity
        );
      }
    });

    it('should cap adjusted similarity at 1', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          {
            id: 'doc-1',
            content: 'Content 1',
            title: 'Title 1',
            similarity: '0.95', // High similarity
            embedding_model: 'text-embedding-3-small',
            embedding_version: 2,
            metadata: null,
          },
        ],
        rowCount: 1,
      } as QueryResult<{
        id: string;
        content: string;
        title: string;
        similarity: string;
        embedding_model: string;
        embedding_version: number;
        metadata: Record<string, unknown> | null;
      }>);

      const response = await compatibility.search(queryEmbedding, {
        preferCurrentModel: true,
        currentModelBoost: 1.5,
      });

      expect(response.results[0]?.adjustedSimilarity).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // SEARCH CAPABILITY TESTS
  // ============================================================================

  describe('canSearchWithCurrentModel', () => {
    it('should return false when no embeddings exist', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<{ model: string; entry_count: string }>);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(false);
      expect(result.currentModelCoverage).toBe(0);
      expect(result.compatibleCoverage).toBe(0);
      expect(result.recommendation).toContain('No embeddings found');
    });

    it('should return optimal when nearly all entries use current model', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ model: 'text-embedding-3-small', entry_count: '980' }],
        rowCount: 1,
      } as QueryResult<{ model: string; entry_count: string }>);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(true);
      expect(result.currentModelCoverage).toBeGreaterThanOrEqual(0.95);
      expect(result.recommendation).toContain('Optimal');
    });

    it('should return good when all entries are compatible', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '500' },
          { model: 'text-embedding-ada-002', entry_count: '500' },
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(true);
      expect(result.compatibleCoverage).toBe(1); // Both are compatible
      expect(result.recommendation).toContain('Good');
    });

    it('should return warning when some entries need migration', async () => {
      // 80% compatible (800 current + 0 ada-002) / 1000 = 0.8, which is between 0.7 and 0.95
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '800' },
          { model: 'text-embedding-3-large', entry_count: '200' }, // Incompatible dimensions
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(true);
      expect(result.compatibleCoverage).toBeLessThan(1);
      expect(result.recommendation).toContain('Warning');
    });

    it('should return critical when many entries are incompatible', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-3-small', entry_count: '200' },
          { model: 'text-embedding-3-large', entry_count: '800' }, // Incompatible
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const result = await compatibility.canSearchWithCurrentModel('knowledge_base');

      expect(result.canSearch).toBe(true); // Can still search compatible subset
      expect(result.compatibleCoverage).toBeLessThan(0.7);
      expect(result.recommendation).toContain('Critical');
    });
  });

  // ============================================================================
  // UPGRADE RECOMMENDATIONS TESTS
  // ============================================================================

  describe('getUpgradeRecommendations', () => {
    it('should identify urgent migrations for deprecated models', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-ada-002', entry_count: '500' }, // Deprecated
          { model: 'text-embedding-3-small', entry_count: '500' },
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const recommendations = await compatibility.getUpgradeRecommendations('knowledge_base');

      expect(recommendations.urgentMigrations.length).toBeGreaterThan(0);
      const adaMigration = recommendations.urgentMigrations.find(
        (m) => m.model === 'text-embedding-ada-002'
      );
      expect(adaMigration?.reason).toContain('deprecated');
    });

    it('should identify urgent migrations for incompatible dimensions', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [
          { model: 'text-embedding-3-large', entry_count: '300' }, // Different dimensions
          { model: 'text-embedding-3-small', entry_count: '700' },
        ],
        rowCount: 2,
      } as QueryResult<{ model: string; entry_count: string }>);

      const recommendations = await compatibility.getUpgradeRecommendations('knowledge_base');

      const largeMigration = recommendations.urgentMigrations.find(
        (m) => m.model === 'text-embedding-3-large'
      );
      expect(largeMigration?.reason).toContain('Dimension mismatch');
    });

    it('should calculate health score correctly', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [{ model: 'text-embedding-3-small', entry_count: '1000' }],
        rowCount: 1,
      } as QueryResult<{ model: string; entry_count: string }>);

      const recommendations = await compatibility.getUpgradeRecommendations('knowledge_base');

      expect(recommendations.healthScore).toBe(100); // All entries use current model
    });

    it('should handle empty distribution', async () => {
      vi.mocked(mockPool.query).mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as QueryResult<{ model: string; entry_count: string }>);

      const recommendations = await compatibility.getUpgradeRecommendations('knowledge_base');

      expect(recommendations.healthScore).toBe(100);
      expect(recommendations.urgentMigrations).toHaveLength(0);
      expect(recommendations.optionalUpgrades).toHaveLength(0);
    });
  });

  // ============================================================================
  // MODEL MANAGEMENT TESTS
  // ============================================================================

  describe('setCurrentModel', () => {
    it('should update current model', () => {
      compatibility.setCurrentModel('text-embedding-3-large');

      const currentModelCompatibility =
        compatibility.getModelCompatibility('text-embedding-3-large');
      expect(currentModelCompatibility.isCurrent).toBe(true);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createEmbeddingVersionCompatibility', () => {
  it('should create with pool only', () => {
    const mockPool = createMockPool();
    const comp = createEmbeddingVersionCompatibility(mockPool);

    expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
  });

  it('should create with custom current model', () => {
    const mockPool = createMockPool();
    const comp = createEmbeddingVersionCompatibility(mockPool, 'text-embedding-3-large');

    expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
  });

  it('should create with custom registry', () => {
    const mockPool = createMockPool();
    const mockRegistry = createEmbeddingModelRegistry();
    const comp = createEmbeddingVersionCompatibility(
      mockPool,
      'text-embedding-3-small',
      mockRegistry
    );

    expect(comp).toBeInstanceOf(EmbeddingVersionCompatibility);
  });
});

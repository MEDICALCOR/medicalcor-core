/**
 * Embedding Model Registry Tests
 *
 * Comprehensive tests for the model registry:
 * - Model queries and metadata
 * - Migration path management
 * - Compatibility checks
 * - Statistics and reporting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  EMBEDDING_MODELS,
  MIGRATION_PATHS,
  EmbeddingModelIdSchema,
  ModelStatusSchema,
  EmbeddingModelConfigSchema,
  MigrationPathSchema,
  type EmbeddingModelId,
  type ModelStatus,
  type EmbeddingModelConfig,
  type MigrationPath,
} from '../embedding-model-registry.js';

// ============================================================================
// SCHEMA TESTS
// ============================================================================

describe('Schema Validation', () => {
  describe('EmbeddingModelIdSchema', () => {
    it('should validate all model IDs', () => {
      const validIds: EmbeddingModelId[] = [
        'text-embedding-3-small',
        'text-embedding-3-large',
        'text-embedding-ada-002',
      ];

      for (const id of validIds) {
        const result = EmbeddingModelIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid model ID', () => {
      const result = EmbeddingModelIdSchema.safeParse('invalid-model');
      expect(result.success).toBe(false);
    });
  });

  describe('ModelStatusSchema', () => {
    it('should validate all status values', () => {
      const statuses: ModelStatus[] = ['active', 'supported', 'deprecated', 'retired'];

      for (const status of statuses) {
        const result = ModelStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = ModelStatusSchema.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('EmbeddingModelConfigSchema', () => {
    it('should validate complete config', () => {
      const config: EmbeddingModelConfig = {
        id: 'text-embedding-3-small',
        displayName: 'Test Model',
        provider: 'openai',
        dimensions: 1536,
        maxInputTokens: 8191,
        status: 'active',
        version: '1.0.0',
        releasedAt: new Date(),
        costPer1MTokens: 0.02,
        qualityScore: 85,
      };

      const result = EmbeddingModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const config: EmbeddingModelConfig = {
        id: 'text-embedding-3-small',
        displayName: 'Test Model',
        provider: 'openai',
        dimensions: 1536,
        maxInputTokens: 8191,
        status: 'deprecated',
        version: '1.0.0',
        releasedAt: new Date(),
        deprecatedAt: new Date(),
        retiredAt: new Date(),
        migrateTo: 'text-embedding-3-large',
        costPer1MTokens: 0.02,
        qualityScore: 85,
        notes: 'Test notes',
      };

      const result = EmbeddingModelConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid dimensions', () => {
      const config = {
        id: 'text-embedding-3-small',
        displayName: 'Test',
        provider: 'openai',
        dimensions: -1,
        maxInputTokens: 8191,
        status: 'active',
        version: '1.0.0',
        releasedAt: new Date(),
        costPer1MTokens: 0.02,
        qualityScore: 85,
      };

      const result = EmbeddingModelConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject quality score out of range', () => {
      const config = {
        id: 'text-embedding-3-small',
        displayName: 'Test',
        provider: 'openai',
        dimensions: 1536,
        maxInputTokens: 8191,
        status: 'active',
        version: '1.0.0',
        releasedAt: new Date(),
        costPer1MTokens: 0.02,
        qualityScore: 150,
      };

      const result = EmbeddingModelConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('MigrationPathSchema', () => {
    it('should validate migration path', () => {
      const path: MigrationPath = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        priority: 5,
        requiresReindex: true,
        dimensionChange: false,
        estimatedQualityDelta: 15,
      };

      const result = MigrationPathSchema.safeParse(path);
      expect(result.success).toBe(true);
    });

    it('should apply default priority', () => {
      const path = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        requiresReindex: true,
        dimensionChange: false,
        estimatedQualityDelta: 15,
      };

      const result = MigrationPathSchema.parse(path);
      expect(result.priority).toBe(5);
    });

    it('should reject priority out of range', () => {
      const path = {
        fromModel: 'text-embedding-ada-002',
        toModel: 'text-embedding-3-small',
        priority: 15,
        requiresReindex: true,
        dimensionChange: false,
        estimatedQualityDelta: 15,
      };

      const result = MigrationPathSchema.safeParse(path);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('Constants', () => {
  describe('EMBEDDING_MODELS', () => {
    it('should contain all expected models', () => {
      expect(EMBEDDING_MODELS['text-embedding-3-small']).toBeDefined();
      expect(EMBEDDING_MODELS['text-embedding-3-large']).toBeDefined();
      expect(EMBEDDING_MODELS['text-embedding-ada-002']).toBeDefined();
    });

    it('should have correct dimensions', () => {
      expect(EMBEDDING_MODELS['text-embedding-3-small'].dimensions).toBe(1536);
      expect(EMBEDDING_MODELS['text-embedding-3-large'].dimensions).toBe(3072);
      expect(EMBEDDING_MODELS['text-embedding-ada-002'].dimensions).toBe(1536);
    });

    it('should have correct statuses', () => {
      expect(EMBEDDING_MODELS['text-embedding-3-small'].status).toBe('active');
      expect(EMBEDDING_MODELS['text-embedding-3-large'].status).toBe('supported');
      expect(EMBEDDING_MODELS['text-embedding-ada-002'].status).toBe('deprecated');
    });
  });

  describe('MIGRATION_PATHS', () => {
    it('should contain expected migration paths', () => {
      const adaToSmall = MIGRATION_PATHS.find(
        (p) => p.fromModel === 'text-embedding-ada-002' && p.toModel === 'text-embedding-3-small'
      );
      expect(adaToSmall).toBeDefined();
      expect(adaToSmall?.priority).toBe(10);
    });

    it('should have paths with correct dimension change flags', () => {
      const smallToLarge = MIGRATION_PATHS.find(
        (p) => p.fromModel === 'text-embedding-3-small' && p.toModel === 'text-embedding-3-large'
      );
      expect(smallToLarge?.dimensionChange).toBe(true);

      const adaToSmall = MIGRATION_PATHS.find(
        (p) => p.fromModel === 'text-embedding-ada-002' && p.toModel === 'text-embedding-3-small'
      );
      expect(adaToSmall?.dimensionChange).toBe(false);
    });
  });
});

// ============================================================================
// REGISTRY CLASS TESTS
// ============================================================================

describe('EmbeddingModelRegistry', () => {
  let registry: EmbeddingModelRegistry;

  beforeEach(() => {
    registry = new EmbeddingModelRegistry();
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create with default model', () => {
      const reg = new EmbeddingModelRegistry();
      const current = reg.getCurrentModel();
      expect(current.id).toBe('text-embedding-3-small');
    });

    it('should create with custom current model', () => {
      const reg = new EmbeddingModelRegistry('text-embedding-3-large');
      const current = reg.getCurrentModel();
      expect(current.id).toBe('text-embedding-3-large');
    });

    it('should apply custom model overrides', () => {
      const customModels: Partial<Record<EmbeddingModelId, Partial<EmbeddingModelConfig>>> = {
        'text-embedding-3-small': { costPer1MTokens: 0.05 },
      };
      const reg = new EmbeddingModelRegistry('text-embedding-3-small', customModels);
      const model = reg.getModel('text-embedding-3-small');
      expect(model?.costPer1MTokens).toBe(0.05);
    });

    it('should apply custom migration paths', () => {
      const customPaths: MigrationPath[] = [
        {
          fromModel: 'text-embedding-3-small',
          toModel: 'text-embedding-3-large',
          priority: 1,
          requiresReindex: true,
          dimensionChange: true,
          estimatedQualityDelta: 10,
        },
      ];
      const reg = new EmbeddingModelRegistry('text-embedding-3-small', undefined, customPaths);
      const paths = reg.getMigrationPathsFrom('text-embedding-3-small');
      expect(paths).toHaveLength(1);
      expect(paths[0]?.priority).toBe(1);
    });
  });

  // ============================================================================
  // MODEL QUERIES TESTS
  // ============================================================================

  describe('getCurrentModel', () => {
    it('should return current model config', () => {
      const current = registry.getCurrentModel();
      expect(current.id).toBe('text-embedding-3-small');
      expect(current.dimensions).toBe(1536);
    });

    it('should throw for non-existent current model', () => {
      // Create registry with invalid state (shouldn't happen in practice)
      const reg = new EmbeddingModelRegistry('text-embedding-3-small');
      // Access internal state to simulate corruption
      (reg as unknown as { models: Map<string, unknown> }).models.clear();

      expect(() => reg.getCurrentModel()).toThrow('not found in registry');
    });
  });

  describe('getModel', () => {
    it('should return model by ID', () => {
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.dimensions).toBe(3072);
    });

    it('should return undefined for non-existent model', () => {
      const model = registry.getModel('non-existent' as EmbeddingModelId);
      expect(model).toBeUndefined();
    });
  });

  describe('getAllModels', () => {
    it('should return all models', () => {
      const models = registry.getAllModels();
      expect(models.length).toBe(3);
    });
  });

  describe('getModelsByStatus', () => {
    it('should filter by active status', () => {
      const activeModels = registry.getModelsByStatus('active');
      expect(activeModels.length).toBeGreaterThan(0);
      expect(activeModels.every((m) => m.status === 'active')).toBe(true);
    });

    it('should filter by deprecated status', () => {
      const deprecatedModels = registry.getModelsByStatus('deprecated');
      expect(deprecatedModels.some((m) => m.id === 'text-embedding-ada-002')).toBe(true);
    });

    it('should return empty array for retired status (none retired)', () => {
      const retiredModels = registry.getModelsByStatus('retired');
      expect(retiredModels.length).toBe(0);
    });
  });

  describe('getActiveModels', () => {
    it('should return active and supported models', () => {
      const activeModels = registry.getActiveModels();
      expect(activeModels.every((m) => m.status === 'active' || m.status === 'supported')).toBe(
        true
      );
    });
  });

  describe('getDeprecatedModels', () => {
    it('should return deprecated and retired models', () => {
      const deprecatedModels = registry.getDeprecatedModels();
      expect(
        deprecatedModels.every((m) => m.status === 'deprecated' || m.status === 'retired')
      ).toBe(true);
    });
  });

  describe('isCurrentModel', () => {
    it('should return true for current model', () => {
      expect(registry.isCurrentModel('text-embedding-3-small')).toBe(true);
    });

    it('should return false for non-current model', () => {
      expect(registry.isCurrentModel('text-embedding-3-large')).toBe(false);
    });
  });

  describe('getDimensions', () => {
    it('should return correct dimensions', () => {
      expect(registry.getDimensions('text-embedding-3-small')).toBe(1536);
      expect(registry.getDimensions('text-embedding-3-large')).toBe(3072);
    });

    it('should return default 1536 for unknown model', () => {
      expect(registry.getDimensions('unknown' as EmbeddingModelId)).toBe(1536);
    });
  });

  // ============================================================================
  // MIGRATION PATH QUERIES TESTS
  // ============================================================================

  describe('getMigrationPath', () => {
    it('should return path between models', () => {
      const path = registry.getMigrationPath('text-embedding-ada-002', 'text-embedding-3-small');
      expect(path).toBeDefined();
      expect(path?.fromModel).toBe('text-embedding-ada-002');
      expect(path?.toModel).toBe('text-embedding-3-small');
    });

    it('should return undefined for non-existent path', () => {
      const path = registry.getMigrationPath('text-embedding-3-large', 'text-embedding-ada-002');
      expect(path).toBeUndefined();
    });
  });

  describe('getMigrationPathsFrom', () => {
    it('should return all paths from a model', () => {
      const paths = registry.getMigrationPathsFrom('text-embedding-ada-002');
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.fromModel === 'text-embedding-ada-002')).toBe(true);
    });

    it('should sort by priority descending', () => {
      const paths = registry.getMigrationPathsFrom('text-embedding-ada-002');
      for (let i = 1; i < paths.length; i++) {
        expect(paths[i - 1]!.priority).toBeGreaterThanOrEqual(paths[i]!.priority);
      }
    });
  });

  describe('getRecommendedMigration', () => {
    it('should return recommended migration for deprecated model', () => {
      const path = registry.getRecommendedMigration('text-embedding-ada-002');
      expect(path).toBeDefined();
      expect(path?.toModel).toBe('text-embedding-3-small');
    });

    it('should use migrateTo hint from model config', () => {
      // Ada-002 has migrateTo: 'text-embedding-3-small'
      const path = registry.getRecommendedMigration('text-embedding-ada-002');
      expect(path?.toModel).toBe('text-embedding-3-small');
    });

    it('should return highest priority path if no migrateTo hint', () => {
      // Small doesn't have migrateTo set, should get highest priority
      const path = registry.getRecommendedMigration('text-embedding-3-small');
      // Either returns path or undefined (if no paths from small)
      expect(path === undefined || path.fromModel === 'text-embedding-3-small').toBe(true);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return migrations from deprecated/retired models', () => {
      const pending = registry.getPendingMigrations();
      // Ada-002 is deprecated, so should have pending migration
      expect(pending.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // COMPATIBILITY CHECKS TESTS
  // ============================================================================

  describe('checkCompatibility', () => {
    it('should return compatible for same model', () => {
      const result = registry.checkCompatibility(
        'text-embedding-3-small',
        'text-embedding-3-small'
      );
      expect(result.compatible).toBe(true);
      expect(result.dimensionMismatch).toBe(false);
      expect(result.requiresMigration).toBe(false);
    });

    it('should return compatible for same dimensions', () => {
      const result = registry.checkCompatibility(
        'text-embedding-ada-002',
        'text-embedding-3-small'
      );
      expect(result.compatible).toBe(true);
      expect(result.dimensionMismatch).toBe(false);
    });

    it('should return incompatible for different dimensions', () => {
      const result = registry.checkCompatibility(
        'text-embedding-3-small',
        'text-embedding-3-large'
      );
      expect(result.compatible).toBe(false);
      expect(result.dimensionMismatch).toBe(true);
      expect(result.requiresMigration).toBe(true);
    });

    it('should indicate migration required for deprecated source', () => {
      const result = registry.checkCompatibility(
        'text-embedding-ada-002',
        'text-embedding-3-small'
      );
      expect(result.requiresMigration).toBe(true);
    });

    it('should return incompatible for unknown models', () => {
      const result = registry.checkCompatibility(
        'unknown' as EmbeddingModelId,
        'text-embedding-3-small'
      );
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should include migration path in result', () => {
      const result = registry.checkCompatibility(
        'text-embedding-ada-002',
        'text-embedding-3-small'
      );
      expect(result.migrationPath).toBeDefined();
    });
  });

  describe('needsMigration', () => {
    it('should return true for deprecated model', () => {
      expect(registry.needsMigration('text-embedding-ada-002')).toBe(true);
    });

    it('should return false for active model', () => {
      expect(registry.needsMigration('text-embedding-3-small')).toBe(false);
    });

    it('should return false for supported model', () => {
      expect(registry.needsMigration('text-embedding-3-large')).toBe(false);
    });

    it('should return true for unknown model', () => {
      expect(registry.needsMigration('unknown' as EmbeddingModelId)).toBe(true);
    });
  });

  describe('validateEmbeddingDimensions', () => {
    it('should return true for correct dimensions', () => {
      const embedding = new Array(1536).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'text-embedding-3-small')).toBe(true);
    });

    it('should return false for incorrect dimensions', () => {
      const embedding = new Array(3072).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'text-embedding-3-small')).toBe(false);
    });

    it('should return false for unknown model', () => {
      const embedding = new Array(1536).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'unknown' as EmbeddingModelId)).toBe(
        false
      );
    });
  });

  // ============================================================================
  // STATISTICS AND REPORTING TESTS
  // ============================================================================

  describe('getStats', () => {
    it('should return registry statistics', () => {
      const stats = registry.getStats();

      expect(stats.totalModels).toBe(3);
      expect(stats.activeModels).toBeGreaterThan(0);
      expect(stats.deprecatedModels).toBeGreaterThan(0);
      expect(stats.migrationPaths).toBeGreaterThan(0);
    });
  });

  describe('getMigrationSummary', () => {
    it('should return migration summary', () => {
      const summary = registry.getMigrationSummary();

      expect(summary.modelsNeedingMigration).toContain('text-embedding-ada-002');
      expect(summary.recommendedPaths.size).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(summary.estimatedEffort);
    });

    it('should estimate effort based on dimension changes', () => {
      // Create registry where all deprecated models have dimension changes
      const customPaths: MigrationPath[] = [
        {
          fromModel: 'text-embedding-ada-002',
          toModel: 'text-embedding-3-large',
          priority: 10,
          requiresReindex: true,
          dimensionChange: true,
          estimatedQualityDelta: 25,
        },
      ];
      const reg = new EmbeddingModelRegistry('text-embedding-3-small', undefined, customPaths);
      const summary = reg.getMigrationSummary();

      expect(summary.estimatedEffort).toBe('high');
    });
  });

  // ============================================================================
  // MODEL MANAGEMENT TESTS
  // ============================================================================

  describe('setCurrentModel', () => {
    it('should update current model', () => {
      registry.setCurrentModel('text-embedding-3-large');
      expect(registry.getCurrentModel().id).toBe('text-embedding-3-large');
    });

    it('should throw for non-existent model', () => {
      expect(() => registry.setCurrentModel('unknown' as EmbeddingModelId)).toThrow('not found');
    });

    it('should throw for retired model', () => {
      // First set a model as retired
      registry.updateModelStatus('text-embedding-ada-002', 'retired');
      expect(() => registry.setCurrentModel('text-embedding-ada-002')).toThrow('retired');
    });
  });

  describe('updateModelStatus', () => {
    it('should update model status', () => {
      registry.updateModelStatus('text-embedding-3-large', 'deprecated');
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.status).toBe('deprecated');
    });

    it('should update deprecatedAt date', () => {
      const deprecatedDate = new Date();
      registry.updateModelStatus('text-embedding-3-large', 'deprecated', deprecatedDate);
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.deprecatedAt).toEqual(deprecatedDate);
    });

    it('should throw for non-existent model', () => {
      expect(() => registry.updateModelStatus('unknown' as EmbeddingModelId, 'active')).toThrow(
        'not found'
      );
    });
  });
});

// ============================================================================
// FACTORY AND SINGLETON TESTS
// ============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetDefaultRegistry();
  });

  describe('createEmbeddingModelRegistry', () => {
    it('should create registry with defaults', () => {
      const registry = createEmbeddingModelRegistry();
      expect(registry).toBeInstanceOf(EmbeddingModelRegistry);
    });

    it('should create registry with custom model', () => {
      const registry = createEmbeddingModelRegistry('text-embedding-3-large');
      expect(registry.getCurrentModel().id).toBe('text-embedding-3-large');
    });

    it('should create registry with all parameters', () => {
      const customModels: Partial<Record<EmbeddingModelId, Partial<EmbeddingModelConfig>>> = {
        'text-embedding-3-small': { qualityScore: 90 },
      };
      const customPaths: MigrationPath[] = [];

      const registry = createEmbeddingModelRegistry(
        'text-embedding-3-small',
        customModels,
        customPaths
      );

      expect(registry.getModel('text-embedding-3-small')?.qualityScore).toBe(90);
    });
  });

  describe('getDefaultRegistry', () => {
    it('should return singleton instance', () => {
      const reg1 = getDefaultRegistry();
      const reg2 = getDefaultRegistry();
      expect(reg1).toBe(reg2);
    });

    it('should create new instance after reset', () => {
      const reg1 = getDefaultRegistry();
      resetDefaultRegistry();
      const reg2 = getDefaultRegistry();
      expect(reg1).not.toBe(reg2);
    });
  });

  describe('resetDefaultRegistry', () => {
    it('should reset the singleton', () => {
      const reg1 = getDefaultRegistry();
      reg1.setCurrentModel('text-embedding-3-large');

      resetDefaultRegistry();
      const reg2 = getDefaultRegistry();

      expect(reg2.getCurrentModel().id).toBe('text-embedding-3-small');
    });
  });
});

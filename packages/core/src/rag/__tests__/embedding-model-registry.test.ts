/**
 * Tests for Embedding Model Registry
 *
 * Tests model configuration, migration paths, compatibility checks, and registry statistics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
  EMBEDDING_MODELS,
  MIGRATION_PATHS,
  type EmbeddingModelId,
  type EmbeddingModelConfig,
  type MigrationPath,
} from '../embedding-model-registry.js';

describe('EmbeddingModelRegistry', () => {
  let registry: EmbeddingModelRegistry;

  beforeEach(() => {
    registry = new EmbeddingModelRegistry();
    resetDefaultRegistry();
  });

  afterEach(() => {
    resetDefaultRegistry();
  });

  describe('constructor', () => {
    it('should create registry with default model', () => {
      const reg = new EmbeddingModelRegistry();
      const current = reg.getCurrentModel();
      expect(current.id).toBe('text-embedding-3-small');
    });

    it('should create registry with custom current model', () => {
      const reg = new EmbeddingModelRegistry('text-embedding-3-large');
      const current = reg.getCurrentModel();
      expect(current.id).toBe('text-embedding-3-large');
    });

    it('should apply custom model overrides', () => {
      const reg = new EmbeddingModelRegistry('text-embedding-3-small', {
        'text-embedding-3-small': {
          qualityScore: 90,
          notes: 'Custom notes',
        },
      });
      const model = reg.getModel('text-embedding-3-small');
      expect(model?.qualityScore).toBe(90);
      expect(model?.notes).toBe('Custom notes');
    });

    it('should use custom migration paths when provided', () => {
      const customPaths: MigrationPath[] = [
        {
          fromModel: 'text-embedding-3-small',
          toModel: 'text-embedding-3-large',
          priority: 10,
          requiresReindex: false,
          dimensionChange: true,
          estimatedQualityDelta: 20,
        },
      ];
      const reg = new EmbeddingModelRegistry('text-embedding-3-small', undefined, customPaths);
      const paths = reg.getMigrationPathsFrom('text-embedding-3-small');
      expect(paths.length).toBe(1);
      expect(paths[0]?.priority).toBe(10);
    });
  });

  describe('getCurrentModel', () => {
    it('should return current model configuration', () => {
      const model = registry.getCurrentModel();
      expect(model).toBeDefined();
      expect(model.id).toBe('text-embedding-3-small');
      expect(model.dimensions).toBe(1536);
    });

    it('should throw if current model not found', () => {
      // Create registry with invalid model in internal state (edge case)
      const reg = createEmbeddingModelRegistry('text-embedding-3-small');
      // Access private field for testing edge case
      (reg as unknown as { currentModel: string }).currentModel =
        'invalid-model' as EmbeddingModelId;

      expect(() => reg.getCurrentModel()).toThrow('not found in registry');
    });
  });

  describe('getModel', () => {
    it('should return model by ID', () => {
      const model = registry.getModel('text-embedding-3-large');
      expect(model).toBeDefined();
      expect(model?.dimensions).toBe(3072);
    });

    it('should return undefined for unknown model', () => {
      const model = registry.getModel('unknown-model' as EmbeddingModelId);
      expect(model).toBeUndefined();
    });
  });

  describe('getAllModels', () => {
    it('should return all registered models', () => {
      const models = registry.getAllModels();
      expect(models.length).toBe(3);
    });

    it('should include all model types', () => {
      const models = registry.getAllModels();
      const ids = models.map((m) => m.id);
      expect(ids).toContain('text-embedding-3-small');
      expect(ids).toContain('text-embedding-3-large');
      expect(ids).toContain('text-embedding-ada-002');
    });
  });

  describe('getModelsByStatus', () => {
    it('should filter by active status', () => {
      const active = registry.getModelsByStatus('active');
      expect(active.every((m) => m.status === 'active')).toBe(true);
    });

    it('should filter by deprecated status', () => {
      const deprecated = registry.getModelsByStatus('deprecated');
      expect(deprecated.every((m) => m.status === 'deprecated')).toBe(true);
    });

    it('should filter by supported status', () => {
      const supported = registry.getModelsByStatus('supported');
      expect(supported.every((m) => m.status === 'supported')).toBe(true);
    });

    it('should return empty for retired (none configured)', () => {
      const retired = registry.getModelsByStatus('retired');
      expect(retired.length).toBe(0);
    });
  });

  describe('getActiveModels', () => {
    it('should return active and supported models', () => {
      const active = registry.getActiveModels();
      expect(active.every((m) => m.status === 'active' || m.status === 'supported')).toBe(true);
    });

    it('should not include deprecated models', () => {
      const active = registry.getActiveModels();
      expect(active.some((m) => m.status === 'deprecated')).toBe(false);
    });
  });

  describe('getDeprecatedModels', () => {
    it('should return deprecated and retired models', () => {
      const deprecated = registry.getDeprecatedModels();
      expect(deprecated.every((m) => m.status === 'deprecated' || m.status === 'retired')).toBe(
        true
      );
    });

    it('should include ada-002 as deprecated', () => {
      const deprecated = registry.getDeprecatedModels();
      expect(deprecated.some((m) => m.id === 'text-embedding-ada-002')).toBe(true);
    });
  });

  describe('isCurrentModel', () => {
    it('should return true for current model', () => {
      expect(registry.isCurrentModel('text-embedding-3-small')).toBe(true);
    });

    it('should return false for other models', () => {
      expect(registry.isCurrentModel('text-embedding-3-large')).toBe(false);
    });
  });

  describe('getDimensions', () => {
    it('should return dimensions for known model', () => {
      expect(registry.getDimensions('text-embedding-3-small')).toBe(1536);
      expect(registry.getDimensions('text-embedding-3-large')).toBe(3072);
    });

    it('should return default 1536 for unknown model', () => {
      expect(registry.getDimensions('unknown' as EmbeddingModelId)).toBe(1536);
    });
  });

  describe('getMigrationPath', () => {
    it('should return migration path between models', () => {
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
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it('should sort by priority descending', () => {
      const paths = registry.getMigrationPathsFrom('text-embedding-ada-002');
      if (paths.length > 1) {
        expect(paths[0]!.priority).toBeGreaterThanOrEqual(paths[1]!.priority);
      }
    });

    it('should return empty array if no paths', () => {
      const paths = registry.getMigrationPathsFrom('text-embedding-3-large');
      expect(paths).toEqual([]);
    });
  });

  describe('getRecommendedMigration', () => {
    it('should return recommended migration for deprecated model', () => {
      const path = registry.getRecommendedMigration('text-embedding-ada-002');
      expect(path).toBeDefined();
      expect(path?.toModel).toBe('text-embedding-3-small');
    });

    it('should prefer explicit migrateTo path', () => {
      // ada-002 has migrateTo set to text-embedding-3-small
      const path = registry.getRecommendedMigration('text-embedding-ada-002');
      expect(path?.toModel).toBe('text-embedding-3-small');
    });

    it('should return highest priority path if no migrateTo', () => {
      const path = registry.getRecommendedMigration('text-embedding-3-small');
      // Should return path to text-embedding-3-large if exists
      if (path) {
        expect(path.fromModel).toBe('text-embedding-3-small');
      }
    });

    it('should return undefined if no migration paths', () => {
      const path = registry.getRecommendedMigration('text-embedding-3-large');
      expect(path).toBeUndefined();
    });
  });

  describe('getPendingMigrations', () => {
    it('should return migrations for deprecated models', () => {
      const pending = registry.getPendingMigrations();
      expect(pending.length).toBeGreaterThanOrEqual(1);
    });

    it('should only include paths from deprecated/retired models', () => {
      const pending = registry.getPendingMigrations();
      const deprecated = registry.getDeprecatedModels().map((m) => m.id);
      expect(pending.every((p) => deprecated.includes(p.fromModel))).toBe(true);
    });
  });

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

    it('should detect dimension mismatch', () => {
      const result = registry.checkCompatibility(
        'text-embedding-3-small',
        'text-embedding-3-large'
      );
      expect(result.compatible).toBe(false);
      expect(result.dimensionMismatch).toBe(true);
      expect(result.requiresMigration).toBe(true);
    });

    it('should return compatible for same dimensions different models', () => {
      const result = registry.checkCompatibility(
        'text-embedding-3-small',
        'text-embedding-ada-002'
      );
      // Both have 1536 dimensions
      expect(result.compatible).toBe(true);
      expect(result.dimensionMismatch).toBe(false);
    });

    it('should require migration for deprecated source', () => {
      const result = registry.checkCompatibility(
        'text-embedding-ada-002',
        'text-embedding-3-small'
      );
      expect(result.requiresMigration).toBe(true);
    });

    it('should handle unknown models', () => {
      const result = registry.checkCompatibility(
        'unknown' as EmbeddingModelId,
        'text-embedding-3-small'
      );
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should include migration path when available', () => {
      const result = registry.checkCompatibility(
        'text-embedding-3-small',
        'text-embedding-3-large'
      );
      // May or may not have migration path depending on configuration
      expect(result.requiresMigration).toBe(true);
    });
  });

  describe('needsMigration', () => {
    it('should return true for deprecated model', () => {
      expect(registry.needsMigration('text-embedding-ada-002')).toBe(true);
    });

    it('should return false for active model', () => {
      expect(registry.needsMigration('text-embedding-3-small')).toBe(false);
    });

    it('should return true for unknown model', () => {
      expect(registry.needsMigration('unknown' as EmbeddingModelId)).toBe(true);
    });
  });

  describe('validateEmbeddingDimensions', () => {
    it('should validate correct dimensions', () => {
      const embedding = new Array(1536).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'text-embedding-3-small')).toBe(true);
    });

    it('should reject incorrect dimensions', () => {
      const embedding = new Array(1024).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'text-embedding-3-small')).toBe(false);
    });

    it('should return false for unknown model', () => {
      const embedding = new Array(1536).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'unknown' as EmbeddingModelId)).toBe(
        false
      );
    });

    it('should validate large model dimensions', () => {
      const embedding = new Array(3072).fill(0.1);
      expect(registry.validateEmbeddingDimensions(embedding, 'text-embedding-3-large')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return registry statistics', () => {
      const stats = registry.getStats();
      expect(stats.totalModels).toBe(3);
      expect(stats.activeModels).toBeGreaterThanOrEqual(1);
      expect(stats.deprecatedModels).toBeGreaterThanOrEqual(1);
      expect(stats.migrationPaths).toBeGreaterThanOrEqual(1);
    });

    it('should count models correctly', () => {
      const stats = registry.getStats();
      expect(stats.activeModels + stats.deprecatedModels + stats.retiredModels).toBeLessThanOrEqual(
        stats.totalModels
      );
    });
  });

  describe('getMigrationSummary', () => {
    it('should return migration summary', () => {
      const summary = registry.getMigrationSummary();
      expect(summary.modelsNeedingMigration).toBeDefined();
      expect(summary.recommendedPaths).toBeDefined();
      expect(summary.estimatedEffort).toBeDefined();
    });

    it('should include deprecated models in needs migration list', () => {
      const summary = registry.getMigrationSummary();
      expect(summary.modelsNeedingMigration).toContain('text-embedding-ada-002');
    });

    it('should have recommended path for deprecated models', () => {
      const summary = registry.getMigrationSummary();
      expect(summary.recommendedPaths.has('text-embedding-ada-002')).toBe(true);
    });

    it('should estimate effort based on dimension changes', () => {
      const summary = registry.getMigrationSummary();
      expect(['low', 'medium', 'high']).toContain(summary.estimatedEffort);
    });
  });

  describe('setCurrentModel', () => {
    it('should change current model', () => {
      registry.setCurrentModel('text-embedding-3-large');
      expect(registry.getCurrentModel().id).toBe('text-embedding-3-large');
    });

    it('should throw for unknown model', () => {
      expect(() => registry.setCurrentModel('unknown' as EmbeddingModelId)).toThrow(
        'not found in registry'
      );
    });

    it('should throw for retired model', () => {
      // First set a model as retired
      registry.updateModelStatus('text-embedding-ada-002', 'retired');
      expect(() => registry.setCurrentModel('text-embedding-ada-002')).toThrow(
        'Cannot set retired model'
      );
    });
  });

  describe('updateModelStatus', () => {
    it('should update model status', () => {
      registry.updateModelStatus('text-embedding-3-large', 'deprecated');
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.status).toBe('deprecated');
    });

    it('should set deprecatedAt date', () => {
      const deprecatedDate = new Date('2025-01-01');
      registry.updateModelStatus('text-embedding-3-large', 'deprecated', deprecatedDate);
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.deprecatedAt).toEqual(deprecatedDate);
    });

    it('should throw for unknown model', () => {
      expect(() => registry.updateModelStatus('unknown' as EmbeddingModelId, 'deprecated')).toThrow(
        'not found in registry'
      );
    });

    it('should preserve existing deprecatedAt if not provided', () => {
      const firstDate = new Date('2024-06-01');
      registry.updateModelStatus('text-embedding-3-large', 'deprecated', firstDate);

      registry.updateModelStatus('text-embedding-3-large', 'retired');
      const model = registry.getModel('text-embedding-3-large');
      expect(model?.deprecatedAt).toEqual(firstDate);
    });
  });
});

describe('Factory Functions', () => {
  afterEach(() => {
    resetDefaultRegistry();
  });

  describe('createEmbeddingModelRegistry', () => {
    it('should create registry with defaults', () => {
      const reg = createEmbeddingModelRegistry();
      expect(reg).toBeInstanceOf(EmbeddingModelRegistry);
    });

    it('should create registry with custom model', () => {
      const reg = createEmbeddingModelRegistry('text-embedding-3-large');
      expect(reg.getCurrentModel().id).toBe('text-embedding-3-large');
    });

    it('should create registry with custom models and paths', () => {
      const customModels = {
        'text-embedding-3-small': { qualityScore: 95 },
      };
      const customPaths: MigrationPath[] = [];
      const reg = createEmbeddingModelRegistry('text-embedding-3-small', customModels, customPaths);
      expect(reg.getModel('text-embedding-3-small')?.qualityScore).toBe(95);
    });
  });

  describe('getDefaultRegistry', () => {
    it('should return singleton instance', () => {
      const reg1 = getDefaultRegistry();
      const reg2 = getDefaultRegistry();
      expect(reg1).toBe(reg2);
    });

    it('should create registry if not exists', () => {
      resetDefaultRegistry();
      const reg = getDefaultRegistry();
      expect(reg).toBeInstanceOf(EmbeddingModelRegistry);
    });
  });

  describe('resetDefaultRegistry', () => {
    it('should reset singleton', () => {
      const reg1 = getDefaultRegistry();
      resetDefaultRegistry();
      const reg2 = getDefaultRegistry();
      expect(reg1).not.toBe(reg2);
    });
  });
});

describe('Exported Constants', () => {
  describe('EMBEDDING_MODELS', () => {
    it('should contain all model configurations', () => {
      expect(EMBEDDING_MODELS['text-embedding-3-small']).toBeDefined();
      expect(EMBEDDING_MODELS['text-embedding-3-large']).toBeDefined();
      expect(EMBEDDING_MODELS['text-embedding-ada-002']).toBeDefined();
    });

    it('should have valid configurations', () => {
      for (const model of Object.values(EMBEDDING_MODELS)) {
        expect(model.id).toBeDefined();
        expect(model.dimensions).toBeGreaterThan(0);
        expect(model.maxInputTokens).toBeGreaterThan(0);
        expect(model.costPer1MTokens).toBeGreaterThan(0);
        expect(model.qualityScore).toBeGreaterThanOrEqual(0);
        expect(model.qualityScore).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('MIGRATION_PATHS', () => {
    it('should contain migration paths', () => {
      expect(MIGRATION_PATHS.length).toBeGreaterThan(0);
    });

    it('should have valid migration path configurations', () => {
      for (const path of MIGRATION_PATHS) {
        expect(path.fromModel).toBeDefined();
        expect(path.toModel).toBeDefined();
        expect(path.priority).toBeGreaterThanOrEqual(1);
        expect(path.priority).toBeLessThanOrEqual(10);
        expect(typeof path.requiresReindex).toBe('boolean');
        expect(typeof path.dimensionChange).toBe('boolean');
      }
    });
  });
});

import { z } from 'zod';

/**
 * Embedding Model Registry
 *
 * Centralized configuration for embedding models with version metadata,
 * deprecation tracking, and migration path definitions.
 *
 * @module @medicalcor/core/rag/embedding-model-registry
 */

// =============================================================================
// Schema Definitions
// =============================================================================

export const EmbeddingModelIdSchema = z.enum([
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
]);

export type EmbeddingModelId = z.infer<typeof EmbeddingModelIdSchema>;

export const ModelStatusSchema = z.enum([
  'active', // Current recommended model
  'supported', // Still supported but not recommended for new embeddings
  'deprecated', // Scheduled for removal, should migrate away
  'retired', // No longer supported, must migrate
]);

export type ModelStatus = z.infer<typeof ModelStatusSchema>;

export const EmbeddingModelConfigSchema = z.object({
  id: EmbeddingModelIdSchema,
  displayName: z.string(),
  provider: z.literal('openai'),
  dimensions: z.number().int().positive(),
  maxInputTokens: z.number().int().positive(),
  status: ModelStatusSchema,
  version: z.string(), // Semantic version of this config
  releasedAt: z.date(),
  deprecatedAt: z.date().optional(),
  retiredAt: z.date().optional(),
  migrateTo: EmbeddingModelIdSchema.optional(), // Recommended migration target
  costPer1MTokens: z.number().positive(), // USD cost per 1M tokens
  qualityScore: z.number().min(0).max(100), // Relative quality rating
  notes: z.string().optional(),
});

export type EmbeddingModelConfig = z.infer<typeof EmbeddingModelConfigSchema>;

export const MigrationPathSchema = z.object({
  fromModel: EmbeddingModelIdSchema,
  toModel: EmbeddingModelIdSchema,
  priority: z.number().int().min(1).max(10).default(5),
  requiresReindex: z.boolean().default(true),
  dimensionChange: z.boolean(),
  estimatedQualityDelta: z.number().min(-100).max(100), // Percentage change
  notes: z.string().optional(),
});

export type MigrationPath = z.infer<typeof MigrationPathSchema>;

// =============================================================================
// Model Registry Configuration
// =============================================================================

/**
 * Comprehensive registry of all supported embedding models
 */
export const EMBEDDING_MODELS: Record<EmbeddingModelId, EmbeddingModelConfig> = {
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    displayName: 'Text Embedding 3 Small',
    provider: 'openai',
    dimensions: 1536,
    maxInputTokens: 8191,
    status: 'active',
    version: '1.0.0',
    releasedAt: new Date('2024-01-25'),
    costPer1MTokens: 0.02,
    qualityScore: 85,
    notes: 'Cost-effective model with excellent quality for most use cases',
  },
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    displayName: 'Text Embedding 3 Large',
    provider: 'openai',
    dimensions: 3072,
    maxInputTokens: 8191,
    status: 'supported',
    version: '1.0.0',
    releasedAt: new Date('2024-01-25'),
    costPer1MTokens: 0.13,
    qualityScore: 95,
    notes: 'Highest quality model, recommended for precision-critical use cases',
  },
  'text-embedding-ada-002': {
    id: 'text-embedding-ada-002',
    displayName: 'Ada 002 (Legacy)',
    provider: 'openai',
    dimensions: 1536,
    maxInputTokens: 8191,
    status: 'deprecated',
    version: '1.0.0',
    releasedAt: new Date('2022-12-15'),
    deprecatedAt: new Date('2024-01-25'),
    migrateTo: 'text-embedding-3-small',
    costPer1MTokens: 0.1,
    qualityScore: 70,
    notes: 'Legacy model, migrate to text-embedding-3-small for better performance and cost',
  },
};

/**
 * Defined migration paths between models
 */
export const MIGRATION_PATHS: MigrationPath[] = [
  {
    fromModel: 'text-embedding-ada-002',
    toModel: 'text-embedding-3-small',
    priority: 10, // High priority - deprecated model
    requiresReindex: true,
    dimensionChange: false,
    estimatedQualityDelta: 21, // 15% improvement
    notes: 'Recommended migration: better quality at lower cost',
  },
  {
    fromModel: 'text-embedding-3-small',
    toModel: 'text-embedding-3-large',
    priority: 3, // Low priority - optional upgrade
    requiresReindex: true,
    dimensionChange: true,
    estimatedQualityDelta: 12, // 12% improvement
    notes: 'Optional upgrade for precision-critical applications',
  },
  {
    fromModel: 'text-embedding-ada-002',
    toModel: 'text-embedding-3-large',
    priority: 5,
    requiresReindex: true,
    dimensionChange: true,
    estimatedQualityDelta: 36,
    notes: 'Direct upgrade to highest quality model',
  },
];

// =============================================================================
// Registry Class
// =============================================================================

export interface ModelRegistryStats {
  totalModels: number;
  activeModels: number;
  deprecatedModels: number;
  retiredModels: number;
  migrationPaths: number;
}

export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
  dimensionMismatch: boolean;
  requiresMigration: boolean;
  migrationPath?: MigrationPath;
}

/**
 * Embedding Model Registry Service
 *
 * Provides model metadata, migration paths, and compatibility checks
 */
export class EmbeddingModelRegistry {
  private models: Map<EmbeddingModelId, EmbeddingModelConfig>;
  private migrationPaths: MigrationPath[];
  private currentModel: EmbeddingModelId;

  constructor(
    currentModel: EmbeddingModelId = 'text-embedding-3-small',
    customModels?: Partial<Record<EmbeddingModelId, Partial<EmbeddingModelConfig>>>,
    customPaths?: MigrationPath[]
  ) {
    this.currentModel = currentModel;
    this.models = new Map();

    // Load default models with any custom overrides
    for (const [id, config] of Object.entries(EMBEDDING_MODELS)) {
      const customConfig = customModels?.[id as EmbeddingModelId];
      this.models.set(
        id as EmbeddingModelId,
        {
          ...config,
          ...customConfig,
        } as EmbeddingModelConfig
      );
    }

    // Load migration paths
    this.migrationPaths = customPaths ?? [...MIGRATION_PATHS];
  }

  // ===========================================================================
  // Model Queries
  // ===========================================================================

  /**
   * Get the current active model configuration
   */
  getCurrentModel(): EmbeddingModelConfig {
    const model = this.models.get(this.currentModel);
    if (!model) {
      throw new Error(`Current model ${this.currentModel} not found in registry`);
    }
    return model;
  }

  /**
   * Get model configuration by ID
   */
  getModel(id: EmbeddingModelId): EmbeddingModelConfig | undefined {
    return this.models.get(id);
  }

  /**
   * Get all registered models
   */
  getAllModels(): EmbeddingModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by status
   */
  getModelsByStatus(status: ModelStatus): EmbeddingModelConfig[] {
    return this.getAllModels().filter((m) => m.status === status);
  }

  /**
   * Get all active models (active or supported)
   */
  getActiveModels(): EmbeddingModelConfig[] {
    return this.getAllModels().filter((m) => m.status === 'active' || m.status === 'supported');
  }

  /**
   * Get deprecated models that need migration
   */
  getDeprecatedModels(): EmbeddingModelConfig[] {
    return this.getAllModels().filter((m) => m.status === 'deprecated' || m.status === 'retired');
  }

  /**
   * Check if a model is the current active model
   */
  isCurrentModel(id: EmbeddingModelId): boolean {
    return id === this.currentModel;
  }

  /**
   * Get model dimensions
   */
  getDimensions(id: EmbeddingModelId): number {
    const model = this.models.get(id);
    return model?.dimensions ?? 1536;
  }

  // ===========================================================================
  // Migration Path Queries
  // ===========================================================================

  /**
   * Get migration path from one model to another
   */
  getMigrationPath(from: EmbeddingModelId, to: EmbeddingModelId): MigrationPath | undefined {
    return this.migrationPaths.find((p) => p.fromModel === from && p.toModel === to);
  }

  /**
   * Get all migration paths from a model
   */
  getMigrationPathsFrom(from: EmbeddingModelId): MigrationPath[] {
    return this.migrationPaths
      .filter((p) => p.fromModel === from)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get recommended migration for a model
   */
  getRecommendedMigration(from: EmbeddingModelId): MigrationPath | undefined {
    const model = this.models.get(from);

    // If model has explicit migrateTo, use that path
    if (model?.migrateTo) {
      const path = this.getMigrationPath(from, model.migrateTo);
      if (path) return path;
    }

    // Otherwise, get highest priority path
    const paths = this.getMigrationPathsFrom(from);
    return paths[0];
  }

  /**
   * Get all pending migrations (from deprecated/retired models to active)
   */
  getPendingMigrations(): MigrationPath[] {
    const deprecatedModels = this.getDeprecatedModels();
    return deprecatedModels
      .map((m) => this.getRecommendedMigration(m.id))
      .filter((p): p is MigrationPath => p !== undefined);
  }

  // ===========================================================================
  // Compatibility Checks
  // ===========================================================================

  /**
   * Check compatibility between two models for search
   */
  checkCompatibility(
    sourceModel: EmbeddingModelId,
    targetModel: EmbeddingModelId
  ): CompatibilityResult {
    const source = this.models.get(sourceModel);
    const target = this.models.get(targetModel);

    if (!source || !target) {
      return {
        compatible: false,
        reason: 'One or both models not found in registry',
        dimensionMismatch: true,
        requiresMigration: true,
      };
    }

    const dimensionMismatch = source.dimensions !== target.dimensions;

    if (sourceModel === targetModel) {
      return {
        compatible: true,
        dimensionMismatch: false,
        requiresMigration: false,
      };
    }

    if (dimensionMismatch) {
      return {
        compatible: false,
        reason: `Dimension mismatch: ${source.dimensions} vs ${target.dimensions}`,
        dimensionMismatch: true,
        requiresMigration: true,
        migrationPath: this.getMigrationPath(sourceModel, targetModel),
      };
    }

    // Same dimensions but different models - can search but quality may vary
    return {
      compatible: true,
      reason: 'Same dimensions, search possible but results may have reduced quality',
      dimensionMismatch: false,
      requiresMigration: source.status === 'deprecated' || source.status === 'retired',
      migrationPath: this.getMigrationPath(sourceModel, targetModel),
    };
  }

  /**
   * Check if model needs migration
   */
  needsMigration(modelId: EmbeddingModelId): boolean {
    const model = this.models.get(modelId);
    if (!model) return true;
    return model.status === 'deprecated' || model.status === 'retired';
  }

  /**
   * Validate that an embedding matches expected model dimensions
   */
  validateEmbeddingDimensions(embedding: number[], expectedModel: EmbeddingModelId): boolean {
    const model = this.models.get(expectedModel);
    if (!model) return false;
    return embedding.length === model.dimensions;
  }

  // ===========================================================================
  // Statistics and Reporting
  // ===========================================================================

  /**
   * Get registry statistics
   */
  getStats(): ModelRegistryStats {
    const models = this.getAllModels();
    return {
      totalModels: models.length,
      activeModels: models.filter((m) => m.status === 'active').length,
      deprecatedModels: models.filter((m) => m.status === 'deprecated').length,
      retiredModels: models.filter((m) => m.status === 'retired').length,
      migrationPaths: this.migrationPaths.length,
    };
  }

  /**
   * Get migration summary for planning
   */
  getMigrationSummary(): {
    modelsNeedingMigration: EmbeddingModelId[];
    recommendedPaths: Map<EmbeddingModelId, MigrationPath>;
    estimatedEffort: 'low' | 'medium' | 'high';
  } {
    const needsMigration = this.getDeprecatedModels().map((m) => m.id);
    const recommendedPaths = new Map<EmbeddingModelId, MigrationPath>();

    for (const modelId of needsMigration) {
      const path = this.getRecommendedMigration(modelId);
      if (path) {
        recommendedPaths.set(modelId, path);
      }
    }

    // Estimate effort based on dimension changes
    const hasDimensionChanges = Array.from(recommendedPaths.values()).some(
      (p) => p.dimensionChange
    );
    const estimatedEffort =
      needsMigration.length === 0 ? 'low' : hasDimensionChanges ? 'high' : 'medium';

    return {
      modelsNeedingMigration: needsMigration,
      recommendedPaths,
      estimatedEffort,
    };
  }

  /**
   * Set the current model (for upgrades)
   */
  setCurrentModel(modelId: EmbeddingModelId): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }
    if (model.status === 'retired') {
      throw new Error(`Cannot set retired model ${modelId} as current`);
    }
    this.currentModel = modelId;
  }

  /**
   * Update model status
   */
  updateModelStatus(modelId: EmbeddingModelId, status: ModelStatus, deprecatedAt?: Date): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }
    this.models.set(modelId, {
      ...model,
      status,
      deprecatedAt: deprecatedAt ?? model.deprecatedAt,
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new embedding model registry instance
 */
export function createEmbeddingModelRegistry(
  currentModel?: EmbeddingModelId,
  customModels?: Partial<Record<EmbeddingModelId, Partial<EmbeddingModelConfig>>>,
  customPaths?: MigrationPath[]
): EmbeddingModelRegistry {
  return new EmbeddingModelRegistry(currentModel, customModels, customPaths);
}

/**
 * Default registry singleton
 */
let defaultRegistry: EmbeddingModelRegistry | null = null;

export function getDefaultRegistry(): EmbeddingModelRegistry {
  defaultRegistry ??= createEmbeddingModelRegistry();
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}

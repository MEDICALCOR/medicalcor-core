import type { Pool } from 'pg';
import { z } from 'zod';
import { createLogger } from '../logger/index.js';
import {
  type EmbeddingModelId,
  type EmbeddingModelRegistry,
  createEmbeddingModelRegistry,
} from './embedding-model-registry.js';

/**
 * Embedding Version Compatibility Layer
 *
 * Handles searching across different embedding model versions during
 * migration periods. Provides strategies for:
 * - Same-model search (optimal)
 * - Compatible-model search (same dimensions)
 * - Cross-dimension search (requires re-embedding)
 *
 * @module @medicalcor/core/rag/embedding-version-compatibility
 */

const logger = createLogger({ serviceName: 'embedding-version-compatibility' });

// =============================================================================
// Schema Definitions
// =============================================================================

export const SearchStrategySchema = z.enum([
  'current_model_only', // Only search entries with current model
  'compatible_models', // Search entries with same dimensions
  'all_with_fallback', // Search all, with quality warnings
  'hybrid_rerank', // Search all, then rerank results
]);

export type SearchStrategy = z.infer<typeof SearchStrategySchema>;

export const VersionedSearchOptionsSchema = z.object({
  strategy: SearchStrategySchema.default('compatible_models'),
  includeModelMetadata: z.boolean().default(true),
  warnOnMixedModels: z.boolean().default(true),
  preferCurrentModel: z.boolean().default(true),
  currentModelBoost: z.number().min(0).max(2).default(1.1),
  minSimilarityThreshold: z.number().min(0).max(1).default(0.7),
});

export type VersionedSearchOptions = z.infer<typeof VersionedSearchOptionsSchema>;

export interface VersionedSearchResult {
  id: string;
  content: string;
  title: string;
  similarity: number;
  adjustedSimilarity: number;
  embeddingModel: string;
  embeddingVersion: number;
  isCurrentModel: boolean;
  compatibilityScore: number;
  metadata: Record<string, unknown>;
}

export interface VersionedSearchResponse {
  results: VersionedSearchResult[];
  searchModel: string;
  modelsSearched: string[];
  mixedModelsWarning: boolean;
  totalResults: number;
  filteredByCompatibility: number;
  latencyMs: number;
}

export interface ModelCompatibilityInfo {
  model: string;
  dimensions: number;
  isCompatible: boolean;
  isCurrent: boolean;
  qualityFactor: number;
  entryCount: number;
}

// =============================================================================
// Compatibility Layer Class
// =============================================================================

export class EmbeddingVersionCompatibility {
  private pool: Pool;
  private registry: EmbeddingModelRegistry;
  private currentModel: EmbeddingModelId;

  constructor(
    pool: Pool,
    currentModel: EmbeddingModelId = 'text-embedding-3-small',
    registry?: EmbeddingModelRegistry
  ) {
    this.pool = pool;
    this.currentModel = currentModel;
    this.registry = registry ?? createEmbeddingModelRegistry(currentModel);
  }

  // ===========================================================================
  // Compatibility Checks
  // ===========================================================================

  /**
   * Check compatibility between query model and stored models
   */
  getModelCompatibility(storedModel: EmbeddingModelId): ModelCompatibilityInfo {
    const storedConfig = this.registry.getModel(storedModel);
    const currentConfig = this.registry.getCurrentModel();

    if (!storedConfig) {
      return {
        model: storedModel,
        dimensions: 0,
        isCompatible: false,
        isCurrent: false,
        qualityFactor: 0,
        entryCount: 0,
      };
    }

    const isCompatible = storedConfig.dimensions === currentConfig.dimensions;
    const isCurrent = storedModel === this.currentModel;

    // Quality factor based on model quality scores
    const qualityFactor = storedConfig.qualityScore / currentConfig.qualityScore;

    return {
      model: storedModel,
      dimensions: storedConfig.dimensions,
      isCompatible,
      isCurrent,
      qualityFactor,
      entryCount: 0, // Will be populated by caller
    };
  }

  /**
   * Get all compatible models for searching
   */
  getCompatibleModels(): EmbeddingModelId[] {
    const currentConfig = this.registry.getCurrentModel();
    const allModels = this.registry.getAllModels();

    return allModels.filter((m) => m.dimensions === currentConfig.dimensions).map((m) => m.id);
  }

  /**
   * Get model distribution with compatibility info
   */
  async getModelDistributionWithCompatibility(
    targetTable: 'knowledge_base' | 'message_embeddings' = 'knowledge_base'
  ): Promise<ModelCompatibilityInfo[]> {
    const result = await this.pool.query('SELECT * FROM get_embedding_model_distribution($1)', [
      targetTable,
    ]);

    const compatibleModels = this.getCompatibleModels();

    return (
      result.rows as {
        model: string;
        entry_count: string;
      }[]
    ).map((row) => {
      const compatibility = this.getModelCompatibility(row.model as EmbeddingModelId);
      return {
        ...compatibility,
        isCompatible: compatibleModels.includes(row.model as EmbeddingModelId),
        entryCount: parseInt(row.entry_count, 10),
      };
    });
  }

  // ===========================================================================
  // Versioned Search
  // ===========================================================================

  /**
   * Perform a version-aware semantic search
   */
  async search(
    queryEmbedding: number[],
    options: Partial<VersionedSearchOptions> & {
      targetTable?: 'knowledge_base' | 'message_embeddings';
      topK?: number;
      clinicId?: string;
      language?: string;
      sourceType?: string;
    } = {}
  ): Promise<VersionedSearchResponse> {
    const startTime = Date.now();
    const validated = VersionedSearchOptionsSchema.parse(options);
    const targetTable = options.targetTable ?? 'knowledge_base';
    const topK = options.topK ?? 10;

    // Determine which models to search based on strategy
    const modelsToSearch = this.getModelsForStrategy(validated.strategy);

    // Build and execute query
    const results = await this.executeVersionedSearch(
      queryEmbedding,
      modelsToSearch,
      targetTable,
      topK * 2, // Fetch extra for filtering
      {
        clinicId: options.clinicId,
        language: options.language,
        sourceType: options.sourceType,
        minSimilarity: validated.minSimilarityThreshold,
      }
    );

    // Apply compatibility adjustments
    const adjustedResults = this.applyCompatibilityAdjustments(results, validated);

    // Sort by adjusted similarity and limit
    const sortedResults = adjustedResults
      .sort((a, b) => b.adjustedSimilarity - a.adjustedSimilarity)
      .slice(0, topK);

    // Check for mixed models warning
    const uniqueModels = new Set(sortedResults.map((r) => r.embeddingModel));
    const mixedModelsWarning =
      validated.warnOnMixedModels && uniqueModels.size > 1 && !uniqueModels.has(this.currentModel);

    if (mixedModelsWarning) {
      logger.warn(
        {
          models: Array.from(uniqueModels),
          currentModel: this.currentModel,
          strategy: validated.strategy,
        },
        'Search returned results from multiple embedding models'
      );
    }

    return {
      results: sortedResults,
      searchModel: this.currentModel,
      modelsSearched: Array.from(modelsToSearch),
      mixedModelsWarning,
      totalResults: sortedResults.length,
      filteredByCompatibility: results.length - sortedResults.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Check if a search can be performed with current model
   */
  async canSearchWithCurrentModel(
    targetTable: 'knowledge_base' | 'message_embeddings' = 'knowledge_base'
  ): Promise<{
    canSearch: boolean;
    currentModelCoverage: number;
    compatibleCoverage: number;
    recommendation: string;
  }> {
    const distribution = await this.getModelDistributionWithCompatibility(targetTable);
    const totalEntries = distribution.reduce((sum, d) => sum + d.entryCount, 0);

    if (totalEntries === 0) {
      return {
        canSearch: false,
        currentModelCoverage: 0,
        compatibleCoverage: 0,
        recommendation: 'No embeddings found in the database',
      };
    }

    const currentModelEntries = distribution.find((d) => d.isCurrent)?.entryCount ?? 0;
    const compatibleEntries = distribution
      .filter((d) => d.isCompatible)
      .reduce((sum, d) => sum + d.entryCount, 0);

    const currentModelCoverage = currentModelEntries / totalEntries;
    const compatibleCoverage = compatibleEntries / totalEntries;

    let recommendation: string;
    if (currentModelCoverage >= 0.95) {
      recommendation = 'Optimal: Nearly all entries use current model';
    } else if (compatibleCoverage >= 0.95) {
      recommendation =
        'Good: All entries are compatible, consider migrating to current model for consistency';
    } else if (compatibleCoverage >= 0.7) {
      recommendation = 'Warning: Some entries require migration for full search coverage';
    } else {
      recommendation = 'Critical: Many entries have incompatible dimensions, migration required';
    }

    return {
      canSearch: compatibleCoverage > 0,
      currentModelCoverage,
      compatibleCoverage,
      recommendation,
    };
  }

  // ===========================================================================
  // Search Execution
  // ===========================================================================

  private getModelsForStrategy(strategy: SearchStrategy): Set<EmbeddingModelId> {
    const models = new Set<EmbeddingModelId>();

    switch (strategy) {
      case 'current_model_only':
        models.add(this.currentModel);
        break;

      case 'compatible_models':
        for (const model of this.getCompatibleModels()) {
          models.add(model);
        }
        break;

      case 'all_with_fallback':
      case 'hybrid_rerank':
        for (const model of this.registry.getAllModels()) {
          if (model.dimensions === this.registry.getCurrentModel().dimensions) {
            models.add(model.id);
          }
        }
        break;

      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = strategy;
        throw new Error(`Unknown search strategy: ${String(_exhaustiveCheck)}`);
      }
    }

    return models;
  }

  private async executeVersionedSearch(
    queryEmbedding: number[],
    models: Set<EmbeddingModelId>,
    targetTable: string,
    limit: number,
    filters: {
      clinicId?: string;
      language?: string;
      sourceType?: string;
      minSimilarity: number;
    }
  ): Promise<VersionedSearchResult[]> {
    const modelList = Array.from(models);

    if (targetTable === 'knowledge_base') {
      const query = `
        SELECT
          kb.id,
          kb.content,
          kb.title,
          (1 - (kb.embedding <=> $1)) AS similarity,
          kb.embedding_model,
          COALESCE(kb.embedding_version, 1) AS embedding_version,
          kb.metadata
        FROM knowledge_base kb
        WHERE kb.is_active = TRUE
          AND kb.embedding IS NOT NULL
          AND kb.embedding_model = ANY($2)
          AND (1 - (kb.embedding <=> $1)) >= $3
          ${filters.clinicId ? 'AND (kb.clinic_id = $4 OR kb.clinic_id IS NULL)' : ''}
          ${filters.language ? `AND kb.language = $${filters.clinicId ? 5 : 4}` : ''}
          ${filters.sourceType ? `AND kb.source_type = $${(filters.clinicId ? 1 : 0) + (filters.language ? 1 : 0) + 4}` : ''}
        ORDER BY kb.embedding <=> $1
        LIMIT ${limit}
      `;

      const values: unknown[] = [`[${queryEmbedding.join(',')}]`, modelList, filters.minSimilarity];

      if (filters.clinicId) values.push(filters.clinicId);
      if (filters.language) values.push(filters.language);
      if (filters.sourceType) values.push(filters.sourceType);

      const result = await this.pool.query(query, values);

      return (
        result.rows as {
          id: string;
          content: string;
          title: string;
          similarity: string;
          embedding_model: string;
          embedding_version: number;
          metadata: Record<string, unknown> | null;
        }[]
      ).map((row) => ({
        id: row.id,
        content: row.content,
        title: row.title,
        similarity: parseFloat(row.similarity),
        adjustedSimilarity: parseFloat(row.similarity),
        embeddingModel: row.embedding_model,
        embeddingVersion: row.embedding_version,
        isCurrentModel: row.embedding_model === this.currentModel,
        compatibilityScore: 1,
        metadata: row.metadata ?? {},
      }));
    }

    // Message embeddings search
    const query = `
      SELECT
        me.id,
        me.content_sanitized AS content,
        me.phone AS title,
        (1 - (me.embedding <=> $1)) AS similarity,
        me.embedding_model,
        COALESCE(me.embedding_version, 1) AS embedding_version,
        me.metadata
      FROM message_embeddings me
      WHERE me.embedding IS NOT NULL
        AND me.embedding_model = ANY($2)
        AND (1 - (me.embedding <=> $1)) >= $3
        ${filters.clinicId ? 'AND me.clinic_id = $4' : ''}
      ORDER BY me.embedding <=> $1
      LIMIT ${limit}
    `;

    const values: unknown[] = [`[${queryEmbedding.join(',')}]`, modelList, filters.minSimilarity];

    if (filters.clinicId) values.push(filters.clinicId);

    const result = await this.pool.query(query, values);

    return (
      result.rows as {
        id: string;
        content: string;
        title: string;
        similarity: string;
        embedding_model: string;
        embedding_version: number;
        metadata: Record<string, unknown> | null;
      }[]
    ).map((row) => ({
      id: row.id,
      content: row.content,
      title: row.title,
      similarity: parseFloat(row.similarity),
      adjustedSimilarity: parseFloat(row.similarity),
      embeddingModel: row.embedding_model,
      embeddingVersion: row.embedding_version,
      isCurrentModel: row.embedding_model === this.currentModel,
      compatibilityScore: 1,
      metadata: row.metadata ?? {},
    }));
  }

  private applyCompatibilityAdjustments(
    results: VersionedSearchResult[],
    options: VersionedSearchOptions
  ): VersionedSearchResult[] {
    return results.map((result) => {
      let adjustedSimilarity = result.similarity;

      // Apply boost for current model
      if (options.preferCurrentModel && result.isCurrentModel) {
        adjustedSimilarity *= options.currentModelBoost;
      }

      // Get compatibility info
      const compatibility = this.getModelCompatibility(result.embeddingModel as EmbeddingModelId);

      // Apply quality factor adjustment
      if (!result.isCurrentModel && compatibility.qualityFactor < 1) {
        adjustedSimilarity *= compatibility.qualityFactor;
      }

      return {
        ...result,
        adjustedSimilarity: Math.min(adjustedSimilarity, 1), // Cap at 1
        compatibilityScore: compatibility.qualityFactor,
      };
    });
  }

  // ===========================================================================
  // Upgrade Recommendations
  // ===========================================================================

  /**
   * Get recommendations for improving search quality
   */
  async getUpgradeRecommendations(
    targetTable: 'knowledge_base' | 'message_embeddings' = 'knowledge_base'
  ): Promise<{
    urgentMigrations: { model: string; entryCount: number; reason: string }[];
    optionalUpgrades: { model: string; entryCount: number; benefit: string }[];
    healthScore: number;
    estimatedQualityImprovement: number;
  }> {
    const distribution = await this.getModelDistributionWithCompatibility(targetTable);
    const urgentMigrations: { model: string; entryCount: number; reason: string }[] = [];
    const optionalUpgrades: { model: string; entryCount: number; benefit: string }[] = [];

    let totalEntries = 0;
    let currentModelEntries = 0;

    for (const dist of distribution) {
      totalEntries += dist.entryCount;

      if (dist.isCurrent) {
        currentModelEntries += dist.entryCount;
        continue;
      }

      const modelConfig = this.registry.getModel(dist.model as EmbeddingModelId);

      if (!dist.isCompatible) {
        urgentMigrations.push({
          model: dist.model,
          entryCount: dist.entryCount,
          reason: 'Dimension mismatch - cannot search these entries with current model',
        });
      } else if (modelConfig?.status === 'deprecated' || modelConfig?.status === 'retired') {
        urgentMigrations.push({
          model: dist.model,
          entryCount: dist.entryCount,
          reason: `Model ${modelConfig.status} - should migrate for continued support`,
        });
      } else if (dist.qualityFactor < 1) {
        optionalUpgrades.push({
          model: dist.model,
          entryCount: dist.entryCount,
          benefit: `${Math.round((1 - dist.qualityFactor) * 100)}% quality improvement expected`,
        });
      }
    }

    const healthScore = totalEntries > 0 ? (currentModelEntries / totalEntries) * 100 : 100;
    const currentConfig = this.registry.getCurrentModel();

    const estimatedQualityImprovement = optionalUpgrades.reduce((sum, upgrade) => {
      const modelConfig = this.registry.getModel(upgrade.model as EmbeddingModelId);
      if (modelConfig) {
        const improvementFactor = (currentConfig.qualityScore - modelConfig.qualityScore) / 100;
        return sum + (upgrade.entryCount / totalEntries) * improvementFactor * 100;
      }
      return sum;
    }, 0);

    return {
      urgentMigrations,
      optionalUpgrades,
      healthScore: Math.round(healthScore * 100) / 100,
      estimatedQualityImprovement: Math.round(estimatedQualityImprovement * 100) / 100,
    };
  }

  /**
   * Update current model (for after migration)
   */
  setCurrentModel(modelId: EmbeddingModelId): void {
    this.currentModel = modelId;
    this.registry.setCurrentModel(modelId);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmbeddingVersionCompatibility(
  pool: Pool,
  currentModel?: EmbeddingModelId,
  registry?: EmbeddingModelRegistry
): EmbeddingVersionCompatibility {
  return new EmbeddingVersionCompatibility(pool, currentModel, registry);
}

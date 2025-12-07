/**
 * Entity Deduplication Service
 *
 * H8: Auto-merge similar entities in the knowledge graph to maintain
 * data quality and prevent fragmentation.
 *
 * Uses embedding similarity as the primary detection mechanism, with
 * optional LLM disambiguation for edge cases.
 */

import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../logger.js';
import type { IEmbeddingService } from './episode-builder.js';
import {
  DEFAULT_DEDUPLICATION_CONFIG,
  type EntityDeduplicationConfig,
  type KnowledgeEntity,
  type EntityType,
  type DuplicateCandidate,
  type DuplicateDetectionResult,
  type EntityMergeResult,
  type MergeOptions,
  type DeduplicationRunSummary,
  type DuplicateMatchReason,
} from './types.js';

const logger = createLogger({ name: 'cognitive-entity-deduplication' });

// =============================================================================
// Entity Deduplication Service
// =============================================================================

export class EntityDeduplicationService {
  private config: EntityDeduplicationConfig;

  constructor(
    private pool: Pool,
    private embeddings: IEmbeddingService | null,
    config: Partial<EntityDeduplicationConfig> = {}
  ) {
    this.config = { ...DEFAULT_DEDUPLICATION_CONFIG, ...config };
  }

  // ===========================================================================
  // Duplicate Detection
  // ===========================================================================

  /**
   * Find potential duplicate entities for a given entity
   */
  async findDuplicates(entityId: string): Promise<DuplicateDetectionResult> {
    // Get the source entity with its embedding
    const sourceResult = await this.pool.query<{
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
    }>(
      `SELECT id, entity_type, entity_value, entity_hash, canonical_form,
              mention_count, avg_confidence, first_observed_at, last_observed_at, embedding
       FROM knowledge_entities
       WHERE id = $1 AND deleted_at IS NULL`,
      [entityId]
    );

    const sourceRow = sourceResult.rows[0];
    if (!sourceRow) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const sourceEntity = this.rowToEntity(sourceRow);

    // If no embedding, cannot do similarity search
    if (!sourceRow.embedding) {
      logger.warn({ entityId }, 'Entity has no embedding, skipping duplicate detection');
      return {
        sourceEntity,
        candidates: [],
        autoMerged: false,
        mergedEntityIds: [],
      };
    }

    const embedding = JSON.parse(sourceRow.embedding) as number[];

    // Find similar entities using embedding search
    const candidatesResult = await this.pool.query<{
      id: string;
      entity_type: string;
      entity_value: string;
      entity_hash: string;
      canonical_form: string | null;
      mention_count: number;
      avg_confidence: number | null;
      first_observed_at: Date;
      last_observed_at: Date;
      similarity: number;
    }>(
      `SELECT ke.id, ke.entity_type, ke.entity_value, ke.entity_hash, ke.canonical_form,
              ke.mention_count, ke.avg_confidence, ke.first_observed_at, ke.last_observed_at,
              1 - (ke.embedding <=> $1::vector) as similarity
       FROM knowledge_entities ke
       WHERE ke.id != $2
         AND ke.entity_type = $3
         AND ke.deleted_at IS NULL
         AND ke.embedding IS NOT NULL
         AND 1 - (ke.embedding <=> $1::vector) >= $4
       ORDER BY similarity DESC
       LIMIT $5`,
      [
        JSON.stringify(embedding),
        entityId,
        sourceRow.entity_type,
        this.config.minSimilarityThreshold,
        this.config.maxCandidates,
      ]
    );

    const candidates: DuplicateCandidate[] = candidatesResult.rows.map((row) => {
      const matchReasons = this.calculateMatchReasons(
        sourceRow.entity_value,
        row.entity_value,
        row.similarity
      );

      return {
        entity: this.rowToEntity(row),
        similarity: row.similarity,
        matchReasons,
      };
    });

    // Perform auto-merge if enabled and high confidence matches found
    let autoMerged = false;
    const mergedEntityIds: string[] = [];

    if (this.config.autoMergeEnabled) {
      const autoMergeCandidates = candidates.filter(
        (c) => c.similarity >= this.config.autoMergeThreshold
      );

      for (const candidate of autoMergeCandidates) {
        try {
          const mergeResult = await this.mergeEntities(sourceEntity.id, candidate.entity.id, {
            mergeReason: 'auto_merge_high_similarity',
          });

          if (mergeResult.success) {
            autoMerged = true;
            mergedEntityIds.push(candidate.entity.id);
            logger.info(
              {
                sourceId: sourceEntity.id,
                mergedId: candidate.entity.id,
                similarity: candidate.similarity,
              },
              'Auto-merged duplicate entity'
            );
          }
        } catch (error) {
          logger.warn(
            { error, sourceId: sourceEntity.id, candidateId: candidate.entity.id },
            'Failed to auto-merge entity'
          );
        }
      }
    }

    // Filter out merged entities from candidates
    const remainingCandidates = candidates.filter((c) => !mergedEntityIds.includes(c.entity.id));

    return {
      sourceEntity,
      candidates: remainingCandidates,
      autoMerged,
      mergedEntityIds,
    };
  }

  /**
   * Calculate match reasons based on various similarity metrics
   */
  private calculateMatchReasons(
    sourceValue: string,
    candidateValue: string,
    embeddingSimilarity: number
  ): DuplicateMatchReason[] {
    const reasons: DuplicateMatchReason[] = [];

    // Always include embedding similarity if we got here
    if (embeddingSimilarity >= this.config.minSimilarityThreshold) {
      reasons.push('embedding_similarity');
    }

    // Check substring matching
    const sourceLower = sourceValue.toLowerCase();
    const candidateLower = candidateValue.toLowerCase();

    if (sourceLower.includes(candidateLower) || candidateLower.includes(sourceLower)) {
      reasons.push('value_substring');
    }

    // Check edit distance (Levenshtein)
    const editDistance = this.levenshteinDistance(sourceLower, candidateLower);
    const maxLength = Math.max(sourceLower.length, candidateLower.length);
    const editSimilarity = 1 - editDistance / maxLength;

    if (editSimilarity >= 0.8) {
      reasons.push('value_edit_distance');
    }

    return reasons;
  }

  /**
   * Calculate Levenshtein edit distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1, // substitution
            matrix[i]![j - 1]! + 1, // insertion
            matrix[i - 1]![j]! + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  // ===========================================================================
  // Entity Merging
  // ===========================================================================

  /**
   * Merge two entities, keeping one as the canonical version
   */
  async mergeEntities(
    entityId1: string,
    entityId2: string,
    options: MergeOptions = {}
  ): Promise<EntityMergeResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get both entities
      const entitiesResult = await client.query<{
        id: string;
        entity_type: string;
        entity_value: string;
        entity_hash: string;
        canonical_form: string | null;
        mention_count: number;
        avg_confidence: number | null;
        first_observed_at: Date;
        last_observed_at: Date;
      }>(
        `SELECT id, entity_type, entity_value, entity_hash, canonical_form,
                mention_count, avg_confidence, first_observed_at, last_observed_at
         FROM knowledge_entities
         WHERE id = ANY($1) AND deleted_at IS NULL
         FOR UPDATE`,
        [[entityId1, entityId2]]
      );

      if (entitiesResult.rows.length !== 2) {
        await client.query('ROLLBACK');
        return {
          survivingEntity: {} as KnowledgeEntity,
          mergedEntity: {} as KnowledgeEntity,
          relationsTransferred: 0,
          eventMappingsTransferred: 0,
          success: false,
          error: 'One or both entities not found or already deleted',
        };
      }

      const entity1 = entitiesResult.rows.find((r) => r.id === entityId1)!;
      const entity2 = entitiesResult.rows.find((r) => r.id === entityId2)!;

      // Determine survivor (entity with more mentions, or specified by options)
      let survivor: typeof entity1;
      let merged: typeof entity1;

      if (options.survivorId) {
        if (options.survivorId === entityId1) {
          survivor = entity1;
          merged = entity2;
        } else if (options.survivorId === entityId2) {
          survivor = entity2;
          merged = entity1;
        } else {
          await client.query('ROLLBACK');
          return {
            survivingEntity: {} as KnowledgeEntity,
            mergedEntity: {} as KnowledgeEntity,
            relationsTransferred: 0,
            eventMappingsTransferred: 0,
            success: false,
            error: `Specified survivor ID ${options.survivorId} does not match either entity`,
          };
        }
      } else {
        // Default: entity with more mentions survives
        if (entity1.mention_count >= entity2.mention_count) {
          survivor = entity1;
          merged = entity2;
        } else {
          survivor = entity2;
          merged = entity1;
        }
      }

      // Transfer relations from merged entity to survivor
      const relationsTransferred = await this.transferRelations(client, merged.id, survivor.id);

      // Transfer event mappings
      const eventMappingsTransferred = await this.transferEventMappings(
        client,
        merged.id,
        survivor.id
      );

      // Update survivor with combined stats
      const combinedMentions = entity1.mention_count + entity2.mention_count;
      const earliestObservation =
        entity1.first_observed_at < entity2.first_observed_at
          ? entity1.first_observed_at
          : entity2.first_observed_at;
      const latestObservation =
        entity1.last_observed_at > entity2.last_observed_at
          ? entity1.last_observed_at
          : entity2.last_observed_at;

      // Calculate combined average confidence
      let combinedConfidence: number | null = null;
      if (entity1.avg_confidence !== null && entity2.avg_confidence !== null) {
        combinedConfidence =
          (entity1.avg_confidence * entity1.mention_count +
            entity2.avg_confidence * entity2.mention_count) /
          combinedMentions;
      } else {
        combinedConfidence = entity1.avg_confidence ?? entity2.avg_confidence;
      }

      await client.query(
        `UPDATE knowledge_entities
         SET mention_count = $1,
             avg_confidence = $2,
             first_observed_at = $3,
             last_observed_at = $4,
             canonical_form = COALESCE($5, canonical_form),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'merged_from', COALESCE((metadata->>'merged_from')::jsonb, '[]'::jsonb) || to_jsonb(ARRAY[$6::text]),
               'merge_reason', $7
             ),
             updated_at = NOW()
         WHERE id = $8`,
        [
          combinedMentions,
          combinedConfidence,
          earliestObservation,
          latestObservation,
          options.canonicalForm ?? null,
          merged.id,
          options.mergeReason ?? 'manual_merge',
          survivor.id,
        ]
      );

      // Soft delete the merged entity
      await client.query(
        `UPDATE knowledge_entities
         SET deleted_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'merged_into', $1,
               'merge_reason', $2
             )
         WHERE id = $3`,
        [survivor.id, options.mergeReason ?? 'manual_merge', merged.id]
      );

      await client.query('COMMIT');

      // Fetch the updated survivor
      const updatedSurvivorResult = await this.pool.query<{
        id: string;
        entity_type: string;
        entity_value: string;
        entity_hash: string;
        canonical_form: string | null;
        mention_count: number;
        avg_confidence: number | null;
        first_observed_at: Date;
        last_observed_at: Date;
      }>(
        `SELECT id, entity_type, entity_value, entity_hash, canonical_form,
                mention_count, avg_confidence, first_observed_at, last_observed_at
         FROM knowledge_entities WHERE id = $1`,
        [survivor.id]
      );

      logger.info(
        {
          survivorId: survivor.id,
          mergedId: merged.id,
          relationsTransferred,
          eventMappingsTransferred,
        },
        'Entities merged successfully'
      );

      return {
        survivingEntity: this.rowToEntity(updatedSurvivorResult.rows[0]!),
        mergedEntity: this.rowToEntity(merged),
        relationsTransferred,
        eventMappingsTransferred,
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error, entityId1, entityId2 }, 'Failed to merge entities');
      return {
        survivingEntity: {} as KnowledgeEntity,
        mergedEntity: {} as KnowledgeEntity,
        relationsTransferred: 0,
        eventMappingsTransferred: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Transfer relations from one entity to another
   */
  private async transferRelations(
    client: PoolClient,
    fromEntityId: string,
    toEntityId: string
  ): Promise<number> {
    // Update relations where the merged entity is the source
    const sourceResult = await client.query(
      `UPDATE knowledge_relations
       SET source_entity_id = $1,
           updated_at = NOW()
       WHERE source_entity_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM knowledge_relations kr2
           WHERE kr2.source_entity_id = $1
             AND kr2.target_entity_id = knowledge_relations.target_entity_id
             AND kr2.relation_type = knowledge_relations.relation_type
         )`,
      [toEntityId, fromEntityId]
    );

    // Update relations where the merged entity is the target
    const targetResult = await client.query(
      `UPDATE knowledge_relations
       SET target_entity_id = $1,
           updated_at = NOW()
       WHERE target_entity_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM knowledge_relations kr2
           WHERE kr2.source_entity_id = knowledge_relations.source_entity_id
             AND kr2.target_entity_id = $1
             AND kr2.relation_type = knowledge_relations.relation_type
         )`,
      [toEntityId, fromEntityId]
    );

    // Delete any remaining duplicate relations that couldn't be transferred
    await client.query(
      `DELETE FROM knowledge_relations
       WHERE source_entity_id = $1 OR target_entity_id = $1`,
      [fromEntityId]
    );

    return (sourceResult.rowCount ?? 0) + (targetResult.rowCount ?? 0);
  }

  /**
   * Transfer event mappings from one entity to another
   */
  private async transferEventMappings(
    client: PoolClient,
    fromEntityId: string,
    toEntityId: string
  ): Promise<number> {
    // Transfer mappings that don't already exist for the survivor
    const result = await client.query(
      `UPDATE entity_event_mapping
       SET entity_id = $1
       WHERE entity_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM entity_event_mapping eem2
           WHERE eem2.entity_id = $1 AND eem2.event_id = entity_event_mapping.event_id
         )`,
      [toEntityId, fromEntityId]
    );

    // Delete any remaining duplicates
    await client.query(`DELETE FROM entity_event_mapping WHERE entity_id = $1`, [fromEntityId]);

    return result.rowCount ?? 0;
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Run deduplication across all entities of a given type
   */
  async runDeduplication(entityType?: EntityType): Promise<DeduplicationRunSummary> {
    const startTime = Date.now();
    const summary: DeduplicationRunSummary = {
      totalEntitiesScanned: 0,
      duplicatePairsDetected: 0,
      entitiesMerged: 0,
      totalRelationsTransferred: 0,
      totalEventMappingsTransferred: 0,
      errors: [],
      durationMs: 0,
    };

    // Get all entities to process
    const entitiesQuery = entityType
      ? `SELECT id FROM knowledge_entities WHERE entity_type = $1 AND deleted_at IS NULL ORDER BY mention_count DESC`
      : `SELECT id FROM knowledge_entities WHERE deleted_at IS NULL ORDER BY mention_count DESC`;

    const entitiesResult = await this.pool.query<{ id: string }>(
      entitiesQuery,
      entityType ? [entityType] : []
    );

    const processedPairs = new Set<string>();

    for (const row of entitiesResult.rows) {
      summary.totalEntitiesScanned++;

      try {
        const result = await this.findDuplicates(row.id);

        for (const candidate of result.candidates) {
          // Create a normalized pair key to avoid processing the same pair twice
          const pairKey = [row.id, candidate.entity.id].sort().join(':');
          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey);
            summary.duplicatePairsDetected++;
          }
        }

        summary.entitiesMerged += result.mergedEntityIds.length;
      } catch (error) {
        summary.errors.push({
          entityId: row.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    summary.durationMs = Date.now() - startTime;

    logger.info(summary, 'Deduplication run completed');

    return summary;
  }

  /**
   * Find all duplicate candidates across the knowledge graph
   */
  async findAllDuplicates(
    entityType?: EntityType,
    limit = 100
  ): Promise<DuplicateDetectionResult[]> {
    const results: DuplicateDetectionResult[] = [];

    // Get entities with embeddings
    const entitiesQuery = entityType
      ? `SELECT id FROM knowledge_entities
         WHERE entity_type = $1 AND deleted_at IS NULL AND embedding IS NOT NULL
         ORDER BY mention_count DESC LIMIT $2`
      : `SELECT id FROM knowledge_entities
         WHERE deleted_at IS NULL AND embedding IS NOT NULL
         ORDER BY mention_count DESC LIMIT $1`;

    const entitiesResult = await this.pool.query<{ id: string }>(
      entitiesQuery,
      entityType ? [entityType, limit] : [limit]
    );

    const processedPairs = new Set<string>();

    for (const row of entitiesResult.rows) {
      try {
        const result = await this.findDuplicates(row.id);

        // Filter out already processed pairs
        result.candidates = result.candidates.filter((c) => {
          const pairKey = [row.id, c.entity.id].sort().join(':');
          if (processedPairs.has(pairKey)) {
            return false;
          }
          processedPairs.add(pairKey);
          return true;
        });

        if (result.candidates.length > 0 || result.mergedEntityIds.length > 0) {
          results.push(result);
        }
      } catch (error) {
        logger.warn({ error, entityId: row.id }, 'Failed to find duplicates for entity');
      }
    }

    return results;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Convert database row to KnowledgeEntity
   */
  private rowToEntity(row: {
    id: string;
    entity_type: string;
    entity_value: string;
    entity_hash: string;
    canonical_form: string | null;
    mention_count: number;
    avg_confidence: number | null;
    first_observed_at: Date;
    last_observed_at: Date;
  }): KnowledgeEntity {
    return {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      entityHash: row.entity_hash,
      canonicalForm: row.canonical_form ?? undefined,
      mentionCount: row.mention_count,
      avgConfidence: row.avg_confidence ?? undefined,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEntityDeduplicationService(
  pool: Pool,
  embeddings: IEmbeddingService | null,
  config?: Partial<EntityDeduplicationConfig>
): EntityDeduplicationService {
  return new EntityDeduplicationService(pool, embeddings, config);
}

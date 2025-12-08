/**
 * Knowledge Graph Service - Entity and Relation Management
 *
 * H8: Normalizes entities from episodic memory into a graph structure
 * for relationship discovery and semantic entity search.
 *
 * L4: Integrates with EntityCanonicalizationService to populate canonical_form.
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { createLogger } from '../logger.js';
import type { IEmbeddingService } from './episode-builder.js';
import type { EntityCanonicalizationService } from './entity-canonicalization.js';
import {
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  type KnowledgeGraphConfig,
  type KnowledgeEntity,
  type KnowledgeRelation,
  type KeyEntity,
  type EntityType,
  type RelationType,
  type ExtractionMethod,
  type RelatedEntityResult,
  type EntityCooccurrenceResult,
  type EntitySearchResult,
} from './types.js';

const logger = createLogger({ name: 'cognitive-knowledge-graph' });

// =============================================================================
// Knowledge Graph Service
// =============================================================================

export class KnowledgeGraphService {
  private config: KnowledgeGraphConfig;
  private canonicalization: EntityCanonicalizationService | null = null;

  constructor(
    private pool: Pool,
    private embeddings: IEmbeddingService | null,
    config: Partial<KnowledgeGraphConfig> = {}
  ) {
    this.config = { ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG, ...config };
  }

  /**
   * Set the canonicalization service for automatic canonical form population (L4)
   */
  setCanonicalizationService(service: EntityCanonicalizationService): void {
    this.canonicalization = service;
    logger.info('Canonicalization service connected to knowledge graph');
  }

  // ===========================================================================
  // Entity Management
  // ===========================================================================

  /**
   * Process entities from an episodic event and store in knowledge graph
   */
  async processEntitiesFromEvent(
    eventId: string,
    entities: KeyEntity[],
    occurredAt: Date
  ): Promise<KnowledgeEntity[]> {
    if (!this.config.enabled || entities.length === 0) {
      return [];
    }

    const processedEntities: KnowledgeEntity[] = [];

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity) continue;

      // Filter by confidence if provided
      if (entity.confidence !== undefined && entity.confidence < this.config.minEntityConfidence) {
        continue;
      }

      try {
        const knowledgeEntity = await this.upsertEntity(entity, eventId, i + 1, occurredAt);
        processedEntities.push(knowledgeEntity);
      } catch (error) {
        logger.warn(
          { error, entityValue: entity.value, eventId },
          'Failed to process entity, continuing...'
        );
      }
    }

    // Create co-occurrence relations between entities in the same event
    if (processedEntities.length > 1) {
      await this.createCooccurrenceRelations(processedEntities, eventId, occurredAt);
    }

    logger.debug(
      { eventId, entityCount: processedEntities.length },
      'Processed entities from event'
    );

    return processedEntities;
  }

  /**
   * Upsert an entity (insert or update if exists)
   */
  private async upsertEntity(
    entity: KeyEntity,
    eventId: string,
    extractionPosition: number,
    occurredAt: Date
  ): Promise<KnowledgeEntity> {
    const entityHash = this.hashEntity(entity.type, entity.value);
    const now = new Date();

    // Try to get existing entity
    const existingResult = await this.pool.query<{
      id: string;
      mention_count: number;
      avg_confidence: number | null;
      first_observed_at: Date;
    }>(
      `SELECT id, mention_count, avg_confidence, first_observed_at
       FROM knowledge_entities
       WHERE entity_type = $1 AND entity_hash = $2 AND deleted_at IS NULL`,
      [entity.type, entityHash]
    );

    let entityId: string;
    let knowledgeEntity: KnowledgeEntity;

    const existingRow = existingResult.rows[0];
    if (existingRow) {
      // Update existing entity
      const existing = existingRow;
      entityId = existing.id;

      // Calculate new average confidence
      const currentAvg = existing.avg_confidence ?? entity.confidence ?? 0;
      const newAvg =
        entity.confidence !== undefined
          ? (currentAvg * existing.mention_count + entity.confidence) / (existing.mention_count + 1)
          : currentAvg;

      await this.pool.query(
        `UPDATE knowledge_entities
         SET mention_count = mention_count + 1,
             avg_confidence = $1,
             last_observed_at = $2,
             updated_at = $3
         WHERE id = $4`,
        [newAvg, occurredAt, now, entityId]
      );

      knowledgeEntity = {
        id: entityId,
        entityType: entity.type,
        entityValue: entity.value,
        entityHash,
        mentionCount: existing.mention_count + 1,
        avgConfidence: newAvg,
        firstObservedAt: existing.first_observed_at,
        lastObservedAt: occurredAt,
      };
    } else {
      // Insert new entity
      entityId = crypto.randomUUID();

      // Generate embedding if enabled
      let embedding: number[] | null = null;
      let embeddingModel: string | null = null;

      if (this.config.enableEntityEmbeddings && this.embeddings) {
        try {
          const embeddingResult = await this.embeddings.embed(`${entity.type}: ${entity.value}`);
          embedding = embeddingResult.embedding;
          embeddingModel = 'text-embedding-3-small';
        } catch (error) {
          logger.warn({ error, entityValue: entity.value }, 'Failed to generate entity embedding');
        }
      }

      // L4: Get canonical form if canonicalization service is available
      let canonicalForm: string | null = null;
      if (this.canonicalization) {
        try {
          const canonicalResult = await this.canonicalization.canonicalize(
            entity.value,
            entity.type
          );
          canonicalForm = canonicalResult.canonicalForm;
          logger.debug(
            {
              entityValue: entity.value,
              canonicalForm,
              method: canonicalResult.method,
            },
            'Canonicalized entity'
          );
        } catch (error) {
          logger.warn(
            { error, entityValue: entity.value },
            'Failed to canonicalize entity, proceeding without canonical form'
          );
        }
      }

      await this.pool.query(
        `INSERT INTO knowledge_entities (
           id, entity_type, entity_value, entity_hash, canonical_form, embedding, embedding_model,
           mention_count, first_mentioned_event_id, avg_confidence,
           first_observed_at, last_observed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          entityId,
          entity.type,
          entity.value,
          entityHash,
          canonicalForm,
          embedding ? JSON.stringify(embedding) : null,
          embeddingModel,
          1,
          eventId,
          entity.confidence ?? null,
          occurredAt,
          occurredAt,
          now,
          now,
        ]
      );

      knowledgeEntity = {
        id: entityId,
        entityType: entity.type,
        entityValue: entity.value,
        entityHash,
        canonicalForm: canonicalForm ?? undefined,
        mentionCount: 1,
        firstMentionedEventId: eventId,
        avgConfidence: entity.confidence,
        firstObservedAt: occurredAt,
        lastObservedAt: occurredAt,
      };
    }

    // Create entity-event mapping
    await this.pool.query(
      `INSERT INTO entity_event_mapping (id, entity_id, event_id, extraction_position, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (entity_id, event_id) DO NOTHING`,
      [crypto.randomUUID(), entityId, eventId, extractionPosition, entity.confidence ?? null, now]
    );

    return knowledgeEntity;
  }

  /**
   * Create co-occurrence relations between entities in the same event
   */
  private async createCooccurrenceRelations(
    entities: KnowledgeEntity[],
    eventId: string,
    occurredAt: Date
  ): Promise<void> {
    const now = new Date();

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const source = entities[i];
        const target = entities[j];
        if (!source || !target) continue;

        try {
          // Check if relation exists
          const existingResult = await this.pool.query<{ id: string; occurrence_count: number }>(
            `SELECT id, occurrence_count FROM knowledge_relations
             WHERE source_entity_id = $1 AND target_entity_id = $2 AND relation_type = 'mentioned_with'`,
            [source.id, target.id]
          );

          const existingRelation = existingResult.rows[0];
          if (existingRelation) {
            // Update existing relation
            await this.pool.query(
              `UPDATE knowledge_relations
               SET occurrence_count = occurrence_count + 1,
                   weight = weight + 0.1,
                   supporting_event_ids = array_append(supporting_event_ids, $1::uuid),
                   last_observed_at = $2,
                   updated_at = $3
               WHERE id = $4`,
              [eventId, occurredAt, now, existingRelation.id]
            );
          } else {
            // Create new relation (bidirectional)
            const confidence = Math.min(
              (source.avgConfidence ?? 0.7) * (target.avgConfidence ?? 0.7),
              1.0
            );

            await this.pool.query(
              `INSERT INTO knowledge_relations (
                 id, source_entity_id, target_entity_id, relation_type,
                 confidence, weight, extraction_method, supporting_event_ids,
                 occurrence_count, first_observed_at, last_observed_at, created_at, updated_at
               ) VALUES ($1, $2, $3, 'mentioned_with', $4, 1.0, 'co_occurrence', $5, 1, $6, $7, $8, $9)
               ON CONFLICT (source_entity_id, target_entity_id, relation_type) DO NOTHING`,
              [
                crypto.randomUUID(),
                source.id,
                target.id,
                confidence,
                [eventId],
                occurredAt,
                occurredAt,
                now,
                now,
              ]
            );
          }
        } catch (error) {
          logger.warn(
            { error, sourceId: source.id, targetId: target.id },
            'Failed to create co-occurrence relation'
          );
        }
      }
    }
  }

  // ===========================================================================
  // Relation Management
  // ===========================================================================

  /**
   * Create a relation between two entities
   */
  async createRelation(
    sourceEntityId: string,
    targetEntityId: string,
    relationType: RelationType,
    extractionMethod: ExtractionMethod,
    options: {
      confidence?: number;
      eventId?: string;
      description?: string;
    } = {}
  ): Promise<KnowledgeRelation> {
    const now = new Date();
    const relationId = crypto.randomUUID();

    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO knowledge_relations (
         id, source_entity_id, target_entity_id, relation_type,
         confidence, weight, extraction_method, supporting_event_ids,
         relation_description, occurrence_count, first_observed_at, last_observed_at,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 1.0, $6, $7, $8, 1, $9, $10, $11, $12)
       ON CONFLICT (source_entity_id, target_entity_id, relation_type)
       DO UPDATE SET
         occurrence_count = knowledge_relations.occurrence_count + 1,
         weight = knowledge_relations.weight + 0.1,
         supporting_event_ids = CASE
           WHEN $13::uuid IS NOT NULL THEN array_append(knowledge_relations.supporting_event_ids, $13::uuid)
           ELSE knowledge_relations.supporting_event_ids
         END,
         last_observed_at = $14,
         updated_at = $15
       RETURNING id`,
      [
        relationId,
        sourceEntityId,
        targetEntityId,
        relationType,
        options.confidence ?? 0.7,
        extractionMethod,
        options.eventId ? [options.eventId] : [],
        options.description ?? null,
        now,
        now,
        now,
        now,
        options.eventId ?? null,
        now,
        now,
      ]
    );

    return {
      id: result.rows[0]?.id ?? relationId,
      sourceEntityId,
      targetEntityId,
      relationType,
      confidence: options.confidence ?? 0.7,
      weight: 1.0,
      extractionMethod,
      supportingEventIds: options.eventId ? [options.eventId] : [],
      relationDescription: options.description,
      occurrenceCount: 1,
      firstObservedAt: now,
      lastObservedAt: now,
    };
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Find entity by type and value
   */
  async findEntity(entityType: EntityType, entityValue: string): Promise<KnowledgeEntity | null> {
    const entityHash = this.hashEntity(entityType, entityValue);

    const result = await this.pool.query<{
      id: string;
      entity_type: string;
      entity_value: string;
      entity_hash: string;
      canonical_form: string | null;
      mention_count: number;
      first_mentioned_event_id: string | null;
      avg_confidence: number | null;
      first_observed_at: Date;
      last_observed_at: Date;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, entity_type, entity_value, entity_hash, canonical_form,
              mention_count, first_mentioned_event_id, avg_confidence,
              first_observed_at, last_observed_at, metadata
       FROM knowledge_entities
       WHERE entity_type = $1 AND entity_hash = $2 AND deleted_at IS NULL`,
      [entityType, entityHash]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      entityHash: row.entity_hash,
      canonicalForm: row.canonical_form ?? undefined,
      mentionCount: row.mention_count,
      firstMentionedEventId: row.first_mentioned_event_id ?? undefined,
      avgConfidence: row.avg_confidence ?? undefined,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
      metadata: row.metadata ?? undefined,
    };
  }

  /**
   * Search entities by semantic similarity
   */
  async searchEntities(
    query: string,
    options: {
      entityType?: EntityType;
      matchThreshold?: number;
      limit?: number;
    } = {}
  ): Promise<EntitySearchResult[]> {
    if (!this.embeddings) {
      logger.warn('Embedding service not available for semantic search');
      return [];
    }

    const { embedding } = await this.embeddings.embed(query);

    const result = await this.pool.query<{
      id: string;
      entity_type: string;
      entity_value: string;
      canonical_form: string | null;
      mention_count: number;
      similarity: number;
    }>(`SELECT * FROM search_knowledge_entities($1, $2, $3, $4)`, [
      JSON.stringify(embedding),
      options.entityType ?? null,
      options.matchThreshold ?? 0.7,
      options.limit ?? 10,
    ]);

    return result.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      canonicalForm: row.canonical_form ?? undefined,
      mentionCount: row.mention_count,
      similarity: row.similarity,
    }));
  }

  /**
   * Get related entities via graph traversal
   */
  async getRelatedEntities(
    entityId: string,
    options: {
      relationTypes?: RelationType[];
      minConfidence?: number;
      maxDepth?: number;
      limit?: number;
    } = {}
  ): Promise<RelatedEntityResult[]> {
    const result = await this.pool.query<{
      entity_id: string;
      entity_type: string;
      entity_value: string;
      relation_type: string;
      confidence: number;
      depth: number;
      path: string[];
    }>(`SELECT * FROM get_related_entities($1, $2, $3, $4, $5)`, [
      entityId,
      options.relationTypes ?? null,
      options.minConfidence ?? 0.5,
      options.maxDepth ?? 2,
      options.limit ?? 20,
    ]);

    return result.rows.map((row) => ({
      entityId: row.entity_id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      relationType: row.relation_type as RelationType,
      confidence: row.confidence,
      depth: row.depth,
      path: row.path,
    }));
  }

  /**
   * Get entities that frequently co-occur with a given entity
   */
  async getCooccurrences(
    entityId: string,
    options: {
      minCooccurrence?: number;
      limit?: number;
    } = {}
  ): Promise<EntityCooccurrenceResult[]> {
    const result = await this.pool.query<{
      cooccurring_entity_id: string;
      entity_type: string;
      entity_value: string;
      cooccurrence_count: bigint;
      shared_event_ids: string[];
    }>(`SELECT * FROM get_entity_cooccurrences($1, $2, $3)`, [
      entityId,
      options.minCooccurrence ?? this.config.minCooccurrenceForRelation,
      options.limit ?? 20,
    ]);

    return result.rows.map((row) => ({
      cooccurringEntityId: row.cooccurring_entity_id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      cooccurrenceCount: Number(row.cooccurrence_count),
      sharedEventIds: row.shared_event_ids,
    }));
  }

  /**
   * Get all events where an entity was mentioned
   */
  async getEntityEvents(entityId: string, limit = 20): Promise<string[]> {
    const result = await this.pool.query<{ event_id: string }>(
      `SELECT event_id FROM entity_event_mapping
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [entityId, limit]
    );

    return result.rows.map((row) => row.event_id);
  }

  /**
   * Get most frequently mentioned entities
   */
  async getTopEntities(
    options: {
      entityType?: EntityType;
      limit?: number;
    } = {}
  ): Promise<KnowledgeEntity[]> {
    const result = await this.pool.query<{
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
       WHERE deleted_at IS NULL
       ${options.entityType ? 'AND entity_type = $1' : ''}
       ORDER BY mention_count DESC
       LIMIT ${options.entityType ? '$2' : '$1'}`,
      options.entityType ? [options.entityType, options.limit ?? 20] : [options.limit ?? 20]
    );

    return result.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type as EntityType,
      entityValue: row.entity_value,
      entityHash: row.entity_hash,
      canonicalForm: row.canonical_form ?? undefined,
      mentionCount: row.mention_count,
      avgConfidence: row.avg_confidence ?? undefined,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
    }));
  }

  // ===========================================================================
  // GDPR Compliance
  // ===========================================================================

  /**
   * Soft delete entities and relations for a subject (GDPR erasure)
   */
  async eraseSubjectEntities(subjectId: string): Promise<number> {
    const now = new Date();

    // Find all events for this subject
    const eventsResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM episodic_events WHERE subject_id = $1`,
      [subjectId]
    );

    if (eventsResult.rows.length === 0) return 0;

    const eventIds = eventsResult.rows.map((r) => r.id);

    // Find entities only associated with this subject's events
    const entitiesResult = await this.pool.query<{ entity_id: string }>(
      `SELECT DISTINCT eem.entity_id
       FROM entity_event_mapping eem
       WHERE eem.event_id = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM entity_event_mapping eem2
         WHERE eem2.entity_id = eem.entity_id
         AND eem2.event_id != ALL($1)
       )`,
      [eventIds]
    );

    const entityIds = entitiesResult.rows.map((r) => r.entity_id);

    if (entityIds.length === 0) return 0;

    // Soft delete entities
    await this.pool.query(`UPDATE knowledge_entities SET deleted_at = $1 WHERE id = ANY($2)`, [
      now,
      entityIds,
    ]);

    // Delete relations involving these entities (cascade handled by FK)
    await this.pool.query(
      `DELETE FROM knowledge_relations
       WHERE source_entity_id = ANY($1) OR target_entity_id = ANY($1)`,
      [entityIds]
    );

    // Delete entity-event mappings
    await this.pool.query(`DELETE FROM entity_event_mapping WHERE entity_id = ANY($1)`, [
      entityIds,
    ]);

    logger.info(
      { subjectId, erasedEntities: entityIds.length },
      'GDPR erasure completed for subject entities'
    );

    return entityIds.length;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Generate a hash for entity deduplication
   */
  private hashEntity(entityType: string, entityValue: string): string {
    const normalized = `${entityType}:${entityValue.toLowerCase().trim()}`;
    return createHash('sha256').update(normalized).digest('hex');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createKnowledgeGraphService(
  pool: Pool,
  embeddings: IEmbeddingService | null,
  config?: Partial<KnowledgeGraphConfig>
): KnowledgeGraphService {
  return new KnowledgeGraphService(pool, embeddings, config);
}

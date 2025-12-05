/**
 * Memory Retrieval Service - Semantic Search for Episodic Memory
 *
 * ADR-004: Provides temporal and semantic search across episodic events
 * for context retrieval and pattern analysis.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  type EpisodicEvent,
  type MemoryQuery,
  type SubjectMemorySummary,
  type SourceChannel,
  type SentimentTrend,
  type BehavioralPattern,
  type CognitiveSystemConfig,
} from './types.js';
import type { IEmbeddingService } from './episode-builder.js';

// Logger available for future debugging
const _logger = createLogger({ name: 'cognitive-memory-retrieval' });
void _logger;

// =============================================================================
// Database Row Types
// =============================================================================

interface StatsRow {
  total_events: string | number;
  first_interaction: Date | null;
  last_interaction: Date | null;
  positive_count: string | number;
  neutral_count: string | number;
  negative_count: string | number;
}

interface ChannelRow {
  source_channel: string;
  count: string | number;
}

interface SentimentRow {
  recent_avg: string | number | null;
  older_avg: string | number | null;
}

// =============================================================================
// Memory Retrieval Service Class
// =============================================================================

export class MemoryRetrievalService {
  private config: CognitiveSystemConfig;

  constructor(
    private pool: Pool,
    private embeddings: IEmbeddingService,
    config: Partial<CognitiveSystemConfig> = {}
  ) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
  }

  /**
   * Query episodic memories with optional semantic search
   */
  async query(query: MemoryQuery): Promise<EpisodicEvent[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Subject filters
    if (query.subjectType) {
      conditions.push(`subject_type = $${paramIndex++}`);
      params.push(query.subjectType);
    }

    if (query.subjectId) {
      conditions.push(`subject_id = $${paramIndex++}`);
      params.push(query.subjectId);
    }

    // Event type filters
    if (query.eventTypes?.length) {
      conditions.push(`event_type = ANY($${paramIndex++})`);
      params.push(query.eventTypes);
    }

    if (query.eventCategories?.length) {
      conditions.push(`event_category = ANY($${paramIndex++})`);
      params.push(query.eventCategories);
    }

    // Channel filters
    if (query.channels?.length) {
      conditions.push(`source_channel = ANY($${paramIndex++})`);
      params.push(query.channels);
    }

    // Temporal filters
    if (query.fromDate) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(query.fromDate);
    }

    if (query.toDate) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(query.toDate);
    }

    let orderBy = 'occurred_at DESC';
    let selectClause = `
      id, subject_type, subject_id, event_type, event_category,
      source_channel, raw_event_id, summary, key_entities,
      sentiment, intent, occurred_at, processed_at, metadata
    `;

    // Semantic search if query text provided
    if (query.semanticQuery) {
      const embeddingResult = await this.embeddings.embed(query.semanticQuery);
      const queryEmbedding = embeddingResult.embedding;

      selectClause = `${selectClause}, 1 - (embedding <=> $${paramIndex++}::vector) as similarity`;
      params.push(JSON.stringify(queryEmbedding));

      const minSimilarity = query.minSimilarity ?? this.config.minSimilarity;
      conditions.push(`embedding IS NOT NULL`);
      conditions.push(`1 - (embedding <=> $${paramIndex - 1}::vector) >= $${paramIndex++}`);
      params.push(minSimilarity);

      orderBy = 'similarity DESC, occurred_at DESC';
    }

    const limit = query.limit ?? this.config.defaultQueryLimit;

    const sql = `
      SELECT ${selectClause}
      FROM episodic_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `;

    const result = await this.pool.query(sql, params);

    return result.rows.map((row: Record<string, unknown>) => this.rowToEpisodicEvent(row));
  }

  /**
   * Get comprehensive memory summary for a subject
   */
  async getSubjectSummary(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string
  ): Promise<SubjectMemorySummary> {
    // Get aggregate statistics
    const statsResult = await this.pool.query(
      `
      SELECT
        COUNT(*) as total_events,
        MIN(occurred_at) as first_interaction,
        MAX(occurred_at) as last_interaction,
        COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_count,
        COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_count,
        COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count
      FROM episodic_events
      WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
    `,
      [subjectType, subjectId]
    );

    // Get channel breakdown
    const channelResult = await this.pool.query(
      `
      SELECT source_channel, COUNT(*) as count
      FROM episodic_events
      WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
      GROUP BY source_channel
    `,
      [subjectType, subjectId]
    );

    // Get sentiment trend
    const sentimentTrend = await this.calculateSentimentTrend(subjectType, subjectId);

    // Get behavioral patterns
    const patternsResult = await this.pool.query(
      `
      SELECT *
      FROM behavioral_patterns
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY confidence DESC
      LIMIT 5
    `,
      [subjectType, subjectId]
    );

    // Get recent events for summary
    const recentEvents = await this.query({
      subjectType,
      subjectId,
      limit: 5,
    });

    const stats = statsResult.rows[0] as StatsRow | undefined;
    const channelBreakdown: Partial<Record<SourceChannel, number>> = {};

    for (const row of channelResult.rows as ChannelRow[]) {
      channelBreakdown[row.source_channel as SourceChannel] = Number(row.count);
    }

    return {
      subjectType,
      subjectId,
      totalEvents: Number(stats?.total_events ?? 0),
      firstInteraction: stats?.first_interaction ?? null,
      lastInteraction: stats?.last_interaction ?? null,
      channelBreakdown,
      sentimentTrend,
      sentimentCounts: {
        positive: Number(stats?.positive_count ?? 0),
        neutral: Number(stats?.neutral_count ?? 0),
        negative: Number(stats?.negative_count ?? 0),
      },
      patterns: patternsResult.rows.map((row: Record<string, unknown>) =>
        this.rowToBehavioralPattern(row)
      ),
      recentSummary: recentEvents.map((e) => e.summary).join(' '),
    };
  }

  /**
   * Find similar past interactions using semantic search
   */
  async findSimilarInteractions(
    query: string,
    options: {
      subjectId?: string;
      subjectType?: 'lead' | 'patient' | 'contact';
      limit?: number;
      minSimilarity?: number;
    } = {}
  ): Promise<EpisodicEvent[]> {
    return this.query({
      subjectId: options.subjectId,
      subjectType: options.subjectType,
      semanticQuery: query,
      limit: options.limit ?? 5,
      minSimilarity: options.minSimilarity ?? this.config.minSimilarity,
    });
  }

  /**
   * Get recent events for a subject within a time window
   */
  async getRecentEvents(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string,
    days = 30,
    limit = 20
  ): Promise<EpisodicEvent[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    return this.query({
      subjectType,
      subjectId,
      fromDate,
      limit,
    });
  }

  /**
   * Get events by type for a subject
   */
  async getEventsByType(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string,
    eventTypes: string[],
    limit = 20
  ): Promise<EpisodicEvent[]> {
    return this.query({
      subjectType,
      subjectId,
      eventTypes,
      limit,
    });
  }

  /**
   * Calculate sentiment trend for a subject
   */
  private async calculateSentimentTrend(
    subjectType: string,
    subjectId: string
  ): Promise<SentimentTrend> {
    const result = await this.pool.query(
      `
      WITH recent_sentiment AS (
        SELECT
          sentiment,
          occurred_at,
          ROW_NUMBER() OVER (ORDER BY occurred_at DESC) as recency
        FROM episodic_events
        WHERE subject_type = $1 AND subject_id = $2
          AND sentiment IS NOT NULL
          AND deleted_at IS NULL
        ORDER BY occurred_at DESC
        LIMIT 10
      ),
      sentiment_scores AS (
        SELECT
          CASE sentiment
            WHEN 'positive' THEN 1
            WHEN 'neutral' THEN 0
            WHEN 'negative' THEN -1
          END as score,
          recency
        FROM recent_sentiment
      )
      SELECT
        AVG(CASE WHEN recency <= 3 THEN score END) as recent_avg,
        AVG(CASE WHEN recency > 3 THEN score END) as older_avg
      FROM sentiment_scores
    `,
      [subjectType, subjectId]
    );

    const row = result.rows[0] as SentimentRow | undefined;
    const recentAvg = row?.recent_avg;
    const olderAvg = row?.older_avg;
    if (
      recentAvg === null ||
      recentAvg === undefined ||
      olderAvg === null ||
      olderAvg === undefined
    ) {
      return 'stable';
    }

    const diff = Number(recentAvg) - Number(olderAvg);
    if (diff > 0.3) return 'improving';
    if (diff < -0.3) return 'declining';
    return 'stable';
  }

  /**
   * Convert database row to EpisodicEvent
   */
  private rowToEpisodicEvent(row: Record<string, unknown>): EpisodicEvent {
    const keyEntities = row.key_entities as EpisodicEvent['keyEntities'] | null;
    const metadata = row.metadata as Record<string, unknown> | null;

    return {
      id: row.id as string,
      subjectType: row.subject_type as EpisodicEvent['subjectType'],
      subjectId: row.subject_id as string,
      eventType: row.event_type as string,
      eventCategory: row.event_category as EpisodicEvent['eventCategory'],
      sourceChannel: row.source_channel as EpisodicEvent['sourceChannel'],
      rawEventId: row.raw_event_id as string | undefined,
      summary: row.summary as string,
      keyEntities: keyEntities ?? [],
      sentiment: row.sentiment as EpisodicEvent['sentiment'],
      intent: row.intent as string | undefined,
      occurredAt: row.occurred_at as Date,
      processedAt: row.processed_at as Date | undefined,
      metadata: metadata ?? undefined,
    };
  }

  /**
   * Convert database row to BehavioralPattern
   */
  private rowToBehavioralPattern(row: Record<string, unknown>): BehavioralPattern {
    const supportingEventIds = row.supporting_event_ids as string[] | null;
    const metadata = row.metadata as Record<string, unknown> | null;
    const occurrenceCount = row.occurrence_count as number | null;

    return {
      id: row.id as string,
      subjectType: row.subject_type as BehavioralPattern['subjectType'],
      subjectId: row.subject_id as string,
      patternType: row.pattern_type as string,
      patternDescription: row.pattern_description as string,
      confidence: Number(row.confidence),
      supportingEventIds: supportingEventIds ?? [],
      firstObservedAt: row.first_observed_at as Date,
      lastObservedAt: row.last_observed_at as Date,
      occurrenceCount: occurrenceCount ?? 1,
      metadata: metadata ?? undefined,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMemoryRetrievalService(
  pool: Pool,
  embeddings: IEmbeddingService,
  config?: Partial<CognitiveSystemConfig>
): MemoryRetrievalService {
  return new MemoryRetrievalService(pool, embeddings, config);
}

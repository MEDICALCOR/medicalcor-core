/**
 * Memory Retrieval Service - Semantic Search for Episodic Memory
 *
 * ADR-004: Provides temporal and semantic search across episodic events
 * for context retrieval and pattern analysis.
 *
 * L6: Supports optional PII masking at query time for non-admin roles.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  PaginationCursorDataSchema,
  type EpisodicEvent,
  type MemoryQuery,
  type PaginatedMemoryQuery,
  type PaginatedResult,
  type PaginationCursorData,
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
// Cursor Encoding/Decoding Utilities
// =============================================================================

/**
 * Encode pagination cursor data to an opaque base64 string.
 * Uses URL-safe base64 encoding for HTTP compatibility.
 */
export function encodeCursor(data: PaginationCursorData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode an opaque cursor string to pagination cursor data.
 * Returns null if the cursor is invalid or malformed.
 */
export function decodeCursor(cursor: string): PaginationCursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    const result = PaginationCursorDataSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
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
   * Query episodic memories with cursor-based pagination.
   * Prevents OOM issues with large result sets by returning pages of results.
   */
  async queryPaginated(query: PaginatedMemoryQuery): Promise<PaginatedResult<EpisodicEvent>> {
    const cursorData = this.decodePaginationCursor(query.cursor);
    const queryContext = await this.buildPaginatedQueryContext(query, cursorData);

    const result = await this.pool.query(queryContext.sql, queryContext.params);
    const rawRows = result.rows as Record<string, unknown>[];

    return this.buildPaginatedResult(rawRows, queryContext.pageSize);
  }

  /**
   * Decode and validate pagination cursor, throwing if invalid.
   */
  private decodePaginationCursor(cursor?: string): PaginationCursorData | null {
    if (!cursor) return null;
    const cursorData = decodeCursor(cursor);
    if (!cursorData) throw new Error('Invalid pagination cursor');
    return cursorData;
  }

  /**
   * Build the SQL query context for paginated queries.
   */
  private async buildPaginatedQueryContext(
    query: PaginatedMemoryQuery,
    cursorData: PaginationCursorData | null
  ): Promise<{ sql: string; params: unknown[]; pageSize: number }> {
    const ctx = { conditions: ['deleted_at IS NULL'], params: [] as unknown[], paramIndex: 1 };

    this.addBaseFilters(ctx, query);
    const { selectClause, orderBy } = await this.addSemanticOrTemporalConditions(
      ctx,
      query,
      cursorData
    );

    const pageSize = query.pageSize ?? query.limit ?? this.config.defaultQueryLimit;
    const sql = `
      SELECT ${selectClause}
      FROM episodic_events
      WHERE ${ctx.conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${pageSize + 1}
    `;

    return { sql, params: ctx.params, pageSize };
  }

  /**
   * Add base query filters (subject, event types, channels, dates).
   */
  private addBaseFilters(
    ctx: { conditions: string[]; params: unknown[]; paramIndex: number },
    query: PaginatedMemoryQuery
  ): void {
    if (query.subjectType) {
      ctx.conditions.push(`subject_type = $${ctx.paramIndex++}`);
      ctx.params.push(query.subjectType);
    }
    if (query.subjectId) {
      ctx.conditions.push(`subject_id = $${ctx.paramIndex++}`);
      ctx.params.push(query.subjectId);
    }
    if (query.eventTypes?.length) {
      ctx.conditions.push(`event_type = ANY($${ctx.paramIndex++})`);
      ctx.params.push(query.eventTypes);
    }
    if (query.eventCategories?.length) {
      ctx.conditions.push(`event_category = ANY($${ctx.paramIndex++})`);
      ctx.params.push(query.eventCategories);
    }
    if (query.channels?.length) {
      ctx.conditions.push(`source_channel = ANY($${ctx.paramIndex++})`);
      ctx.params.push(query.channels);
    }
    if (query.fromDate) {
      ctx.conditions.push(`occurred_at >= $${ctx.paramIndex++}`);
      ctx.params.push(query.fromDate);
    }
    if (query.toDate) {
      ctx.conditions.push(`occurred_at <= $${ctx.paramIndex++}`);
      ctx.params.push(query.toDate);
    }
  }

  /**
   * Add semantic search or temporal ordering conditions.
   */
  private async addSemanticOrTemporalConditions(
    ctx: { conditions: string[]; params: unknown[]; paramIndex: number },
    query: PaginatedMemoryQuery,
    cursorData: PaginationCursorData | null
  ): Promise<{ selectClause: string; orderBy: string }> {
    const baseSelect = `id, subject_type, subject_id, event_type, event_category,
      source_channel, raw_event_id, summary, key_entities,
      sentiment, intent, occurred_at, processed_at, metadata`;

    if (query.semanticQuery) {
      return this.addSemanticSearchConditions(
        ctx,
        query.semanticQuery,
        query.minSimilarity,
        cursorData,
        baseSelect
      );
    }

    this.addTemporalCursorConditions(ctx, cursorData);
    return { selectClause: baseSelect, orderBy: 'occurred_at DESC, id DESC' };
  }

  /**
   * Add semantic search conditions to query context.
   */
  private async addSemanticSearchConditions(
    ctx: { conditions: string[]; params: unknown[]; paramIndex: number },
    semanticQuery: string,
    minSimilarityOverride: number | undefined,
    cursorData: PaginationCursorData | null,
    baseSelect: string
  ): Promise<{ selectClause: string; orderBy: string }> {
    const embeddingResult = await this.embeddings.embed(semanticQuery);
    const embeddingParamIdx = ctx.paramIndex++;
    ctx.params.push(JSON.stringify(embeddingResult.embedding));

    const selectClause = `${baseSelect}, 1 - (embedding <=> $${embeddingParamIdx}::vector) as similarity`;
    const minSimilarity = minSimilarityOverride ?? this.config.minSimilarity;

    ctx.conditions.push(`embedding IS NOT NULL`);
    ctx.conditions.push(
      `1 - (embedding <=> $${embeddingParamIdx}::vector) >= $${ctx.paramIndex++}`
    );
    ctx.params.push(minSimilarity);

    if (cursorData) {
      this.addSemanticCursorConditions(ctx, cursorData, embeddingParamIdx);
    }

    return { selectClause, orderBy: 'similarity DESC, occurred_at DESC, id DESC' };
  }

  /**
   * Add cursor conditions for semantic search ordering.
   */
  private addSemanticCursorConditions(
    ctx: { conditions: string[]; params: unknown[]; paramIndex: number },
    cursorData: PaginationCursorData,
    embeddingParamIdx: number
  ): void {
    const cursorSimilarity = cursorData.similarity ?? 0;
    const p1 = ctx.paramIndex++;
    const p2 = ctx.paramIndex++;
    const p3 = ctx.paramIndex++;
    const p4 = ctx.paramIndex++;
    const p5 = ctx.paramIndex++;

    ctx.conditions.push(`(
      (1 - (embedding <=> $${embeddingParamIdx}::vector)) < $${p1}
      OR ((1 - (embedding <=> $${embeddingParamIdx}::vector)) = $${p2}
        AND (occurred_at < $${p3} OR (occurred_at = $${p4} AND id < $${p5})))
    )`);
    ctx.params.push(
      cursorSimilarity,
      cursorSimilarity,
      new Date(cursorData.occurredAt),
      new Date(cursorData.occurredAt),
      cursorData.id
    );
  }

  /**
   * Add cursor conditions for temporal ordering.
   */
  private addTemporalCursorConditions(
    ctx: { conditions: string[]; params: unknown[]; paramIndex: number },
    cursorData: PaginationCursorData | null
  ): void {
    if (!cursorData) return;
    const p1 = ctx.paramIndex++;
    const p2 = ctx.paramIndex++;
    const p3 = ctx.paramIndex++;
    ctx.conditions.push(`(occurred_at < $${p1} OR (occurred_at = $${p2} AND id < $${p3}))`);
    ctx.params.push(
      new Date(cursorData.occurredAt),
      new Date(cursorData.occurredAt),
      cursorData.id
    );
  }

  /**
   * Build paginated result from raw database rows.
   */
  private buildPaginatedResult(
    rawRows: Record<string, unknown>[],
    pageSize: number
  ): PaginatedResult<EpisodicEvent> {
    const hasMore = rawRows.length > pageSize;
    const pageRows = rawRows.slice(0, pageSize);
    const items = pageRows.map((row) => this.rowToEpisodicEvent(row));

    const nextCursor = this.buildNextCursor(pageRows, items, hasMore);

    return { items, nextCursor, hasMore };
  }

  /**
   * Build the next cursor from the last item in the result set.
   */
  private buildNextCursor(
    pageRows: Record<string, unknown>[],
    items: EpisodicEvent[],
    hasMore: boolean
  ): string | null {
    if (!hasMore || pageRows.length === 0) return null;

    const lastRawRow = pageRows[pageRows.length - 1];
    const lastItem = items[items.length - 1];
    if (!lastItem || !lastRawRow) return null;

    const cursorPayload: PaginationCursorData = {
      occurredAt: lastItem.occurredAt.toISOString(),
      id: lastItem.id,
    };

    const rawSimilarity = lastRawRow.similarity;
    if (rawSimilarity !== undefined && rawSimilarity !== null) {
      const numSimilarity = Number(rawSimilarity);
      if (!isNaN(numSimilarity)) {
        cursorPayload.similarity = numSimilarity;
      }
    }

    return encodeCursor(cursorPayload);
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

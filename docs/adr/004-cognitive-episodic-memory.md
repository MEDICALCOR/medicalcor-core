# ADR-004: Cognitive Episodic Memory System

## Status

**PROPOSED** - 2024-12-02

## Context

MedicalCor requires an AI system that can "remember" patient interactions across time and channels, enabling:

1. **Contextual AI responses**: GPT-4o should understand a patient's full history when generating replies
2. **Pattern recognition**: Detect behavioral patterns (e.g., "patient always reschedules Monday appointments")
3. **Proactive engagement**: Identify patients at risk of churning based on interaction patterns
4. **Personalized communication**: Tailor tone and content based on past interactions

### Current Limitations

The existing RAG system (`packages/core/src/rag/`) provides:

- Knowledge base search (FAQs, protocols, pricing)
- Message embedding storage
- Hybrid semantic + keyword search

However, it lacks:

- **Temporal awareness**: Cannot query "what happened in the last 30 days"
- **Subject-centric views**: Cannot retrieve all events for a specific patient/lead
- **Event summarization**: No LLM-powered insights from historical events
- **Cross-channel correlation**: WhatsApp, Voice, Web events are siloed

## Decision

Implement a **Cognitive Episodic Memory** system as an extension to the existing architecture, leveraging:

- Existing Event Store for raw events
- Existing pgvector for semantic search
- New episodic memory layer for AI-powered retrieval and analysis

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COGNITIVE EPISODIC MEMORY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐    │
│  │  Event Ingest   │───▶│  Episode Builder │───▶│  Embedding Service  │    │
│  │  (Trigger.dev)  │    │  (Summarization) │    │  (OpenAI + Cache)   │    │
│  └─────────────────┘    └──────────────────┘    └──────────────────────┘   │
│           │                      │                        │                 │
│           ▼                      ▼                        ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     EPISODIC EVENTS TABLE                            │   │
│  │  (PostgreSQL + pgvector)                                             │   │
│  │  - Subject (lead/patient)                                            │   │
│  │  - Event type & source channel                                       │   │
│  │  - LLM-generated summary                                             │   │
│  │  - Semantic embedding (1536-dim)                                     │   │
│  │  - Temporal metadata                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     MEMORY RETRIEVAL SERVICE                         │   │
│  │  - Temporal queries (last N days)                                    │   │
│  │  - Semantic similarity search                                        │   │
│  │  - Subject-centric retrieval                                         │   │
│  │  - Pattern detection                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     COGNITIVE ANALYSIS                               │   │
│  │  - Behavioral pattern extraction                                     │   │
│  │  - Churn risk scoring                                                │   │
│  │  - Relationship summarization                                        │   │
│  │  - Next-best-action recommendations                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Package Structure

```
packages/
├── core/
│   └── src/
│       └── cognitive/              # NEW: Cognitive Memory Module
│           ├── index.ts
│           ├── types.ts
│           ├── episodic-event.ts
│           ├── episode-builder.ts
│           ├── memory-repository.ts
│           ├── memory-retrieval.ts
│           ├── pattern-detector.ts
│           └── cognitive-analyzer.ts
```

### 1. Database Schema

**File**: `db/migrations/20241202000004_add_episodic_memory.sql`

```sql
-- migrate:up

-- Episodic events table with vector embeddings
CREATE TABLE episodic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Subject identification (polymorphic)
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('lead', 'patient', 'contact')),
    subject_id UUID NOT NULL,

    -- Event classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    source_channel VARCHAR(30) NOT NULL CHECK (source_channel IN ('whatsapp', 'voice', 'web', 'email', 'crm', 'system')),

    -- Content
    raw_event_id UUID, -- Reference to domain_events if applicable
    summary TEXT NOT NULL, -- LLM-generated summary
    key_entities JSONB DEFAULT '[]', -- Extracted entities (procedures, dates, amounts)
    sentiment VARCHAR(20), -- positive, neutral, negative
    intent VARCHAR(100), -- detected intent

    -- Embedding for semantic search
    embedding vector(1536),

    -- Temporal metadata
    occurred_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}',
    embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

    -- Soft delete for GDPR
    deleted_at TIMESTAMPTZ
);

-- Partition by time for performance (monthly partitions)
-- Note: Partitioning setup would be done separately for production

-- Indexes for common query patterns
CREATE INDEX idx_episodic_subject ON episodic_events(subject_type, subject_id, occurred_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_episodic_type ON episodic_events(event_type, occurred_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_episodic_channel ON episodic_events(source_channel, occurred_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_episodic_occurred ON episodic_events(occurred_at DESC)
    WHERE deleted_at IS NULL;

-- HNSW index for semantic similarity search
CREATE INDEX idx_episodic_embedding_hnsw ON episodic_events
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- GIN index for entity search
CREATE INDEX idx_episodic_entities ON episodic_events USING gin(key_entities);

-- Behavioral patterns table (computed/cached)
CREATE TABLE behavioral_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type VARCHAR(20) NOT NULL,
    subject_id UUID NOT NULL,
    pattern_type VARCHAR(50) NOT NULL,
    pattern_description TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    supporting_event_ids UUID[] NOT NULL,
    first_observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_type, subject_id, pattern_type)
);

CREATE INDEX idx_patterns_subject ON behavioral_patterns(subject_type, subject_id);
CREATE INDEX idx_patterns_type ON behavioral_patterns(pattern_type);

-- migrate:down
DROP TABLE IF EXISTS behavioral_patterns;
DROP TABLE IF EXISTS episodic_events;
```

### 2. Core Types

**File**: `packages/core/src/cognitive/types.ts`

```typescript
import { z } from 'zod';

export const SubjectTypeSchema = z.enum(['lead', 'patient', 'contact']);
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

export const SourceChannelSchema = z.enum(['whatsapp', 'voice', 'web', 'email', 'crm', 'system']);
export type SourceChannel = z.infer<typeof SourceChannelSchema>;

export const SentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const EpisodicEventSchema = z.object({
  id: z.string().uuid(),
  subjectType: SubjectTypeSchema,
  subjectId: z.string().uuid(),
  eventType: z.string().max(100),
  eventCategory: z.string().max(50),
  sourceChannel: SourceChannelSchema,
  rawEventId: z.string().uuid().optional(),
  summary: z.string(),
  keyEntities: z.array(
    z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
  sentiment: SentimentSchema.optional(),
  intent: z.string().max(100).optional(),
  occurredAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type EpisodicEvent = z.infer<typeof EpisodicEventSchema>;

export interface EpisodicEventWithEmbedding extends EpisodicEvent {
  embedding: number[];
  embeddingModel: string;
}

export interface BehavioralPattern {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  patternType: string;
  patternDescription: string;
  confidence: number;
  supportingEventIds: string[];
  firstObservedAt: Date;
  lastObservedAt: Date;
  occurrenceCount: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  subjectType?: SubjectType;
  subjectId?: string;
  eventTypes?: string[];
  channels?: SourceChannel[];
  fromDate?: Date;
  toDate?: Date;
  semanticQuery?: string;
  limit?: number;
  minSimilarity?: number;
}

export interface SubjectMemorySummary {
  subjectType: SubjectType;
  subjectId: string;
  totalEvents: number;
  firstInteraction: Date;
  lastInteraction: Date;
  channelBreakdown: Record<SourceChannel, number>;
  sentimentTrend: 'improving' | 'stable' | 'declining';
  patterns: BehavioralPattern[];
  recentSummary: string; // LLM-generated
}

export interface CognitiveInsight {
  type:
    | 'churn_risk'
    | 'upsell_opportunity'
    | 'engagement_drop'
    | 'positive_momentum'
    | 'pattern_detected';
  confidence: number;
  description: string;
  recommendedAction: string;
  supportingEvents: EpisodicEvent[];
}
```

### 3. Episode Builder (Event Processing)

**File**: `packages/core/src/cognitive/episode-builder.ts`

```typescript
import { type Pool } from 'pg';
import { type OpenAIClient } from '@medicalcor/integrations';
import { type EmbeddingsService } from '@medicalcor/integrations';
import {
  type EpisodicEvent,
  type EpisodicEventWithEmbedding,
  type SubjectType,
  type SourceChannel,
} from './types';
import { logger } from '../logger';

interface RawEventContext {
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  occurredAt: Date;
}

export class EpisodeBuilder {
  constructor(
    private openai: OpenAIClient,
    private embeddings: EmbeddingsService,
    private pool: Pool
  ) {}

  async processEvent(
    subjectType: SubjectType,
    subjectId: string,
    sourceChannel: SourceChannel,
    rawEvent: RawEventContext
  ): Promise<EpisodicEventWithEmbedding> {
    // 1. Generate summary using GPT-4o
    const analysis = await this.analyzeEvent(rawEvent);

    // 2. Generate embedding for the summary
    const embedding = await this.embeddings.embed(analysis.summary);

    // 3. Create episodic event
    const episode: EpisodicEventWithEmbedding = {
      id: crypto.randomUUID(),
      subjectType,
      subjectId,
      eventType: rawEvent.eventType,
      eventCategory: this.categorizeEvent(rawEvent.eventType),
      sourceChannel,
      rawEventId: rawEvent.correlationId,
      summary: analysis.summary,
      keyEntities: analysis.entities,
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      occurredAt: rawEvent.occurredAt,
      embedding,
      embeddingModel: 'text-embedding-3-small',
      metadata: {
        originalPayloadKeys: Object.keys(rawEvent.payload),
      },
    };

    // 4. Persist
    await this.save(episode);

    logger.info({ subjectId, eventType: rawEvent.eventType }, 'Episodic memory created');

    return episode;
  }

  private async analyzeEvent(event: RawEventContext): Promise<{
    summary: string;
    entities: Array<{ type: string; value: string; confidence?: number }>;
    sentiment: 'positive' | 'neutral' | 'negative';
    intent: string;
  }> {
    const prompt = `Analyze this medical CRM event and extract structured information.

Event Type: ${event.eventType}
Event Data: ${JSON.stringify(event.payload, null, 2)}

Respond in JSON format:
{
  "summary": "A concise 1-2 sentence summary of what happened",
  "entities": [{"type": "procedure|date|amount|person|location", "value": "extracted value"}],
  "sentiment": "positive|neutral|negative",
  "intent": "The apparent intent or purpose of this interaction"
}`;

    const response = await this.openai.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });

    return JSON.parse(response.content);
  }

  private categorizeEvent(eventType: string): string {
    const categories: Record<string, string[]> = {
      communication: ['message.received', 'message.sent', 'call.completed', 'email.sent'],
      scheduling: ['appointment.scheduled', 'appointment.cancelled', 'appointment.rescheduled'],
      clinical: ['treatment.started', 'treatment.completed', 'diagnosis.added'],
      financial: ['payment.received', 'invoice.sent', 'quote.sent'],
      lifecycle: ['lead.created', 'lead.qualified', 'patient.onboarded'],
    };

    for (const [category, types] of Object.entries(categories)) {
      if (types.some((t) => eventType.includes(t))) {
        return category;
      }
    }
    return 'other';
  }

  private async save(episode: EpisodicEventWithEmbedding): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO episodic_events (
        id, subject_type, subject_id, event_type, event_category,
        source_channel, raw_event_id, summary, key_entities,
        sentiment, intent, embedding, occurred_at, metadata, embedding_model
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
    `,
      [
        episode.id,
        episode.subjectType,
        episode.subjectId,
        episode.eventType,
        episode.eventCategory,
        episode.sourceChannel,
        episode.rawEventId,
        episode.summary,
        JSON.stringify(episode.keyEntities),
        episode.sentiment,
        episode.intent,
        JSON.stringify(episode.embedding),
        episode.occurredAt,
        JSON.stringify(episode.metadata),
        episode.embeddingModel,
      ]
    );
  }
}
```

### 4. Memory Retrieval Service

**File**: `packages/core/src/cognitive/memory-retrieval.ts`

```typescript
import { type Pool } from 'pg';
import { type EmbeddingsService } from '@medicalcor/integrations';
import {
  type EpisodicEvent,
  type MemoryQuery,
  type SubjectMemorySummary,
  type SourceChannel,
} from './types';

export class MemoryRetrievalService {
  constructor(
    private pool: Pool,
    private embeddings: EmbeddingsService
  ) {}

  /**
   * Retrieve episodic memories matching the query criteria
   */
  async query(query: MemoryQuery): Promise<EpisodicEvent[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.subjectType) {
      conditions.push(`subject_type = $${paramIndex++}`);
      params.push(query.subjectType);
    }

    if (query.subjectId) {
      conditions.push(`subject_id = $${paramIndex++}`);
      params.push(query.subjectId);
    }

    if (query.eventTypes?.length) {
      conditions.push(`event_type = ANY($${paramIndex++})`);
      params.push(query.eventTypes);
    }

    if (query.channels?.length) {
      conditions.push(`source_channel = ANY($${paramIndex++})`);
      params.push(query.channels);
    }

    if (query.fromDate) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(query.fromDate);
    }

    if (query.toDate) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(query.toDate);
    }

    let orderBy = 'occurred_at DESC';
    let selectClause = '*';

    // Semantic search if query text provided
    if (query.semanticQuery) {
      const queryEmbedding = await this.embeddings.embed(query.semanticQuery);
      selectClause = `*, 1 - (embedding <=> $${paramIndex++}::vector) as similarity`;
      params.push(JSON.stringify(queryEmbedding));

      if (query.minSimilarity) {
        conditions.push(`1 - (embedding <=> $${paramIndex - 1}::vector) >= $${paramIndex++}`);
        params.push(query.minSimilarity);
      }

      orderBy = 'similarity DESC';
    }

    const limit = query.limit || 20;

    const sql = `
      SELECT ${selectClause}
      FROM episodic_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `;

    const result = await this.pool.query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      eventType: row.event_type,
      eventCategory: row.event_category,
      sourceChannel: row.source_channel,
      rawEventId: row.raw_event_id,
      summary: row.summary,
      keyEntities: row.key_entities,
      sentiment: row.sentiment,
      intent: row.intent,
      occurredAt: row.occurred_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Get a complete memory summary for a subject
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
        jsonb_object_agg(
          source_channel,
          channel_count
        ) as channel_breakdown
      FROM (
        SELECT
          source_channel,
          COUNT(*) as channel_count
        FROM episodic_events
        WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
        GROUP BY source_channel
      ) channel_stats,
      (
        SELECT COUNT(*) as total, MIN(occurred_at) as min_date, MAX(occurred_at) as max_date
        FROM episodic_events
        WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
      ) overall_stats
    `,
      [subjectType, subjectId]
    );

    // Get sentiment trend
    const sentimentResult = await this.pool.query(
      `
      WITH recent_sentiment AS (
        SELECT sentiment, occurred_at
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
          ROW_NUMBER() OVER (ORDER BY occurred_at DESC) as recency
        FROM recent_sentiment
      )
      SELECT
        AVG(CASE WHEN recency <= 3 THEN score END) as recent_avg,
        AVG(CASE WHEN recency > 3 THEN score END) as older_avg
      FROM sentiment_scores
    `,
      [subjectType, subjectId]
    );

    // Get behavioral patterns
    const patternsResult = await this.pool.query(
      `
      SELECT * FROM behavioral_patterns
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY confidence DESC
      LIMIT 5
    `,
      [subjectType, subjectId]
    );

    // Get recent events for summary generation
    const recentEvents = await this.query({
      subjectType,
      subjectId,
      limit: 5,
    });

    const stats = statsResult.rows[0];
    const sentiment = sentimentResult.rows[0];

    let sentimentTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (sentiment.recent_avg !== null && sentiment.older_avg !== null) {
      const diff = sentiment.recent_avg - sentiment.older_avg;
      if (diff > 0.3) sentimentTrend = 'improving';
      else if (diff < -0.3) sentimentTrend = 'declining';
    }

    return {
      subjectType,
      subjectId,
      totalEvents: Number(stats.total_events),
      firstInteraction: stats.first_interaction,
      lastInteraction: stats.last_interaction,
      channelBreakdown: stats.channel_breakdown || ({} as Record<SourceChannel, number>),
      sentimentTrend,
      patterns: patternsResult.rows.map((row) => ({
        id: row.id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        patternType: row.pattern_type,
        patternDescription: row.pattern_description,
        confidence: Number(row.confidence),
        supportingEventIds: row.supporting_event_ids,
        firstObservedAt: row.first_observed_at,
        lastObservedAt: row.last_observed_at,
        occurrenceCount: row.occurrence_count,
        metadata: row.metadata,
      })),
      recentSummary: recentEvents.map((e) => e.summary).join(' '),
    };
  }

  /**
   * Find similar past interactions for context
   */
  async findSimilarInteractions(
    query: string,
    options: {
      subjectId?: string;
      limit?: number;
      minSimilarity?: number;
    } = {}
  ): Promise<EpisodicEvent[]> {
    return this.query({
      subjectId: options.subjectId,
      semanticQuery: query,
      limit: options.limit || 5,
      minSimilarity: options.minSimilarity || 0.7,
    });
  }
}
```

### 5. Pattern Detector

**File**: `packages/core/src/cognitive/pattern-detector.ts`

```typescript
import { type Pool } from 'pg';
import { type OpenAIClient } from '@medicalcor/integrations';
import { type BehavioralPattern, type EpisodicEvent, type SubjectType } from './types';
import { logger } from '../logger';

interface PatternDefinition {
  type: string;
  description: string;
  detector: (events: EpisodicEvent[]) => {
    detected: boolean;
    confidence: number;
    supportingEvents: string[];
  };
}

export class PatternDetector {
  private patterns: PatternDefinition[] = [
    {
      type: 'appointment_rescheduler',
      description: 'Frequently reschedules appointments',
      detector: (events) => {
        const reschedules = events.filter((e) => e.eventType === 'appointment.rescheduled');
        const appointments = events.filter((e) => e.eventType.startsWith('appointment.'));
        if (appointments.length < 3)
          return { detected: false, confidence: 0, supportingEvents: [] };

        const ratio = reschedules.length / appointments.length;
        return {
          detected: ratio > 0.3,
          confidence: Math.min(ratio, 1),
          supportingEvents: reschedules.map((e) => e.id),
        };
      },
    },
    {
      type: 'monday_avoider',
      description: 'Avoids Monday appointments',
      detector: (events) => {
        const scheduledEvents = events.filter(
          (e) =>
            e.eventType === 'appointment.scheduled' &&
            e.keyEntities.some((ent) => ent.type === 'date')
        );
        if (scheduledEvents.length < 5)
          return { detected: false, confidence: 0, supportingEvents: [] };

        const mondayCount = scheduledEvents.filter((e) => {
          const dateEntity = e.keyEntities.find((ent) => ent.type === 'date');
          if (!dateEntity) return false;
          const date = new Date(dateEntity.value);
          return date.getDay() === 1;
        }).length;

        const ratio = mondayCount / scheduledEvents.length;
        return {
          detected: ratio < 0.1,
          confidence: 1 - ratio,
          supportingEvents: scheduledEvents.map((e) => e.id),
        };
      },
    },
    {
      type: 'high_engagement',
      description: 'Highly engaged across multiple channels',
      detector: (events) => {
        const last30Days = events.filter(
          (e) => e.occurredAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );
        const channels = new Set(last30Days.map((e) => e.sourceChannel));

        if (channels.size >= 2 && last30Days.length >= 5) {
          return {
            detected: true,
            confidence: Math.min(channels.size / 3, 1) * Math.min(last30Days.length / 10, 1),
            supportingEvents: last30Days.slice(0, 10).map((e) => e.id),
          };
        }
        return { detected: false, confidence: 0, supportingEvents: [] };
      },
    },
    {
      type: 'declining_engagement',
      description: 'Engagement is declining over time',
      detector: (events) => {
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

        const recent = events.filter((e) => e.occurredAt.getTime() > thirtyDaysAgo).length;
        const previous = events.filter(
          (e) => e.occurredAt.getTime() > sixtyDaysAgo && e.occurredAt.getTime() <= thirtyDaysAgo
        ).length;

        if (previous === 0) return { detected: false, confidence: 0, supportingEvents: [] };

        const declineRatio = 1 - recent / previous;
        return {
          detected: declineRatio > 0.5,
          confidence: Math.min(declineRatio, 1),
          supportingEvents: events.slice(0, 5).map((e) => e.id),
        };
      },
    },
  ];

  constructor(
    private pool: Pool,
    private openai: OpenAIClient
  ) {}

  async detectPatterns(
    subjectType: SubjectType,
    subjectId: string,
    events: EpisodicEvent[]
  ): Promise<BehavioralPattern[]> {
    const detectedPatterns: BehavioralPattern[] = [];

    for (const patternDef of this.patterns) {
      const result = patternDef.detector(events);

      if (result.detected && result.confidence > 0.5) {
        const pattern: BehavioralPattern = {
          id: crypto.randomUUID(),
          subjectType,
          subjectId,
          patternType: patternDef.type,
          patternDescription: patternDef.description,
          confidence: result.confidence,
          supportingEventIds: result.supportingEvents,
          firstObservedAt: new Date(),
          lastObservedAt: new Date(),
          occurrenceCount: 1,
        };

        await this.upsertPattern(pattern);
        detectedPatterns.push(pattern);
      }
    }

    // LLM-based pattern detection for complex patterns
    const llmPatterns = await this.detectLLMPatterns(subjectType, subjectId, events);
    detectedPatterns.push(...llmPatterns);

    return detectedPatterns;
  }

  private async detectLLMPatterns(
    subjectType: SubjectType,
    subjectId: string,
    events: EpisodicEvent[]
  ): Promise<BehavioralPattern[]> {
    if (events.length < 10) return [];

    const eventSummaries = events
      .slice(0, 20)
      .map((e) => `[${e.occurredAt.toISOString()}] ${e.sourceChannel}: ${e.summary}`)
      .join('\n');

    const prompt = `Analyze these patient/lead interactions and identify any behavioral patterns not captured by standard rules.

Interaction History:
${eventSummaries}

Look for patterns like:
- Preferred communication times
- Response patterns
- Topic preferences
- Seasonal behaviors
- Price sensitivity signals

Respond in JSON format:
{
  "patterns": [
    {
      "type": "pattern_identifier",
      "description": "Human-readable description",
      "confidence": 0.0-1.0,
      "reasoning": "Why this pattern was detected"
    }
  ]
}

Only include patterns with confidence > 0.6. Return empty array if no clear patterns.`;

    try {
      const response = await this.openai.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 800,
        responseFormat: { type: 'json_object' },
      });

      const result = JSON.parse(response.content);

      return (result.patterns || [])
        .filter((p: { confidence: number }) => p.confidence > 0.6)
        .map((p: { type: string; description: string; confidence: number }) => ({
          id: crypto.randomUUID(),
          subjectType,
          subjectId,
          patternType: `llm_${p.type}`,
          patternDescription: p.description,
          confidence: p.confidence,
          supportingEventIds: events.slice(0, 10).map((e) => e.id),
          firstObservedAt: new Date(),
          lastObservedAt: new Date(),
          occurrenceCount: 1,
        }));
    } catch (error) {
      logger.warn({ error }, 'LLM pattern detection failed');
      return [];
    }
  }

  private async upsertPattern(pattern: BehavioralPattern): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO behavioral_patterns (
        id, subject_type, subject_id, pattern_type, pattern_description,
        confidence, supporting_event_ids, first_observed_at, last_observed_at,
        occurrence_count, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (subject_type, subject_id, pattern_type) DO UPDATE SET
        confidence = GREATEST(behavioral_patterns.confidence, EXCLUDED.confidence),
        supporting_event_ids = EXCLUDED.supporting_event_ids,
        last_observed_at = EXCLUDED.last_observed_at,
        occurrence_count = behavioral_patterns.occurrence_count + 1,
        updated_at = NOW()
    `,
      [
        pattern.id,
        pattern.subjectType,
        pattern.subjectId,
        pattern.patternType,
        pattern.patternDescription,
        pattern.confidence,
        pattern.supportingEventIds,
        pattern.firstObservedAt,
        pattern.lastObservedAt,
        pattern.occurrenceCount,
        JSON.stringify(pattern.metadata || {}),
      ]
    );
  }
}
```

### 6. Cognitive Analyzer (Insights Generation)

**File**: `packages/core/src/cognitive/cognitive-analyzer.ts`

```typescript
import { type Pool } from 'pg';
import { type OpenAIClient } from '@medicalcor/integrations';
import { MemoryRetrievalService } from './memory-retrieval';
import { PatternDetector } from './pattern-detector';
import { type CognitiveInsight, type SubjectType, type EpisodicEvent } from './types';
import { logger } from '../logger';

export class CognitiveAnalyzer {
  constructor(
    private memoryService: MemoryRetrievalService,
    private patternDetector: PatternDetector,
    private openai: OpenAIClient,
    private pool: Pool
  ) {}

  /**
   * Generate insights for a subject based on their episodic memory
   */
  async analyzeSubject(subjectType: SubjectType, subjectId: string): Promise<CognitiveInsight[]> {
    const insights: CognitiveInsight[] = [];

    // Get subject's memory summary
    const summary = await this.memoryService.getSubjectSummary(subjectType, subjectId);

    // Get recent events for detailed analysis
    const recentEvents = await this.memoryService.query({
      subjectType,
      subjectId,
      limit: 50,
    });

    // Detect patterns
    const patterns = await this.patternDetector.detectPatterns(
      subjectType,
      subjectId,
      recentEvents
    );

    // Convert patterns to insights
    for (const pattern of patterns) {
      if (pattern.patternType === 'declining_engagement') {
        insights.push({
          type: 'churn_risk',
          confidence: pattern.confidence,
          description: `Engagement has declined significantly. ${pattern.patternDescription}`,
          recommendedAction: 'Schedule a proactive check-in call or send a re-engagement message',
          supportingEvents: recentEvents.filter((e) => pattern.supportingEventIds.includes(e.id)),
        });
      }

      if (pattern.patternType === 'high_engagement') {
        insights.push({
          type: 'upsell_opportunity',
          confidence: pattern.confidence,
          description: `Highly engaged across ${summary.channelBreakdown ? Object.keys(summary.channelBreakdown).length : 0} channels`,
          recommendedAction: 'Consider presenting premium treatment options or referral program',
          supportingEvents: recentEvents.filter((e) => pattern.supportingEventIds.includes(e.id)),
        });
      }
    }

    // LLM-powered insight generation
    const llmInsights = await this.generateLLMInsights(summary, recentEvents, patterns);
    insights.push(...llmInsights);

    return insights;
  }

  private async generateLLMInsights(
    summary: Awaited<ReturnType<MemoryRetrievalService['getSubjectSummary']>>,
    events: EpisodicEvent[],
    patterns: Awaited<ReturnType<PatternDetector['detectPatterns']>>
  ): Promise<CognitiveInsight[]> {
    const context = `
Subject Summary:
- Total interactions: ${summary.totalEvents}
- First contact: ${summary.firstInteraction?.toISOString() || 'N/A'}
- Last contact: ${summary.lastInteraction?.toISOString() || 'N/A'}
- Sentiment trend: ${summary.sentimentTrend}
- Detected patterns: ${patterns.map((p) => p.patternDescription).join(', ') || 'None'}

Recent Events:
${events
  .slice(0, 10)
  .map((e) => `- [${e.sourceChannel}] ${e.summary} (${e.sentiment || 'neutral'})`)
  .join('\n')}
`;

    const prompt = `As a medical CRM cognitive assistant, analyze this patient/lead profile and provide actionable insights.

${context}

Generate insights in these categories:
1. Churn Risk: Signs the patient may leave or disengage
2. Upsell Opportunity: Signs they may be interested in additional services
3. Engagement Issues: Communication problems or gaps
4. Positive Momentum: Good signs to reinforce

Respond in JSON format:
{
  "insights": [
    {
      "type": "churn_risk|upsell_opportunity|engagement_drop|positive_momentum",
      "confidence": 0.0-1.0,
      "description": "Brief explanation",
      "recommendedAction": "Specific action to take"
    }
  ]
}

Only include insights with confidence > 0.5. Be specific and actionable.`;

    try {
      const response = await this.openai.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        maxTokens: 1000,
        responseFormat: { type: 'json_object' },
      });

      const result = JSON.parse(response.content);

      return (result.insights || [])
        .filter((i: { confidence: number }) => i.confidence > 0.5)
        .map(
          (i: {
            type: string;
            confidence: number;
            description: string;
            recommendedAction: string;
          }) => ({
            type: i.type as CognitiveInsight['type'],
            confidence: i.confidence,
            description: i.description,
            recommendedAction: i.recommendedAction,
            supportingEvents: events.slice(0, 5),
          })
        );
    } catch (error) {
      logger.warn({ error }, 'LLM insight generation failed');
      return [];
    }
  }

  /**
   * Get contextual memories for AI reply generation
   */
  async getContextForReply(
    subjectType: SubjectType,
    subjectId: string,
    currentMessage: string
  ): Promise<string> {
    // Find similar past interactions
    const similarEvents = await this.memoryService.findSimilarInteractions(currentMessage, {
      subjectId,
      limit: 3,
      minSimilarity: 0.6,
    });

    // Get recent interactions
    const recentEvents = await this.memoryService.query({
      subjectType,
      subjectId,
      limit: 5,
    });

    // Get patterns
    const patterns = await this.pool.query(
      `
      SELECT pattern_type, pattern_description
      FROM behavioral_patterns
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY confidence DESC
      LIMIT 3
    `,
      [subjectType, subjectId]
    );

    const context = [
      '## Patient/Lead Context',
      '',
      '### Recent History:',
      ...recentEvents.map((e) => `- ${e.summary}`),
      '',
    ];

    if (similarEvents.length > 0) {
      context.push('### Similar Past Interactions:');
      context.push(...similarEvents.map((e) => `- ${e.summary}`));
      context.push('');
    }

    if (patterns.rows.length > 0) {
      context.push('### Known Patterns:');
      context.push(...patterns.rows.map((p) => `- ${p.pattern_description}`));
      context.push('');
    }

    return context.join('\n');
  }
}
```

### 7. Integration with Existing RAG Pipeline

**File**: `packages/core/src/cognitive/index.ts`

```typescript
export * from './types';
export { EpisodeBuilder } from './episode-builder';
export { MemoryRetrievalService } from './memory-retrieval';
export { PatternDetector } from './pattern-detector';
export { CognitiveAnalyzer } from './cognitive-analyzer';

// Factory function for easy instantiation
import { type Pool } from 'pg';
import { type OpenAIClient, type EmbeddingsService } from '@medicalcor/integrations';
import { EpisodeBuilder } from './episode-builder';
import { MemoryRetrievalService } from './memory-retrieval';
import { PatternDetector } from './pattern-detector';
import { CognitiveAnalyzer } from './cognitive-analyzer';

export interface CognitiveSystemDependencies {
  pool: Pool;
  openai: OpenAIClient;
  embeddings: EmbeddingsService;
}

export function createCognitiveSystem(deps: CognitiveSystemDependencies) {
  const memoryRetrieval = new MemoryRetrievalService(deps.pool, deps.embeddings);
  const patternDetector = new PatternDetector(deps.pool, deps.openai);
  const episodeBuilder = new EpisodeBuilder(deps.openai, deps.embeddings, deps.pool);
  const analyzer = new CognitiveAnalyzer(memoryRetrieval, patternDetector, deps.openai, deps.pool);

  return {
    episodeBuilder,
    memoryRetrieval,
    patternDetector,
    analyzer,
  };
}
```

---

## Usage Examples

### Processing Incoming Events (Trigger.dev)

```typescript
import { createCognitiveSystem } from '@medicalcor/core/cognitive';

// In whatsapp-handler.ts
export const whatsappHandler = task({
  id: 'whatsapp-message-handler',
  run: async (payload: WhatsAppMessage) => {
    const cognitive = createCognitiveSystem({ pool, openai, embeddings });

    // Create episodic memory for this interaction
    await cognitive.episodeBuilder.processEvent('lead', payload.leadId, 'whatsapp', {
      eventType: 'message.received',
      payload: payload,
      correlationId: payload.messageId,
      occurredAt: new Date(payload.timestamp),
    });

    // Existing scoring and reply logic...
  },
});
```

### Enhancing AI Replies with Context

```typescript
import { createCognitiveSystem } from '@medicalcor/core/cognitive';

async function generateContextualReply(leadId: string, message: string): Promise<string> {
  const cognitive = createCognitiveSystem({ pool, openai, embeddings });

  // Get episodic memory context
  const memoryContext = await cognitive.analyzer.getContextForReply('lead', leadId, message);

  // Include in prompt for reply generation
  const reply = await openai.generateReply({
    message,
    systemPrompt: `You are a helpful medical CRM assistant.\n\n${memoryContext}`,
    tone: 'professional',
  });

  return reply;
}
```

### Generating Insights for Dashboard

```typescript
import { createCognitiveSystem } from '@medicalcor/core/cognitive';

async function getLeadInsights(leadId: string): Promise<CognitiveInsight[]> {
  const cognitive = createCognitiveSystem({ pool, openai, embeddings });

  const insights = await cognitive.analyzer.analyzeSubject('lead', leadId);

  return insights.filter((i) => i.confidence > 0.7);
}
```

---

## Consequences

### Positive

- **Contextual AI**: Replies are informed by full interaction history
- **Proactive engagement**: Pattern detection enables early intervention
- **Personalization**: Each patient/lead gets tailored communication
- **Unified view**: Cross-channel interactions in one place
- **GDPR compliance**: Soft delete and subject-centric data access

### Negative

- **Storage growth**: Each event generates ~2KB (summary + embedding)
- **API costs**: GPT-4o for summarization, embeddings for each event
- **Latency**: Embedding generation adds ~200ms per event
- **Complexity**: New subsystem to maintain

### Mitigation Strategies

| Concern       | Mitigation                                   |
| ------------- | -------------------------------------------- |
| Storage costs | Partition by time, archive old events        |
| API costs     | Batch embeddings, cache summaries            |
| Latency       | Process asynchronously via Trigger.dev       |
| Complexity    | Clear module boundaries, comprehensive tests |

## Alternatives Considered

### 1. Third-party Memory Systems (Mem0, Zep)

**Rejected**: Adds external dependency, data residency concerns for HIPAA.

### 2. Graph Database (Neo4j)

**Deferred**: Adds operational complexity. pgvector sufficient for current scale. Revisit for complex relationship queries.

### 3. Simple RAG without Summarization

**Rejected**: Raw events are verbose; summaries provide better retrieval quality.

## Implementation Plan

### Phase 1: Foundation (Week 1)

- [ ] Create database migration for episodic_events
- [ ] Implement EpisodeBuilder
- [ ] Implement MemoryRetrievalService
- [ ] Unit tests for core components

### Phase 2: Integration (Week 2)

- [ ] Integrate with WhatsApp handler
- [ ] Integrate with Voice handler
- [ ] Add memory context to reply generation
- [ ] Integration tests

### Phase 3: Intelligence (Week 3)

- [ ] Implement PatternDetector
- [ ] Implement CognitiveAnalyzer
- [ ] Add insights API endpoint
- [ ] Dashboard integration

### Phase 4: Optimization (Week 4)

- [ ] Add embedding cache
- [ ] Batch processing for high-volume
- [ ] Performance testing
- [ ] Documentation

## References

- [Episodic Memory in AI Systems](https://arxiv.org/abs/2304.03442)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- ADR-001: Hexagonal Architecture
- ADR-003: Architecture Improvements
- Existing RAG implementation: `packages/core/src/rag/`

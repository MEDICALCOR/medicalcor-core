/**
 * Episode Builder - Event Processing for Cognitive Memory
 *
 * ADR-004: Transforms raw events into episodic memories with LLM-generated
 * summaries and semantic embeddings for retrieval.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  type EpisodicEventWithEmbedding,
  type EpisodicEvent,
  type RawEventContext,
  type EventAnalysisResult,
  type SubjectType,
  type SourceChannel,
  type EventCategory,
  type KeyEntity,
  type Sentiment,
  type CognitiveSystemConfig,
  type KnowledgeEntity,
  type PatternUpdateEvent,
} from './types.js';
import type { KnowledgeGraphService } from './knowledge-graph.js';
import type { RealtimePatternStream } from './realtime-pattern-stream.js';

/**
 * Callback invoked after an episodic event is processed
 */
export type OnEventProcessedCallback = (
  event: EpisodicEvent,
  patternUpdate: PatternUpdateEvent | null
) => void | Promise<void>;

const logger = createLogger({ name: 'cognitive-episode-builder' });

// =============================================================================
// Interfaces for Dependencies (Dependency Injection)
// =============================================================================

export interface IOpenAIClient {
  chatCompletion(options: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  }): Promise<string>;
}

export interface IEmbeddingService {
  embed(text: string): Promise<{ embedding: number[]; contentHash: string }>;
}

// =============================================================================
// Event Category Mapping
// =============================================================================

const EVENT_CATEGORY_MAP: Record<string, EventCategory> = {
  'message.received': 'communication',
  'message.sent': 'communication',
  'call.completed': 'communication',
  'call.started': 'communication',
  'email.sent': 'communication',
  'email.received': 'communication',

  'appointment.scheduled': 'scheduling',
  'appointment.cancelled': 'scheduling',
  'appointment.rescheduled': 'scheduling',
  'appointment.confirmed': 'scheduling',
  'appointment.reminder_sent': 'scheduling',

  'treatment.started': 'clinical',
  'treatment.completed': 'clinical',
  'diagnosis.added': 'clinical',
  'prescription.created': 'clinical',
  'medical_record.updated': 'clinical',

  'payment.received': 'financial',
  'invoice.sent': 'financial',
  'quote.sent': 'financial',
  'quote.accepted': 'financial',
  'quote.rejected': 'financial',

  'lead.created': 'lifecycle',
  'lead.qualified': 'lifecycle',
  'lead.converted': 'lifecycle',
  'patient.onboarded': 'lifecycle',
  'consent.granted': 'lifecycle',
  'consent.revoked': 'lifecycle',
};

// =============================================================================
// Episode Builder Class
// =============================================================================

export class EpisodeBuilder {
  private config: CognitiveSystemConfig;
  private knowledgeGraph: KnowledgeGraphService | null = null;
  private realtimePatternStream: RealtimePatternStream | null = null;
  private onEventProcessedCallbacks = new Set<OnEventProcessedCallback>();

  constructor(
    private openai: IOpenAIClient,
    private embeddings: IEmbeddingService,
    private pool: Pool,
    config: Partial<CognitiveSystemConfig> = {}
  ) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
  }

  /**
   * Set the knowledge graph service for entity extraction
   */
  setKnowledgeGraph(knowledgeGraph: KnowledgeGraphService): void {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Set the real-time pattern stream for automatic pattern updates (L5)
   */
  setRealtimePatternStream(stream: RealtimePatternStream): void {
    this.realtimePatternStream = stream;
    logger.info('Real-time pattern stream connected to episode builder');
  }

  /**
   * Subscribe to event processing notifications
   * Callback receives the processed event and any resulting pattern update
   */
  onEventProcessed(callback: OnEventProcessedCallback): () => void {
    this.onEventProcessedCallbacks.add(callback);
    return () => {
      this.onEventProcessedCallbacks.delete(callback);
    };
  }

  /**
   * Process a raw event into an episodic memory
   */
  async processEvent(
    subjectType: SubjectType,
    subjectId: string,
    sourceChannel: SourceChannel,
    rawEvent: RawEventContext
  ): Promise<EpisodicEventWithEmbedding> {
    const startTime = Date.now();

    try {
      // 1. Analyze event with LLM to generate summary and extract entities
      const analysis = await this.analyzeEvent(rawEvent);

      // 2. Generate embedding for the summary
      const embeddingResult = await this.embeddings.embed(analysis.summary);

      // 3. Create episodic event object
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
        processedAt: new Date(),
        embedding: embeddingResult.embedding,
        embeddingModel: this.config.embeddingModel,
        metadata: {
          originalPayloadKeys: Object.keys(rawEvent.payload),
          processingTimeMs: Date.now() - startTime,
        },
      };

      // 4. Persist to database
      await this.save(episode);

      // 5. Extract entities to knowledge graph (H8)
      let extractedEntities: KnowledgeEntity[] = [];
      if (this.knowledgeGraph && episode.keyEntities.length > 0) {
        try {
          extractedEntities = await this.knowledgeGraph.processEntitiesFromEvent(
            episode.id,
            episode.keyEntities,
            episode.occurredAt
          );
        } catch (error) {
          logger.warn(
            { error, episodeId: episode.id },
            'Failed to extract entities to knowledge graph, continuing...'
          );
        }
      }

      // 6. Trigger real-time pattern detection (L5)
      let patternUpdate: PatternUpdateEvent | null = null;
      if (this.realtimePatternStream) {
        try {
          // Convert to base EpisodicEvent for pattern processing
          const baseEvent: EpisodicEvent = {
            id: episode.id,
            subjectType: episode.subjectType,
            subjectId: episode.subjectId,
            eventType: episode.eventType,
            eventCategory: episode.eventCategory,
            sourceChannel: episode.sourceChannel,
            rawEventId: episode.rawEventId,
            summary: episode.summary,
            keyEntities: episode.keyEntities,
            sentiment: episode.sentiment,
            intent: episode.intent,
            occurredAt: episode.occurredAt,
            processedAt: episode.processedAt,
            metadata: episode.metadata,
          };
          patternUpdate = await this.realtimePatternStream.processEvent(baseEvent);
          if (patternUpdate) {
            logger.debug(
              {
                subjectId,
                deltaCount: patternUpdate.deltas.length,
              },
              'Real-time pattern update triggered'
            );
          }
        } catch (error) {
          logger.warn(
            { error, episodeId: episode.id },
            'Failed to trigger real-time pattern detection, continuing...'
          );
        }
      }

      // 7. Notify callbacks
      await this.notifyEventProcessed(episode, patternUpdate);

      logger.info(
        {
          subjectId,
          eventType: rawEvent.eventType,
          processingTimeMs: Date.now() - startTime,
          extractedEntities: extractedEntities.length,
          patternUpdateTriggered: patternUpdate !== null,
        },
        'Episodic memory created'
      );

      return episode;
    } catch (error) {
      logger.error(
        {
          error,
          subjectId,
          eventType: rawEvent.eventType,
        },
        'Failed to process event into episodic memory'
      );
      throw error;
    }
  }

  /**
   * Batch process multiple events
   */
  async processEventBatch(
    events: {
      subjectType: SubjectType;
      subjectId: string;
      sourceChannel: SourceChannel;
      rawEvent: RawEventContext;
    }[]
  ): Promise<EpisodicEventWithEmbedding[]> {
    const results: EpisodicEventWithEmbedding[] = [];

    for (const event of events) {
      try {
        const episode = await this.processEvent(
          event.subjectType,
          event.subjectId,
          event.sourceChannel,
          event.rawEvent
        );
        results.push(episode);
      } catch (error) {
        logger.warn(
          {
            error,
            subjectId: event.subjectId,
            eventType: event.rawEvent.eventType,
          },
          'Failed to process event in batch, continuing...'
        );
      }
    }

    return results;
  }

  /**
   * Analyze event using LLM
   */
  private async analyzeEvent(event: RawEventContext): Promise<EventAnalysisResult> {
    // Truncate payload for prompt
    const payloadStr = JSON.stringify(event.payload, null, 2).substring(0, 2000);

    const prompt = `Analyze this medical CRM event and extract structured information.

Event Type: ${event.eventType}
Occurred At: ${event.occurredAt.toISOString()}
Event Data:
${payloadStr}

Extract the following in JSON format:
{
  "summary": "A concise 1-2 sentence summary of what happened from the patient's perspective",
  "entities": [
    {"type": "procedure|date|amount|person|location|product|other", "value": "extracted value", "confidence": 0.0-1.0}
  ],
  "sentiment": "positive|neutral|negative",
  "intent": "The apparent purpose or outcome of this interaction (e.g., 'seeking appointment', 'asking about pricing', 'confirming treatment')"
}

Guidelines:
- Summary should be patient-centric and meaningful for future context retrieval
- Extract concrete entities like procedures (e.g., "All-on-4"), dates, monetary amounts
- Sentiment reflects the patient's apparent emotional state
- Intent captures the underlying goal or outcome`;

    try {
      const response = await this.openai.chatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'You are a medical CRM analyst. Extract structured information from patient interaction events. ' +
              'Always respond with valid JSON. Be concise but informative.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.llmTemperature,
        maxTokens: this.config.llmMaxTokens,
        jsonMode: true,
      });

      const parsed = JSON.parse(response) as {
        summary?: string;
        entities?: { type: string; value: string; confidence?: number }[];
        sentiment?: string;
        intent?: string;
      };

      return {
        summary: parsed.summary ?? this.generateFallbackSummary(event),
        entities: this.validateEntities(parsed.entities ?? []),
        sentiment: this.validateSentiment(parsed.sentiment),
        intent: parsed.intent ?? 'unknown',
      };
    } catch (error) {
      logger.warn({ error, eventType: event.eventType }, 'LLM analysis failed, using fallback');
      return this.generateFallbackAnalysis(event);
    }
  }

  /**
   * Categorize event based on type
   */
  private categorizeEvent(eventType: string): EventCategory {
    // Check exact match first
    const exactMatch = EVENT_CATEGORY_MAP[eventType];
    if (exactMatch) return exactMatch;

    // Check partial match
    for (const [pattern, category] of Object.entries(EVENT_CATEGORY_MAP)) {
      const prefix = pattern.split('.')[0];
      if (prefix && eventType.includes(prefix)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Validate and normalize entities
   */
  private validateEntities(
    entities: { type: string; value: string; confidence?: number }[]
  ): KeyEntity[] {
    const validTypes = ['procedure', 'date', 'amount', 'person', 'location', 'product', 'other'];

    return entities
      .filter((e) => e.value && e.value.trim().length > 0)
      .map((e) => ({
        type: validTypes.includes(e.type) ? (e.type as KeyEntity['type']) : 'other',
        value: e.value.trim(),
        confidence: e.confidence !== undefined ? Math.min(1, Math.max(0, e.confidence)) : undefined,
      }));
  }

  /**
   * Validate sentiment value
   */
  private validateSentiment(sentiment?: string): Sentiment {
    const valid: Sentiment[] = ['positive', 'neutral', 'negative'];
    const normalized = sentiment?.toLowerCase() as Sentiment | undefined;
    return normalized && valid.includes(normalized) ? normalized : 'neutral';
  }

  /**
   * Generate fallback summary when LLM fails
   */
  private generateFallbackSummary(event: RawEventContext): string {
    const typeWords = event.eventType.replace(/[._]/g, ' ');
    return `${typeWords} event recorded at ${event.occurredAt.toISOString().split('T')[0]}`;
  }

  /**
   * Generate fallback analysis when LLM fails
   */
  private generateFallbackAnalysis(event: RawEventContext): EventAnalysisResult {
    return {
      summary: this.generateFallbackSummary(event),
      entities: [],
      sentiment: 'neutral',
      intent: 'unknown',
    };
  }

  /**
   * Notify all registered callbacks about processed event (L5)
   */
  private async notifyEventProcessed(
    event: EpisodicEvent,
    patternUpdate: PatternUpdateEvent | null
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const callback of this.onEventProcessedCallbacks) {
      try {
        const result = callback(event, patternUpdate);
        if (result instanceof Promise) {
          promises.push(
            result.catch((error: unknown) => {
              logger.warn({ error }, 'Event processed callback failed');
            })
          );
        }
      } catch (error) {
        logger.warn({ error }, 'Event processed callback threw synchronously');
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Save episodic event to database
   */
  private async save(episode: EpisodicEventWithEmbedding): Promise<void> {
    const sql = `
      INSERT INTO episodic_events (
        id, subject_type, subject_id, event_type, event_category,
        source_channel, raw_event_id, summary, key_entities,
        sentiment, intent, embedding, occurred_at, processed_at,
        metadata, embedding_model
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await this.pool.query(sql, [
      episode.id,
      episode.subjectType,
      episode.subjectId,
      episode.eventType,
      episode.eventCategory,
      episode.sourceChannel,
      episode.rawEventId ?? null,
      episode.summary,
      JSON.stringify(episode.keyEntities),
      episode.sentiment ?? null,
      episode.intent ?? null,
      JSON.stringify(episode.embedding),
      episode.occurredAt,
      episode.processedAt,
      JSON.stringify(episode.metadata ?? {}),
      episode.embeddingModel,
    ]);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEpisodeBuilder(
  openai: IOpenAIClient,
  embeddings: IEmbeddingService,
  pool: Pool,
  config?: Partial<CognitiveSystemConfig>
): EpisodeBuilder {
  return new EpisodeBuilder(openai, embeddings, pool, config);
}

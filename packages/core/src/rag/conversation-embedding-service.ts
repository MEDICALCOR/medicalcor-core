/**
 * Conversation Embedding Service
 *
 * Manages embeddings for conversation history, enabling:
 * - Semantic search across patient conversations
 * - Similar conversation retrieval for context
 * - Conversation clustering and analysis
 * - Pattern recognition in patient interactions
 */

import type { Pool } from 'pg';
import crypto from 'crypto';
import { z } from 'zod';
import type { MessageEmbedding, Language } from './types.js';

/**
 * Embedding service interface for dependency injection
 */
export interface IEmbeddingService {
  embed(text: string): Promise<{
    embedding: number[];
    contentHash: string;
    model: string;
    dimensions: number;
    tokensUsed: number;
  }>;
}

/**
 * Conversation message for embedding
 */
export interface ConversationMessage {
  /** Unique message ID */
  messageId?: string;
  /** Patient phone number (E.164 format) */
  phone: string;
  /** Message content */
  content: string;
  /** Message direction */
  direction: 'IN' | 'OUT';
  /** Message type */
  messageType?: string;
  /** Detected intent */
  intent?: string;
  /** Sentiment analysis result */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Language */
  language?: Language;
  /** Clinic ID */
  clinicId?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Message timestamp */
  timestamp?: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Search result for similar conversations
 */
export interface ConversationSearchResult {
  /** Message ID */
  id: string;
  /** Phone number */
  phone: string;
  /** Message content (sanitized) */
  content: string;
  /** Direction */
  direction: 'IN' | 'OUT';
  /** Similarity score (0-1) */
  similarity: number;
  /** Detected intent */
  intent?: string;
  /** Sentiment */
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Language */
  language?: Language;
  /** Message timestamp */
  timestamp?: Date;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Conversation context for similar messages
 */
export interface ConversationContext {
  /** Similar messages found */
  messages: ConversationSearchResult[];
  /** Formatted context string */
  contextString: string;
  /** Total search time */
  searchLatencyMs: number;
  /** Embedding time */
  embeddingLatencyMs: number;
}

/**
 * Configuration for conversation embedding service
 */
export const ConversationEmbeddingConfigSchema = z.object({
  /** Enable embedding storage */
  enabled: z.boolean().default(true),
  /** Minimum message length to embed */
  minMessageLength: z.number().int().min(1).default(10),
  /** Maximum message length to embed */
  maxMessageLength: z.number().int().max(10000).default(2000),
  /** Default number of similar conversations to retrieve */
  defaultTopK: z.number().int().min(1).max(50).default(5),
  /** Default similarity threshold */
  defaultSimilarityThreshold: z.number().min(0).max(1).default(0.7),
  /** Include metadata in search results */
  includeMetadata: z.boolean().default(true),
  /** Maximum context string length */
  maxContextLength: z.number().int().min(100).max(10000).default(2000),
  /** Batch size for bulk operations */
  batchSize: z.number().int().min(1).max(100).default(10),
});

export type ConversationEmbeddingConfig = z.infer<typeof ConversationEmbeddingConfigSchema>;

/**
 * Conversation Embedding Service
 *
 * Stores and searches conversation embeddings for semantic retrieval
 */
export class ConversationEmbeddingService {
  private pool: Pool;
  private embeddingService: IEmbeddingService;
  private config: ConversationEmbeddingConfig;

  constructor(
    pool: Pool,
    embeddingService: IEmbeddingService,
    config: Partial<ConversationEmbeddingConfig> = {}
  ) {
    this.pool = pool;
    this.embeddingService = embeddingService;
    this.config = ConversationEmbeddingConfigSchema.parse(config);
  }

  /**
   * Store a conversation message with embedding
   */
  async embedAndStore(message: ConversationMessage): Promise<MessageEmbedding | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Validate message length
    if (message.content.length < this.config.minMessageLength) {
      return null;
    }

    // Sanitize and truncate content
    const sanitizedContent = this.sanitizeContent(message.content);
    const contentHash = this.hashContent(sanitizedContent);

    // Check if already embedded (deduplication)
    const existing = await this.findByContentHash(contentHash);
    if (existing) {
      return existing;
    }

    // Generate embedding
    const embeddingStart = Date.now();
    const embeddingResult = await this.embeddingService.embed(sanitizedContent);
    const embeddingLatencyMs = Date.now() - embeddingStart;

    // Store in database
    const messageEmbedding: MessageEmbedding = {
      messageId: message.messageId,
      phone: message.phone,
      correlationId: message.correlationId,
      contentSanitized: sanitizedContent,
      contentHash,
      embedding: embeddingResult.embedding,
      direction: message.direction,
      messageType: message.messageType ?? 'text',
      intent: message.intent,
      sentiment: message.sentiment,
      language: message.language,
      clinicId: message.clinicId,
      metadata: {
        ...message.metadata,
        embeddingModel: embeddingResult.model,
        embeddingDimensions: embeddingResult.dimensions,
        tokensUsed: embeddingResult.tokensUsed,
        embeddingLatencyMs,
      },
      messageTimestamp: message.timestamp,
    };

    await this.storeEmbedding(messageEmbedding);

    return messageEmbedding;
  }

  /**
   * Store multiple messages in batch
   */
  async embedAndStoreBatch(messages: ConversationMessage[]): Promise<MessageEmbedding[]> {
    if (!this.config.enabled || messages.length === 0) {
      return [];
    }

    const results: MessageEmbedding[] = [];
    const batches = this.chunkArray(messages, this.config.batchSize);

    for (const batch of batches) {
      const embeddings = await Promise.all(batch.map((msg) => this.embedAndStore(msg)));

      results.push(...embeddings.filter((e): e is MessageEmbedding => e !== null));
    }

    return results;
  }

  /**
   * Search for similar conversations by text
   */
  async searchSimilar(
    query: string,
    options: {
      topK?: number;
      similarityThreshold?: number;
      phone?: string;
      clinicId?: string;
      direction?: 'IN' | 'OUT';
      language?: Language;
      excludePhone?: string;
    } = {}
  ): Promise<ConversationContext> {
    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      phone,
      clinicId,
      direction,
      language,
      excludePhone,
    } = options;

    // Generate embedding for query
    const embeddingStart = Date.now();
    const queryEmbedding = await this.embeddingService.embed(query);
    const embeddingLatencyMs = Date.now() - embeddingStart;

    // Search similar messages
    const searchStart = Date.now();
    const messages = await this.vectorSearch(queryEmbedding.embedding, {
      topK,
      similarityThreshold,
      phone,
      clinicId,
      direction,
      language,
      excludePhone,
    });
    const searchLatencyMs = Date.now() - searchStart;

    // Build context string
    const contextString = this.buildContextString(messages);

    return {
      messages,
      contextString,
      searchLatencyMs,
      embeddingLatencyMs,
    };
  }

  /**
   * Search for similar conversations by embedding
   */
  async searchByEmbedding(
    embedding: number[],
    options: {
      topK?: number;
      similarityThreshold?: number;
      phone?: string;
      clinicId?: string;
      direction?: 'IN' | 'OUT';
      language?: Language;
      excludePhone?: string;
    } = {}
  ): Promise<ConversationSearchResult[]> {
    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      ...filters
    } = options;

    return this.vectorSearch(embedding, {
      topK,
      similarityThreshold,
      ...filters,
    });
  }

  /**
   * Get conversation history for a patient
   */
  async getPatientConversations(
    phone: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<ConversationSearchResult[]> {
    const { limit = 50, offset = 0, startDate, endDate } = options;

    let query = `
      SELECT
        id, phone, content_sanitized as content, direction,
        intent, sentiment, language, message_timestamp as timestamp,
        metadata
      FROM message_embeddings
      WHERE phone = $1
    `;
    const params: (string | number | Date)[] = [phone];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND message_timestamp >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND message_timestamp <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY message_timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    interface MessageRow {
      id: string;
      phone: string;
      content: string;
      direction: 'IN' | 'OUT';
      intent?: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      language?: Language;
      timestamp?: Date;
      metadata?: Record<string, unknown>;
    }

    const result = await this.pool.query<MessageRow>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      content: row.content,
      direction: row.direction,
      similarity: 1.0, // Direct retrieval, not similarity search
      metadata: row.metadata ?? {},
      ...(row.intent !== undefined && { intent: row.intent }),
      ...(row.sentiment !== undefined && { sentiment: row.sentiment }),
      ...(row.language !== undefined && { language: row.language }),
      ...(row.timestamp !== undefined && { timestamp: row.timestamp }),
    }));
  }

  /**
   * Find conversations with similar intent
   */
  async findSimilarIntents(
    intent: string,
    options: {
      topK?: number;
      clinicId?: string;
      language?: Language;
    } = {}
  ): Promise<ConversationSearchResult[]> {
    const { topK = this.config.defaultTopK, clinicId, language } = options;

    let query = `
      SELECT
        id, phone, content_sanitized as content, direction,
        intent, sentiment, language, message_timestamp as timestamp,
        metadata
      FROM message_embeddings
      WHERE intent = $1
    `;
    const params: (string | number)[] = [intent];
    let paramIndex = 2;

    if (clinicId) {
      query += ` AND clinic_id = $${paramIndex}`;
      params.push(clinicId);
      paramIndex++;
    }

    if (language) {
      query += ` AND language = $${paramIndex}`;
      params.push(language);
      paramIndex++;
    }

    query += ` ORDER BY message_timestamp DESC LIMIT $${paramIndex}`;
    params.push(topK);

    interface IntentRow {
      id: string;
      phone: string;
      content: string;
      direction: 'IN' | 'OUT';
      intent?: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      language?: Language;
      timestamp?: Date;
      metadata?: Record<string, unknown>;
    }

    const result = await this.pool.query<IntentRow>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      content: row.content,
      direction: row.direction,
      similarity: 1.0,
      metadata: row.metadata ?? {},
      ...(row.intent !== undefined && { intent: row.intent }),
      ...(row.sentiment !== undefined && { sentiment: row.sentiment }),
      ...(row.language !== undefined && { language: row.language }),
      ...(row.timestamp !== undefined && { timestamp: row.timestamp }),
    }));
  }

  /**
   * Perform vector similarity search
   */
  private async vectorSearch(
    queryEmbedding: number[],
    options: {
      topK: number;
      similarityThreshold: number;
      phone?: string | undefined;
      clinicId?: string | undefined;
      direction?: 'IN' | 'OUT' | undefined;
      language?: Language | undefined;
      excludePhone?: string | undefined;
    }
  ): Promise<ConversationSearchResult[]> {
    const { topK, similarityThreshold, phone, clinicId, direction, language, excludePhone } =
      options;

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: (string | number | string[])[] = [];
    let paramIndex = 1;

    // Add embedding parameter
    params.push(`[${queryEmbedding.join(',')}]`);
    paramIndex++;

    if (phone) {
      conditions.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (clinicId) {
      conditions.push(`clinic_id = $${paramIndex}`);
      params.push(clinicId);
      paramIndex++;
    }

    if (direction) {
      conditions.push(`direction = $${paramIndex}`);
      params.push(direction);
      paramIndex++;
    }

    if (language) {
      conditions.push(`language = $${paramIndex}`);
      params.push(language);
      paramIndex++;
    }

    if (excludePhone) {
      conditions.push(`phone != $${paramIndex}`);
      params.push(excludePhone);
      paramIndex++;
    }

    // Similarity threshold
    params.push(similarityThreshold);
    const similarityParamIndex = paramIndex;
    paramIndex++;

    // Top K
    params.push(topK);
    const topKParamIndex = paramIndex;

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        id, phone, content_sanitized as content, direction,
        intent, sentiment, language, message_timestamp as timestamp,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM message_embeddings
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $${similarityParamIndex}
        ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $${topKParamIndex}
    `;

    interface VectorSearchRow {
      id: string;
      phone: string;
      content: string;
      direction: 'IN' | 'OUT';
      similarity: string;
      intent?: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      language?: Language;
      timestamp?: Date;
      metadata?: Record<string, unknown>;
    }

    const result = await this.pool.query<VectorSearchRow>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      content: row.content,
      direction: row.direction,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata ?? {},
      ...(row.intent !== undefined && { intent: row.intent }),
      ...(row.sentiment !== undefined && { sentiment: row.sentiment }),
      ...(row.language !== undefined && { language: row.language }),
      ...(row.timestamp !== undefined && { timestamp: row.timestamp }),
    }));
  }

  /**
   * Store embedding in database
   */
  private async storeEmbedding(embedding: MessageEmbedding): Promise<void> {
    const query = `
      INSERT INTO message_embeddings (
        message_id, phone, correlation_id, content_sanitized, content_hash,
        embedding, direction, message_type, intent, sentiment, language,
        clinic_id, metadata, message_timestamp
      ) VALUES (
        $1, $2, $3, $4, $5, $6::vector, $7, $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        message_id = COALESCE(EXCLUDED.message_id, message_embeddings.message_id),
        correlation_id = COALESCE(EXCLUDED.correlation_id, message_embeddings.correlation_id),
        intent = COALESCE(EXCLUDED.intent, message_embeddings.intent),
        sentiment = COALESCE(EXCLUDED.sentiment, message_embeddings.sentiment),
        metadata = message_embeddings.metadata || EXCLUDED.metadata
    `;

    await this.pool.query(query, [
      embedding.messageId ?? null,
      embedding.phone,
      embedding.correlationId ?? null,
      embedding.contentSanitized,
      embedding.contentHash,
      embedding.embedding ? `[${embedding.embedding.join(',')}]` : null,
      embedding.direction,
      embedding.messageType || 'text',
      embedding.intent ?? null,
      embedding.sentiment ?? null,
      embedding.language ?? null,
      embedding.clinicId ?? null,
      JSON.stringify(embedding.metadata),
      embedding.messageTimestamp ?? new Date(),
    ]);
  }

  /**
   * Find embedding by content hash
   */
  private async findByContentHash(contentHash: string): Promise<MessageEmbedding | null> {
    interface EmbeddingRow {
      id: string;
      message_id?: string;
      phone: string;
      correlation_id?: string;
      content_sanitized: string;
      content_hash: string;
      embedding?: number[];
      direction: 'IN' | 'OUT';
      message_type?: string;
      intent?: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      language?: Language;
      clinic_id?: string;
      metadata?: Record<string, unknown>;
      message_timestamp?: Date;
      created_at?: Date;
    }

    const query = `
      SELECT * FROM message_embeddings WHERE content_hash = $1
    `;

    const result = await this.pool.query<EmbeddingRow>(query, [contentHash]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      phone: row.phone,
      contentSanitized: row.content_sanitized,
      contentHash: row.content_hash,
      direction: row.direction,
      messageType: row.message_type ?? 'text',
      metadata: row.metadata ?? {},
      ...(row.message_id !== undefined && { messageId: row.message_id }),
      ...(row.correlation_id !== undefined && { correlationId: row.correlation_id }),
      ...(row.embedding !== undefined && { embedding: row.embedding }),
      ...(row.intent !== undefined && { intent: row.intent }),
      ...(row.sentiment !== undefined && { sentiment: row.sentiment }),
      ...(row.language !== undefined && { language: row.language }),
      ...(row.clinic_id !== undefined && { clinicId: row.clinic_id }),
      ...(row.message_timestamp !== undefined && { messageTimestamp: row.message_timestamp }),
      ...(row.created_at !== undefined && { createdAt: row.created_at }),
    };
  }

  /**
   * Sanitize message content
   */
  private sanitizeContent(content: string): string {
    // Remove control characters and zero-width spaces
    let sanitized = content
      // eslint-disable-next-line no-control-regex -- intentionally removing control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();

    // Truncate if too long
    if (sanitized.length > this.config.maxMessageLength) {
      sanitized = sanitized.substring(0, this.config.maxMessageLength);
    }

    return sanitized;
  }

  /**
   * Generate SHA-256 hash of content
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Build context string from search results
   */
  private buildContextString(messages: ConversationSearchResult[]): string {
    if (messages.length === 0) {
      return '';
    }

    const sections: string[] = [];
    sections.push('## Similar Conversations');
    sections.push('');

    for (const msg of messages) {
      const direction = msg.direction === 'IN' ? 'Patient' : 'Clinic';
      const similarity = (msg.similarity * 100).toFixed(0);
      sections.push(`[${direction}] (${similarity}% similar): ${msg.content}`);

      if (msg.intent) {
        sections.push(`  Intent: ${msg.intent}`);
      }
      if (msg.sentiment) {
        sections.push(`  Sentiment: ${msg.sentiment}`);
      }
      sections.push('');
    }

    // Truncate if too long
    let contextString = sections.join('\n');
    if (contextString.length > this.config.maxContextLength) {
      contextString = contextString.substring(0, this.config.maxContextLength - 3) + '...';
    }

    return contextString;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get configuration
   */
  getConfig(): ConversationEmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConversationEmbeddingConfig>): void {
    this.config = ConversationEmbeddingConfigSchema.parse({ ...this.config, ...updates });
  }
}

/**
 * Factory function
 */
export function createConversationEmbeddingService(
  pool: Pool,
  embeddingService: IEmbeddingService,
  config?: Partial<ConversationEmbeddingConfig>
): ConversationEmbeddingService {
  return new ConversationEmbeddingService(pool, embeddingService, config);
}

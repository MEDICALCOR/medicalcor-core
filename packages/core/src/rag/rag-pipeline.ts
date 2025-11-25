import type { Pool } from 'pg';
import type { RAGContext, RAGResult, RAGConfig, SearchResult, RAGQueryLogEntry } from './types.js';
import { VectorSearchService } from './vector-search-service.js';

/**
 * Embedding Service Interface
 * Defined locally to avoid circular dependency with @medicalcor/integrations
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
 * RAG Pipeline
 *
 * End-to-end Retrieval-Augmented Generation pipeline that:
 * 1. Embeds the query
 * 2. Retrieves relevant context from knowledge base
 * 3. Formats context for injection into prompts
 * 4. Logs queries for analytics and improvement
 *
 * State-of-the-art features:
 * - Hybrid search (semantic + keyword)
 * - Context window management
 * - Conversation history integration
 * - Multi-source retrieval
 * - Query logging and feedback
 */

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  enabled: true,
  maxContextTokens: 2000,
  defaultTopK: 5,
  defaultSimilarityThreshold: 0.7,
  includeConversationContext: true,
  maxConversationHistory: 5,
  fallbackOnNoResults: true,
  logQueries: true,
};

export class RAGPipeline {
  private searchService: VectorSearchService;
  private embeddingService: IEmbeddingService;
  private pool: Pool;
  private config: RAGConfig;

  constructor(pool: Pool, embeddingService: IEmbeddingService, config: Partial<RAGConfig> = {}) {
    this.pool = pool;
    this.embeddingService = embeddingService;
    this.searchService = new VectorSearchService(pool);
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
  }

  /**
   * Execute full RAG pipeline
   */
  async retrieve(context: RAGContext): Promise<RAGResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return this.emptyResult(startTime);
    }

    // 1. Build search query from context
    const searchQuery = this.buildSearchQuery(context);

    // 2. Generate embedding for query
    const embeddingStart = Date.now();
    const embeddingResult = await this.embeddingService.embed(searchQuery);
    const embeddingLatencyMs = Date.now() - embeddingStart;

    // 3. Perform search based on use case
    const searchStart = Date.now();
    const searchResponse = await this.performSearch(
      embeddingResult.embedding,
      searchQuery,
      context
    );
    const searchLatencyMs = Date.now() - searchStart;

    // 4. Format retrieved context
    const { formattedContext, contextTokenEstimate } = this.formatContext(
      searchResponse.results,
      context
    );

    // 5. Log query if enabled
    if (this.config.logQueries) {
      const logEntry: RAGQueryLogEntry = {
        queryText: searchQuery,
        queryEmbedding: embeddingResult.embedding,
        searchType: searchResponse.searchType,
        topK: this.config.defaultTopK,
        similarityThreshold: this.config.defaultSimilarityThreshold,
        filters: { clinicId: context.clinicId, language: context.language },
        resultCount: searchResponse.results.length,
        resultIds: searchResponse.results.map((r) => r.id),
        resultScores: searchResponse.results.map((r) => r.similarity),
        embeddingLatencyMs,
        searchLatencyMs,
        totalLatencyMs: Date.now() - startTime,
        correlationId: context.correlationId ?? null,
        useCase: context.useCase,
      };
      await this.logQuery(logEntry);
    }

    // 6. Return result
    return {
      retrievedContext: formattedContext,
      sources: searchResponse.results.map((r) => ({
        id: r.id,
        title: r.title,
        sourceType: r.sourceType,
        similarity: r.similarity,
      })),
      searchLatencyMs,
      embeddingLatencyMs,
      totalLatencyMs: Date.now() - startTime,
      contextTokenEstimate,
    };
  }

  /**
   * Retrieve context specifically for lead scoring
   */
  async retrieveForScoring(context: RAGContext): Promise<RAGResult> {
    return this.retrieve({
      ...context,
      useCase: 'scoring',
    });
  }

  /**
   * Retrieve context specifically for reply generation
   */
  async retrieveForReply(context: RAGContext): Promise<RAGResult> {
    return this.retrieve({
      ...context,
      useCase: 'reply_generation',
    });
  }

  /**
   * Inject RAG context into a prompt
   */
  injectContext(basePrompt: string, ragResult: RAGResult): string {
    if (!ragResult.retrievedContext || ragResult.sources.length === 0) {
      return basePrompt;
    }

    const contextSection = `
## Retrieved Knowledge Context

The following information has been retrieved from our knowledge base to help with this request:

${ragResult.retrievedContext}

---
Sources: ${ragResult.sources.map((s) => s.title).join(', ')}
---

`;

    // Insert context after any system instructions but before user content
    if (basePrompt.includes('## ') || basePrompt.includes('### ')) {
      // Find first major section and insert before it
      const insertIndex = basePrompt.search(/^##?\s/m);
      if (insertIndex > 0) {
        return basePrompt.slice(0, insertIndex) + contextSection + basePrompt.slice(insertIndex);
      }
    }

    // Default: prepend context
    return contextSection + basePrompt;
  }

  /**
   * Build search query from context
   */
  private buildSearchQuery(context: RAGContext): string {
    const parts: string[] = [];

    // Add main query
    parts.push(context.query);

    // Add recent conversation context if enabled
    if (this.config.includeConversationContext && context.conversationHistory?.length) {
      const recentHistory = context.conversationHistory.slice(-this.config.maxConversationHistory);

      // Extract key topics from conversation
      const conversationContext = recentHistory
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' ');

      if (conversationContext) {
        parts.push(conversationContext.slice(0, 500)); // Limit conversation context
      }
    }

    return parts.join(' ').trim();
  }

  /**
   * Perform search based on use case
   */
  private async performSearch(queryEmbedding: number[], query: string, context: RAGContext) {
    const language = context.language;

    switch (context.useCase) {
      case 'scoring':
        return this.searchService.searchForScoring(
          queryEmbedding,
          query,
          context.clinicId,
          language
        );

      case 'reply_generation':
        return this.searchService.searchForReply(queryEmbedding, query, context.clinicId, language);

      default:
        return this.searchService.hybridSearch(queryEmbedding, query, {
          topK: this.config.defaultTopK,
          similarityThreshold: this.config.defaultSimilarityThreshold,
          filters: {
            clinicId: context.clinicId,
            language,
          },
        });
    }
  }

  /**
   * Format retrieved results into context string
   */
  private formatContext(
    results: SearchResult[],
    context: RAGContext
  ): { formattedContext: string; contextTokenEstimate: number } {
    if (results.length === 0) {
      if (this.config.fallbackOnNoResults) {
        return {
          formattedContext: this.getFallbackContext(context),
          contextTokenEstimate: 50,
        };
      }
      return { formattedContext: '', contextTokenEstimate: 0 };
    }

    const contextParts: string[] = [];
    let totalTokens = 0;
    const maxTokens = this.config.maxContextTokens;

    for (const result of results) {
      const entryText = this.formatEntry(result);
      const entryTokens = this.estimateTokens(entryText);

      if (totalTokens + entryTokens > maxTokens) {
        break;
      }

      contextParts.push(entryText);
      totalTokens += entryTokens;
    }

    return {
      formattedContext: contextParts.join('\n\n'),
      contextTokenEstimate: totalTokens,
    };
  }

  /**
   * Format a single search result
   */
  private formatEntry(result: SearchResult): string {
    const parts: string[] = [];

    parts.push(`### ${result.title}`);
    parts.push(`[${result.sourceType}] (relevance: ${(result.similarity * 100).toFixed(0)}%)`);
    parts.push('');
    parts.push(result.content);

    return parts.join('\n');
  }

  /**
   * Get fallback context when no results found
   */
  private getFallbackContext(context: RAGContext): string {
    const fallbacks: Record<string, string> = {
      scoring: 'No specific knowledge found for this query. Use general lead scoring guidelines.',
      reply_generation:
        'No specific knowledge found. Provide a helpful, general response and offer to connect with a specialist.',
      general: 'No specific context available for this query.',
    };

    return fallbacks[context.useCase] ?? fallbacks.general;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Return empty result when RAG is disabled
   */
  private emptyResult(startTime: number): RAGResult {
    return {
      retrievedContext: '',
      sources: [],
      searchLatencyMs: 0,
      embeddingLatencyMs: 0,
      totalLatencyMs: Date.now() - startTime,
      contextTokenEstimate: 0,
    };
  }

  /**
   * Log query for analytics
   */
  private async logQuery(entry: RAGQueryLogEntry): Promise<void> {
    try {
      const query = `
        INSERT INTO rag_query_log (
          query_text, query_embedding, search_type, top_k,
          similarity_threshold, filters, result_count, result_ids,
          result_scores, embedding_latency_ms, search_latency_ms,
          total_latency_ms, correlation_id, use_case
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
      `;

      await this.pool.query(query, [
        entry.queryText,
        entry.queryEmbedding ? `[${entry.queryEmbedding.join(',')}]` : null,
        entry.searchType,
        entry.topK,
        entry.similarityThreshold ?? null,
        JSON.stringify(entry.filters),
        entry.resultCount,
        entry.resultIds,
        entry.resultScores,
        entry.embeddingLatencyMs ?? null,
        entry.searchLatencyMs ?? null,
        entry.totalLatencyMs ?? null,
        entry.correlationId ?? null,
        entry.useCase ?? null,
      ]);
    } catch (error) {
      // Don't fail the main operation if logging fails
      console.error('Failed to log RAG query:', error);
    }
  }

  /**
   * Update feedback for a query
   */
  async updateQueryFeedback(
    queryId: string,
    feedback: { wasHelpful?: boolean; score?: number; notes?: string }
  ): Promise<void> {
    const query = `
      UPDATE rag_query_log
      SET was_helpful = COALESCE($2, was_helpful),
          feedback_score = COALESCE($3, feedback_score),
          feedback_notes = COALESCE($4, feedback_notes)
      WHERE id = $1
    `;

    await this.pool.query(query, [
      queryId,
      feedback.wasHelpful ?? null,
      feedback.score ?? null,
      feedback.notes ?? null,
    ]);
  }

  /**
   * Get configuration
   */
  getConfig(): RAGConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Check if RAG is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable RAG
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRAGPipeline(
  pool: Pool,
  embeddingService: IEmbeddingService,
  config?: Partial<RAGConfig>
): RAGPipeline {
  return new RAGPipeline(pool, embeddingService, config);
}

// =============================================================================
// Helper: Build RAG-Enhanced Prompt
// =============================================================================

export interface RAGPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  ragResult: RAGResult;
  includeSourcesInPrompt?: boolean;
}

export function buildRAGEnhancedPrompt(options: RAGPromptOptions): {
  system: string;
  user: string;
} {
  const { systemPrompt, userPrompt, ragResult, includeSourcesInPrompt = true } = options;

  let enhancedSystem = systemPrompt;

  if (ragResult.retrievedContext && ragResult.sources.length > 0) {
    const contextSection = `

## Knowledge Base Context

You have access to the following relevant information from our knowledge base:

${ragResult.retrievedContext}

${includeSourcesInPrompt ? `\nSources used: ${ragResult.sources.map((s) => s.title).join(', ')}` : ''}

IMPORTANT: Use this knowledge to provide accurate, relevant responses. If the retrieved context doesn't fully answer the question, acknowledge what you know and offer to provide more specific information.
`;

    enhancedSystem = systemPrompt + contextSection;
  }

  return {
    system: enhancedSystem,
    user: userPrompt,
  };
}

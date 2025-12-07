/**
 * @fileoverview Embedding Pipeline for Clinical Data
 *
 * Infrastructure component for generating and storing embeddings
 * for clinical data, enabling semantic search capabilities.
 *
 * Features:
 * - Optional Redis caching with 8hr TTL to reduce OpenAI API calls
 * - Batch processing with configurable concurrency
 * - Retry logic with exponential backoff
 *
 * @module infrastructure/ai/EmbeddingPipeline
 */

import OpenAI from 'openai';
import { createLogger, type Logger } from '@medicalcor/core';
import type { PgVectorService } from './vector-search/PgVectorService.js';
import type { EmbeddingCacheRedis } from './EmbeddingCacheRedis.js';

/**
 * Configuration for EmbeddingPipeline
 */
export interface EmbeddingPipelineConfig {
  /** OpenAI API key */
  openaiApiKey: string;
  /** Embedding model to use */
  model?: string;
  /** Batch size for concurrent processing */
  batchSize?: number;
  /** Maximum retries for API calls */
  maxRetries?: number;
  /** Optional embedding cache for reducing API calls */
  cache?: EmbeddingCacheRedis;
}

/**
 * Case data for embedding generation
 */
export interface CaseEmbeddingData {
  /** Case ID */
  id: string;
  /** Case status */
  status: string;
  /** Clinical notes */
  notes?: string;
  /** Clinical score data */
  clinicalScore?: {
    boneQuality: string;
    softTissueStatus: string;
    systemicRisk: string;
    urgency: string;
    financialFlexibility: string;
    globalScore: number;
    riskClass: string;
  };
  /** Subject type */
  subjectType: string;
  /** Creation date */
  createdAt: Date;
}

/**
 * Search filters for similar cases
 */
export interface SimilarCaseFilters {
  /** Filter by risk class */
  riskClass?: string;
  /** Filter by status */
  status?: string;
  /** Filter by minimum score */
  minScore?: number;
  /** Filter by maximum score */
  maxScore?: number;
}

/**
 * Embedding Pipeline
 *
 * Handles the generation and storage of embeddings for clinical data.
 * Uses OpenAI's text-embedding-ada-002 model for generating embeddings
 * and pgvector for storage and similarity search.
 *
 * @example
 * ```typescript
 * const pipeline = new EmbeddingPipeline(
 *   { openaiApiKey: process.env.OPENAI_API_KEY },
 *   vectorService
 * );
 *
 * // Process a single case
 * await pipeline.processCase(caseData);
 *
 * // Find similar cases
 * const similar = await pipeline.findSimilarCases(
 *   'Patient with severe bone loss...',
 *   5,
 *   { riskClass: 'RED' }
 * );
 * ```
 */
export class EmbeddingPipeline {
  private openai: OpenAI;
  private model: string;
  private batchSize: number;
  private maxRetries: number;
  private cache: EmbeddingCacheRedis | null;
  private logger: Logger;

  constructor(
    config: EmbeddingPipelineConfig,
    private readonly vectorService: PgVectorService
  ) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.model ?? 'text-embedding-ada-002';
    this.batchSize = config.batchSize ?? 5;
    this.maxRetries = config.maxRetries ?? 3;
    this.cache = config.cache ?? null;
    this.logger = createLogger({ name: 'embedding-pipeline' });

    if (this.cache) {
      this.logger.info(
        { model: this.model, cacheTtl: this.cache.getTTL() },
        'Embedding pipeline initialized with Redis cache'
      );
    }
  }

  /**
   * Process a single case and store its embedding
   *
   * @param caseData - Case data to process
   */
  async processCase(caseData: CaseEmbeddingData): Promise<void> {
    const textContent = this.extractContent(caseData);
    if (!textContent || textContent.trim().length === 0) {
      return;
    }

    const embedding = await this.generateEmbedding(textContent);

    await this.vectorService.storeEmbedding(caseData.id, textContent, 'clinical_notes', embedding, {
      status: caseData.status,
      riskClass: caseData.clinicalScore?.riskClass,
      globalScore: caseData.clinicalScore?.globalScore,
      subjectType: caseData.subjectType,
      createdAt: caseData.createdAt.toISOString(),
    });
  }

  /**
   * Find similar cases based on a query
   *
   * @param query - Natural language query
   * @param limit - Maximum number of results
   * @param filters - Optional filters
   * @returns Array of similar cases with similarity scores
   */
  async findSimilarCases(
    query: string,
    limit = 5,
    filters?: SimilarCaseFilters
  ): Promise<
    {
      caseId: string;
      similarity: number;
      content: string;
      metadata: Record<string, unknown>;
    }[]
  > {
    const queryEmbedding = await this.generateEmbedding(query);

    const results = await this.vectorService.semanticSearch(
      queryEmbedding,
      limit * 2, // Get extra to filter
      0.7, // Default similarity threshold
      { contentTypes: ['clinical_notes'] }
    );

    // Apply additional filters
    let filteredResults = results;

    if (filters?.riskClass) {
      filteredResults = filteredResults.filter((r) => r.metadata.riskClass === filters.riskClass);
    }

    if (filters?.status) {
      filteredResults = filteredResults.filter((r) => r.metadata.status === filters.status);
    }

    if (filters?.minScore !== undefined) {
      filteredResults = filteredResults.filter(
        (r) =>
          typeof r.metadata.globalScore === 'number' && r.metadata.globalScore >= filters.minScore!
      );
    }

    if (filters?.maxScore !== undefined) {
      filteredResults = filteredResults.filter(
        (r) =>
          typeof r.metadata.globalScore === 'number' && r.metadata.globalScore <= filters.maxScore!
      );
    }

    return filteredResults.slice(0, limit).map((r) => ({
      caseId: r.caseId,
      similarity: r.similarity,
      content: r.content,
      metadata: r.metadata,
    }));
  }

  /**
   * Batch process multiple cases
   *
   * @param cases - Array of cases to process
   * @param concurrency - Number of concurrent processes
   */
  async batchProcess(
    cases: CaseEmbeddingData[],
    concurrency = this.batchSize
  ): Promise<{
    processed: number;
    failed: number;
    errors: { caseId: string; error: string }[];
  }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as { caseId: string; error: string }[],
    };

    // Process in batches
    for (let i = 0; i < cases.length; i += concurrency) {
      const batch = cases.slice(i, i + concurrency);
      const promises = batch.map(async (caseData) => {
        try {
          await this.processCase(caseData);
          results.processed++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            caseId: caseData.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Generate embedding for text with retry logic and optional caching
   *
   * When a cache is configured:
   * - Checks cache before calling OpenAI API
   * - Stores new embeddings in cache with 8hr TTL
   * - Reduces redundant API calls by ~50%
   *
   * @param text - Text to embed
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first if available
    if (this.cache) {
      const cached = await this.cache.get(text, this.model);
      if (cached) {
        this.logger.debug({ model: this.model }, 'Using cached embedding');
        return cached;
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: text,
        });

        const embeddingData = response.data[0];
        if (!embeddingData) {
          throw new Error('Empty embedding response from OpenAI API');
        }

        const embedding = embeddingData.embedding;

        // Cache the new embedding if cache is available
        if (this.cache) {
          await this.cache.set(text, this.model, embedding);
        }

        return embedding;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Exponential backoff
        if (attempt < this.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError ?? new Error('Failed to generate embedding');
  }

  /**
   * Generate embeddings for multiple texts with caching support
   *
   * @param texts - Array of texts to embed
   * @returns Array of embeddings in the same order as input texts
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // If no cache, use direct API call
    if (!this.cache) {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    }

    // With cache: check for cached embeddings first
    const cachedMap = await this.cache.getMany(texts, this.model);
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text && !cachedMap.has(text)) {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    this.logger.debug(
      {
        total: texts.length,
        cached: texts.length - uncachedTexts.length,
        uncached: uncachedTexts.length,
      },
      'Batch embedding cache check'
    );

    // Generate embeddings for uncached texts
    let newEmbeddings: number[][] = [];
    if (uncachedTexts.length > 0) {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: uncachedTexts,
      });
      newEmbeddings = response.data.map((d) => d.embedding);

      // Cache the new embeddings
      const cacheEntries = uncachedTexts
        .map((text, i) => {
          const embedding = newEmbeddings[i];
          return embedding ? { text, embedding } : null;
        })
        .filter((entry): entry is { text: string; embedding: number[] } => entry !== null);
      await this.cache.setMany(cacheEntries, this.model);
    }

    // Assemble results in original order
    const results: number[][] = new Array<number[]>(texts.length);

    // Add cached embeddings
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text) {
        const cached = cachedMap.get(text);
        if (cached) {
          results[i] = cached;
        }
      }
    }

    // Add new embeddings
    for (let i = 0; i < uncachedIndices.length; i++) {
      const idx = uncachedIndices[i];
      const embedding = newEmbeddings[i];
      if (idx !== undefined && embedding) {
        results[idx] = embedding;
      }
    }

    return results;
  }

  /**
   * Extract embeddable content from case data
   */
  private extractContent(caseData: CaseEmbeddingData): string {
    const parts: string[] = [];

    if (caseData.notes) {
      parts.push(`Clinical Notes: ${caseData.notes}`);
    }

    if (caseData.clinicalScore) {
      const score = caseData.clinicalScore;
      parts.push(`Bone Quality: ${score.boneQuality}`);
      parts.push(`Soft Tissue Status: ${score.softTissueStatus}`);
      parts.push(`Systemic Risk: ${score.systemicRisk}`);
      parts.push(`Urgency: ${score.urgency}`);
      parts.push(`Financial Flexibility: ${score.financialFlexibility}`);
      parts.push(`Global Score: ${score.globalScore}`);
      parts.push(`Risk Class: ${score.riskClass}`);
    }

    parts.push(`Status: ${caseData.status}`);
    parts.push(`Subject Type: ${caseData.subjectType}`);

    return parts.join('\n');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get pipeline statistics including cache metrics
   */
  async getStatistics(): Promise<{
    vectorStats: Awaited<ReturnType<PgVectorService['getStatistics']>>;
    model: string;
    batchSize: number;
    cache: {
      enabled: boolean;
      hits: number;
      misses: number;
      hitRate: number;
      errors: number;
    } | null;
  }> {
    const cacheStats = this.cache ? this.cache.getStats() : null;

    return {
      vectorStats: await this.vectorService.getStatistics(),
      model: this.model,
      batchSize: this.batchSize,
      cache: cacheStats
        ? {
            enabled: true,
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            hitRate: cacheStats.hitRate,
            errors: cacheStats.errors,
          }
        : null,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    openai: boolean;
    vectorDb: boolean;
    details?: string;
  }> {
    const vectorHealth = await this.vectorService.healthCheck();

    // Test OpenAI connection
    let openaiHealthy = false;
    try {
      await this.openai.models.list();
      openaiHealthy = true;
    } catch {
      openaiHealthy = false;
    }

    return {
      openai: openaiHealthy,
      vectorDb: vectorHealth.healthy,
      details: vectorHealth.details,
    };
  }
}

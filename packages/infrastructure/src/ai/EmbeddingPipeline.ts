/**
 * @fileoverview Embedding Pipeline for Clinical Data
 *
 * Infrastructure component for generating and storing embeddings
 * for OSAX clinical data, enabling semantic search capabilities.
 *
 * @module infrastructure/ai/EmbeddingPipeline
 */

import OpenAI from 'openai';
import { PgVectorService, type VectorSearchResult } from './vector-search/PgVectorService.js';

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
 * await pipeline.processCase(osaxCase);
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

  constructor(
    config: EmbeddingPipelineConfig,
    private readonly vectorService: PgVectorService
  ) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.model = config.model ?? 'text-embedding-ada-002';
    this.batchSize = config.batchSize ?? 5;
    this.maxRetries = config.maxRetries ?? 3;
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

    await this.vectorService.storeEmbedding(
      caseData.id,
      textContent,
      'clinical_notes',
      embedding,
      {
        status: caseData.status,
        riskClass: caseData.clinicalScore?.riskClass,
        globalScore: caseData.clinicalScore?.globalScore,
        subjectType: caseData.subjectType,
        createdAt: caseData.createdAt.toISOString(),
      }
    );
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
    limit: number = 5,
    filters?: SimilarCaseFilters
  ): Promise<Array<{
    caseId: string;
    similarity: number;
    content: string;
    metadata: Record<string, unknown>;
  }>> {
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
      filteredResults = filteredResults.filter(
        r => r.metadata.riskClass === filters.riskClass
      );
    }

    if (filters?.status) {
      filteredResults = filteredResults.filter(
        r => r.metadata.status === filters.status
      );
    }

    if (filters?.minScore !== undefined) {
      filteredResults = filteredResults.filter(
        r => typeof r.metadata.globalScore === 'number' && r.metadata.globalScore >= filters.minScore!
      );
    }

    if (filters?.maxScore !== undefined) {
      filteredResults = filteredResults.filter(
        r => typeof r.metadata.globalScore === 'number' && r.metadata.globalScore <= filters.maxScore!
      );
    }

    return filteredResults.slice(0, limit).map(r => ({
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
    concurrency: number = this.batchSize
  ): Promise<{
    processed: number;
    failed: number;
    errors: Array<{ caseId: string; error: string }>;
  }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as Array<{ caseId: string; error: string }>,
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
   * Generate embedding for text with retry logic
   *
   * @param text - Text to embed
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: text,
        });

        return response.data[0]!.embedding;
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
   * Generate embeddings for multiple texts
   *
   * @param texts - Array of texts to embed
   * @returns Array of embeddings
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: texts,
    });

    return response.data.map(d => d.embedding);
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get pipeline statistics
   */
  async getStatistics(): Promise<{
    vectorStats: Awaited<ReturnType<PgVectorService['getStatistics']>>;
    model: string;
    batchSize: number;
  }> {
    return {
      vectorStats: await this.vectorService.getStatistics(),
      model: this.model,
      batchSize: this.batchSize,
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

import OpenAI from 'openai';
import { z } from 'zod';
import { withRetry, ExternalServiceError } from '@medicalcor/core';
import crypto from 'crypto';

/**
 * Embedding Service - State-of-the-art text embeddings using OpenAI
 *
 * Supports:
 * - text-embedding-3-small (1536 dimensions, cost-effective)
 * - text-embedding-3-large (3072 dimensions, highest quality)
 * - Batch processing for efficiency
 * - Caching via content hash
 */

// =============================================================================
// Configuration Schema
// =============================================================================

export const EmbeddingConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z
    .enum(['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'])
    .default('text-embedding-3-small'),
  dimensions: z.number().int().min(256).max(3072).optional(),
  organization: z.string().optional(),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10).default(3),
      baseDelayMs: z.number().int().min(100).max(30000).default(1000),
    })
    .optional(),
  /** Request timeout in milliseconds (default: 30000ms, max: 120000ms) */
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});

export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingResult {
  embedding: number[];
  contentHash: string;
  model: string;
  dimensions: number;
  tokensUsed: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokensUsed: number;
  processingTimeMs: number;
}

export interface EmbeddingInput {
  text: string;
  id?: string;
}

// Model dimension mapping
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

// =============================================================================
// Embedding Service Class
// =============================================================================

/** Default timeout for embedding API requests (30 seconds) */
const DEFAULT_EMBEDDING_TIMEOUT_MS = 30000;

export class EmbeddingService {
  private client: OpenAI;
  private config: Required<
    Pick<EmbeddingConfig, 'apiKey' | 'model'> & {
      dimensions: number;
      retryConfig: { maxRetries: number; baseDelayMs: number };
      timeoutMs: number;
    }
  >;

  constructor(config: EmbeddingConfig) {
    const validated = EmbeddingConfigSchema.parse(config);

    const defaultDimensions = MODEL_DIMENSIONS[validated.model] ?? 1536;

    this.config = {
      apiKey: validated.apiKey,
      model: validated.model,
      dimensions: validated.dimensions ?? defaultDimensions,
      retryConfig: validated.retryConfig ?? { maxRetries: 3, baseDelayMs: 1000 },
      timeoutMs: validated.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      organization: validated.organization,
      timeout: this.config.timeoutMs,
    });
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const sanitized = this.sanitizeText(text);
    const contentHash = this.hashContent(sanitized);

    const makeRequest = async () => {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: sanitized,
        dimensions: this.config.dimensions,
      });

      const embeddingData = response.data[0];
      if (!embeddingData) {
        throw new ExternalServiceError('OpenAI Embeddings', 'Empty response from API');
      }

      return {
        embedding: embeddingData.embedding,
        contentHash,
        model: this.config.model,
        dimensions: embeddingData.embedding.length,
        tokensUsed: response.usage.total_tokens,
      };
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig.maxRetries,
      baseDelayMs: this.config.retryConfig.baseDelayMs,
      shouldRetry: this.shouldRetryError,
    });
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * OpenAI supports up to 2048 inputs per request
   */
  async embedBatch(inputs: EmbeddingInput[], batchSize = 100): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    let totalTokens = 0;

    // Process in batches
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const batchTexts = batch.map((input) => this.sanitizeText(input.text));
      const batchHashes = batchTexts.map((text) => this.hashContent(text));

      const makeRequest = async () => {
        const response = await this.client.embeddings.create({
          model: this.config.model,
          input: batchTexts,
          dimensions: this.config.dimensions,
        });

        return response;
      };

      const response = await withRetry(makeRequest, {
        maxRetries: this.config.retryConfig.maxRetries,
        baseDelayMs: this.config.retryConfig.baseDelayMs,
        shouldRetry: this.shouldRetryError,
      });

      totalTokens += response.usage.total_tokens;

      // Map results back to inputs
      for (let j = 0; j < response.data.length; j++) {
        const embeddingData = response.data[j];
        if (embeddingData) {
          results.push({
            embedding: embeddingData.embedding,
            contentHash: batchHashes[j]!,
            model: this.config.model,
            dimensions: embeddingData.embedding.length,
            tokensUsed: Math.ceil(response.usage.total_tokens / response.data.length),
          });
        }
      }
    }

    return {
      embeddings: results,
      totalTokensUsed: totalTokens,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Find most similar embeddings from a set
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidates: { id: string; embedding: number[] }[],
    topK = 5,
    threshold = 0
  ): { id: string; similarity: number }[] {
    const scored = candidates.map((candidate) => ({
      id: candidate.id,
      similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding),
    }));

    return scored
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Get model info
   */
  getModelInfo(): { model: string; dimensions: number } {
    return {
      model: this.config.model,
      dimensions: this.config.dimensions,
    };
  }

  /**
   * Sanitize text for embedding
   * - Remove excessive whitespace
   * - Truncate to model limits (8191 tokens ~ 32000 chars)
   * - Remove control characters
   */
  private sanitizeText(text: string, maxLength = 32000): string {
    let sanitized = text
      // Remove control characters
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate if too long
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Hash content for caching/deduplication
   */
  private hashContent(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Determine if error is retryable
   */
  private shouldRetryError = (error: unknown): boolean => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('rate_limit')) return true;
      if (message.includes('502')) return true;
      if (message.includes('503')) return true;
      if (message.includes('timeout')) return true;
      if (message.includes('econnreset')) return true;
    }
    return false;
  };
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  return new EmbeddingService(config);
}

// =============================================================================
// Utility: Chunk Text for Embedding
// =============================================================================

export interface ChunkOptions {
  maxChunkSize: number;
  overlap: number;
  separator?: string;
}

/**
 * Split text into overlapping chunks for embedding
 * Uses recursive character splitting with smart boundary detection
 */
export function chunkText(
  text: string,
  options: ChunkOptions = { maxChunkSize: 1000, overlap: 200 }
): string[] {
  const { maxChunkSize, overlap, separator } = options;

  // Handle empty text case
  if (!text || text.length === 0) {
    return [];
  }

  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  const separators = separator ? [separator] : ['\n\n', '\n', '. ', ', ', ' ', ''];

  function splitRecursively(text: string, separatorIndex: number): string[] {
    const sep = separators[separatorIndex];
    if (sep === undefined) {
      // Base case: split by character
      const result: string[] = [];
      for (let i = 0; i < text.length; i += maxChunkSize - overlap) {
        result.push(text.slice(i, i + maxChunkSize));
      }
      return result;
    }

    const splits = text.split(sep);
    const goodSplits: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const potentialChunk = currentChunk ? currentChunk + sep + split : split;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          goodSplits.push(currentChunk);
        }
        if (split.length > maxChunkSize) {
          // Recursively split with next separator
          goodSplits.push(...splitRecursively(split, separatorIndex + 1));
          currentChunk = '';
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk) {
      goodSplits.push(currentChunk);
    }

    return goodSplits;
  }

  const rawChunks = splitRecursively(text, 0);

  // Add overlap
  for (let i = 0; i < rawChunks.length; i++) {
    let chunk = rawChunks[i]!;

    // Add overlap from previous chunk
    if (i > 0 && overlap > 0) {
      const prevChunk = rawChunks[i - 1]!;
      const overlapText = prevChunk.slice(-overlap);
      chunk = overlapText + chunk;
    }

    chunks.push(chunk.trim());
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

// =============================================================================
// Utility: Prepare Text for Embedding
// =============================================================================

/**
 * Prepare text with metadata prefix for better semantic matching
 */
export function prepareTextForEmbedding(
  content: string,
  metadata?: {
    title?: string;
    sourceType?: string;
    language?: string;
    tags?: string[];
  }
): string {
  const parts: string[] = [];

  if (metadata?.title) {
    parts.push(`Title: ${metadata.title}`);
  }

  if (metadata?.sourceType) {
    parts.push(`Type: ${metadata.sourceType}`);
  }

  if (metadata?.tags?.length) {
    parts.push(`Tags: ${metadata.tags.join(', ')}`);
  }

  parts.push('');
  parts.push(content);

  return parts.join('\n');
}

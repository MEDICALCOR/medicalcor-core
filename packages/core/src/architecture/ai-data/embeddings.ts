/**
 * @module architecture/ai-data/embeddings
 *
 * Embedding Generation
 * ====================
 *
 * Generate and manage embeddings for semantic search.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export interface EmbeddingModel {
  readonly id: string;
  readonly name: string;
  readonly provider: EmbeddingProvider;
  readonly dimension: number;
  readonly maxTokens: number;
}

export type EmbeddingProvider = 'openai' | 'cohere' | 'huggingface' | 'local';

export interface EmbeddingRequest {
  readonly texts: string[];
  readonly model?: string;
}

export interface EmbeddingResponse {
  readonly embeddings: number[][];
  readonly model: string;
  readonly usage: EmbeddingUsage;
}

export interface EmbeddingUsage {
  readonly promptTokens: number;
  readonly totalTokens: number;
}

// ============================================================================
// EMBEDDING ERROR
// ============================================================================

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly code: EmbeddingErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export type EmbeddingErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

// ============================================================================
// EMBEDDING SERVICE
// ============================================================================

export interface EmbeddingService {
  embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, EmbeddingError>>;
  embedOne(text: string, model?: string): Promise<Result<number[], EmbeddingError>>;
  listModels(): Promise<EmbeddingModel[]>;
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

export interface TextChunk {
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface TextChunker {
  chunk(text: string, options?: { maxChunkSize?: number; overlap?: number }): TextChunk[];
}

export class FixedSizeChunker implements TextChunker {
  constructor(
    private chunkSize = 1000,
    private overlap = 200
  ) {}

  chunk(text: string, options?: { maxChunkSize?: number; overlap?: number }): TextChunk[] {
    const chunkSize = options?.maxChunkSize ?? this.chunkSize;
    const overlap = options?.overlap ?? this.overlap;
    const chunks: TextChunk[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push({ text: text.slice(start, end), startIndex: start, endIndex: end });
      start = end - overlap;
      if (start >= text.length - overlap) break;
    }

    return chunks;
  }
}

// ============================================================================
// MOCK EMBEDDING SERVICE
// ============================================================================

export class MockEmbeddingService implements EmbeddingService {
  private models: EmbeddingModel[] = [
    { id: 'mock-small', name: 'Mock Small', provider: 'local', dimension: 384, maxTokens: 512 },
    { id: 'mock-large', name: 'Mock Large', provider: 'local', dimension: 1536, maxTokens: 8192 },
  ];

  embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, EmbeddingError>> {
    const modelId = request.model ?? 'mock-small';
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      return Promise.resolve(Err(new EmbeddingError('Model not found', 'MODEL_NOT_FOUND')));
    }

    const embeddings = request.texts.map((text) =>
      this.generateMockEmbedding(text, model.dimension)
    );
    return Promise.resolve(
      Ok({
        embeddings,
        model: modelId,
        usage: {
          promptTokens: request.texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
          totalTokens: request.texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
        },
      })
    );
  }

  async embedOne(text: string, model?: string): Promise<Result<number[], EmbeddingError>> {
    const result = await this.embed({ texts: [text], model });
    if (!result.isOk) return Err(result.error);
    const embedding = result.value.embeddings[0];
    if (!embedding) return Err(new EmbeddingError('No embedding generated', 'INTERNAL_ERROR'));
    return Ok(embedding);
  }

  listModels(): Promise<EmbeddingModel[]> {
    return Promise.resolve([...this.models]);
  }

  private generateMockEmbedding(text: string, dimension: number): number[] {
    const embedding: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }
    for (let i = 0; i < dimension; i++) {
      embedding.push(Math.sin(hash + i * 1.5) * 0.5);
    }
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / magnitude);
  }
}

// ============================================================================
// SIMILARITY FUNCTIONS
// ============================================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dot += aVal * bVal;
    magA += aVal * aVal;
    magB += bVal * bVal;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    const diff = aVal - bVal;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

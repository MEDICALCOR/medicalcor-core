/**
 * Masked Memory Retrieval Service (L6: Dynamic PII Masking)
 *
 * Wraps MemoryRetrievalService to automatically apply PII masking
 * based on user role at query time.
 */

import type { Pool } from 'pg';
import type {
  EpisodicEvent,
  MaskingContext,
  MaskingResult,
  MemoryQuery,
  PaginatedMemoryQuery,
  PaginatedResult,
  PiiMaskingConfig,
  SubjectMemorySummary,
  CognitiveSystemConfig,
} from './types.js';
import type { IEmbeddingService } from './episode-builder.js';
import { MemoryRetrievalService } from './memory-retrieval.js';
import { PiiMaskingService } from './pii-masking.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for MaskedMemoryRetrievalService
 */
export interface MaskedMemoryRetrievalConfig {
  /** Cognitive system configuration */
  cognitiveConfig?: Partial<CognitiveSystemConfig>;
  /** PII masking configuration */
  maskingConfig?: Partial<PiiMaskingConfig>;
}

// =============================================================================
// Masked Memory Retrieval Service
// =============================================================================

/**
 * Memory retrieval service with built-in PII masking.
 *
 * L6: Wraps MemoryRetrievalService to automatically apply PII masking
 * based on user role at query time.
 *
 * @example
 * ```typescript
 * const maskedRetrieval = createMaskedMemoryRetrievalService(pool, embeddings, {
 *   maskingConfig: { auditLogging: true },
 * });
 *
 * // Query with masking context
 * const result = await maskedRetrieval.queryWithMasking(
 *   { subjectId, semanticQuery: 'appointment' },
 *   { userRole: 'analyst', userId: 'user-123' }
 * );
 *
 * // Result includes masked data and audit info
 * console.log(result.data); // Masked events
 * console.log(result.auditInfo); // Access audit trail
 * ```
 */
export class MaskedMemoryRetrievalService {
  private readonly retrieval: MemoryRetrievalService;
  private readonly masking: PiiMaskingService;

  constructor(pool: Pool, embeddings: IEmbeddingService, config?: MaskedMemoryRetrievalConfig) {
    this.retrieval = new MemoryRetrievalService(pool, embeddings, config?.cognitiveConfig);
    this.masking = new PiiMaskingService(config?.maskingConfig);
  }

  /**
   * Query memories with automatic PII masking based on user role
   */
  async queryWithMasking(
    query: MemoryQuery,
    context: MaskingContext
  ): Promise<MaskingResult<EpisodicEvent[]>> {
    const events = await this.retrieval.query(query);
    return this.masking.maskEvents(events, { context });
  }

  /**
   * Query memories with pagination and automatic PII masking
   */
  async queryPaginatedWithMasking(
    query: PaginatedMemoryQuery,
    context: MaskingContext
  ): Promise<MaskingResult<PaginatedResult<EpisodicEvent>>> {
    const result = await this.retrieval.queryPaginated(query);
    return this.masking.maskPaginatedResult(result, { context });
  }

  /**
   * Get subject summary with automatic PII masking
   */
  async getSubjectSummaryWithMasking(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string,
    context: MaskingContext
  ): Promise<MaskingResult<SubjectMemorySummary>> {
    const summary = await this.retrieval.getSubjectSummary(subjectType, subjectId);
    return this.masking.maskSubjectSummary(summary, { context });
  }

  /**
   * Find similar interactions with automatic PII masking
   */
  async findSimilarInteractionsWithMasking(
    queryText: string,
    options: {
      subjectId?: string;
      subjectType?: 'lead' | 'patient' | 'contact';
      limit?: number;
      minSimilarity?: number;
    },
    context: MaskingContext
  ): Promise<MaskingResult<EpisodicEvent[]>> {
    const events = await this.retrieval.findSimilarInteractions(queryText, options);
    return this.masking.maskEvents(events, { context });
  }

  /**
   * Get recent events with automatic PII masking
   */
  async getRecentEventsWithMasking(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string,
    context: MaskingContext,
    days = 30,
    limit = 20
  ): Promise<MaskingResult<EpisodicEvent[]>> {
    const events = await this.retrieval.getRecentEvents(subjectType, subjectId, days, limit);
    return this.masking.maskEvents(events, { context });
  }

  /**
   * Get events by type with automatic PII masking
   */
  async getEventsByTypeWithMasking(
    subjectType: 'lead' | 'patient' | 'contact',
    subjectId: string,
    eventTypes: string[],
    context: MaskingContext,
    limit = 20
  ): Promise<MaskingResult<EpisodicEvent[]>> {
    const events = await this.retrieval.getEventsByType(subjectType, subjectId, eventTypes, limit);
    return this.masking.maskEvents(events, { context });
  }

  /**
   * Access the underlying unmasked retrieval service.
   *
   * WARNING: Only use for admin operations that require unmasked data.
   * All access through this method bypasses PII masking.
   */
  getUnmaskedService(): MemoryRetrievalService {
    return this.retrieval;
  }

  /**
   * Access the masking service for custom masking operations
   */
  getMaskingService(): PiiMaskingService {
    return this.masking;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a memory retrieval service with built-in PII masking
 *
 * @param pool - PostgreSQL connection pool
 * @param embeddings - Embedding service for semantic search
 * @param config - Configuration for cognitive system and masking
 * @returns MaskedMemoryRetrievalService instance
 */
export function createMaskedMemoryRetrievalService(
  pool: Pool,
  embeddings: IEmbeddingService,
  config?: MaskedMemoryRetrievalConfig
): MaskedMemoryRetrievalService {
  return new MaskedMemoryRetrievalService(pool, embeddings, config);
}

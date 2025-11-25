import type { Pool } from 'pg';
import type {
  SearchOptions,
  SearchResult,
  SearchResponse,
  KnowledgeSourceType,
  SearchFilters,
} from './types.js';
import { KnowledgeBaseRepository } from './knowledge-base-repository.js';

/**
 * Vector Search Service
 *
 * High-level service for semantic and hybrid search operations
 * Wraps pgvector operations with caching, logging, and optimization
 */

export interface VectorSearchConfig {
  defaultTopK: number;
  defaultSimilarityThreshold: number;
  defaultSemanticWeight: number;
  defaultKeywordWeight: number;
  maxResults: number;
  enableQueryLogging: boolean;
}

const DEFAULT_CONFIG: VectorSearchConfig = {
  defaultTopK: 5,
  defaultSimilarityThreshold: 0.7,
  defaultSemanticWeight: 0.7,
  defaultKeywordWeight: 0.3,
  maxResults: 100,
  enableQueryLogging: true,
};

export class VectorSearchService {
  private repository: KnowledgeBaseRepository;
  private config: VectorSearchConfig;

  constructor(pool: Pool, config: Partial<VectorSearchConfig> = {}) {
    this.repository = new KnowledgeBaseRepository(pool);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      filters,
      includeMetadata = true,
    } = options;

    const results = await this.repository.search(queryEmbedding, {
      topK: Math.min(topK, this.config.maxResults),
      similarityThreshold,
      filters: filters ? { ...filters } : {},
    });

    const searchResults: SearchResult[] = results.map((r) => ({
      id: r.id ?? '',
      sourceType: r.sourceType,
      title: r.title,
      content: r.content,
      similarity: r.similarity,
      metadata: includeMetadata ? r.metadata : {},
      tags: r.tags,
    }));

    return {
      results: searchResults,
      query,
      searchType: 'semantic',
      totalResults: searchResults.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    const {
      topK = this.config.defaultTopK,
      similarityThreshold = this.config.defaultSimilarityThreshold,
      semanticWeight = this.config.defaultSemanticWeight,
      keywordWeight = this.config.defaultKeywordWeight,
      filters,
      includeMetadata = true,
    } = options;

    const results = await this.repository.hybridSearch(queryEmbedding, query, {
      topK: Math.min(topK, this.config.maxResults),
      similarityThreshold,
      semanticWeight,
      keywordWeight,
      filters: filters ? { ...filters } : {},
    });

    const searchResults: SearchResult[] = results.map((r) => ({
      id: r.id ?? '',
      sourceType: r.sourceType,
      title: r.title,
      content: r.content,
      similarity: r.semanticScore,
      keywordScore: r.keywordScore,
      combinedScore: r.combinedScore,
      metadata: includeMetadata ? r.metadata : {},
      tags: r.tags,
    }));

    return {
      results: searchResults,
      query,
      searchType: 'hybrid',
      totalResults: searchResults.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Search with automatic type selection
   */
  async search(
    queryEmbedding: number[],
    query: string,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResponse> {
    const searchType = options.type ?? 'hybrid';

    if (searchType === 'semantic') {
      return this.semanticSearch(queryEmbedding, query, options);
    }

    return this.hybridSearch(queryEmbedding, query, options);
  }

  /**
   * Search by source type for specific use cases
   */
  async searchByType(
    queryEmbedding: number[],
    query: string,
    sourceTypes: KnowledgeSourceType[],
    options: Partial<Omit<SearchOptions, 'filters'>> = {}
  ): Promise<SearchResponse> {
    return this.search(queryEmbedding, query, {
      ...options,
      filters: { sourceTypes },
    });
  }

  /**
   * Search FAQs specifically
   */
  async searchFAQs(
    queryEmbedding: number[],
    query: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = { sourceType: 'faq' };
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 3,
      similarityThreshold: 0.6,
    });
  }

  /**
   * Search clinic protocols
   */
  async searchProtocols(
    queryEmbedding: number[],
    query: string,
    clinicId?: string
  ): Promise<SearchResponse> {
    const filters: SearchFilters = { sourceType: 'clinic_protocol' };
    if (clinicId) filters.clinicId = clinicId;

    return this.search(queryEmbedding, query, {
      type: 'semantic',
      filters,
      topK: 3,
      similarityThreshold: 0.65,
    });
  }

  /**
   * Search for scoring context (FAQs + protocols + treatment info)
   */
  async searchForScoring(
    queryEmbedding: number[],
    query: string,
    clinicId?: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = {
      sourceTypes: ['faq', 'clinic_protocol', 'treatment_info', 'pricing_info'],
    };
    if (clinicId) filters.clinicId = clinicId;
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 5,
      similarityThreshold: 0.6,
      semanticWeight: 0.8,
      keywordWeight: 0.2,
    });
  }

  /**
   * Search for reply generation context
   */
  async searchForReply(
    queryEmbedding: number[],
    query: string,
    clinicId?: string,
    language?: 'ro' | 'en' | 'de'
  ): Promise<SearchResponse> {
    const filters: SearchFilters = {
      sourceTypes: ['faq', 'treatment_info', 'appointment_policy', 'marketing_content'],
    };
    if (clinicId) filters.clinicId = clinicId;
    if (language) filters.language = language;

    return this.search(queryEmbedding, query, {
      type: 'hybrid',
      filters,
      topK: 4,
      similarityThreshold: 0.65,
      semanticWeight: 0.7,
      keywordWeight: 0.3,
    });
  }

  /**
   * Get configuration
   */
  getConfig(): VectorSearchConfig {
    return { ...this.config };
  }

  /**
   * Get underlying repository for advanced operations
   */
  getRepository(): KnowledgeBaseRepository {
    return this.repository;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVectorSearchService(
  pool: Pool,
  config?: Partial<VectorSearchConfig>
): VectorSearchService {
  return new VectorSearchService(pool, config);
}

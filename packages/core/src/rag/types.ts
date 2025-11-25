import { z } from 'zod';

/**
 * RAG Type Definitions
 */

// =============================================================================
// Knowledge Base Types
// =============================================================================

export const KnowledgeSourceTypeSchema = z.enum([
  'clinic_protocol',
  'faq',
  'patient_interaction',
  'treatment_info',
  'pricing_info',
  'appointment_policy',
  'consent_template',
  'marketing_content',
  'custom',
]);

export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;

export const LanguageSchema = z.enum(['ro', 'en', 'de']);
export type Language = z.infer<typeof LanguageSchema>;

export const KnowledgeEntrySchema = z.object({
  id: z.string().uuid().optional(),
  sourceType: KnowledgeSourceTypeSchema,
  sourceId: z.string().max(200).optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  contentHash: z.string().length(64).optional(),
  chunkIndex: z.number().int().min(0).default(0),
  chunkTotal: z.number().int().min(1).default(1),
  parentId: z.string().uuid().optional(),
  embedding: z.array(z.number()).optional(),
  clinicId: z.string().max(100).optional(),
  language: LanguageSchema.default('ro'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  version: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().max(100).optional(),
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const CreateKnowledgeEntrySchema = KnowledgeEntrySchema.omit({
  id: true,
  contentHash: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateKnowledgeEntry = z.infer<typeof CreateKnowledgeEntrySchema>;

// =============================================================================
// Search Types
// =============================================================================

export const SearchTypeSchema = z.enum(['semantic', 'hybrid', 'keyword']);
export type SearchType = z.infer<typeof SearchTypeSchema>;

export const SearchFiltersSchema = z.object({
  sourceType: KnowledgeSourceTypeSchema.optional(),
  sourceTypes: z.array(KnowledgeSourceTypeSchema).optional(),
  clinicId: z.string().optional(),
  language: LanguageSchema.optional(),
  tags: z.array(z.string()).optional(),
  excludeIds: z.array(z.string().uuid()).optional(),
});

export interface SearchFilters {
  sourceType?: KnowledgeSourceType | undefined;
  sourceTypes?: KnowledgeSourceType[] | undefined;
  clinicId?: string | undefined;
  language?: Language | undefined;
  tags?: string[] | undefined;
  excludeIds?: string[] | undefined;
}

export const SearchOptionsSchema = z.object({
  type: SearchTypeSchema.default('hybrid'),
  topK: z.number().int().min(1).max(100).default(5),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  semanticWeight: z.number().min(0).max(1).default(0.7),
  keywordWeight: z.number().min(0).max(1).default(0.3),
  filters: SearchFiltersSchema.optional(),
  includeMetadata: z.boolean().default(true),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

export interface SearchResult {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string;
  content: string;
  similarity: number;
  keywordScore?: number;
  combinedScore?: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  searchType: SearchType;
  totalResults: number;
  latencyMs: number;
}

// =============================================================================
// RAG Pipeline Types
// =============================================================================

export const RAGContextSchema = z.object({
  query: z.string().min(1),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
  phone: z.string().optional(),
  clinicId: z.string().optional(),
  language: LanguageSchema.optional(),
  correlationId: z.string().optional(),
  useCase: z.enum(['scoring', 'reply_generation', 'general']).default('general'),
});

export type RAGContext = z.infer<typeof RAGContextSchema>;

export interface RAGResult {
  retrievedContext: string;
  sources: {
    id: string;
    title: string;
    sourceType: KnowledgeSourceType;
    similarity: number;
  }[];
  searchLatencyMs: number;
  embeddingLatencyMs: number;
  totalLatencyMs: number;
  contextTokenEstimate: number;
}

export interface RAGConfig {
  enabled: boolean;
  maxContextTokens: number;
  defaultTopK: number;
  defaultSimilarityThreshold: number;
  includeConversationContext: boolean;
  maxConversationHistory: number;
  fallbackOnNoResults: boolean;
  logQueries: boolean;
}

// =============================================================================
// Message Embedding Types
// =============================================================================

export const MessageEmbeddingSchema = z.object({
  id: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  phone: z.string().min(10).max(20),
  correlationId: z.string().optional(),
  contentSanitized: z.string(),
  contentHash: z.string().length(64),
  embedding: z.array(z.number()).optional(),
  direction: z.enum(['IN', 'OUT']),
  messageType: z.string().default('text'),
  intent: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  language: LanguageSchema.optional(),
  clinicId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  messageTimestamp: z.date().optional(),
  createdAt: z.date().optional(),
});

export type MessageEmbedding = z.infer<typeof MessageEmbeddingSchema>;

// =============================================================================
// Query Log Types
// =============================================================================

export interface RAGQueryLogEntry {
  id?: string;
  queryText: string;
  queryEmbedding?: number[];
  searchType: SearchType;
  topK: number;
  similarityThreshold?: number;
  filters: Record<string, unknown>;
  resultCount: number;
  resultIds: string[];
  resultScores: number[];
  embeddingLatencyMs?: number;
  searchLatencyMs?: number;
  totalLatencyMs?: number;
  correlationId?: string | null;
  useCase?: string | null;
  wasHelpful?: boolean;
  feedbackScore?: number;
  feedbackNotes?: string;
  createdAt?: Date;
}

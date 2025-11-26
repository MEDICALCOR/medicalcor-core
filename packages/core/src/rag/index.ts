/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * State-of-the-art RAG implementation with:
 * - pgvector for vector storage
 * - Hybrid search (semantic + keyword)
 * - Document chunking with overlap
 * - Context injection for AI prompts
 * - HubSpot patient context integration
 * - Conversation embedding for semantic search
 */

export * from './knowledge-base-repository.js';
export * from './vector-search-service.js';
export * from './rag-pipeline.js';
export * from './types.js';

// HubSpot Context Provider for RAG
export {
  HubSpotContextProvider,
  createHubSpotContextProvider,
  HubSpotContextConfigSchema,
  type IHubSpotClient,
  type HubSpotContactForRAG,
  type PatientContext,
  type RAGPatientContext,
  type HubSpotContextConfig,
} from './hubspot-context-provider.js';

// Conversation Embedding Service for semantic search
export {
  ConversationEmbeddingService,
  createConversationEmbeddingService,
  ConversationEmbeddingConfigSchema,
  type ConversationMessage,
  type ConversationSearchResult,
  type ConversationContext,
  type ConversationEmbeddingConfig,
} from './conversation-embedding-service.js';

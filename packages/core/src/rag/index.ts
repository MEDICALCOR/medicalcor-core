/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * State-of-the-art RAG implementation with:
 * - pgvector for vector storage
 * - Hybrid search (semantic + keyword)
 * - Document chunking with overlap
 * - Context injection for AI prompts
 */

export * from './knowledge-base-repository.js';
export * from './vector-search-service.js';
export * from './rag-pipeline.js';
export * from './types.js';

/**
 * @fileoverview Infrastructure Layer Package
 *
 * Hexagonal Architecture Infrastructure Layer for MedicalCor OSAX.
 *
 * This package contains adapters that implement the secondary ports
 * defined in the application layer, connecting the application to
 * external infrastructure.
 *
 * @module @medicalcor/infrastructure
 *
 * ## Architecture Overview
 *
 * ```
 *    APPLICATION LAYER                    INFRASTRUCTURE LAYER
 *   ┌─────────────────┐                  ┌─────────────────────┐
 *   │                 │                  │                     │
 *   │  Secondary      │                  │  ┌───────────────┐  │
 *   │  Ports          │─────implements──▶│  │ PostgreSQL    │  │
 *   │  (Interfaces)   │                  │  │ Repository    │  │
 *   │                 │                  │  └───────────────┘  │
 *   │                 │                  │                     │
 *   │  OsaxCase       │                  │  ┌───────────────┐  │
 *   │  Repository     │─────implements──▶│  │ Supabase      │  │
 *   │                 │                  │  │ Repository    │  │
 *   │                 │                  │  └───────────────┘  │
 *   │                 │                  │                     │
 *   │  Event          │                  │  ┌───────────────┐  │
 *   │  Publisher      │─────implements──▶│  │ Kafka/Redis   │  │
 *   │                 │                  │  │ Publisher     │  │
 *   │                 │                  │  └───────────────┘  │
 *   │                 │                  │                     │
 *   │  Audit          │                  │  ┌───────────────┐  │
 *   │  Service        │─────implements──▶│  │ PostgreSQL    │  │
 *   │                 │                  │  │ Audit Adapter │  │
 *   └─────────────────┘                  │  └───────────────┘  │
 *                                        │                     │
 *                                        │  ┌───────────────┐  │
 *                                        │  │ AI/Vector     │  │
 *                                        │  │ Services      │  │
 *                                        │  └───────────────┘  │
 *                                        └─────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   // AI & Vector Search
 *   EmbeddingPipeline,
 *   PgVectorService,
 * } from '@medicalcor/infrastructure';
 *
 * // Initialize vector service
 * const vectorService = new PgVectorService(connectionString);
 * await vectorService.initialize();
 *
 * // Create embedding pipeline
 * const pipeline = new EmbeddingPipeline(
 *   { openaiApiKey: process.env.OPENAI_API_KEY },
 *   vectorService
 * );
 * ```
 */

// ============================================================================
// AI & VECTOR SEARCH
// ============================================================================

export * from './ai/index.js';

/**
 * Agent Guidance Module Exports
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Provides structured call scripts and real-time coaching guidance
 * for agents handling voice calls and chat interactions.
 *
 * ADR-004: Cognitive memory integration for context-aware guidance.
 */

// Repository interface
export * from './repositories/index.js';

// Base Service
export {
  GuidanceService,
  getGuidanceService,
  resetGuidanceService,
  type GuidanceServiceConfig,
  type GuidanceServiceEvents,
  type ScriptCompletionStats,
} from './guidance-service.js';

// Memory-Enriched Service (ADR-004: Cognitive Memory Integration)
export {
  MemoryEnrichedGuidanceService,
  getMemoryEnrichedGuidanceService,
  createMemoryEnrichedGuidanceService,
  resetMemoryEnrichedGuidanceService,
  type MemoryEnrichedGuidanceConfig,
  type MemoryEnrichedGuidanceEvents,
  type MemoryEnrichedCallSpec,
  type MemoryEnrichedSuggestion,
  type CallMemoryContext,
} from './memory-enriched-guidance-service.js';

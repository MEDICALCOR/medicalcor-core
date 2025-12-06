/**
 * Agent Guidance Module Exports
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Provides structured call scripts and real-time coaching guidance
 * for agents handling voice calls and chat interactions.
 */

// Repository interface
export * from './repositories/index.js';

// Service
export {
  GuidanceService,
  getGuidanceService,
  resetGuidanceService,
  type GuidanceServiceConfig,
  type GuidanceServiceEvents,
  type ScriptCompletionStats,
} from './guidance-service.js';

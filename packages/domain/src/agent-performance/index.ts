/**
 * @fileoverview Agent Performance Module
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 * M8: Wrap-Up Time Tracking - Agent productivity metrics
 * Exports for agent performance tracking and reporting.
 *
 * @module @medicalcor/domain/agent-performance
 */

export {
  type IAgentPerformanceRepository,
  type GetAgentsOptions,
  PostgresAgentPerformanceRepository,
  createAgentPerformanceRepository,
} from './agent-performance-repository.js';

// Wrap-Up Time Tracking (M8)
export {
  type IWrapUpTimeRepository,
  type WrapUpTimeServiceConfig,
  type WrapUpTimeServiceDeps,
  WrapUpTimeService,
  createWrapUpTimeService,
} from './wrap-up-time-service.js';

export {
  PostgresWrapUpTimeRepository,
  createWrapUpTimeRepository,
} from './wrap-up-time-repository.js';

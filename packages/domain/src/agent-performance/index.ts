/**
 * @fileoverview Agent Performance Module
 *
 * M7: Agent Performance Dashboard - Individual Metrics
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

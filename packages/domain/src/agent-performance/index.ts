/**
 * @fileoverview Agent Performance Module (Domain Layer)
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 * M8: Wrap-Up Time Tracking - Agent productivity metrics
 *
 * Exports interfaces (ports) and domain services for agent performance.
 * PostgreSQL implementations (adapters) are in @medicalcor/infrastructure.
 *
 * @module @medicalcor/domain/agent-performance
 */

// Agent Performance Repository Interface (Port)
export {
  type IAgentPerformanceRepository,
  type GetAgentsOptions,
} from './agent-performance-repository.js';

// Wrap-Up Time Tracking (M8) - Service and Repository Interface
export {
  type IWrapUpTimeRepository,
  type WrapUpTimeServiceConfig,
  type WrapUpTimeServiceDeps,
  WrapUpTimeService,
  createWrapUpTimeService,
} from './wrap-up-time-service.js';

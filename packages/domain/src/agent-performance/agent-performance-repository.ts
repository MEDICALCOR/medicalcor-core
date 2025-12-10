/**
 * @fileoverview Agent Performance Repository Interface (Domain Layer)
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 *
 * ## Hexagonal Architecture
 *
 * @deprecated This interface has been moved to the application layer.
 * Import from `@medicalcor/application` instead:
 *
 * ```typescript
 * import type { IAgentPerformanceRepositoryPort } from '@medicalcor/application';
 * ```
 *
 * This file is kept for backward compatibility only and will be removed
 * in a future release.
 *
 * @module domain/agent-performance/agent-performance-repository
 */

import type {
  Agent,
  AgentSession,
  AgentDailyMetrics,
  AgentPerformanceSummary,
  AgentTrendPoint,
  AgentDashboardMetrics,
  AgentPerformanceDashboardData,
  AgentPerformanceTimeRange,
  AgentType,
  AgentAvailability,
} from '@medicalcor/types';

// ============================================================================
// REPOSITORY INTERFACE (DEPRECATED)
// ============================================================================

/**
 * Repository interface for agent performance data
 *
 * @deprecated Use `IAgentPerformanceRepositoryPort` from `@medicalcor/application` instead.
 * This interface is kept for backward compatibility only.
 */
export interface IAgentPerformanceRepository {
  // Agent operations
  getAgent(agentId: string): Promise<Agent | null>;
  getAgents(clinicId: string, options?: GetAgentsOptions): Promise<Agent[]>;
  createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent>;
  updateAgent(agentId: string, updates: Partial<Agent>): Promise<void>;

  // Session operations
  getActiveSession(agentId: string): Promise<AgentSession | null>;
  startSession(session: Omit<AgentSession, 'id'>): Promise<AgentSession>;
  endSession(sessionId: string): Promise<void>;
  updateSessionMetrics(
    sessionId: string,
    metrics: Pick<
      AgentSession,
      'leadsHandled' | 'callsHandled' | 'messagesSent' | 'avgResponseTimeMs'
    >
  ): Promise<void>;

  // Performance metrics
  getDailyMetrics(agentId: string, date: Date): Promise<AgentDailyMetrics | null>;
  incrementMetric(
    agentId: string,
    clinicId: string,
    metric: keyof AgentDailyMetrics,
    value?: number
  ): Promise<void>;
  updateDailyMetrics(
    agentId: string,
    clinicId: string,
    date: Date,
    metrics: Partial<AgentDailyMetrics>
  ): Promise<void>;

  // Dashboard data
  getPerformanceSummary(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceSummary[]>;
  getAgentTrend(agentId: string, timeRange: AgentPerformanceTimeRange): Promise<AgentTrendPoint[]>;
  getDashboardMetrics(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentDashboardMetrics>;
  getDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceDashboardData>;

  // Agent status
  getAgentCurrentStatus(agentId: string): Promise<AgentAvailability | null>;
  getActiveAgentCount(clinicId: string): Promise<number>;
}

/**
 * Options for getting agents
 *
 * @deprecated Use `GetAgentsOptions` from `@medicalcor/application` instead.
 */
export interface GetAgentsOptions {
  agentType?: AgentType;
  status?: 'active' | 'inactive';
  limit?: number;
  offset?: number;
}

/**
 * @fileoverview Agent Performance Repository Port Interface (Secondary Port)
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 *
 * Defines the interface for agent performance data persistence with
 * dashboard and analytics capabilities. This port enables tracking
 * individual agent metrics, sessions, and performance trends.
 *
 * @module application/ports/secondary/persistence/AgentPerformanceRepositoryPort
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for agent performance
 * data access.
 *
 * ## Features
 *
 * - Agent CRUD operations
 * - Session tracking (login/logout, availability)
 * - Daily performance metrics aggregation
 * - Dashboard data for visualization
 * - Trend analysis over configurable time ranges
 * - Top performers and needs-attention identification
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

// =============================================================================
// QUERY OPTIONS
// =============================================================================

/**
 * Options for filtering agent queries
 */
export interface GetAgentsOptions {
  /** Filter by agent type (human, ai, hybrid) */
  agentType?: AgentType;
  /** Filter by status (active, inactive) */
  status?: 'active' | 'inactive';
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Options for performance queries
 */
export interface PerformanceQueryOptions {
  /** Include inactive agents */
  includeInactive?: boolean;
  /** Minimum leads threshold for ranking */
  minLeadsThreshold?: number;
  /** Sort field */
  sortBy?:
    | 'name'
    | 'leadsHandled'
    | 'conversionRate'
    | 'avgResponseTime'
    | 'satisfaction'
    | 'revenue';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// AGENT PERFORMANCE REPOSITORY PORT INTERFACE
// =============================================================================

/**
 * Agent Performance Repository Port Interface
 *
 * Defines the contract for agent performance data persistence with
 * comprehensive metrics tracking and dashboard support.
 *
 * @example
 * ```typescript
 * // Get dashboard data for a clinic
 * const dashboard = await agentPerformanceRepository.getDashboardData(
 *   'clinic-123',
 *   '30d'
 * );
 *
 * // Get individual agent metrics
 * const summary = await agentPerformanceRepository.getPerformanceSummary(
 *   'clinic-123',
 *   '7d'
 * );
 *
 * // Track agent session
 * const session = await agentPerformanceRepository.startSession({
 *   agentId: 'agent-123',
 *   clinicId: 'clinic-123',
 *   startedAt: new Date().toISOString(),
 *   status: 'available',
 * });
 * ```
 */
export interface IAgentPerformanceRepositoryPort {
  // ===========================================================================
  // AGENT OPERATIONS
  // ===========================================================================

  /**
   * Get a single agent by ID
   *
   * @param agentId - Agent identifier
   * @returns Agent if found, null otherwise
   */
  getAgent(agentId: string): Promise<Agent | null>;

  /**
   * Get all agents for a clinic with optional filtering
   *
   * @param clinicId - Clinic identifier
   * @param options - Query options (type, status, pagination)
   * @returns Array of agents matching the criteria
   */
  getAgents(clinicId: string, options?: GetAgentsOptions): Promise<Agent[]>;

  /**
   * Create a new agent
   *
   * @param agent - Agent data without auto-generated fields
   * @returns Created agent with ID and timestamps
   */
  createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent>;

  /**
   * Update an existing agent
   *
   * @param agentId - Agent identifier
   * @param updates - Partial agent data to update
   */
  updateAgent(agentId: string, updates: Partial<Agent>): Promise<void>;

  // ===========================================================================
  // SESSION OPERATIONS
  // ===========================================================================

  /**
   * Get the current active session for an agent
   *
   * Active sessions have no end time and represent current login state.
   *
   * @param agentId - Agent identifier
   * @returns Active session if found, null otherwise
   */
  getActiveSession(agentId: string): Promise<AgentSession | null>;

  /**
   * Start a new agent session
   *
   * Call when agent logs in or becomes available.
   *
   * @param session - Session data without ID
   * @returns Created session with ID
   */
  startSession(session: Omit<AgentSession, 'id'>): Promise<AgentSession>;

  /**
   * End an agent session
   *
   * Call when agent logs out or becomes unavailable.
   *
   * @param sessionId - Session identifier
   */
  endSession(sessionId: string): Promise<void>;

  /**
   * Update session metrics in real-time
   *
   * Updates the running totals for the current session.
   *
   * @param sessionId - Session identifier
   * @param metrics - Metrics to update
   */
  updateSessionMetrics(
    sessionId: string,
    metrics: Pick<
      AgentSession,
      'leadsHandled' | 'callsHandled' | 'messagesSent' | 'avgResponseTimeMs'
    >
  ): Promise<void>;

  // ===========================================================================
  // PERFORMANCE METRICS
  // ===========================================================================

  /**
   * Get daily metrics for an agent on a specific date
   *
   * @param agentId - Agent identifier
   * @param date - Date to retrieve metrics for
   * @returns Daily metrics if found, null otherwise
   */
  getDailyMetrics(agentId: string, date: Date): Promise<AgentDailyMetrics | null>;

  /**
   * Increment a specific metric counter
   *
   * Used for real-time metric updates (e.g., incrementing leads_handled).
   * Creates the daily record if it doesn't exist.
   *
   * @param agentId - Agent identifier
   * @param clinicId - Clinic identifier
   * @param metric - Metric field to increment
   * @param value - Amount to increment (default: 1)
   */
  incrementMetric(
    agentId: string,
    clinicId: string,
    metric: keyof AgentDailyMetrics,
    value?: number
  ): Promise<void>;

  /**
   * Update multiple daily metrics at once
   *
   * Used for batch updates or computed metrics.
   *
   * @param agentId - Agent identifier
   * @param clinicId - Clinic identifier
   * @param date - Date for the metrics
   * @param metrics - Partial metrics to update
   */
  updateDailyMetrics(
    agentId: string,
    clinicId: string,
    date: Date,
    metrics: Partial<AgentDailyMetrics>
  ): Promise<void>;

  // ===========================================================================
  // DASHBOARD DATA
  // ===========================================================================

  /**
   * Get performance summary for all agents in a clinic
   *
   * Returns aggregated metrics for each active agent over the
   * specified time range, suitable for dashboard tables.
   *
   * @param clinicId - Clinic identifier
   * @param timeRange - Time range for aggregation ('7d', '30d', '90d', '12m')
   * @returns Array of agent performance summaries
   */
  getPerformanceSummary(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceSummary[]>;

  /**
   * Get performance trend data for a single agent
   *
   * Returns daily data points for charting agent performance
   * over time.
   *
   * @param agentId - Agent identifier
   * @param timeRange - Time range for the trend
   * @returns Array of trend data points
   */
  getAgentTrend(agentId: string, timeRange: AgentPerformanceTimeRange): Promise<AgentTrendPoint[]>;

  /**
   * Get aggregate dashboard metrics for a clinic
   *
   * Returns high-level KPIs with period-over-period changes
   * for dashboard header cards.
   *
   * @param clinicId - Clinic identifier
   * @param timeRange - Time range for metrics
   * @returns Dashboard metrics with change percentages
   */
  getDashboardMetrics(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentDashboardMetrics>;

  /**
   * Get complete dashboard data for a clinic
   *
   * Returns all data needed to render the agent performance
   * dashboard, including metrics, agent list, top performers,
   * agents needing attention, and performance over time.
   *
   * @param clinicId - Clinic identifier
   * @param timeRange - Time range for all data
   * @returns Complete dashboard data structure
   */
  getDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceDashboardData>;

  // ===========================================================================
  // AGENT STATUS
  // ===========================================================================

  /**
   * Get current availability status for an agent
   *
   * Returns the status from the agent's active session.
   *
   * @param agentId - Agent identifier
   * @returns Current availability status or null if offline
   */
  getAgentCurrentStatus(agentId: string): Promise<AgentAvailability | null>;

  /**
   * Get count of currently active agents in a clinic
   *
   * Active agents have an open session (logged in).
   *
   * @param clinicId - Clinic identifier
   * @returns Number of active agents
   */
  getActiveAgentCount(clinicId: string): Promise<number>;
}

// =============================================================================
// RE-EXPORT FOR BACKWARDS COMPATIBILITY
// =============================================================================

/**
 * Alias for the port interface
 *
 * @deprecated Use IAgentPerformanceRepositoryPort instead
 */
export type IAgentPerformanceRepository = IAgentPerformanceRepositoryPort;

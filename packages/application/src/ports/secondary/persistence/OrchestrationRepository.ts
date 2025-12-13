/**
 * @fileoverview Secondary Port - OrchestrationRepository
 *
 * Defines what the application needs from the orchestration session persistence layer.
 * This is a hexagonal architecture SECONDARY PORT for managing multi-agent
 * orchestration sessions, directives, reports, and quality gate results.
 *
 * @module application/ports/secondary/persistence/OrchestrationRepository
 *
 * ORCHESTRATION PRINCIPLE:
 * This port manages the complete lifecycle of orchestration sessions including:
 * 1. Session creation and state management
 * 2. Agent directive dispatch tracking
 * 3. Agent report collection
 * 4. Quality gate result storage
 * 5. Conflict resolution tracking
 */

import type {
  OrchestrationSession,
  CreateOrchestrationSession,
  AgentDirective,
  AgentReport,
  QualityGateResult,
  ConflictResolution,
  OrchestrationReport,
  OrchestrationStatus,
  AgentCodename,
} from '@medicalcor/types';

// ============================================================================
// QUERY FILTERS
// ============================================================================

/**
 * Filter options for orchestration session queries
 */
export interface OrchestrationSessionFilter {
  /** Filter by status */
  readonly status?: OrchestrationStatus | OrchestrationStatus[];

  /** Filter by priority */
  readonly priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  /** Filter sessions created after this date */
  readonly createdAfter?: Date;

  /** Filter sessions created before this date */
  readonly createdBefore?: Date;

  /** Filter by initiator */
  readonly initiatedBy?: string;

  /** Filter by correlation ID */
  readonly correlationId?: string;

  /** Limit results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;
}

/**
 * Session statistics for monitoring
 */
export interface OrchestrationSessionStats {
  /** Total sessions */
  readonly total: number;

  /** Sessions by status */
  readonly byStatus: Record<OrchestrationStatus, number>;

  /** Active sessions (in progress) */
  readonly active: number;

  /** Completed sessions */
  readonly completed: number;

  /** Failed sessions */
  readonly failed: number;

  /** Average session duration in ms */
  readonly avgDurationMs: number;

  /** Average quality gate pass rate */
  readonly avgGatePassRate: number;
}

// ============================================================================
// SECONDARY PORT INTERFACE
// ============================================================================

/**
 * SECONDARY PORT: Orchestration Repository
 *
 * Defines the contract for managing orchestration session persistence.
 * Implementations can use PostgreSQL, Redis, or in-memory storage.
 *
 * @example
 * ```typescript
 * // Infrastructure adapter implementing this port
 * class PostgresOrchestrationRepository implements IOrchestrationRepository {
 *   async createSession(input: CreateOrchestrationSession) {
 *     const result = await this.pool.query(
 *       'INSERT INTO orchestration_sessions ...',
 *       [...]
 *     );
 *     return this.mapToSession(result.rows[0]);
 *   }
 * }
 * ```
 */
export interface IOrchestrationRepository {
  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Create a new orchestration session
   *
   * @param input - Session creation input
   * @returns Created session
   */
  createSession(input: CreateOrchestrationSession): Promise<OrchestrationSession>;

  /**
   * Get session by ID
   *
   * @param sessionId - Session identifier
   * @returns Session or null if not found
   */
  getSession(sessionId: string): Promise<OrchestrationSession | null>;

  /**
   * Get session by correlation ID
   *
   * @param correlationId - Correlation identifier
   * @returns Session or null if not found
   */
  getSessionByCorrelationId(correlationId: string): Promise<OrchestrationSession | null>;

  /**
   * Update session status
   *
   * @param sessionId - Session identifier
   * @param status - New status
   * @param summary - Optional summary message
   * @returns Updated session
   */
  updateSessionStatus(
    sessionId: string,
    status: OrchestrationStatus,
    summary?: string
  ): Promise<OrchestrationSession>;

  /**
   * Find sessions matching filter criteria
   *
   * @param filter - Query filters
   * @returns Array of matching sessions
   */
  findSessions(filter: OrchestrationSessionFilter): Promise<OrchestrationSession[]>;

  /**
   * Delete a session (soft delete)
   *
   * @param sessionId - Session identifier
   */
  deleteSession(sessionId: string): Promise<void>;

  // ============================================================================
  // Directive Operations
  // ============================================================================

  /**
   * Save agent directives for a session
   *
   * @param sessionId - Session identifier
   * @param directives - Agent directives to save
   * @returns Updated session
   */
  saveDirectives(sessionId: string, directives: AgentDirective[]): Promise<OrchestrationSession>;

  /**
   * Get directives for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of directives
   */
  getDirectives(sessionId: string): Promise<AgentDirective[]>;

  /**
   * Get directive by ID
   *
   * @param directiveId - Directive identifier
   * @returns Directive or null if not found
   */
  getDirective(directiveId: string): Promise<AgentDirective | null>;

  // ============================================================================
  // Report Operations
  // ============================================================================

  /**
   * Save an agent report
   *
   * @param sessionId - Session identifier
   * @param report - Agent report to save
   * @returns Updated session
   */
  saveReport(sessionId: string, report: AgentReport): Promise<OrchestrationSession>;

  /**
   * Get reports for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of agent reports
   */
  getReports(sessionId: string): Promise<AgentReport[]>;

  /**
   * Get reports by agent
   *
   * @param sessionId - Session identifier
   * @param agent - Agent codename
   * @returns Array of reports from the agent
   */
  getReportsByAgent(sessionId: string, agent: AgentCodename): Promise<AgentReport[]>;

  // ============================================================================
  // Quality Gate Operations
  // ============================================================================

  /**
   * Save quality gate result
   *
   * @param sessionId - Session identifier
   * @param result - Quality gate result to save
   * @returns Updated session
   */
  saveQualityGateResult(
    sessionId: string,
    result: QualityGateResult
  ): Promise<OrchestrationSession>;

  /**
   * Get quality gate results for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of quality gate results
   */
  getQualityGateResults(sessionId: string): Promise<QualityGateResult[]>;

  // ============================================================================
  // Conflict Operations
  // ============================================================================

  /**
   * Save conflict resolution
   *
   * @param sessionId - Session identifier
   * @param conflict - Conflict resolution to save
   * @returns Updated session
   */
  saveConflict(sessionId: string, conflict: ConflictResolution): Promise<OrchestrationSession>;

  /**
   * Resolve a conflict
   *
   * @param sessionId - Session identifier
   * @param conflictId - Conflict identifier
   * @param resolution - Resolution description
   * @returns Updated session
   */
  resolveConflict(
    sessionId: string,
    conflictId: string,
    resolution: string
  ): Promise<OrchestrationSession>;

  /**
   * Get unresolved conflicts for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of unresolved conflicts
   */
  getUnresolvedConflicts(sessionId: string): Promise<ConflictResolution[]>;

  // ============================================================================
  // Report Generation
  // ============================================================================

  /**
   * Generate orchestration report for a session
   *
   * @param sessionId - Session identifier
   * @returns Orchestration report
   */
  generateReport(sessionId: string): Promise<OrchestrationReport | null>;

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get session statistics
   *
   * @param since - Optional start date for statistics
   * @returns Session statistics
   */
  getStats(since?: Date): Promise<OrchestrationSessionStats>;

  // ============================================================================
  // Idempotency
  // ============================================================================

  /**
   * Check if an idempotency key has been used
   *
   * @param key - Idempotency key
   * @returns True if key has been used
   */
  isIdempotencyKeyUsed(key: string): Promise<boolean>;

  /**
   * Mark an idempotency key as used
   *
   * @param key - Idempotency key
   * @param sessionId - Associated session ID
   */
  markIdempotencyKeyUsed(key: string, sessionId: string): Promise<void>;
}

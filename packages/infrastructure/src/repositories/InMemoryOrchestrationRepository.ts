/**
 * @fileoverview In-Memory Orchestration Repository (Infrastructure Layer)
 *
 * Concrete in-memory adapter implementing the IOrchestrationRepository port
 * from the application layer. Suitable for development and testing.
 *
 * @module @medicalcor/infrastructure/repositories/in-memory-orchestration-repository
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the port (IOrchestrationRepository) defined
 * in the application layer. The application layer depends only on the interface,
 * not this implementation.
 */

import { createLogger } from '@medicalcor/core';
import { createOrchestrationService } from '@medicalcor/domain';
import type { IOrchestrationRepository } from '@medicalcor/application';
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
  TaskAnalysis,
} from '@medicalcor/types';

const logger = createLogger({ name: 'in-memory-orchestration-repository' });

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * In-memory implementation of the Orchestration Repository
 *
 * This adapter implements the IOrchestrationRepository port, providing
 * an in-memory storage solution for orchestration sessions.
 *
 * Features:
 * - Full session lifecycle management
 * - Directive, report, and conflict tracking
 * - Idempotency key management
 * - Statistics generation
 */
export class InMemoryOrchestrationRepository implements IOrchestrationRepository {
  private sessions = new Map<string, OrchestrationSession>();
  private sessionsByCorrelation = new Map<string, string>();
  private idempotencyKeys = new Map<string, string>();
  private orchestrationService = createOrchestrationService();

  constructor() {
    logger.info('InMemoryOrchestrationRepository initialized');
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  async createSession(input: CreateOrchestrationSession): Promise<OrchestrationSession> {
    // Check idempotency key
    if (input.idempotencyKey) {
      const existingSessionId = this.idempotencyKeys.get(input.idempotencyKey);
      if (existingSessionId) {
        const existing = this.sessions.get(existingSessionId);
        if (existing) {
          logger.info({ sessionId: existingSessionId }, 'Returning existing session (idempotent)');
          return existing;
        }
      }
    }

    const session = this.orchestrationService.createSession(input);

    this.sessions.set(session.id, session);
    this.sessionsByCorrelation.set(session.correlationId, session.id);

    if (input.idempotencyKey) {
      this.idempotencyKeys.set(input.idempotencyKey, session.id);
    }

    logger.info({ sessionId: session.id }, 'Created orchestration session');
    return session;
  }

  async getSession(sessionId: string): Promise<OrchestrationSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getSessionByCorrelationId(correlationId: string): Promise<OrchestrationSession | null> {
    const sessionId = this.sessionsByCorrelation.get(correlationId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  async updateSessionStatus(
    sessionId: string,
    status: OrchestrationStatus,
    summary?: string
  ): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      status,
      summary: summary ?? session.summary,
      updatedAt: now,
      completedAt: ['COMPLETED', 'APPROVED', 'FAILED', 'CANCELLED'].includes(status)
        ? now
        : session.completedAt,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: 'system',
          action: 'STATUS_CHANGED',
          fromStatus: session.status,
          toStatus: status,
          details: summary,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, status }, 'Updated session status');
    return updatedSession;
  }

  async findSessions(filter: {
    status?: OrchestrationStatus | OrchestrationStatus[];
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    createdAfter?: Date;
    createdBefore?: Date;
    initiatedBy?: string;
    correlationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<OrchestrationSession[]> {
    let sessions = Array.from(this.sessions.values());

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      sessions = sessions.filter((s) => statuses.includes(s.status));
    }

    if (filter.priority) {
      sessions = sessions.filter((s) => s.priority === filter.priority);
    }

    if (filter.createdAfter) {
      sessions = sessions.filter((s) => new Date(s.createdAt) >= filter.createdAfter!);
    }

    if (filter.createdBefore) {
      sessions = sessions.filter((s) => new Date(s.createdAt) <= filter.createdBefore!);
    }

    if (filter.correlationId) {
      sessions = sessions.filter((s) => s.correlationId === filter.correlationId);
    }

    // Sort by created date descending
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;

    return sessions.slice(offset, offset + limit);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessionsByCorrelation.delete(session.correlationId);
      this.sessions.delete(sessionId);
      logger.info({ sessionId }, 'Deleted session');
    }
  }

  // ============================================================================
  // Directive Operations
  // ============================================================================

  async saveDirectives(
    sessionId: string,
    directives: AgentDirective[]
  ): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      directives: [...session.directives, ...directives],
      status: 'DISPATCHING',
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: 'system',
          action: 'DIRECTIVES_CREATED',
          details: `Created ${directives.length} directives`,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, directiveCount: directives.length }, 'Saved directives');
    return updatedSession;
  }

  async getDirectives(sessionId: string): Promise<AgentDirective[]> {
    const session = this.sessions.get(sessionId);
    return session?.directives ?? [];
  }

  async getDirective(directiveId: string): Promise<AgentDirective | null> {
    for (const session of this.sessions.values()) {
      const directive = session.directives.find((d) => d.id === directiveId);
      if (directive) return directive;
    }
    return null;
  }

  // ============================================================================
  // Report Operations
  // ============================================================================

  async saveReport(sessionId: string, report: AgentReport): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      reports: [...session.reports, report],
      status: 'IN_PROGRESS',
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: report.agent,
          action: 'REPORT_RECEIVED',
          details: `Agent ${report.agent} reported: ${report.status}`,
        },
      ],
    };

    // Check if all agents have reported
    const allReported = updatedSession.directives.every((d) =>
      updatedSession.reports.some((r) => r.directiveId === d.id)
    );

    if (allReported) {
      updatedSession.status = 'VALIDATING';
    }

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, agent: report.agent, status: report.status }, 'Saved report');
    return updatedSession;
  }

  async getReports(sessionId: string): Promise<AgentReport[]> {
    const session = this.sessions.get(sessionId);
    return session?.reports ?? [];
  }

  async getReportsByAgent(sessionId: string, agent: AgentCodename): Promise<AgentReport[]> {
    const session = this.sessions.get(sessionId);
    return session?.reports.filter((r) => r.agent === agent) ?? [];
  }

  // ============================================================================
  // Quality Gate Operations
  // ============================================================================

  async saveQualityGateResult(
    sessionId: string,
    result: QualityGateResult
  ): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      qualityGates: [...session.qualityGates, result],
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: result.checkedBy,
          action: `QUALITY_GATE_${result.status}`,
          details: `Gate ${result.gate}: ${result.status}`,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, gate: result.gate, status: result.status }, 'Saved quality gate');
    return updatedSession;
  }

  async getQualityGateResults(sessionId: string): Promise<QualityGateResult[]> {
    const session = this.sessions.get(sessionId);
    return session?.qualityGates ?? [];
  }

  // ============================================================================
  // Conflict Operations
  // ============================================================================

  async saveConflict(
    sessionId: string,
    conflict: ConflictResolution
  ): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      conflicts: [...session.conflicts, conflict],
      status: 'RESOLVING_CONFLICTS',
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: conflict.detectedBy,
          action: 'CONFLICT_DETECTED',
          details: `${conflict.type}: ${conflict.description}`,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, conflictType: conflict.type }, 'Saved conflict');
    return updatedSession;
  }

  async resolveConflict(
    sessionId: string,
    conflictId: string,
    resolution: string
  ): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedConflicts = session.conflicts.map((c) =>
      c.id === conflictId ? { ...c, resolvedAt: now, resolution } : c
    );

    const unresolvedCount = updatedConflicts.filter((c) => !c.resolvedAt).length;

    const updatedSession: OrchestrationSession = {
      ...session,
      conflicts: updatedConflicts,
      status: unresolvedCount === 0 ? 'IN_PROGRESS' : 'RESOLVING_CONFLICTS',
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: 'system',
          action: 'CONFLICT_RESOLVED',
          details: resolution,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, conflictId }, 'Resolved conflict');
    return updatedSession;
  }

  async getUnresolvedConflicts(sessionId: string): Promise<ConflictResolution[]> {
    const session = this.sessions.get(sessionId);
    return session?.conflicts.filter((c) => !c.resolvedAt) ?? [];
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  async generateReport(sessionId: string): Promise<OrchestrationReport | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return this.orchestrationService.generateReport(session);
  }

  // ============================================================================
  // Analysis Operations
  // ============================================================================

  async saveAnalysis(sessionId: string, analysis: TaskAnalysis): Promise<OrchestrationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const updatedSession: OrchestrationSession = {
      ...session,
      analysis,
      status: 'ANALYZED',
      updatedAt: now,
      auditTrail: [
        ...session.auditTrail,
        {
          timestamp: now,
          actor: 'system',
          action: 'TASK_ANALYZED',
          details: `Complexity: ${analysis.complexity}, Agents: ${analysis.requiredAgents.join(', ')}`,
        },
      ],
    };

    this.sessions.set(sessionId, updatedSession);
    logger.info({ sessionId, complexity: analysis.complexity }, 'Saved analysis');
    return updatedSession;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats(since?: Date): Promise<{
    total: number;
    byStatus: Record<OrchestrationStatus, number>;
    active: number;
    completed: number;
    failed: number;
    avgDurationMs: number;
    avgGatePassRate: number;
  }> {
    let sessions = Array.from(this.sessions.values());

    if (since) {
      sessions = sessions.filter((s) => new Date(s.createdAt) >= since);
    }

    const byStatus: Record<string, number> = {};
    const activeStatuses = ['ANALYZING', 'DISPATCHING', 'IN_PROGRESS', 'VALIDATING'];
    let active = 0;
    let completed = 0;
    let failed = 0;
    let totalDuration = 0;
    let completedCount = 0;
    let totalGatePassRate = 0;
    let sessionsWithGates = 0;

    for (const session of sessions) {
      byStatus[session.status] = (byStatus[session.status] ?? 0) + 1;

      if (activeStatuses.includes(session.status)) {
        active++;
      }

      if (session.status === 'COMPLETED' || session.status === 'APPROVED') {
        completed++;
        if (session.completedAt) {
          totalDuration +=
            new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime();
          completedCount++;
        }
      }

      if (session.status === 'FAILED') {
        failed++;
      }

      if (session.qualityGates.length > 0) {
        const passed = session.qualityGates.filter((g) => g.status === 'PASSED').length;
        totalGatePassRate += passed / session.qualityGates.length;
        sessionsWithGates++;
      }
    }

    return {
      total: sessions.length,
      byStatus: byStatus as Record<OrchestrationStatus, number>,
      active,
      completed,
      failed,
      avgDurationMs: completedCount > 0 ? totalDuration / completedCount : 0,
      avgGatePassRate: sessionsWithGates > 0 ? totalGatePassRate / sessionsWithGates : 0,
    };
  }

  // ============================================================================
  // Idempotency
  // ============================================================================

  async isIdempotencyKeyUsed(key: string): Promise<boolean> {
    return this.idempotencyKeys.has(key);
  }

  async markIdempotencyKeyUsed(key: string, sessionId: string): Promise<void> {
    this.idempotencyKeys.set(key, sessionId);
  }

  // ============================================================================
  // Cleanup (for testing)
  // ============================================================================

  clear(): void {
    this.sessions.clear();
    this.sessionsByCorrelation.clear();
    this.idempotencyKeys.clear();
    logger.info('Cleared all sessions');
  }
}

/**
 * Factory function to create an in-memory orchestration repository
 */
export function createInMemoryOrchestrationRepository(): InMemoryOrchestrationRepository {
  return new InMemoryOrchestrationRepository();
}

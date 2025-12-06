/**
 * @fileoverview Supervisor State Repository
 *
 * H3 Production Fix: Provides database persistence for SupervisorAgent state.
 * Ensures call monitoring state survives server restarts.
 *
 * @module domain/voice/supervisor-state-repository
 */

import type { Pool, PoolClient } from 'pg';
import type {
  MonitoredCall,
  SupervisorSession,
  SupervisorRole,
  SupervisorPermission,
  HandoffRequest,
  SupervisorNote,
  SupervisorDashboardStats,
} from '@medicalcor/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Escalation history entry
 */
export interface EscalationHistoryEntry {
  id: string;
  callSid: string;
  clinicId: string;
  reason: string;
  escalationType: 'keyword' | 'sentiment' | 'hold_time' | 'silence' | 'manual' | 'ai_request';
  timestamp: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionAction?: string;
}

/**
 * Handoff history entry
 */
export interface HandoffHistoryEntry {
  id: string;
  callSid: string;
  clinicId: string;
  handoffId: string;
  reason?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  skillRequired?: string;
  context: Record<string, unknown>;
  requestedAt: Date;
  completedAt?: Date;
  agentId?: string;
  agentName?: string;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for supervisor state persistence
 */
export interface ISupervisorStateRepository {
  // Call operations
  saveCall(clinicId: string, call: MonitoredCall): Promise<void>;
  getCall(callSid: string): Promise<MonitoredCall | null>;
  updateCall(callSid: string, updates: Partial<MonitoredCall>): Promise<void>;
  deleteCall(callSid: string): Promise<void>;
  getActiveCalls(clinicId?: string): Promise<MonitoredCall[]>;
  getCallsByFlag(flag: string, clinicId?: string): Promise<MonitoredCall[]>;

  // Session operations
  saveSession(clinicId: string, session: SupervisorSession): Promise<void>;
  getSession(sessionId: string): Promise<SupervisorSession | null>;
  updateSession(sessionId: string, updates: Partial<SupervisorSession>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  getActiveSessions(clinicId?: string): Promise<SupervisorSession[]>;

  // Notes operations
  saveNote(note: SupervisorNote): Promise<void>;
  getNotes(callSid: string, supervisorId?: string): Promise<SupervisorNote[]>;

  // History operations
  recordEscalation(entry: Omit<EscalationHistoryEntry, 'id'>): Promise<void>;
  recordHandoff(request: HandoffRequest, clinicId: string): Promise<string>;
  completeHandoff(callSid: string, agentId: string, agentName?: string): Promise<void>;
  getEscalationsToday(clinicId: string): Promise<EscalationHistoryEntry[]>;
  getHandoffsToday(clinicId: string): Promise<number>;

  // Dashboard operations
  getDashboardStats(clinicId: string): Promise<SupervisorDashboardStats>;

  // Cleanup
  cleanupExpiredSessions(): Promise<number>;
  cleanupCompletedCalls(retentionHours?: number): Promise<number>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the supervisor state repository
 */
export class PostgresSupervisorStateRepository implements ISupervisorStateRepository {
  constructor(private readonly pool: Pool) {}

  // ============================================================================
  // CALL OPERATIONS
  // ============================================================================

  async saveCall(clinicId: string, call: MonitoredCall): Promise<void> {
    await this.pool.query(
      `INSERT INTO supervisor_monitored_calls (
        call_sid, clinic_id, phone_number, lead_id, contact_name,
        state, direction, duration, assistant_id, agent_id,
        started_at, answered_at, hold_started_at,
        sentiment, ai_score, flags, recent_transcript, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (call_sid) DO UPDATE SET
        state = EXCLUDED.state,
        duration = EXCLUDED.duration,
        assistant_id = EXCLUDED.assistant_id,
        agent_id = EXCLUDED.agent_id,
        answered_at = EXCLUDED.answered_at,
        hold_started_at = EXCLUDED.hold_started_at,
        sentiment = EXCLUDED.sentiment,
        ai_score = EXCLUDED.ai_score,
        flags = EXCLUDED.flags,
        recent_transcript = EXCLUDED.recent_transcript,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()`,
      [
        call.callSid,
        clinicId,
        call.phoneNumber ?? call.customerPhone ?? null,
        call.leadId ?? null,
        call.contactName ?? null,
        call.state,
        call.direction,
        call.duration ?? 0,
        call.assistantId ?? null,
        call.agentId ?? null,
        call.startedAt,
        call.answeredAt ?? null,
        call.holdStartedAt ?? null,
        call.sentiment ?? null,
        call.aiScore ?? null,
        call.flags,
        JSON.stringify(call.recentTranscript),
        call.metadata ?? {},
      ]
    );
  }

  async getCall(callSid: string): Promise<MonitoredCall | null> {
    const result = await this.pool.query(
      `SELECT * FROM supervisor_monitored_calls WHERE call_sid = $1`,
      [callSid]
    );

    if (result.rows.length === 0) return null;
    return this.rowToMonitoredCall(result.rows[0]);
  }

  async updateCall(callSid: string, updates: Partial<MonitoredCall>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      state: 'state',
      assistantId: 'assistant_id',
      agentId: 'agent_id',
      answeredAt: 'answered_at',
      holdStartedAt: 'hold_started_at',
      sentiment: 'sentiment',
      aiScore: 'ai_score',
      flags: 'flags',
      recentTranscript: 'recent_transcript',
      metadata: 'metadata',
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key];
      if (dbField && value !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        if (key === 'recentTranscript') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push('updated_at = NOW()');
    values.push(callSid);

    await this.pool.query(
      `UPDATE supervisor_monitored_calls SET ${setClauses.join(', ')} WHERE call_sid = $${paramIndex}`,
      values
    );
  }

  async deleteCall(callSid: string): Promise<void> {
    // Soft delete by setting state to completed
    await this.pool.query(
      `UPDATE supervisor_monitored_calls SET state = 'completed', updated_at = NOW() WHERE call_sid = $1`,
      [callSid]
    );
  }

  async getActiveCalls(clinicId?: string): Promise<MonitoredCall[]> {
    let query = `SELECT * FROM supervisor_monitored_calls WHERE state != 'completed'`;
    const params: unknown[] = [];

    if (clinicId) {
      query += ` AND clinic_id = $1`;
      params.push(clinicId);
    }

    query += ` ORDER BY started_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToMonitoredCall(row));
  }

  async getCallsByFlag(flag: string, clinicId?: string): Promise<MonitoredCall[]> {
    let query = `SELECT * FROM supervisor_monitored_calls WHERE $1 = ANY(flags) AND state != 'completed'`;
    const params: unknown[] = [flag];

    if (clinicId) {
      query += ` AND clinic_id = $2`;
      params.push(clinicId);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToMonitoredCall(row));
  }

  // ============================================================================
  // SESSION OPERATIONS
  // ============================================================================

  async saveSession(clinicId: string, session: SupervisorSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO supervisor_sessions (
        session_id, clinic_id, supervisor_id, supervisor_name, role,
        permissions, monitoring_mode, active_call_sid,
        calls_monitored, interventions, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (session_id) DO UPDATE SET
        monitoring_mode = EXCLUDED.monitoring_mode,
        active_call_sid = EXCLUDED.active_call_sid,
        calls_monitored = EXCLUDED.calls_monitored,
        interventions = EXCLUDED.interventions,
        last_activity_at = NOW(),
        updated_at = NOW()`,
      [
        session.sessionId,
        clinicId,
        session.supervisorId,
        session.supervisorName,
        session.role,
        session.permissions,
        session.monitoringMode,
        session.activeCallSid ?? null,
        session.callsMonitored,
        session.interventions,
        session.startedAt,
      ]
    );
  }

  async getSession(sessionId: string): Promise<SupervisorSession | null> {
    const result = await this.pool.query(
      `SELECT * FROM supervisor_sessions WHERE session_id = $1 AND expires_at > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToSupervisorSession(result.rows[0]);
  }

  async updateSession(sessionId: string, updates: Partial<SupervisorSession>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      monitoringMode: 'monitoring_mode',
      activeCallSid: 'active_call_sid',
      callsMonitored: 'calls_monitored',
      interventions: 'interventions',
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMap[key];
      if (dbField && value !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push('last_activity_at = NOW()', 'updated_at = NOW()');
    values.push(sessionId);

    await this.pool.query(
      `UPDATE supervisor_sessions SET ${setClauses.join(', ')} WHERE session_id = $${paramIndex}`,
      values
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query(`DELETE FROM supervisor_sessions WHERE session_id = $1`, [sessionId]);
  }

  async getActiveSessions(clinicId?: string): Promise<SupervisorSession[]> {
    let query = `SELECT * FROM supervisor_sessions WHERE expires_at > NOW()`;
    const params: unknown[] = [];

    if (clinicId) {
      query += ` AND clinic_id = $1`;
      params.push(clinicId);
    }

    query += ` ORDER BY started_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToSupervisorSession(row));
  }

  // ============================================================================
  // NOTES OPERATIONS
  // ============================================================================

  async saveNote(note: SupervisorNote): Promise<void> {
    await this.pool.query(
      `INSERT INTO supervisor_notes (call_sid, supervisor_id, supervisor_name, content, is_private, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        note.callSid,
        note.supervisorId,
        note.supervisorName ?? null,
        note.content ?? note.note,
        note.isPrivate ?? false,
        note.timestamp,
      ]
    );
  }

  async getNotes(callSid: string, supervisorId?: string): Promise<SupervisorNote[]> {
    let query = `SELECT * FROM supervisor_notes WHERE call_sid = $1`;
    const params: unknown[] = [callSid];

    if (supervisorId) {
      query += ` AND (supervisor_id = $2 OR is_private = false)`;
      params.push(supervisorId);
    }

    query += ` ORDER BY timestamp DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToSupervisorNote(row));
  }

  // ============================================================================
  // HISTORY OPERATIONS
  // ============================================================================

  async recordEscalation(entry: Omit<EscalationHistoryEntry, 'id'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO supervisor_escalation_history (call_sid, clinic_id, reason, escalation_type, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.callSid, entry.clinicId, entry.reason, entry.escalationType, entry.timestamp]
    );
  }

  async recordHandoff(request: HandoffRequest, clinicId: string): Promise<string> {
    const handoffId = `hoff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await this.pool.query(
      `INSERT INTO supervisor_handoff_history (
        call_sid, clinic_id, handoff_id, reason, priority, skill_required, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        request.callSid,
        clinicId,
        handoffId,
        request.reason ?? null,
        request.priority ?? 'normal',
        request.skillRequired ?? null,
        request.context ?? {},
      ]
    );

    return handoffId;
  }

  async completeHandoff(callSid: string, agentId: string, agentName?: string): Promise<void> {
    await this.pool.query(
      `UPDATE supervisor_handoff_history
       SET completed_at = NOW(), agent_id = $2, agent_name = $3
       WHERE call_sid = $1 AND completed_at IS NULL`,
      [callSid, agentId, agentName ?? null]
    );
  }

  async getEscalationsToday(clinicId: string): Promise<EscalationHistoryEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM supervisor_escalation_history
       WHERE clinic_id = $1 AND timestamp >= DATE_TRUNC('day', NOW())
       ORDER BY timestamp DESC`,
      [clinicId]
    );

    return result.rows.map((row) => this.rowToEscalationEntry(row));
  }

  async getHandoffsToday(clinicId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM supervisor_handoff_history
       WHERE clinic_id = $1 AND completed_at IS NOT NULL
       AND requested_at >= DATE_TRUNC('day', NOW())`,
      [clinicId]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  // ============================================================================
  // DASHBOARD OPERATIONS
  // ============================================================================

  async getDashboardStats(clinicId: string): Promise<SupervisorDashboardStats> {
    const calls = await this.getActiveCalls(clinicId);
    const escalationsToday = await this.getEscalationsToday(clinicId);
    const handoffsToday = await this.getHandoffsToday(clinicId);

    const activeEscalations = calls.filter((c) => c.flags.includes('escalation-requested'));
    const aiHandoffs = calls.filter((c) => c.flags.includes('ai-handoff-needed'));
    const callsWithFlags = calls.filter((c) => c.flags.length > 0);

    return {
      activeCalls: calls.length,
      callsInQueue: calls.filter((c) => c.state === 'ringing').length,
      averageWaitTime: 0, // Would need historical calculation
      agentsAvailable: 0, // Would need agent status tracking
      agentsBusy: 0,
      agentsOnBreak: 0,
      agentsOffline: 0,
      aiHandledCalls: calls.filter((c) => c.assistantId && !c.agentId).length,
      aiHandoffRate: 0,
      averageAiConfidence: 0,
      activeAlerts: activeEscalations.length + aiHandoffs.length + callsWithFlags.length,
      escalationsToday: escalationsToday.length,
      handoffsToday,
      callsHandledToday: 0, // Would need historical calculation
      averageHandleTime: 0, // Would need historical calculation
      serviceLevelPercent: 100, // Would need SLA configuration
      abandonedCalls: 0, // Would need tracking of abandoned calls
      lastUpdated: new Date(),
    };
  }

  // ============================================================================
  // CLEANUP OPERATIONS
  // ============================================================================

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM supervisor_sessions WHERE expires_at < NOW() RETURNING session_id`
    );
    return result.rowCount ?? 0;
  }

  async cleanupCompletedCalls(retentionHours = 24): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM supervisor_monitored_calls
       WHERE state = 'completed'
       AND updated_at < NOW() - ($1 || ' hours')::INTERVAL
       RETURNING call_sid`,
      [retentionHours]
    );
    return result.rowCount ?? 0;
  }

  // ============================================================================
  // ROW MAPPERS
  // ============================================================================

  private rowToMonitoredCall(row: Record<string, unknown>): MonitoredCall {
    const transcript = row.recent_transcript;
    const parsedTranscript = typeof transcript === 'string'
      ? JSON.parse(transcript)
      : transcript ?? [];

    // Get flags and ensure they match the expected enum values
    const rawFlags = (row.flags as string[]) ?? [];
    const validFlags = rawFlags.filter((f): f is MonitoredCall['flags'][number] =>
      ['escalation-requested', 'high-value-lead', 'complaint', 'long-hold', 'silence-detected', 'ai-handoff-needed'].includes(f)
    );

    return {
      callSid: row.call_sid as string,
      customerPhone: (row.phone_number ?? row.customer_phone ?? '') as string,
      phoneNumber: row.phone_number as string | undefined,
      leadId: row.lead_id as string | undefined,
      contactName: row.contact_name as string | undefined,
      state: row.state as MonitoredCall['state'],
      direction: row.direction as MonitoredCall['direction'],
      duration: (row.duration as number) ?? 0,
      assistantId: row.assistant_id as string | undefined,
      agentId: row.agent_id as string | undefined,
      startedAt: new Date(row.started_at as string),
      answeredAt: row.answered_at ? new Date(row.answered_at as string) : undefined,
      holdStartedAt: row.hold_started_at ? new Date(row.hold_started_at as string) : undefined,
      sentiment: row.sentiment as MonitoredCall['sentiment'],
      aiScore: row.ai_score as number | undefined,
      flags: validFlags,
      recentTranscript: parsedTranscript,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  private rowToSupervisorSession(row: Record<string, unknown>): SupervisorSession {
    return {
      sessionId: row.session_id as string,
      supervisorId: row.supervisor_id as string,
      supervisorName: row.supervisor_name as string,
      role: row.role as SupervisorRole,
      permissions: (row.permissions as SupervisorPermission[]) ?? [],
      monitoringMode: row.monitoring_mode as SupervisorSession['monitoringMode'],
      activeCallSid: row.active_call_sid as string | undefined,
      callsMonitored: row.calls_monitored as number,
      interventions: row.interventions as number,
      startedAt: new Date(row.started_at as string),
    };
  }

  private rowToSupervisorNote(row: Record<string, unknown>): SupervisorNote {
    return {
      callSid: row.call_sid as string,
      supervisorId: row.supervisor_id as string,
      supervisorName: row.supervisor_name as string | undefined,
      note: row.content as string,
      content: row.content as string | undefined,
      isPrivate: row.is_private as boolean,
      timestamp: new Date(row.timestamp as string),
    };
  }

  private rowToEscalationEntry(row: Record<string, unknown>): EscalationHistoryEntry {
    return {
      id: row.id as string,
      callSid: row.call_sid as string,
      clinicId: row.clinic_id as string,
      reason: row.reason as string,
      escalationType: row.escalation_type as EscalationHistoryEntry['escalationType'],
      timestamp: new Date(row.timestamp as string),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
      resolvedBy: row.resolved_by as string | undefined,
      resolutionAction: row.resolution_action as string | undefined,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a PostgreSQL supervisor state repository
 */
export function createSupervisorStateRepository(pool: Pool): ISupervisorStateRepository {
  return new PostgresSupervisorStateRepository(pool);
}

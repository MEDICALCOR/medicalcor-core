/**
 * @fileoverview PostgreSQL Agent Performance Repository (Infrastructure Layer)
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 * Provides PostgreSQL implementation of the agent performance repository interface.
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the IAgentPerformanceRepository port
 * defined in the domain layer. The domain depends only on the interface.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-agent-performance-repository
 */

import type { Pool } from 'pg';
import type {
  Agent,
  AgentSession,
  AgentDailyMetrics,
  AgentPerformanceSummary,
  AgentTrendPoint,
  AgentDashboardMetrics,
  AgentPerformanceDashboardData,
  AgentPerformanceTimeRange,
  AgentAvailability,
} from '@medicalcor/types';
import type { IAgentPerformanceRepository, GetAgentsOptions } from '@medicalcor/domain';

// ============================================================================
// CONSTANTS
// ============================================================================

const TIME_RANGE_DAYS: Record<AgentPerformanceTimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface AgentRow {
  id: string;
  clinic_id: string;
  user_id: string | null;
  external_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  agent_type: string;
  role: string;
  skills: string[];
  languages: string[];
  max_concurrent_chats: number;
  status: string;
  available: boolean;
  hired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AgentSessionRow {
  id: string;
  agent_id: string;
  clinic_id: string;
  started_at: Date;
  ended_at: Date | null;
  status: string;
  leads_handled: number;
  calls_handled: number;
  messages_sent: number;
  avg_response_time_ms: number | null;
  total_break_seconds: number;
}

interface AgentDailyMetricsRow {
  id: string;
  agent_id: string;
  clinic_id: string;
  metric_date: Date;
  leads_assigned: number;
  leads_handled: number;
  leads_converted: number;
  leads_lost: number;
  calls_inbound: number;
  calls_outbound: number;
  calls_answered: number;
  calls_missed: number;
  total_talk_time_seconds: number;
  avg_call_duration_seconds: number;
  messages_sent: number;
  messages_received: number;
  avg_response_time_ms: number;
  min_response_time_ms: number | null;
  max_response_time_ms: number | null;
  first_response_time_ms: number | null;
  appointments_scheduled: number;
  appointments_completed: number;
  appointments_cancelled: number;
  escalations: number;
  handoffs_received: number;
  handoffs_given: number;
  csat_responses: number;
  csat_total_score: number;
  nps_promoters: number;
  nps_detractors: number;
  nps_passives: number;
  revenue_generated: number;
  time_logged_seconds: number;
  time_on_break_seconds: number;
  time_in_calls_seconds: number;
  wrap_up_time_seconds: number;
  wrap_up_count: number;
  avg_wrap_up_time_seconds: number;
  min_wrap_up_time_seconds: number | null;
  max_wrap_up_time_seconds: number | null;
}

interface PerformanceSummaryRow {
  id: string;
  name: string;
  avatar_url: string | null;
  agent_type: string;
  role: string;
  current_status: string;
  leads_handled: number;
  conversions: number;
  conversion_rate: string;
  avg_response_time: string;
  satisfaction: string;
  total_calls: number;
  talk_time_hours: string;
  revenue: string;
  active_leads: number;
}

interface AgentTrendRow {
  date: string;
  leads_handled: number;
  conversions: number;
  conversion_rate: string;
  avg_response_time_min: string;
  satisfaction: string | null;
  revenue: string;
}

interface DashboardMetricsRow {
  total_agents: string;
  active_agents: string;
  total_leads: string;
  avg_conversion_rate: string;
  avg_response_time: string;
  avg_satisfaction: string;
  total_revenue: string;
}

interface PerformanceOverTimeRow {
  date: string;
  avg_conversion_rate: string;
  avg_response_time: string;
  total_leads: string;
}

interface AgentStatusRow {
  status: string;
}

interface CountRow {
  count: string;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the agent performance repository
 */
export class PostgresAgentPerformanceRepository implements IAgentPerformanceRepository {
  constructor(private readonly pool: Pool) {}

  // ============================================================================
  // AGENT OPERATIONS
  // ============================================================================

  async getAgent(agentId: string): Promise<Agent | null> {
    const result = await this.pool.query<AgentRow>(
      `SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToAgent(result.rows[0]!);
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToAgent(row);
  }

  async getAgents(clinicId: string, options: GetAgentsOptions = {}): Promise<Agent[]> {
    const conditions = ['clinic_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [clinicId];
    let paramIndex = 2;

    if (options.agentType) {
      conditions.push(`agent_type = $${paramIndex++}`);
      params.push(options.agentType);
    }

    if (options.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(options.status);
    }

    let query = `SELECT * FROM agents WHERE ${conditions.join(' AND ')} ORDER BY name ASC`;

    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await this.pool.query<AgentRow>(query, params);
    return result.rows.map((row) => this.rowToAgent(row));
  }

  async createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO agents (
        clinic_id, user_id, external_id, name, email, phone, avatar_url,
        agent_type, role, skills, languages, max_concurrent_chats,
        status, available, working_hours, hired_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        agent.clinicId,
        agent.userId ?? null,
        agent.externalId ?? null,
        agent.name,
        agent.email ?? null,
        agent.phone ?? null,
        agent.avatarUrl ?? null,
        agent.agentType,
        agent.role,
        agent.skills,
        agent.languages,
        agent.maxConcurrentChats,
        agent.status,
        agent.available,
        '{}',
        agent.hiredAt ?? null,
      ]
    );

    // INSERT RETURNING always returns the inserted row
    return this.rowToAgent(result.rows[0]!);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create agent');
      throw new Error('Failed to create agent: no row returned');
    }
    return this.rowToAgent(row);
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Partial<Record<string, string>> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      avatarUrl: 'avatar_url',
      agentType: 'agent_type',
      role: 'role',
      skills: 'skills',
      languages: 'languages',
      maxConcurrentChats: 'max_concurrent_chats',
      status: 'status',
      available: 'available',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (key in fieldMap) {
        const dbField = fieldMap[key];
        setClauses.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    values.push(agentId);

    await this.pool.query(
      `UPDATE agents SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );
  }

  // ============================================================================
  // SESSION OPERATIONS
  // ============================================================================

  async getActiveSession(agentId: string): Promise<AgentSession | null> {
    const result = await this.pool.query<AgentSessionRow>(
      `SELECT * FROM agent_sessions WHERE agent_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToAgentSession(result.rows[0]!);
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToAgentSession(row);
  }

  async startSession(session: Omit<AgentSession, 'id'>): Promise<AgentSession> {
    const result = await this.pool.query<AgentSessionRow>(
      `INSERT INTO agent_sessions (agent_id, clinic_id, started_at, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [session.agentId, session.clinicId, session.startedAt, session.status]
    );

    // INSERT RETURNING always returns the inserted row
    return this.rowToAgentSession(result.rows[0]!);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create agent session');
      throw new Error('Failed to start session: no row returned');
    }
    return this.rowToAgentSession(row);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE agent_sessions SET ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  async updateSessionMetrics(
    sessionId: string,
    metrics: Pick<
      AgentSession,
      'leadsHandled' | 'callsHandled' | 'messagesSent' | 'avgResponseTimeMs'
    >
  ): Promise<void> {
    await this.pool.query(
      `UPDATE agent_sessions SET
         leads_handled = $2,
         calls_handled = $3,
         messages_sent = $4,
         avg_response_time_ms = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [
        sessionId,
        metrics.leadsHandled,
        metrics.callsHandled,
        metrics.messagesSent,
        metrics.avgResponseTimeMs,
      ]
    );
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  async getDailyMetrics(agentId: string, date: Date): Promise<AgentDailyMetrics | null> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.pool.query<AgentDailyMetricsRow>(
      `SELECT * FROM agent_performance_daily WHERE agent_id = $1 AND metric_date = $2`,
      [agentId, dateStr]
    );

    if (result.rows.length === 0) return null;
    return this.rowToDailyMetrics(result.rows[0]!);
    const row = result.rows[0];
    if (!row) return null;
    return this.rowToDailyMetrics(row);
  }

  async incrementMetric(
    agentId: string,
    clinicId: string,
    metric: keyof AgentDailyMetrics,
    value = 1
  ): Promise<void> {
    const dateStr = new Date().toISOString().split('T')[0];

    // Map camelCase to snake_case
    const fieldMap: Record<string, string> = {
      leadsAssigned: 'leads_assigned',
      leadsHandled: 'leads_handled',
      leadsConverted: 'leads_converted',
      leadsLost: 'leads_lost',
      callsInbound: 'calls_inbound',
      callsOutbound: 'calls_outbound',
      callsAnswered: 'calls_answered',
      callsMissed: 'calls_missed',
      messagesSent: 'messages_sent',
      messagesReceived: 'messages_received',
      appointmentsScheduled: 'appointments_scheduled',
      appointmentsCompleted: 'appointments_completed',
      appointmentsCancelled: 'appointments_cancelled',
      escalations: 'escalations',
      handoffsReceived: 'handoffs_received',
      handoffsGiven: 'handoffs_given',
      csatResponses: 'csat_responses',
      csatTotalScore: 'csat_total_score',
      npsPromoters: 'nps_promoters',
      npsDetractors: 'nps_detractors',
      npsPassives: 'nps_passives',
    };

    const dbField = fieldMap[metric];
    if (!dbField) return;

    await this.pool.query(
      `INSERT INTO agent_performance_daily (agent_id, clinic_id, metric_date, ${dbField})
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, metric_date) DO UPDATE
       SET ${dbField} = agent_performance_daily.${dbField} + $4, updated_at = NOW()`,
      [agentId, clinicId, dateStr, value]
    );
  }

  async updateDailyMetrics(
    agentId: string,
    clinicId: string,
    date: Date,
    metrics: Partial<AgentDailyMetrics>
  ): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const setClauses: string[] = [];
    const values: unknown[] = [agentId, clinicId, dateStr];
    let paramIndex = 4;

    const fieldMap: Partial<Record<string, string>> = {
      avgResponseTimeMs: 'avg_response_time_ms',
      minResponseTimeMs: 'min_response_time_ms',
      maxResponseTimeMs: 'max_response_time_ms',
      firstResponseTimeMs: 'first_response_time_ms',
      totalTalkTimeSeconds: 'total_talk_time_seconds',
      avgCallDurationSeconds: 'avg_call_duration_seconds',
      revenueGenerated: 'revenue_generated',
      timeLoggedSeconds: 'time_logged_seconds',
      timeOnBreakSeconds: 'time_on_break_seconds',
      timeInCallsSeconds: 'time_in_calls_seconds',
    };

    for (const [key, value] of Object.entries(metrics)) {
      if (key in fieldMap) {
        const dbField = fieldMap[key];
        setClauses.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    await this.pool.query(
      `INSERT INTO agent_performance_daily (agent_id, clinic_id, metric_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, metric_date) DO UPDATE
       SET ${setClauses.join(', ')}, updated_at = NOW()`,
      values
    );
  }

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  async getPerformanceSummary(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceSummary[]> {
    const days = TIME_RANGE_DAYS[timeRange];

    const result = await this.pool.query<PerformanceSummaryRow>(
      `SELECT
        a.id,
        a.name,
        a.avatar_url,
        a.agent_type,
        a.role,
        COALESCE(s.status, 'offline') AS current_status,
        COALESCE(SUM(p.leads_handled), 0)::INTEGER AS leads_handled,
        COALESCE(SUM(p.leads_converted), 0)::INTEGER AS conversions,
        CASE
          WHEN SUM(p.leads_handled) > 0
          THEN ROUND((SUM(p.leads_converted)::DECIMAL / SUM(p.leads_handled)) * 100, 1)
          ELSE 0
        END AS conversion_rate,
        CASE
          WHEN SUM(p.leads_handled) > 0
          THEN ROUND(AVG(p.avg_response_time_ms) / 60000.0, 1)
          ELSE 0
        END AS avg_response_time,
        CASE
          WHEN SUM(p.csat_responses) > 0
          THEN ROUND(SUM(p.csat_total_score)::DECIMAL / SUM(p.csat_responses), 1)
          ELSE 0
        END AS satisfaction,
        COALESCE(SUM(p.calls_answered), 0)::INTEGER AS total_calls,
        COALESCE(SUM(p.total_talk_time_seconds) / 3600.0, 0) AS talk_time_hours,
        COALESCE(SUM(p.revenue_generated), 0) AS revenue,
        (
          SELECT COUNT(*)::INTEGER
          FROM agent_lead_assignments ala
          WHERE ala.agent_id = a.id AND ala.unassigned_at IS NULL
        ) AS active_leads
      FROM agents a
      LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
        AND p.metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      LEFT JOIN agent_sessions s ON s.agent_id = a.id AND s.ended_at IS NULL
      WHERE a.clinic_id = $1
        AND a.deleted_at IS NULL
        AND a.status = 'active'
      GROUP BY a.id, a.name, a.avatar_url, a.agent_type, a.role, s.status
      ORDER BY leads_handled DESC`,
      [clinicId, days]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      agentType: row.agent_type as 'human' | 'ai' | 'hybrid',
      role: row.role as 'agent' | 'senior_agent' | 'team_lead' | 'supervisor' | 'manager',
      status: row.current_status as
        | 'available'
        | 'busy'
        | 'away'
        | 'break'
        | 'training'
        | 'offline'
        | undefined,
      avatarUrl: row.avatar_url,
      agentType: row.agent_type as AgentPerformanceSummary['agentType'],
      role: row.role as AgentPerformanceSummary['role'],
      status: row.current_status as AgentPerformanceSummary['status'],
      leadsHandled: row.leads_handled,
      conversions: row.conversions,
      conversionRate: Number(row.conversion_rate),
      avgResponseTime: Number(row.avg_response_time),
      satisfaction: Number(row.satisfaction),
      totalCalls: row.total_calls,
      talkTimeHours: Number(row.talk_time_hours),
      revenue: Number(row.revenue),
      activeLeads: row.active_leads,
    }));
  }

  async getAgentTrend(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentTrendPoint[]> {
    const days = TIME_RANGE_DAYS[timeRange];

    const result = await this.pool.query<AgentTrendRow>(
      `SELECT
        metric_date::TEXT AS date,
        COALESCE(leads_handled, 0) AS leads_handled,
        COALESCE(leads_converted, 0) AS conversions,
        CASE
          WHEN leads_handled > 0
          THEN ROUND((leads_converted::DECIMAL / leads_handled) * 100, 1)
          ELSE 0
        END AS conversion_rate,
        COALESCE(avg_response_time_ms / 60000.0, 0) AS avg_response_time_min,
        CASE
          WHEN csat_responses > 0
          THEN ROUND(csat_total_score::DECIMAL / csat_responses, 2)
          ELSE NULL
        END AS satisfaction,
        COALESCE(revenue_generated, 0) AS revenue
      FROM agent_performance_daily
      WHERE agent_id = $1
        AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      ORDER BY metric_date ASC`,
      [agentId, days]
    );

    return result.rows.map((row) => ({
      date: row.date,
      leadsHandled: row.leads_handled,
      conversions: row.conversions,
      conversionRate: Number(row.conversion_rate),
      avgResponseTimeMin: Number(row.avg_response_time_min),
      satisfaction: row.satisfaction !== null ? Number(row.satisfaction) : null,
      revenue: Number(row.revenue),
    }));
  }

  async getDashboardMetrics(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentDashboardMetrics> {
    const days = TIME_RANGE_DAYS[timeRange];

    // Current period metrics
    const currentResult = await this.pool.query<DashboardMetricsRow>(
      `SELECT
        COUNT(DISTINCT a.id) AS total_agents,
        COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN a.id END) AS active_agents,
        COALESCE(SUM(p.leads_handled), 0) AS total_leads,
        CASE
          WHEN SUM(p.leads_handled) > 0
          THEN ROUND((SUM(p.leads_converted)::DECIMAL / SUM(p.leads_handled)) * 100, 1)
          ELSE 0
        END AS avg_conversion_rate,
        COALESCE(ROUND(AVG(NULLIF(p.avg_response_time_ms, 0)) / 60000.0, 1), 0) AS avg_response_time,
        CASE
          WHEN SUM(p.csat_responses) > 0
          THEN ROUND(SUM(p.csat_total_score)::DECIMAL / SUM(p.csat_responses), 1)
          ELSE 0
        END AS avg_satisfaction,
        COALESCE(SUM(p.revenue_generated), 0) AS total_revenue
      FROM agents a
      LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
        AND p.metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      LEFT JOIN agent_sessions s ON s.agent_id = a.id AND s.ended_at IS NULL
      WHERE a.clinic_id = $1
        AND a.deleted_at IS NULL
        AND a.status = 'active'`,
      [clinicId, days]
    );

    // Previous period metrics for comparison
    const previousResult = await this.pool.query<DashboardMetricsRow>(
      `SELECT
        COALESCE(SUM(p.leads_handled), 0) AS total_leads,
        CASE
          WHEN SUM(p.leads_handled) > 0
          THEN ROUND((SUM(p.leads_converted)::DECIMAL / SUM(p.leads_handled)) * 100, 1)
          ELSE 0
        END AS avg_conversion_rate,
        COALESCE(ROUND(AVG(NULLIF(p.avg_response_time_ms, 0)) / 60000.0, 1), 0) AS avg_response_time,
        CASE
          WHEN SUM(p.csat_responses) > 0
          THEN ROUND(SUM(p.csat_total_score)::DECIMAL / SUM(p.csat_responses), 1)
          ELSE 0
        END AS avg_satisfaction,
        COALESCE(SUM(p.revenue_generated), 0) AS total_revenue,
        '0' AS total_agents,
        '0' AS active_agents
      FROM agents a
      LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
        AND p.metric_date >= CURRENT_DATE - ($2 * 2 || ' days')::INTERVAL
        AND p.metric_date < CURRENT_DATE - ($2 || ' days')::INTERVAL
      WHERE a.clinic_id = $1
        AND a.deleted_at IS NULL
        AND a.status = 'active'`,
      [clinicId, days]
    );

    // Aggregate queries always return exactly one row
    const current = currentResult.rows[0]!;
    const previous = previousResult.rows[0]!;

    const calcChange = (curr: number, prev: number): number => {
      if (prev === 0) return 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    // Default values if no data
    const defaultMetrics = {
    // Default values when no data is returned
    const defaultMetrics: DashboardMetricsRow = {
      total_agents: '0',
      active_agents: '0',
      total_leads: '0',
      avg_conversion_rate: '0',
      avg_response_time: '0',
      avg_satisfaction: '0',
      total_revenue: '0',
    };

    const currentData = current ?? defaultMetrics;
    const previousData = previous ?? defaultMetrics;

    return {
      totalAgents: Number(currentData.total_agents),
      activeAgents: Number(currentData.active_agents),
      avgConversionRate: Number(currentData.avg_conversion_rate),
      avgConversionRateChange: calcChange(
        Number(currentData.avg_conversion_rate),
        Number(previousData.avg_conversion_rate)
      ),
      totalLeadsHandled: Number(currentData.total_leads),
      totalLeadsHandledChange: calcChange(
        Number(currentData.total_leads),
        Number(previousData.total_leads)
      ),
      avgResponseTime: Number(currentData.avg_response_time),
      avgResponseTimeChange: calcChange(
        Number(currentData.avg_response_time),
        Number(previousData.avg_response_time)
      ),
      avgSatisfaction: Number(currentData.avg_satisfaction),
      avgSatisfactionChange: calcChange(
        Number(currentData.avg_satisfaction),
        Number(previousData.avg_satisfaction)
      ),
      totalRevenue: Number(currentData.total_revenue),
      totalRevenueChange: calcChange(
        Number(currentData.total_revenue),
        Number(previousData.total_revenue)
    const currentMetrics = current ?? defaultMetrics;
    const previousMetrics = previous ?? defaultMetrics;

    return {
      totalAgents: Number(currentMetrics.total_agents),
      activeAgents: Number(currentMetrics.active_agents),
      avgConversionRate: Number(currentMetrics.avg_conversion_rate),
      avgConversionRateChange: calcChange(
        Number(currentMetrics.avg_conversion_rate),
        Number(previousMetrics.avg_conversion_rate)
      ),
      totalLeadsHandled: Number(currentMetrics.total_leads),
      totalLeadsHandledChange: calcChange(
        Number(currentMetrics.total_leads),
        Number(previousMetrics.total_leads)
      ),
      avgResponseTime: Number(currentMetrics.avg_response_time),
      avgResponseTimeChange: calcChange(
        Number(currentMetrics.avg_response_time),
        Number(previousMetrics.avg_response_time)
      ),
      avgSatisfaction: Number(currentMetrics.avg_satisfaction),
      avgSatisfactionChange: calcChange(
        Number(currentMetrics.avg_satisfaction),
        Number(previousMetrics.avg_satisfaction)
      ),
      totalRevenue: Number(currentMetrics.total_revenue),
      totalRevenueChange: calcChange(
        Number(currentMetrics.total_revenue),
        Number(previousMetrics.total_revenue)
      ),
    };
  }

  async getDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentPerformanceDashboardData> {
    const [metrics, agents] = await Promise.all([
      this.getDashboardMetrics(clinicId, timeRange),
      this.getPerformanceSummary(clinicId, timeRange),
    ]);

    // Get performance over time
    const days = TIME_RANGE_DAYS[timeRange];
    const trendResult = await this.pool.query<PerformanceOverTimeRow>(
      `SELECT
        metric_date::TEXT AS date,
        CASE
          WHEN SUM(leads_handled) > 0
          THEN ROUND((SUM(leads_converted)::DECIMAL / SUM(leads_handled)) * 100, 1)
          ELSE 0
        END AS avg_conversion_rate,
        COALESCE(ROUND(AVG(NULLIF(avg_response_time_ms, 0)) / 60000.0, 1), 0) AS avg_response_time,
        COALESCE(SUM(leads_handled), 0) AS total_leads
      FROM agent_performance_daily
      WHERE clinic_id = $1
        AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY metric_date
      ORDER BY metric_date ASC`,
      [clinicId, days]
    );

    const performanceOverTime = trendResult.rows.map((row) => ({
      date: row.date,
      avgConversionRate: Number(row.avg_conversion_rate),
      avgResponseTime: Number(row.avg_response_time),
      totalLeads: Number(row.total_leads),
    }));

    // Sort agents for top performers (highest conversion rate with minimum leads)
    const topPerformers = [...agents]
      .filter((a) => a.leadsHandled >= 5) // Minimum threshold
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5);

    // Agents needing attention (low conversion, high response time, or low satisfaction)
    const needsAttention = [...agents]
      .filter((a) => a.leadsHandled >= 3) // Minimum threshold
      .filter(
        (a) =>
          a.conversionRate < metrics.avgConversionRate * 0.7 ||
          a.avgResponseTime > metrics.avgResponseTime * 1.5 ||
          (a.satisfaction > 0 && a.satisfaction < 3.5)
      )
      .slice(0, 5);

    return {
      metrics,
      agents,
      topPerformers,
      needsAttention,
      performanceOverTime,
    };
  }

  // ============================================================================
  // AGENT STATUS
  // ============================================================================

  async getAgentCurrentStatus(agentId: string): Promise<AgentAvailability | null> {
    const result = await this.pool.query<AgentStatusRow>(
      `SELECT status FROM agent_sessions
       WHERE agent_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0]!.status as AgentAvailability;
    const row = result.rows[0];
    if (!row) return null;
    return row.status as AgentAvailability;
  }

  async getActiveAgentCount(clinicId: string): Promise<number> {
    const result = await this.pool.query<CountRow>(
      `SELECT COUNT(DISTINCT agent_id) AS count
       FROM agent_sessions
       WHERE clinic_id = $1 AND ended_at IS NULL`,
      [clinicId]
    );

    // COUNT aggregate always returns exactly one row
    return Number(result.rows[0]!.count);
    return Number(result.rows[0]?.count ?? 0);
    const row = result.rows[0];
    return row ? Number(row.count) : 0;
  }

  // ============================================================================
  // ROW MAPPERS
  // ============================================================================

  private rowToAgent(row: AgentRow): Agent {
    return {
      id: row.id,
      clinicId: row.clinic_id,
      userId: row.user_id ?? undefined,
      externalId: row.external_id ?? undefined,
      name: row.name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      avatarUrl: row.avatar_url,
      agentType: row.agent_type as Agent['agentType'],
      role: row.role as Agent['role'],
      skills: row.skills,
      languages: row.languages,
      maxConcurrentChats: row.max_concurrent_chats,
      status: row.status as Agent['status'],
      available: row.available,
      hiredAt: row.hired_at ? row.hired_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private rowToAgentSession(row: AgentSessionRow): AgentSession {
    return {
      id: row.id,
      agentId: row.agent_id,
      clinicId: row.clinic_id,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at ? row.ended_at.toISOString() : null,
      status: row.status as AgentSession['status'],
      leadsHandled: row.leads_handled,
      callsHandled: row.calls_handled,
      messagesSent: row.messages_sent,
      avgResponseTimeMs: row.avg_response_time_ms,
      totalBreakSeconds: row.total_break_seconds,
    };
  }

  private rowToDailyMetrics(row: AgentDailyMetricsRow): AgentDailyMetrics {
    return {
      id: row.id,
      agentId: row.agent_id,
      clinicId: row.clinic_id,
      metricDate: row.metric_date.toISOString().split('T')[0] ?? '',
      leadsAssigned: row.leads_assigned,
      leadsHandled: row.leads_handled,
      leadsConverted: row.leads_converted,
      leadsLost: row.leads_lost,
      callsInbound: row.calls_inbound,
      callsOutbound: row.calls_outbound,
      callsAnswered: row.calls_answered,
      callsMissed: row.calls_missed,
      totalTalkTimeSeconds: row.total_talk_time_seconds,
      avgCallDurationSeconds: row.avg_call_duration_seconds,
      messagesSent: row.messages_sent,
      messagesReceived: row.messages_received,
      avgResponseTimeMs: row.avg_response_time_ms,
      minResponseTimeMs: row.min_response_time_ms,
      maxResponseTimeMs: row.max_response_time_ms,
      firstResponseTimeMs: row.first_response_time_ms,
      appointmentsScheduled: row.appointments_scheduled,
      appointmentsCompleted: row.appointments_completed,
      appointmentsCancelled: row.appointments_cancelled,
      escalations: row.escalations,
      handoffsReceived: row.handoffs_received,
      handoffsGiven: row.handoffs_given,
      csatResponses: row.csat_responses,
      csatTotalScore: row.csat_total_score,
      npsPromoters: row.nps_promoters,
      npsDetractors: row.nps_detractors,
      npsPassives: row.nps_passives,
      revenueGenerated: row.revenue_generated,
      timeLoggedSeconds: row.time_logged_seconds,
      timeOnBreakSeconds: row.time_on_break_seconds,
      timeInCallsSeconds: row.time_in_calls_seconds,
      // Wrap-up time tracking (M8)
      wrapUpTimeSeconds: row.wrap_up_time_seconds,
      wrapUpCount: row.wrap_up_count,
      avgWrapUpTimeSeconds: row.avg_wrap_up_time_seconds,
      minWrapUpTimeSeconds: row.min_wrap_up_time_seconds,
      maxWrapUpTimeSeconds: row.max_wrap_up_time_seconds,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a PostgreSQL agent performance repository
 */
export function createAgentPerformanceRepository(pool: Pool): IAgentPerformanceRepository {
  return new PostgresAgentPerformanceRepository(pool);
}

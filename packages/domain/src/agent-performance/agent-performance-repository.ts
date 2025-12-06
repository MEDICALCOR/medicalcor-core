/**
 * @fileoverview Agent Performance Repository
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 * Provides database persistence for agent performance tracking.
 *
 * @module domain/agent-performance/agent-performance-repository
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
  AgentType,
  AgentAvailability,
} from '@medicalcor/types';

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
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for agent performance data
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
    metrics: Pick<AgentSession, 'leadsHandled' | 'callsHandled' | 'messagesSent' | 'avgResponseTimeMs'>
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
 */
export interface GetAgentsOptions {
  agentType?: AgentType;
  status?: 'active' | 'inactive';
  limit?: number;
  offset?: number;
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
    const result = await this.pool.query(
      `SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToAgent(result.rows[0]);
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

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToAgent(row));
  }

  async createAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const result = await this.pool.query(
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

    return this.rowToAgent(result.rows[0]);
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
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
      const dbField = fieldMap[key];
      if (dbField && value !== undefined) {
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
    const result = await this.pool.query(
      `SELECT * FROM agent_sessions WHERE agent_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToAgentSession(result.rows[0]);
  }

  async startSession(session: Omit<AgentSession, 'id'>): Promise<AgentSession> {
    const result = await this.pool.query(
      `INSERT INTO agent_sessions (agent_id, clinic_id, started_at, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [session.agentId, session.clinicId, session.startedAt, session.status]
    );

    return this.rowToAgentSession(result.rows[0]);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE agent_sessions SET ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  async updateSessionMetrics(
    sessionId: string,
    metrics: Pick<AgentSession, 'leadsHandled' | 'callsHandled' | 'messagesSent' | 'avgResponseTimeMs'>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE agent_sessions SET
         leads_handled = $2,
         calls_handled = $3,
         messages_sent = $4,
         avg_response_time_ms = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [sessionId, metrics.leadsHandled, metrics.callsHandled, metrics.messagesSent, metrics.avgResponseTimeMs]
    );
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  async getDailyMetrics(agentId: string, date: Date): Promise<AgentDailyMetrics | null> {
    const dateStr = date.toISOString().split('T')[0];
    const result = await this.pool.query(
      `SELECT * FROM agent_performance_daily WHERE agent_id = $1 AND metric_date = $2`,
      [agentId, dateStr]
    );

    if (result.rows.length === 0) return null;
    return this.rowToDailyMetrics(result.rows[0]);
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

    const fieldMap: Record<string, string> = {
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
      const dbField = fieldMap[key];
      if (dbField && value !== undefined) {
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

    const result = await this.pool.query(
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
      avatarUrl: row.avatar_url,
      agentType: row.agent_type,
      role: row.role,
      status: row.current_status,
      leadsHandled: Number(row.leads_handled),
      conversions: Number(row.conversions),
      conversionRate: Number(row.conversion_rate),
      avgResponseTime: Number(row.avg_response_time),
      satisfaction: Number(row.satisfaction),
      totalCalls: Number(row.total_calls),
      talkTimeHours: Number(row.talk_time_hours),
      revenue: Number(row.revenue),
      activeLeads: Number(row.active_leads),
    }));
  }

  async getAgentTrend(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentTrendPoint[]> {
    const days = TIME_RANGE_DAYS[timeRange];

    const result = await this.pool.query(
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
      leadsHandled: Number(row.leads_handled),
      conversions: Number(row.conversions),
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
    const currentResult = await this.pool.query(
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
    const previousResult = await this.pool.query(
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
        COALESCE(SUM(p.revenue_generated), 0) AS total_revenue
      FROM agents a
      LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
        AND p.metric_date >= CURRENT_DATE - ($2 * 2 || ' days')::INTERVAL
        AND p.metric_date < CURRENT_DATE - ($2 || ' days')::INTERVAL
      WHERE a.clinic_id = $1
        AND a.deleted_at IS NULL
        AND a.status = 'active'`,
      [clinicId, days]
    );

    const current = currentResult.rows[0];
    const previous = previousResult.rows[0];

    const calcChange = (curr: number, prev: number): number => {
      if (prev === 0) return 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    return {
      totalAgents: Number(current.total_agents),
      activeAgents: Number(current.active_agents),
      avgConversionRate: Number(current.avg_conversion_rate),
      avgConversionRateChange: calcChange(
        Number(current.avg_conversion_rate),
        Number(previous.avg_conversion_rate)
      ),
      totalLeadsHandled: Number(current.total_leads),
      totalLeadsHandledChange: calcChange(
        Number(current.total_leads),
        Number(previous.total_leads)
      ),
      avgResponseTime: Number(current.avg_response_time),
      avgResponseTimeChange: calcChange(
        Number(current.avg_response_time),
        Number(previous.avg_response_time)
      ),
      avgSatisfaction: Number(current.avg_satisfaction),
      avgSatisfactionChange: calcChange(
        Number(current.avg_satisfaction),
        Number(previous.avg_satisfaction)
      ),
      totalRevenue: Number(current.total_revenue),
      totalRevenueChange: calcChange(
        Number(current.total_revenue),
        Number(previous.total_revenue)
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
    const trendResult = await this.pool.query(
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
    const result = await this.pool.query(
      `SELECT status FROM agent_sessions
       WHERE agent_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].status as AgentAvailability;
  }

  async getActiveAgentCount(clinicId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(DISTINCT agent_id) AS count
       FROM agent_sessions
       WHERE clinic_id = $1 AND ended_at IS NULL`,
      [clinicId]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  // ============================================================================
  // ROW MAPPERS
  // ============================================================================

  private rowToAgent(row: Record<string, unknown>): Agent {
    return {
      id: row.id as string,
      clinicId: row.clinic_id as string,
      userId: row.user_id as string | undefined,
      externalId: row.external_id as string | undefined,
      name: row.name as string,
      email: row.email as string | undefined,
      phone: row.phone as string | undefined,
      avatarUrl: row.avatar_url as string | null | undefined,
      agentType: row.agent_type as Agent['agentType'],
      role: row.role as Agent['role'],
      skills: (row.skills as string[]) ?? [],
      languages: (row.languages as string[]) ?? ['ro'],
      maxConcurrentChats: (row.max_concurrent_chats as number) ?? 3,
      status: row.status as Agent['status'],
      available: (row.available as boolean) ?? true,
      hiredAt: row.hired_at ? (row.hired_at as Date).toISOString() : undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }

  private rowToAgentSession(row: Record<string, unknown>): AgentSession {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      clinicId: row.clinic_id as string,
      startedAt: (row.started_at as Date).toISOString(),
      endedAt: row.ended_at ? (row.ended_at as Date).toISOString() : null,
      status: row.status as AgentSession['status'],
      leadsHandled: (row.leads_handled as number) ?? 0,
      callsHandled: (row.calls_handled as number) ?? 0,
      messagesSent: (row.messages_sent as number) ?? 0,
      avgResponseTimeMs: row.avg_response_time_ms as number | null | undefined,
      totalBreakSeconds: (row.total_break_seconds as number) ?? 0,
    };
  }

  private rowToDailyMetrics(row: Record<string, unknown>): AgentDailyMetrics {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      clinicId: row.clinic_id as string,
      metricDate: (row.metric_date as Date).toISOString().split('T')[0] ?? '',
      leadsAssigned: (row.leads_assigned as number) ?? 0,
      leadsHandled: (row.leads_handled as number) ?? 0,
      leadsConverted: (row.leads_converted as number) ?? 0,
      leadsLost: (row.leads_lost as number) ?? 0,
      callsInbound: (row.calls_inbound as number) ?? 0,
      callsOutbound: (row.calls_outbound as number) ?? 0,
      callsAnswered: (row.calls_answered as number) ?? 0,
      callsMissed: (row.calls_missed as number) ?? 0,
      totalTalkTimeSeconds: (row.total_talk_time_seconds as number) ?? 0,
      avgCallDurationSeconds: (row.avg_call_duration_seconds as number) ?? 0,
      messagesSent: (row.messages_sent as number) ?? 0,
      messagesReceived: (row.messages_received as number) ?? 0,
      avgResponseTimeMs: (row.avg_response_time_ms as number) ?? 0,
      minResponseTimeMs: row.min_response_time_ms as number | null | undefined,
      maxResponseTimeMs: row.max_response_time_ms as number | null | undefined,
      firstResponseTimeMs: row.first_response_time_ms as number | null | undefined,
      appointmentsScheduled: (row.appointments_scheduled as number) ?? 0,
      appointmentsCompleted: (row.appointments_completed as number) ?? 0,
      appointmentsCancelled: (row.appointments_cancelled as number) ?? 0,
      escalations: (row.escalations as number) ?? 0,
      handoffsReceived: (row.handoffs_received as number) ?? 0,
      handoffsGiven: (row.handoffs_given as number) ?? 0,
      csatResponses: (row.csat_responses as number) ?? 0,
      csatTotalScore: (row.csat_total_score as number) ?? 0,
      npsPromoters: (row.nps_promoters as number) ?? 0,
      npsDetractors: (row.nps_detractors as number) ?? 0,
      npsPassives: (row.nps_passives as number) ?? 0,
      revenueGenerated: (row.revenue_generated as number) ?? 0,
      timeLoggedSeconds: (row.time_logged_seconds as number) ?? 0,
      timeOnBreakSeconds: (row.time_on_break_seconds as number) ?? 0,
      timeInCallsSeconds: (row.time_in_calls_seconds as number) ?? 0,
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

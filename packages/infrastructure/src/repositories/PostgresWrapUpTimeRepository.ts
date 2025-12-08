/**
 * @fileoverview PostgreSQL Wrap-Up Time Repository (Infrastructure Layer)
 *
 * M8: Wrap-Up Time Tracking - Repository implementation for wrap-up time data.
 * Provides PostgreSQL persistence for wrap-up events and statistics.
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the IWrapUpTimeRepository port
 * defined in the domain layer. The domain depends only on the interface.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-wrap-up-time-repository
 */

import type { Pool } from 'pg';
import type {
  WrapUpEvent,
  WrapUpStats,
  WrapUpTrendPoint,
  AgentWrapUpPerformance,
  WrapUpDashboardData,
  StartWrapUpRequest,
  CompleteWrapUpRequest,
  AgentPerformanceTimeRange,
} from '@medicalcor/types';
import type { IWrapUpTimeRepository } from '@medicalcor/domain';

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

interface WrapUpEventRow {
  id: string;
  agent_id: string;
  clinic_id: string;
  call_sid: string;
  lead_id: string | null;
  disposition_id: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_at: Date;
  completed_at: Date | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface WrapUpStatsRow {
  total_wrap_ups: number;
  completed_wrap_ups: number;
  abandoned_wrap_ups: number;
  total_wrap_up_time: number;
  avg_wrap_up_time: string;
  min_wrap_up_time: number | null;
  max_wrap_up_time: number | null;
}

interface WrapUpTrendRow {
  date: string;
  wrap_up_count: number;
  avg_wrap_up_time_seconds: number;
  total_wrap_up_time_seconds: number;
}

interface AgentPerformanceRow {
  agent_id: string;
  agent_name: string;
  avg_wrap_up_seconds: string;
  total_wrap_ups: number;
  completion_rate: string;
  compared_to_team_avg: string;
}

interface TeamStatsRow {
  total_wrap_ups: number;
  total_wrap_up_time: number;
  team_avg_wrap_up_seconds: string;
}

interface CompletionRow {
  completed: string;
  total: string;
}

interface CountRow {
  count: string;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the wrap-up time repository
 */
export class PostgresWrapUpTimeRepository implements IWrapUpTimeRepository {
  constructor(private readonly pool: Pool) {}

  // ============================================================================
  // EVENT OPERATIONS
  // ============================================================================

  async startWrapUp(request: StartWrapUpRequest): Promise<WrapUpEvent> {
    // First abandon any existing in-progress wrap-up for this agent
    await this.pool.query(
      `UPDATE agent_wrap_up_events
       SET status = 'abandoned',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
           updated_at = NOW()
       WHERE agent_id = $1 AND status = 'in_progress'`,
      [request.agentId]
    );

    // Create new wrap-up event
    const result = await this.pool.query<WrapUpEventRow>(
      `INSERT INTO agent_wrap_up_events (
        agent_id, clinic_id, call_sid, lead_id, status, started_at
      ) VALUES ($1, $2, $3, $4, 'in_progress', NOW())
      RETURNING *`,
      [request.agentId, request.clinicId, request.callSid, request.leadId ?? null]
    );

    return this.rowToWrapUpEvent(result.rows[0]);
  }

  async completeWrapUp(request: CompleteWrapUpRequest): Promise<WrapUpEvent | null> {
    const result = await this.pool.query<WrapUpEventRow>(
      `UPDATE agent_wrap_up_events
       SET status = 'completed',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
           disposition_id = $3,
           notes = $4,
           updated_at = NOW()
       WHERE call_sid = $1 AND agent_id = $2 AND status = 'in_progress'
       RETURNING *`,
      [request.callSid, request.agentId, request.dispositionId ?? null, request.notes ?? null]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const event = this.rowToWrapUpEvent(result.rows[0]);

    // Update daily metrics
    await this.updateDailyMetrics(event.agentId, event.clinicId, event.durationSeconds ?? 0);

    return event;
  }

  async abandonWrapUp(callSid: string, agentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE agent_wrap_up_events
       SET status = 'abandoned',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
           updated_at = NOW()
       WHERE call_sid = $1 AND agent_id = $2 AND status = 'in_progress'`,
      [callSid, agentId]
    );
  }

  async getActiveWrapUp(agentId: string): Promise<WrapUpEvent | null> {
    const result = await this.pool.query<WrapUpEventRow>(
      `SELECT * FROM agent_wrap_up_events
       WHERE agent_id = $1 AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToWrapUpEvent(result.rows[0]);
  }

  async getWrapUpByCallSid(callSid: string, agentId: string): Promise<WrapUpEvent | null> {
    const result = await this.pool.query<WrapUpEventRow>(
      `SELECT * FROM agent_wrap_up_events
       WHERE call_sid = $1 AND agent_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [callSid, agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToWrapUpEvent(result.rows[0]);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getWrapUpStats(agentId: string, startDate: Date, endDate: Date): Promise<WrapUpStats> {
    const result = await this.pool.query<WrapUpStatsRow>(
      `SELECT
         COUNT(*)::INTEGER AS total_wrap_ups,
         COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_wrap_ups,
         COUNT(*) FILTER (WHERE status = 'abandoned')::INTEGER AS abandoned_wrap_ups,
         COALESCE(SUM(duration_seconds), 0)::INTEGER AS total_wrap_up_time,
         COALESCE(AVG(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC AS avg_wrap_up_time,
         MIN(duration_seconds) FILTER (WHERE status = 'completed') AS min_wrap_up_time,
         MAX(duration_seconds) FILTER (WHERE status = 'completed') AS max_wrap_up_time
       FROM agent_wrap_up_events
       WHERE agent_id = $1
       AND started_at::DATE BETWEEN $2 AND $3`,
      [agentId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        agentId,
        totalWrapUps: 0,
        completedWrapUps: 0,
        abandonedWrapUps: 0,
        totalWrapUpTimeSeconds: 0,
        avgWrapUpTimeSeconds: 0,
        minWrapUpTimeSeconds: 0,
        maxWrapUpTimeSeconds: 0,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      };
    }

    return {
      agentId,
      totalWrapUps: row.total_wrap_ups,
      completedWrapUps: row.completed_wrap_ups,
      abandonedWrapUps: row.abandoned_wrap_ups,
      totalWrapUpTimeSeconds: row.total_wrap_up_time,
      avgWrapUpTimeSeconds: Number(row.avg_wrap_up_time),
      minWrapUpTimeSeconds: row.min_wrap_up_time,
      maxWrapUpTimeSeconds: row.max_wrap_up_time,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };
  }

  async getWrapUpTrend(
    agentId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpTrendPoint[]> {
    const days = TIME_RANGE_DAYS[timeRange];

    const result = await this.pool.query<WrapUpTrendRow>(
      `SELECT
         metric_date::TEXT AS date,
         COALESCE(wrap_up_count, 0) AS wrap_up_count,
         COALESCE(avg_wrap_up_time_seconds, 0) AS avg_wrap_up_time_seconds,
         COALESCE(wrap_up_time_seconds, 0) AS total_wrap_up_time_seconds
       FROM agent_performance_daily
       WHERE agent_id = $1
       AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       ORDER BY metric_date ASC`,
      [agentId, days]
    );

    return result.rows.map((row) => ({
      date: row.date,
      wrapUpCount: row.wrap_up_count,
      avgWrapUpTimeSeconds: row.avg_wrap_up_time_seconds,
      totalWrapUpTimeSeconds: row.total_wrap_up_time_seconds,
    }));
  }

  async getTeamWrapUpStats(clinicId: string, startDate: Date, endDate: Date): Promise<WrapUpStats> {
    const result = await this.pool.query<WrapUpStatsRow>(
      `SELECT
         COUNT(*)::INTEGER AS total_wrap_ups,
         COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_wrap_ups,
         COUNT(*) FILTER (WHERE status = 'abandoned')::INTEGER AS abandoned_wrap_ups,
         COALESCE(SUM(duration_seconds), 0)::INTEGER AS total_wrap_up_time,
         COALESCE(AVG(duration_seconds) FILTER (WHERE status = 'completed'), 0)::NUMERIC AS avg_wrap_up_time,
         MIN(duration_seconds) FILTER (WHERE status = 'completed') AS min_wrap_up_time,
         MAX(duration_seconds) FILTER (WHERE status = 'completed') AS max_wrap_up_time
       FROM agent_wrap_up_events
       WHERE clinic_id = $1
       AND started_at::DATE BETWEEN $2 AND $3`,
      [clinicId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        agentId: clinicId,
        totalWrapUps: 0,
        completedWrapUps: 0,
        abandonedWrapUps: 0,
        totalWrapUpTimeSeconds: 0,
        avgWrapUpTimeSeconds: 0,
        minWrapUpTimeSeconds: 0,
        maxWrapUpTimeSeconds: 0,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      };
    }

    return {
      agentId: clinicId, // Using clinicId as identifier for team stats
      totalWrapUps: row.total_wrap_ups,
      completedWrapUps: row.completed_wrap_ups,
      abandonedWrapUps: row.abandoned_wrap_ups,
      totalWrapUpTimeSeconds: row.total_wrap_up_time,
      avgWrapUpTimeSeconds: Number(row.avg_wrap_up_time),
      minWrapUpTimeSeconds: row.min_wrap_up_time,
      maxWrapUpTimeSeconds: row.max_wrap_up_time,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };
  }

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  async getAgentWrapUpPerformance(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<AgentWrapUpPerformance[]> {
    const days = TIME_RANGE_DAYS[timeRange];

    const result = await this.pool.query<AgentPerformanceRow>(
      `WITH agent_stats AS (
         SELECT
           a.id AS agent_id,
           a.name AS agent_name,
           COALESCE(SUM(p.wrap_up_count), 0)::INTEGER AS total_wrap_ups,
           CASE
             WHEN SUM(p.wrap_up_count) > 0
             THEN ROUND(SUM(p.wrap_up_time_seconds)::NUMERIC / SUM(p.wrap_up_count), 0)
             ELSE 0
           END AS avg_wrap_up_seconds
         FROM agents a
         LEFT JOIN agent_performance_daily p ON p.agent_id = a.id
           AND p.metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         WHERE a.clinic_id = $1
           AND a.deleted_at IS NULL
           AND a.status = 'active'
         GROUP BY a.id, a.name
       ),
       team_avg AS (
         SELECT
           CASE
             WHEN SUM(total_wrap_ups) > 0
             THEN SUM(avg_wrap_up_seconds * total_wrap_ups)::NUMERIC / SUM(total_wrap_ups)
             ELSE 0
           END AS team_avg_seconds
         FROM agent_stats
         WHERE total_wrap_ups > 0
       ),
       completed_abandoned AS (
         SELECT
           agent_id,
           COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC AS completed,
           COUNT(*) FILTER (WHERE status = 'abandoned')::NUMERIC AS abandoned
         FROM agent_wrap_up_events
         WHERE clinic_id = $1
           AND started_at >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         GROUP BY agent_id
       )
       SELECT
         s.agent_id,
         s.agent_name,
         s.avg_wrap_up_seconds::TEXT,
         s.total_wrap_ups,
         CASE
           WHEN COALESCE(ca.completed, 0) + COALESCE(ca.abandoned, 0) > 0
           THEN ROUND((COALESCE(ca.completed, 0) / (COALESCE(ca.completed, 0) + COALESCE(ca.abandoned, 0))) * 100, 1)::TEXT
           ELSE '100'
         END AS completion_rate,
         CASE
           WHEN t.team_avg_seconds > 0
           THEN ROUND(((s.avg_wrap_up_seconds - t.team_avg_seconds) / t.team_avg_seconds) * 100, 1)::TEXT
           ELSE '0'
         END AS compared_to_team_avg
       FROM agent_stats s
       CROSS JOIN team_avg t
       LEFT JOIN completed_abandoned ca ON ca.agent_id = s.agent_id
       ORDER BY s.avg_wrap_up_seconds ASC`,
      [clinicId, days]
    );

    return result.rows.map((row) => ({
      agentId: row.agent_id,
      agentName: row.agent_name,
      avgWrapUpTimeSeconds: Number(row.avg_wrap_up_seconds),
      totalWrapUps: row.total_wrap_ups,
      completionRate: Number(row.completion_rate),
      trend: 'stable' as const, // Would need historical comparison for real trend
      comparedToTeamAvg: Number(row.compared_to_team_avg),
    }));
  }

  async getWrapUpDashboardData(
    clinicId: string,
    timeRange: AgentPerformanceTimeRange
  ): Promise<WrapUpDashboardData> {
    const days = TIME_RANGE_DAYS[timeRange];

    // Get current period stats
    const currentStatsResult = await this.pool.query<TeamStatsRow>(
      `SELECT
         COALESCE(SUM(wrap_up_count), 0)::INTEGER AS total_wrap_ups,
         COALESCE(SUM(wrap_up_time_seconds), 0)::INTEGER AS total_wrap_up_time,
         CASE
           WHEN SUM(wrap_up_count) > 0
           THEN ROUND(SUM(wrap_up_time_seconds)::NUMERIC / SUM(wrap_up_count), 0)::TEXT
           ELSE '0'
         END AS team_avg_wrap_up_seconds
       FROM agent_performance_daily
       WHERE clinic_id = $1
       AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL`,
      [clinicId, days]
    );

    // Get previous period stats for comparison
    const previousStatsResult = await this.pool.query<TeamStatsRow>(
      `SELECT
         COALESCE(SUM(wrap_up_count), 0)::INTEGER AS total_wrap_ups,
         COALESCE(SUM(wrap_up_time_seconds), 0)::INTEGER AS total_wrap_up_time,
         CASE
           WHEN SUM(wrap_up_count) > 0
           THEN ROUND(SUM(wrap_up_time_seconds)::NUMERIC / SUM(wrap_up_count), 0)::TEXT
           ELSE '0'
         END AS team_avg_wrap_up_seconds
       FROM agent_performance_daily
       WHERE clinic_id = $1
       AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       AND metric_date < CURRENT_DATE - ($3 || ' days')::INTERVAL`,
      [clinicId, days * 2, days]
    );

    // Get completion rate
    const completionResult = await this.pool.query<CompletionRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed')::TEXT AS completed,
         COUNT(*)::TEXT AS total
       FROM agent_wrap_up_events
       WHERE clinic_id = $1
       AND started_at >= CURRENT_DATE - ($2 || ' days')::INTERVAL`,
      [clinicId, days]
    );

    // Get daily trend
    const trendResult = await this.pool.query<WrapUpTrendRow>(
      `SELECT
         metric_date::TEXT AS date,
         COALESCE(SUM(wrap_up_count), 0)::INTEGER AS wrap_up_count,
         CASE
           WHEN SUM(wrap_up_count) > 0
           THEN ROUND(SUM(wrap_up_time_seconds)::NUMERIC / SUM(wrap_up_count), 0)::INTEGER
           ELSE 0
         END AS avg_wrap_up_time_seconds,
         COALESCE(SUM(wrap_up_time_seconds), 0)::INTEGER AS total_wrap_up_time_seconds
       FROM agent_performance_daily
       WHERE clinic_id = $1
       AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       GROUP BY metric_date
       ORDER BY metric_date ASC`,
      [clinicId, days]
    );

    // Get agent performance
    const agentPerformance = await this.getAgentWrapUpPerformance(clinicId, timeRange);

    // Calculate values
    const currentStats = currentStatsResult.rows[0];
    const previousStats = previousStatsResult.rows[0];
    const completion = completionResult.rows[0];

    const teamAvgWrapUpSeconds = Number(currentStats?.team_avg_wrap_up_seconds ?? 0);
    const prevTeamAvg = Number(previousStats?.team_avg_wrap_up_seconds ?? 0);
    const teamAvgChange =
      prevTeamAvg > 0
        ? Math.round(((teamAvgWrapUpSeconds - prevTeamAvg) / prevTeamAvg) * 1000) / 10
        : 0;

    const totalCompletion = Number(completion?.total ?? 0);
    const completedCount = Number(completion?.completed ?? 0);
    const completionRate =
      totalCompletion > 0 ? Math.round((completedCount / totalCompletion) * 1000) / 10 : 100;

    // Sort for top/bottom performers
    const sortedByAvg = [...agentPerformance]
      .filter((a) => a.totalWrapUps >= 5) // Minimum threshold
      .sort((a, b) => a.avgWrapUpTimeSeconds - b.avgWrapUpTimeSeconds);

    const topPerformers = sortedByAvg.slice(0, 5);
    const needsImprovement = sortedByAvg.slice(-5).reverse();

    return {
      teamAvgWrapUpSeconds,
      teamAvgWrapUpSecondsChange: teamAvgChange,
      totalWrapUps: currentStats?.total_wrap_ups ?? 0,
      totalWrapUpTimeSeconds: currentStats?.total_wrap_up_time ?? 0,
      completionRate,
      agentPerformance,
      trend: trendResult.rows.map((row) => ({
        date: row.date,
        wrapUpCount: row.wrap_up_count,
        avgWrapUpTimeSeconds: row.avg_wrap_up_time_seconds,
        totalWrapUpTimeSeconds: row.total_wrap_up_time_seconds,
      })),
      topPerformers,
      needsImprovement,
    };
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  async abandonStaleWrapUps(maxAgeMinutes: number): Promise<number> {
    const result = await this.pool.query<CountRow>(
      `WITH abandoned AS (
         UPDATE agent_wrap_up_events
         SET status = 'abandoned',
             completed_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
             updated_at = NOW()
         WHERE status = 'in_progress'
         AND started_at < NOW() - ($1 || ' minutes')::INTERVAL
         RETURNING id
       )
       SELECT COUNT(*)::TEXT AS count FROM abandoned`,
      [maxAgeMinutes]
    );

    return Number(result.rows[0].count);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async updateDailyMetrics(
    agentId: string,
    clinicId: string,
    durationSeconds: number
  ): Promise<void> {
    const dateStr = new Date().toISOString().split('T')[0];

    await this.pool.query(
      `INSERT INTO agent_performance_daily (
         agent_id, clinic_id, metric_date,
         wrap_up_time_seconds, wrap_up_count, avg_wrap_up_time_seconds,
         min_wrap_up_time_seconds, max_wrap_up_time_seconds
       ) VALUES (
         $1, $2, $3, $4, 1, $4, $4, $4
       )
       ON CONFLICT (agent_id, metric_date) DO UPDATE
       SET
         wrap_up_time_seconds = agent_performance_daily.wrap_up_time_seconds + $4,
         wrap_up_count = agent_performance_daily.wrap_up_count + 1,
         avg_wrap_up_time_seconds = (agent_performance_daily.wrap_up_time_seconds + $4) / (agent_performance_daily.wrap_up_count + 1),
         min_wrap_up_time_seconds = LEAST(COALESCE(agent_performance_daily.min_wrap_up_time_seconds, $4), $4),
         max_wrap_up_time_seconds = GREATEST(COALESCE(agent_performance_daily.max_wrap_up_time_seconds, $4), $4),
         updated_at = NOW()`,
      [agentId, clinicId, dateStr, durationSeconds]
    );
  }

  private rowToWrapUpEvent(row: WrapUpEventRow): WrapUpEvent {
    return {
      id: row.id,
      agentId: row.agent_id,
      clinicId: row.clinic_id,
      callSid: row.call_sid,
      leadId: row.lead_id,
      dispositionId: row.disposition_id,
      status: row.status,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      durationSeconds: row.duration_seconds,
      notes: row.notes,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a PostgreSQL wrap-up time repository
 */
export function createWrapUpTimeRepository(pool: Pool): IWrapUpTimeRepository {
  return new PostgresWrapUpTimeRepository(pool);
}

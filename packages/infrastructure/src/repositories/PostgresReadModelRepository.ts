/**
 * @fileoverview PostgreSQL Read Model Repository (Infrastructure Layer)
 *
 * Concrete PostgreSQL adapter implementing the IReadModelRepository port
 * from the application layer. Queries pre-aggregated materialized views
 * for dashboard data, offloading reporting from the main transactional database.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-read-model-repository
 *
 * ## CQRS Pattern
 *
 * This adapter queries materialized views that are refreshed periodically:
 * - mv_dashboard_lead_summary
 * - mv_dashboard_daily_metrics
 * - mv_dashboard_appointment_summary
 * - mv_dashboard_revenue_summary
 * - mv_dashboard_agent_performance
 * - mv_dashboard_channel_performance
 *
 * @example
 * ```typescript
 * import { PostgresReadModelRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresReadModelRepository({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * // Get dashboard data
 * const summary = await repository.getLeadSummary(clinicId);
 * const dashboardData = await repository.getDashboardData(clinicId);
 *
 * // Refresh stale read models
 * const results = await repository.refreshStaleReadModels();
 * ```
 */

import { Pool } from 'pg';
import { createLogger } from '@medicalcor/core';

import type {
  IReadModelRepository,
  LeadSummaryReadModel,
  DailyMetricsReadModel,
  AppointmentSummaryReadModel,
  RevenueSummaryReadModel,
  AgentPerformanceReadModel,
  ChannelPerformanceReadModel,
  ReadModelMetadata,
  ReadModelRefreshResult,
  DateRangeFilter,
} from '@medicalcor/application';

const logger = createLogger({ name: 'postgres-read-model-repository' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for PostgreSQL Read Model Repository
 */
export interface PostgresReadModelRepositoryConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum connections in the pool (default: 5) */
  maxConnections?: number;
  /** Default date range for daily metrics in days (default: 30) */
  defaultDateRangeDays?: number;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface LeadSummaryRow {
  clinic_id: string;
  total_leads: string;
  new_leads: string;
  contacted_leads: string;
  qualified_leads: string;
  converted_leads: string;
  lost_leads: string;
  hot_leads: string;
  warm_leads: string;
  cold_leads: string;
  unqualified_leads: string;
  whatsapp_leads: string;
  voice_leads: string;
  web_leads: string;
  referral_leads: string;
  avg_score: string | null;
  scored_leads: string;
  leads_last_7_days: string;
  leads_last_30_days: string;
  leads_this_month: string;
  conversion_rate: string;
  refreshed_at: Date;
}

interface DailyMetricsRow {
  clinic_id: string;
  date: Date;
  new_leads: string;
  hot_leads: string;
  warm_leads: string;
  converted_leads: string;
  lost_leads: string;
  appointments_scheduled: string;
  appointments_completed: string;
  appointments_cancelled: string;
  messages_received: string;
  messages_sent: string;
  payments_count: string;
  gross_revenue: string;
  refunds: string;
  net_revenue: string;
  refreshed_at: Date;
}

interface AppointmentSummaryRow {
  clinic_id: string;
  total_appointments: string;
  scheduled_count: string;
  confirmed_count: string;
  completed_count: string;
  cancelled_count: string;
  no_show_count: string;
  upcoming_count: string;
  next_24h_count: string;
  next_7_days_count: string;
  last_7_days: string;
  last_30_days: string;
  show_rate: string | null;
  cancellation_rate: string;
  avg_daily_appointments: string;
  refreshed_at: Date;
}

interface RevenueSummaryRow {
  clinic_id: string;
  total_cases: string;
  total_case_value: string;
  total_collected: string;
  total_outstanding: string;
  avg_case_value: string;
  pending_cases: string;
  in_progress_cases: string;
  completed_cases: string;
  cancelled_cases: string;
  unpaid_cases: string;
  partial_paid_cases: string;
  fully_paid_cases: string;
  revenue_last_7_days: string;
  revenue_last_30_days: string;
  revenue_this_month: string;
  revenue_this_year: string;
  collection_rate: string | null;
  refreshed_at: Date;
}

interface AgentPerformanceRow {
  agent_id: string;
  clinic_id: string;
  total_leads_assigned: string;
  leads_converted: string;
  leads_lost: string;
  leads_active: string;
  conversion_rate: string | null;
  hot_leads: string;
  warm_leads: string;
  cold_leads: string;
  activity_last_7_days: string;
  activity_last_30_days: string;
  avg_lead_score: string | null;
  refreshed_at: Date;
}

interface ChannelPerformanceRow {
  clinic_id: string;
  channel: string;
  total_leads: string;
  leads_last_30_days: string;
  avg_score: string | null;
  hot_leads: string;
  warm_leads: string;
  cold_leads: string;
  unqualified_leads: string;
  converted_leads: string;
  conversion_rate: string;
  avg_days_to_qualify: string | null;
  refreshed_at: Date;
}

interface ReadModelMetadataRow {
  view_name: string;
  last_refresh_at: Date | null;
  last_refresh_duration_ms: number | null;
  row_count: string | null;
  next_scheduled_refresh: Date | null;
  refresh_interval_minutes: number;
  is_refreshing: boolean;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RefreshResultRow {
  success: boolean;
  duration_ms: number;
  row_count: string;
  error_message: string | null;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the Read Model Repository
 *
 * Queries pre-aggregated materialized views for dashboard data.
 * These views are refreshed periodically to reduce load on the main database.
 */
export class PostgresReadModelRepository implements IReadModelRepository {
  private pool: Pool;
  private defaultDateRangeDays: number;

  constructor(config: PostgresReadModelRepositoryConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 5,
    });
    this.defaultDateRangeDays = config.defaultDateRangeDays ?? 30;

    logger.info('PostgresReadModelRepository initialized');
  }

  // ==========================================================================
  // LEAD SUMMARY
  // ==========================================================================

  async getLeadSummary(clinicId: string): Promise<LeadSummaryReadModel | null> {
    const sql = 'SELECT * FROM mv_dashboard_lead_summary WHERE clinic_id = $1';
    const result = await this.pool.query<LeadSummaryRow>(sql, [clinicId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToLeadSummary(result.rows[0]!);
  }

  async getLeadSummaries(clinicIds: string[]): Promise<LeadSummaryReadModel[]> {
    if (clinicIds.length === 0) {
      return [];
    }

    const sql = 'SELECT * FROM mv_dashboard_lead_summary WHERE clinic_id = ANY($1)';
    const result = await this.pool.query<LeadSummaryRow>(sql, [clinicIds]);

    return result.rows.map((row) => this.mapRowToLeadSummary(row));
  }

  // ==========================================================================
  // DAILY METRICS
  // ==========================================================================

  async getDailyMetrics(
    clinicId: string,
    dateRange: DateRangeFilter
  ): Promise<DailyMetricsReadModel[]> {
    const sql = `
      SELECT * FROM mv_dashboard_daily_metrics
      WHERE clinic_id = $1
        AND date >= $2
        AND date <= $3
      ORDER BY date DESC
    `;

    const result = await this.pool.query<DailyMetricsRow>(sql, [
      clinicId,
      dateRange.startDate,
      dateRange.endDate,
    ]);

    return result.rows.map((row) => this.mapRowToDailyMetrics(row));
  }

  async getDailyMetric(clinicId: string, date: Date): Promise<DailyMetricsReadModel | null> {
    const sql = `
      SELECT * FROM mv_dashboard_daily_metrics
      WHERE clinic_id = $1 AND date = $2
    `;

    const result = await this.pool.query<DailyMetricsRow>(sql, [clinicId, date]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDailyMetrics(result.rows[0]!);
  }

  // ==========================================================================
  // APPOINTMENT SUMMARY
  // ==========================================================================

  async getAppointmentSummary(clinicId: string): Promise<AppointmentSummaryReadModel | null> {
    const sql = 'SELECT * FROM mv_dashboard_appointment_summary WHERE clinic_id = $1';
    const result = await this.pool.query<AppointmentSummaryRow>(sql, [clinicId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAppointmentSummary(result.rows[0]!);
  }

  // ==========================================================================
  // REVENUE SUMMARY
  // ==========================================================================

  async getRevenueSummary(clinicId: string): Promise<RevenueSummaryReadModel | null> {
    const sql = 'SELECT * FROM mv_dashboard_revenue_summary WHERE clinic_id = $1';
    const result = await this.pool.query<RevenueSummaryRow>(sql, [clinicId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToRevenueSummary(result.rows[0]!);
  }

  // ==========================================================================
  // AGENT PERFORMANCE
  // ==========================================================================

  async getAgentPerformance(clinicId: string): Promise<AgentPerformanceReadModel[]> {
    const sql = `
      SELECT * FROM mv_dashboard_agent_performance
      WHERE clinic_id = $1
      ORDER BY total_leads_assigned DESC
    `;

    const result = await this.pool.query<AgentPerformanceRow>(sql, [clinicId]);
    return result.rows.map((row) => this.mapRowToAgentPerformance(row));
  }

  async getAgentPerformanceById(
    clinicId: string,
    agentId: string
  ): Promise<AgentPerformanceReadModel | null> {
    const sql = `
      SELECT * FROM mv_dashboard_agent_performance
      WHERE clinic_id = $1 AND agent_id = $2
    `;

    const result = await this.pool.query<AgentPerformanceRow>(sql, [clinicId, agentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToAgentPerformance(result.rows[0]!);
  }

  // ==========================================================================
  // CHANNEL PERFORMANCE
  // ==========================================================================

  async getChannelPerformance(clinicId: string): Promise<ChannelPerformanceReadModel[]> {
    const sql = `
      SELECT * FROM mv_dashboard_channel_performance
      WHERE clinic_id = $1
      ORDER BY total_leads DESC
    `;

    const result = await this.pool.query<ChannelPerformanceRow>(sql, [clinicId]);
    return result.rows.map((row) => this.mapRowToChannelPerformance(row));
  }

  async getChannelPerformanceByChannel(
    clinicId: string,
    channel: 'whatsapp' | 'voice' | 'web' | 'referral'
  ): Promise<ChannelPerformanceReadModel | null> {
    const sql = `
      SELECT * FROM mv_dashboard_channel_performance
      WHERE clinic_id = $1 AND channel = $2
    `;

    const result = await this.pool.query<ChannelPerformanceRow>(sql, [clinicId, channel]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToChannelPerformance(result.rows[0]!);
  }

  // ==========================================================================
  // COMBINED DASHBOARD DATA
  // ==========================================================================

  async getDashboardData(
    clinicId: string,
    dateRange?: DateRangeFilter
  ): Promise<{
    leadSummary: LeadSummaryReadModel | null;
    appointmentSummary: AppointmentSummaryReadModel | null;
    revenueSummary: RevenueSummaryReadModel | null;
    dailyMetrics: DailyMetricsReadModel[];
    channelPerformance: ChannelPerformanceReadModel[];
  }> {
    // Calculate default date range if not provided
    const effectiveDateRange = dateRange ?? {
      startDate: new Date(Date.now() - this.defaultDateRangeDays * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    // Execute all queries in parallel for efficiency
    const [leadSummary, appointmentSummary, revenueSummary, dailyMetrics, channelPerformance] =
      await Promise.all([
        this.getLeadSummary(clinicId),
        this.getAppointmentSummary(clinicId),
        this.getRevenueSummary(clinicId),
        this.getDailyMetrics(clinicId, effectiveDateRange),
        this.getChannelPerformance(clinicId),
      ]);

    return {
      leadSummary,
      appointmentSummary,
      revenueSummary,
      dailyMetrics,
      channelPerformance,
    };
  }

  // ==========================================================================
  // READ MODEL MANAGEMENT
  // ==========================================================================

  async getReadModelMetadata(): Promise<ReadModelMetadata[]> {
    const sql = 'SELECT * FROM read_model_metadata ORDER BY view_name';
    const result = await this.pool.query<ReadModelMetadataRow>(sql);
    return result.rows.map((row) => this.mapRowToMetadata(row));
  }

  async getReadModelMetadataByName(viewName: string): Promise<ReadModelMetadata | null> {
    const sql = 'SELECT * FROM read_model_metadata WHERE view_name = $1';
    const result = await this.pool.query<ReadModelMetadataRow>(sql, [viewName]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMetadata(result.rows[0]!);
  }

  async refreshReadModel(viewName: string): Promise<ReadModelRefreshResult> {
    logger.info({ viewName }, 'Refreshing read model');

    const sql = 'SELECT * FROM refresh_read_model($1)';
    const result = await this.pool.query<RefreshResultRow>(sql, [viewName]);

    const row = result.rows[0];
    if (!row) {
      logger.error({ viewName }, 'No result from refresh_read_model');
      return {
        viewName,
        success: false,
        durationMs: 0,
        rowCount: 0,
        errorMessage: 'No result from refresh function',
      };
    }

    const refreshResult: ReadModelRefreshResult = {
      viewName,
      success: row.success,
      durationMs: row.duration_ms,
      rowCount: parseInt(row.row_count, 10),
      errorMessage: row.error_message,
    };

    if (refreshResult.success) {
      logger.info(
        { viewName, durationMs: refreshResult.durationMs, rowCount: refreshResult.rowCount },
        'Read model refreshed successfully'
      );
    } else {
      logger.error({ viewName, error: refreshResult.errorMessage }, 'Read model refresh failed');
    }

    return refreshResult;
  }

  async refreshAllDashboardReadModels(): Promise<ReadModelRefreshResult[]> {
    logger.info('Refreshing all dashboard read models');

    const sql = 'SELECT * FROM refresh_all_dashboard_read_models()';
    const result = await this.pool.query<RefreshResultRow & { view_name: string }>(sql);

    const results = result.rows.map((row) => ({
      viewName: row.view_name,
      success: row.success,
      durationMs: row.duration_ms,
      rowCount: parseInt(row.row_count, 10),
      errorMessage: row.error_message,
    }));

    const successCount = results.filter((r) => r.success).length;
    logger.info(
      { successCount, totalCount: results.length },
      'Dashboard read models refresh complete'
    );

    return results;
  }

  async refreshStaleReadModels(): Promise<ReadModelRefreshResult[]> {
    logger.info('Refreshing stale read models');

    const sql = 'SELECT * FROM refresh_stale_read_models()';
    const result = await this.pool.query<RefreshResultRow & { view_name: string }>(sql);

    const results = result.rows.map((row) => ({
      viewName: row.view_name,
      success: row.success,
      durationMs: row.duration_ms,
      rowCount: parseInt(row.row_count, 10),
      errorMessage: row.error_message,
    }));

    if (results.length > 0) {
      const successCount = results.filter((r) => r.success).length;
      logger.info(
        { successCount, totalCount: results.length },
        'Stale read models refresh complete'
      );
    }

    return results;
  }

  async getStaleReadModels(): Promise<string[]> {
    const sql = `
      SELECT view_name
      FROM read_model_metadata
      WHERE (next_scheduled_refresh IS NULL OR next_scheduled_refresh <= NOW())
        AND is_refreshing = FALSE
      ORDER BY next_scheduled_refresh NULLS FIRST
    `;

    const result = await this.pool.query<{ view_name: string }>(sql);
    return result.rows.map((row) => row.view_name);
  }

  // ==========================================================================
  // ROW MAPPERS
  // ==========================================================================

  private mapRowToLeadSummary(row: LeadSummaryRow): LeadSummaryReadModel {
    return {
      clinicId: row.clinic_id,
      totalLeads: parseInt(row.total_leads, 10),
      newLeads: parseInt(row.new_leads, 10),
      contactedLeads: parseInt(row.contacted_leads, 10),
      qualifiedLeads: parseInt(row.qualified_leads, 10),
      convertedLeads: parseInt(row.converted_leads, 10),
      lostLeads: parseInt(row.lost_leads, 10),
      hotLeads: parseInt(row.hot_leads, 10),
      warmLeads: parseInt(row.warm_leads, 10),
      coldLeads: parseInt(row.cold_leads, 10),
      unqualifiedLeads: parseInt(row.unqualified_leads, 10),
      whatsappLeads: parseInt(row.whatsapp_leads, 10),
      voiceLeads: parseInt(row.voice_leads, 10),
      webLeads: parseInt(row.web_leads, 10),
      referralLeads: parseInt(row.referral_leads, 10),
      avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
      scoredLeads: parseInt(row.scored_leads, 10),
      leadsLast7Days: parseInt(row.leads_last_7_days, 10),
      leadsLast30Days: parseInt(row.leads_last_30_days, 10),
      leadsThisMonth: parseInt(row.leads_this_month, 10),
      conversionRate: parseFloat(row.conversion_rate),
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToDailyMetrics(row: DailyMetricsRow): DailyMetricsReadModel {
    return {
      clinicId: row.clinic_id,
      date: row.date,
      newLeads: parseInt(row.new_leads, 10),
      hotLeads: parseInt(row.hot_leads, 10),
      warmLeads: parseInt(row.warm_leads, 10),
      convertedLeads: parseInt(row.converted_leads, 10),
      lostLeads: parseInt(row.lost_leads, 10),
      appointmentsScheduled: parseInt(row.appointments_scheduled, 10),
      appointmentsCompleted: parseInt(row.appointments_completed, 10),
      appointmentsCancelled: parseInt(row.appointments_cancelled, 10),
      messagesReceived: parseInt(row.messages_received, 10),
      messagesSent: parseInt(row.messages_sent, 10),
      paymentsCount: parseInt(row.payments_count, 10),
      grossRevenue: parseFloat(row.gross_revenue),
      refunds: parseFloat(row.refunds),
      netRevenue: parseFloat(row.net_revenue),
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToAppointmentSummary(row: AppointmentSummaryRow): AppointmentSummaryReadModel {
    return {
      clinicId: row.clinic_id,
      totalAppointments: parseInt(row.total_appointments, 10),
      scheduledCount: parseInt(row.scheduled_count, 10),
      confirmedCount: parseInt(row.confirmed_count, 10),
      completedCount: parseInt(row.completed_count, 10),
      cancelledCount: parseInt(row.cancelled_count, 10),
      noShowCount: parseInt(row.no_show_count, 10),
      upcomingCount: parseInt(row.upcoming_count, 10),
      next24hCount: parseInt(row.next_24h_count, 10),
      next7DaysCount: parseInt(row.next_7_days_count, 10),
      last7Days: parseInt(row.last_7_days, 10),
      last30Days: parseInt(row.last_30_days, 10),
      showRate: row.show_rate ? parseFloat(row.show_rate) : null,
      cancellationRate: parseFloat(row.cancellation_rate),
      avgDailyAppointments: parseFloat(row.avg_daily_appointments),
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToRevenueSummary(row: RevenueSummaryRow): RevenueSummaryReadModel {
    return {
      clinicId: row.clinic_id,
      totalCases: parseInt(row.total_cases, 10),
      totalCaseValue: parseFloat(row.total_case_value),
      totalCollected: parseFloat(row.total_collected),
      totalOutstanding: parseFloat(row.total_outstanding),
      avgCaseValue: parseFloat(row.avg_case_value),
      pendingCases: parseInt(row.pending_cases, 10),
      inProgressCases: parseInt(row.in_progress_cases, 10),
      completedCases: parseInt(row.completed_cases, 10),
      cancelledCases: parseInt(row.cancelled_cases, 10),
      unpaidCases: parseInt(row.unpaid_cases, 10),
      partialPaidCases: parseInt(row.partial_paid_cases, 10),
      fullyPaidCases: parseInt(row.fully_paid_cases, 10),
      revenueLast7Days: parseFloat(row.revenue_last_7_days),
      revenueLast30Days: parseFloat(row.revenue_last_30_days),
      revenueThisMonth: parseFloat(row.revenue_this_month),
      revenueThisYear: parseFloat(row.revenue_this_year),
      collectionRate: row.collection_rate ? parseFloat(row.collection_rate) : null,
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToAgentPerformance(row: AgentPerformanceRow): AgentPerformanceReadModel {
    return {
      agentId: row.agent_id,
      clinicId: row.clinic_id,
      totalLeadsAssigned: parseInt(row.total_leads_assigned, 10),
      leadsConverted: parseInt(row.leads_converted, 10),
      leadsLost: parseInt(row.leads_lost, 10),
      leadsActive: parseInt(row.leads_active, 10),
      conversionRate: row.conversion_rate ? parseFloat(row.conversion_rate) : null,
      hotLeads: parseInt(row.hot_leads, 10),
      warmLeads: parseInt(row.warm_leads, 10),
      coldLeads: parseInt(row.cold_leads, 10),
      activityLast7Days: parseInt(row.activity_last_7_days, 10),
      activityLast30Days: parseInt(row.activity_last_30_days, 10),
      avgLeadScore: row.avg_lead_score ? parseFloat(row.avg_lead_score) : null,
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToChannelPerformance(row: ChannelPerformanceRow): ChannelPerformanceReadModel {
    return {
      clinicId: row.clinic_id,
      channel: row.channel as 'whatsapp' | 'voice' | 'web' | 'referral',
      totalLeads: parseInt(row.total_leads, 10),
      leadsLast30Days: parseInt(row.leads_last_30_days, 10),
      avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
      hotLeads: parseInt(row.hot_leads, 10),
      warmLeads: parseInt(row.warm_leads, 10),
      coldLeads: parseInt(row.cold_leads, 10),
      unqualifiedLeads: parseInt(row.unqualified_leads, 10),
      convertedLeads: parseInt(row.converted_leads, 10),
      conversionRate: parseFloat(row.conversion_rate),
      avgDaysToQualify: row.avg_days_to_qualify ? parseFloat(row.avg_days_to_qualify) : null,
      refreshedAt: row.refreshed_at,
    };
  }

  private mapRowToMetadata(row: ReadModelMetadataRow): ReadModelMetadata {
    return {
      viewName: row.view_name,
      lastRefreshAt: row.last_refresh_at,
      lastRefreshDurationMs: row.last_refresh_duration_ms,
      rowCount: row.row_count ? parseInt(row.row_count, 10) : null,
      nextScheduledRefresh: row.next_scheduled_refresh,
      refreshIntervalMinutes: row.refresh_interval_minutes,
      isRefreshing: row.is_refreshing,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgresReadModelRepository connection pool closed');
  }
}

/**
 * Factory function to create a PostgreSQL Read Model Repository
 */
export function createPostgresReadModelRepository(
  config: PostgresReadModelRepositoryConfig
): PostgresReadModelRepository {
  return new PostgresReadModelRepository(config);
}

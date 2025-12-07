/**
 * @fileoverview Read Model Repository Port (Secondary Port)
 *
 * Defines the interface for CQRS read model operations. This port abstracts
 * away the details of how read models are stored and refreshed, allowing
 * the application to query pre-aggregated data without direct database coupling.
 *
 * @module application/ports/secondary/persistence/ReadModelRepository
 *
 * ## CQRS Pattern
 *
 * Read models are optimized for queries, typically as materialized views:
 * - Lead summary for dashboard widgets
 * - Daily metrics for time-series charts
 * - Appointment summaries for scheduling dashboards
 * - Revenue summaries for financial reporting
 * - Agent performance for team management
 * - Channel performance for marketing analytics
 *
 * @example
 * ```typescript
 * const readModelRepo = container.get<IReadModelRepository>('ReadModelRepository');
 *
 * // Get dashboard data
 * const summary = await readModelRepo.getLeadSummary(clinicId);
 * const dailyMetrics = await readModelRepo.getDailyMetrics(clinicId, startDate, endDate);
 *
 * // Refresh stale read models
 * const results = await readModelRepo.refreshStaleReadModels();
 * ```
 */

// ============================================================================
// READ MODEL TYPES
// ============================================================================

/**
 * Lead summary read model - aggregated lead metrics per clinic
 */
export interface LeadSummaryReadModel {
  clinicId: string;
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  unqualifiedLeads: number;
  whatsappLeads: number;
  voiceLeads: number;
  webLeads: number;
  referralLeads: number;
  avgScore: number | null;
  scoredLeads: number;
  leadsLast7Days: number;
  leadsLast30Days: number;
  leadsThisMonth: number;
  conversionRate: number;
  refreshedAt: Date;
}

/**
 * Daily metrics read model - aggregated metrics for a specific date
 */
export interface DailyMetricsReadModel {
  clinicId: string;
  date: Date;
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  convertedLeads: number;
  lostLeads: number;
  appointmentsScheduled: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  messagesReceived: number;
  messagesSent: number;
  paymentsCount: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  refreshedAt: Date;
}

/**
 * Appointment summary read model - aggregated appointment metrics
 */
export interface AppointmentSummaryReadModel {
  clinicId: string;
  totalAppointments: number;
  scheduledCount: number;
  confirmedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  next24hCount: number;
  next7DaysCount: number;
  last7Days: number;
  last30Days: number;
  showRate: number | null;
  cancellationRate: number;
  avgDailyAppointments: number;
  refreshedAt: Date;
}

/**
 * Revenue summary read model - aggregated financial metrics
 */
export interface RevenueSummaryReadModel {
  clinicId: string;
  totalCases: number;
  totalCaseValue: number;
  totalCollected: number;
  totalOutstanding: number;
  avgCaseValue: number;
  pendingCases: number;
  inProgressCases: number;
  completedCases: number;
  cancelledCases: number;
  unpaidCases: number;
  partialPaidCases: number;
  fullyPaidCases: number;
  revenueLast7Days: number;
  revenueLast30Days: number;
  revenueThisMonth: number;
  revenueThisYear: number;
  collectionRate: number | null;
  refreshedAt: Date;
}

/**
 * Agent performance read model - performance metrics per agent
 */
export interface AgentPerformanceReadModel {
  agentId: string;
  clinicId: string;
  totalLeadsAssigned: number;
  leadsConverted: number;
  leadsLost: number;
  leadsActive: number;
  conversionRate: number | null;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  activityLast7Days: number;
  activityLast30Days: number;
  avgLeadScore: number | null;
  refreshedAt: Date;
}

/**
 * Channel performance read model - performance metrics per channel
 */
export interface ChannelPerformanceReadModel {
  clinicId: string;
  channel: 'whatsapp' | 'voice' | 'web' | 'referral';
  totalLeads: number;
  leadsLast30Days: number;
  avgScore: number | null;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  unqualifiedLeads: number;
  convertedLeads: number;
  conversionRate: number;
  avgDaysToQualify: number | null;
  refreshedAt: Date;
}

/**
 * Read model metadata - tracking refresh status
 */
export interface ReadModelMetadata {
  viewName: string;
  lastRefreshAt: Date | null;
  lastRefreshDurationMs: number | null;
  rowCount: number | null;
  nextScheduledRefresh: Date | null;
  refreshIntervalMinutes: number;
  isRefreshing: boolean;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Refresh result for a single read model
 */
export interface ReadModelRefreshResult {
  viewName: string;
  success: boolean;
  durationMs: number;
  rowCount: number;
  errorMessage: string | null;
}

/**
 * Date range filter for queries
 */
export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}

// ============================================================================
// READ MODEL REPOSITORY PORT
// ============================================================================

/**
 * Read Model Repository Port
 *
 * Defines the interface for accessing CQRS read models (materialized views).
 * Implementations should query pre-aggregated data optimized for dashboards.
 */
export interface IReadModelRepository {
  // ==========================================================================
  // LEAD SUMMARY
  // ==========================================================================

  /**
   * Get lead summary for a clinic
   * @param clinicId - The clinic ID to get summary for
   * @returns Lead summary read model or null if not found
   */
  getLeadSummary(clinicId: string): Promise<LeadSummaryReadModel | null>;

  /**
   * Get lead summaries for multiple clinics
   * @param clinicIds - Array of clinic IDs
   * @returns Array of lead summary read models
   */
  getLeadSummaries(clinicIds: string[]): Promise<LeadSummaryReadModel[]>;

  // ==========================================================================
  // DAILY METRICS
  // ==========================================================================

  /**
   * Get daily metrics for a clinic within a date range
   * @param clinicId - The clinic ID
   * @param dateRange - Start and end dates
   * @returns Array of daily metrics
   */
  getDailyMetrics(clinicId: string, dateRange: DateRangeFilter): Promise<DailyMetricsReadModel[]>;

  /**
   * Get a single day's metrics for a clinic
   * @param clinicId - The clinic ID
   * @param date - The specific date
   * @returns Daily metrics or null if not found
   */
  getDailyMetric(clinicId: string, date: Date): Promise<DailyMetricsReadModel | null>;

  // ==========================================================================
  // APPOINTMENT SUMMARY
  // ==========================================================================

  /**
   * Get appointment summary for a clinic
   * @param clinicId - The clinic ID
   * @returns Appointment summary read model or null if not found
   */
  getAppointmentSummary(clinicId: string): Promise<AppointmentSummaryReadModel | null>;

  // ==========================================================================
  // REVENUE SUMMARY
  // ==========================================================================

  /**
   * Get revenue summary for a clinic
   * @param clinicId - The clinic ID
   * @returns Revenue summary read model or null if not found
   */
  getRevenueSummary(clinicId: string): Promise<RevenueSummaryReadModel | null>;

  // ==========================================================================
  // AGENT PERFORMANCE
  // ==========================================================================

  /**
   * Get agent performance metrics for a clinic
   * @param clinicId - The clinic ID
   * @returns Array of agent performance read models
   */
  getAgentPerformance(clinicId: string): Promise<AgentPerformanceReadModel[]>;

  /**
   * Get performance metrics for a specific agent
   * @param clinicId - The clinic ID
   * @param agentId - The agent ID
   * @returns Agent performance or null if not found
   */
  getAgentPerformanceById(
    clinicId: string,
    agentId: string
  ): Promise<AgentPerformanceReadModel | null>;

  // ==========================================================================
  // CHANNEL PERFORMANCE
  // ==========================================================================

  /**
   * Get channel performance metrics for a clinic
   * @param clinicId - The clinic ID
   * @returns Array of channel performance read models
   */
  getChannelPerformance(clinicId: string): Promise<ChannelPerformanceReadModel[]>;

  /**
   * Get performance for a specific channel
   * @param clinicId - The clinic ID
   * @param channel - The channel name
   * @returns Channel performance or null if not found
   */
  getChannelPerformanceByChannel(
    clinicId: string,
    channel: 'whatsapp' | 'voice' | 'web' | 'referral'
  ): Promise<ChannelPerformanceReadModel | null>;

  // ==========================================================================
  // COMBINED DASHBOARD DATA
  // ==========================================================================

  /**
   * Get all dashboard data for a clinic in a single call
   * Optimized to reduce round trips for dashboard loading
   * @param clinicId - The clinic ID
   * @param dateRange - Optional date range for daily metrics
   * @returns Combined dashboard data
   */
  getDashboardData(
    clinicId: string,
    dateRange?: DateRangeFilter
  ): Promise<{
    leadSummary: LeadSummaryReadModel | null;
    appointmentSummary: AppointmentSummaryReadModel | null;
    revenueSummary: RevenueSummaryReadModel | null;
    dailyMetrics: DailyMetricsReadModel[];
    channelPerformance: ChannelPerformanceReadModel[];
  }>;

  // ==========================================================================
  // READ MODEL MANAGEMENT
  // ==========================================================================

  /**
   * Get metadata for all read models
   * @returns Array of read model metadata
   */
  getReadModelMetadata(): Promise<ReadModelMetadata[]>;

  /**
   * Get metadata for a specific read model
   * @param viewName - The materialized view name
   * @returns Read model metadata or null if not found
   */
  getReadModelMetadataByName(viewName: string): Promise<ReadModelMetadata | null>;

  /**
   * Refresh a specific read model
   * @param viewName - The materialized view name to refresh
   * @returns Refresh result
   */
  refreshReadModel(viewName: string): Promise<ReadModelRefreshResult>;

  /**
   * Refresh all dashboard read models
   * @returns Array of refresh results
   */
  refreshAllDashboardReadModels(): Promise<ReadModelRefreshResult[]>;

  /**
   * Refresh only stale read models (past their scheduled refresh time)
   * @returns Array of refresh results
   */
  refreshStaleReadModels(): Promise<ReadModelRefreshResult[]>;

  /**
   * Check if read models need refresh
   * @returns Array of view names that need refresh
   */
  getStaleReadModels(): Promise<string[]>;
}

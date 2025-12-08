import { z } from 'zod';

/**
 * Agent Performance Schemas
 *
 * Zod schemas for agent performance tracking and dashboard data.
 * M7: Agent Performance Dashboard - Individual Metrics
 *
 * @module @medicalcor/types/agent-performance
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Agent type classification
 */
export const AgentTypeSchema = z.enum(['human', 'ai', 'hybrid']);

/**
 * Agent role hierarchy
 */
export const AgentRoleSchema = z.enum([
  'agent',
  'senior_agent',
  'team_lead',
  'supervisor',
  'manager',
]);

/**
 * Agent status
 */
export const AgentStatusSchema = z.enum(['active', 'inactive', 'on_leave', 'terminated']);

/**
 * Agent availability status during sessions
 */
export const AgentAvailabilitySchema = z.enum([
  'available',
  'busy',
  'away',
  'break',
  'training',
  'offline',
]);

/**
 * Lead assignment reasons
 */
export const AssignmentReasonSchema = z.enum([
  'manual',
  'auto_round_robin',
  'auto_skill_based',
  'auto_load_balance',
  'escalation',
  'handoff',
]);

/**
 * Lead outcome types
 */
export const LeadOutcomeSchema = z.enum(['converted', 'lost', 'transferred', 'pending']);

/**
 * Rating types
 */
export const RatingTypeSchema = z.enum(['csat', 'nps', 'effort_score']);

// ============================================================================
// CORE AGENT SCHEMAS
// ============================================================================

/**
 * Agent base information
 */
export const AgentSchema = z.object({
  id: z.string().uuid(),
  clinicId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  agentType: AgentTypeSchema,
  role: AgentRoleSchema,
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(['ro']),
  maxConcurrentChats: z.number().int().min(1).max(20).default(3),
  status: AgentStatusSchema,
  available: z.boolean().default(true),
  hiredAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Agent session tracking
 */
export const AgentSessionSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  clinicId: z.string().uuid(),
  startedAt: z.string(),
  endedAt: z.string().optional().nullable(),
  status: AgentAvailabilitySchema,
  leadsHandled: z.number().int().default(0),
  callsHandled: z.number().int().default(0),
  messagesSent: z.number().int().default(0),
  avgResponseTimeMs: z.number().int().optional().nullable(),
  totalBreakSeconds: z.number().int().default(0),
});

// ============================================================================
// PERFORMANCE METRICS SCHEMAS
// ============================================================================

/**
 * Daily performance metrics for an agent
 */
export const AgentDailyMetricsSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  clinicId: z.string().uuid(),
  metricDate: z.string(), // ISO date string

  // Lead metrics
  leadsAssigned: z.number().int().default(0),
  leadsHandled: z.number().int().default(0),
  leadsConverted: z.number().int().default(0),
  leadsLost: z.number().int().default(0),

  // Call metrics
  callsInbound: z.number().int().default(0),
  callsOutbound: z.number().int().default(0),
  callsAnswered: z.number().int().default(0),
  callsMissed: z.number().int().default(0),
  totalTalkTimeSeconds: z.number().int().default(0),
  avgCallDurationSeconds: z.number().int().default(0),

  // Message metrics
  messagesSent: z.number().int().default(0),
  messagesReceived: z.number().int().default(0),

  // Response metrics
  avgResponseTimeMs: z.number().int().default(0),
  minResponseTimeMs: z.number().int().optional().nullable(),
  maxResponseTimeMs: z.number().int().optional().nullable(),
  firstResponseTimeMs: z.number().int().optional().nullable(),

  // Conversion metrics
  appointmentsScheduled: z.number().int().default(0),
  appointmentsCompleted: z.number().int().default(0),
  appointmentsCancelled: z.number().int().default(0),

  // Quality metrics
  escalations: z.number().int().default(0),
  handoffsReceived: z.number().int().default(0),
  handoffsGiven: z.number().int().default(0),

  // Satisfaction
  csatResponses: z.number().int().default(0),
  csatTotalScore: z.number().int().default(0),
  npsPromoters: z.number().int().default(0),
  npsDetractors: z.number().int().default(0),
  npsPassives: z.number().int().default(0),

  // Revenue
  revenueGenerated: z.number().default(0),

  // Time tracking
  timeLoggedSeconds: z.number().int().default(0),
  timeOnBreakSeconds: z.number().int().default(0),
  timeInCallsSeconds: z.number().int().default(0),

  // Wrap-up time tracking (M8)
  wrapUpTimeSeconds: z.number().int().default(0),
  wrapUpCount: z.number().int().default(0),
  avgWrapUpTimeSeconds: z.number().int().default(0),
  minWrapUpTimeSeconds: z.number().int().optional().nullable(),
  maxWrapUpTimeSeconds: z.number().int().optional().nullable(),
});

// ============================================================================
// DASHBOARD DISPLAY SCHEMAS
// ============================================================================

/**
 * Agent performance summary for dashboard display
 */
export const AgentPerformanceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().optional().nullable(),
  agentType: AgentTypeSchema,
  role: AgentRoleSchema,
  status: AgentAvailabilitySchema.optional(),

  // Key metrics
  leadsHandled: z.number().int(),
  conversions: z.number().int(),
  conversionRate: z.number(), // Percentage
  avgResponseTime: z.number(), // Minutes
  satisfaction: z.number(), // CSAT score (1-5)

  // Additional metrics
  totalCalls: z.number().int().optional(),
  talkTimeHours: z.number().optional(),
  revenue: z.number().optional(),
  activeLeads: z.number().int().optional(),
});

/**
 * Agent trend data point for charts
 */
export const AgentTrendPointSchema = z.object({
  date: z.string(),
  leadsHandled: z.number().int(),
  conversions: z.number().int(),
  conversionRate: z.number(),
  avgResponseTimeMin: z.number(),
  satisfaction: z.number().nullable(),
  revenue: z.number(),
});

/**
 * Agent details with full performance data
 */
export const AgentDetailSchema = z.object({
  agent: AgentSchema,
  currentStatus: AgentAvailabilitySchema.optional(),
  sessionStarted: z.string().optional().nullable(),
  summary: AgentPerformanceSummarySchema,
  trend: z.array(AgentTrendPointSchema),
  recentLeads: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        phone: z.string(),
        status: z.string(),
        assignedAt: z.string(),
        outcome: LeadOutcomeSchema.optional().nullable(),
      })
    )
    .optional(),
});

/**
 * Dashboard aggregate metrics
 */
export const AgentDashboardMetricsSchema = z.object({
  totalAgents: z.number().int(),
  activeAgents: z.number().int(),
  avgConversionRate: z.number(),
  avgConversionRateChange: z.number(),
  totalLeadsHandled: z.number().int(),
  totalLeadsHandledChange: z.number(),
  avgResponseTime: z.number(), // Minutes
  avgResponseTimeChange: z.number(),
  avgSatisfaction: z.number(), // CSAT
  avgSatisfactionChange: z.number(),
  totalRevenue: z.number(),
  totalRevenueChange: z.number(),
});

/**
 * Full dashboard data response
 */
export const AgentPerformanceDashboardDataSchema = z.object({
  metrics: AgentDashboardMetricsSchema,
  agents: z.array(AgentPerformanceSummarySchema),
  topPerformers: z.array(AgentPerformanceSummarySchema),
  needsAttention: z.array(AgentPerformanceSummarySchema),
  performanceOverTime: z.array(
    z.object({
      date: z.string(),
      avgConversionRate: z.number(),
      avgResponseTime: z.number(),
      totalLeads: z.number().int(),
    })
  ),
});

// ============================================================================
// REQUEST/RESPONSE SCHEMAS
// ============================================================================

/**
 * Time range for queries
 */
export const AgentPerformanceTimeRangeSchema = z.enum(['7d', '30d', '90d', '12m']);

/**
 * Request params for agent performance data
 */
export const GetAgentPerformanceRequestSchema = z.object({
  timeRange: AgentPerformanceTimeRangeSchema.default('30d'),
  agentId: z.string().uuid().optional(),
  agentType: AgentTypeSchema.optional(),
  sortBy: z
    .enum(['name', 'leadsHandled', 'conversionRate', 'avgResponseTime', 'satisfaction', 'revenue'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ============================================================================
// WRAP-UP TIME TRACKING SCHEMAS (M8)
// ============================================================================

/**
 * Wrap-up event status
 */
export const WrapUpStatusSchema = z.enum(['in_progress', 'completed', 'abandoned']);

/**
 * Individual wrap-up event record
 */
export const WrapUpEventSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  clinicId: z.string().uuid(),
  callSid: z.string(),
  leadId: z.string().uuid().optional().nullable(),
  dispositionId: z.string().uuid().optional().nullable(),
  status: WrapUpStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Start wrap-up request
 */
export const StartWrapUpRequestSchema = z.object({
  agentId: z.string().uuid(),
  clinicId: z.string().uuid(),
  callSid: z.string(),
  leadId: z.string().uuid().optional(),
});

/**
 * Complete wrap-up request
 */
export const CompleteWrapUpRequestSchema = z.object({
  callSid: z.string(),
  agentId: z.string().uuid(),
  dispositionId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

/**
 * Wrap-up statistics for an agent
 */
export const WrapUpStatsSchema = z.object({
  agentId: z.string().uuid(),
  totalWrapUps: z.number().int(),
  completedWrapUps: z.number().int(),
  abandonedWrapUps: z.number().int(),
  totalWrapUpTimeSeconds: z.number().int(),
  avgWrapUpTimeSeconds: z.number(),
  minWrapUpTimeSeconds: z.number().int().nullable(),
  maxWrapUpTimeSeconds: z.number().int().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

/**
 * Wrap-up time trend data point
 */
export const WrapUpTrendPointSchema = z.object({
  date: z.string(),
  wrapUpCount: z.number().int(),
  avgWrapUpTimeSeconds: z.number(),
  totalWrapUpTimeSeconds: z.number().int(),
});

/**
 * Agent wrap-up performance for dashboard
 */
export const AgentWrapUpPerformanceSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string(),
  avgWrapUpTimeSeconds: z.number(),
  totalWrapUps: z.number().int(),
  completionRate: z.number(), // Percentage of completed vs abandoned
  trend: z.enum(['improving', 'stable', 'declining']),
  comparedToTeamAvg: z.number(), // Percentage difference from team average
});

/**
 * Wrap-up time dashboard data
 */
export const WrapUpDashboardDataSchema = z.object({
  teamAvgWrapUpSeconds: z.number(),
  teamAvgWrapUpSecondsChange: z.number(), // vs previous period
  totalWrapUps: z.number().int(),
  totalWrapUpTimeSeconds: z.number().int(),
  completionRate: z.number(),
  agentPerformance: z.array(AgentWrapUpPerformanceSchema),
  trend: z.array(WrapUpTrendPointSchema),
  topPerformers: z.array(AgentWrapUpPerformanceSchema),
  needsImprovement: z.array(AgentWrapUpPerformanceSchema),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type AgentType = z.infer<typeof AgentTypeSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type AgentAvailability = z.infer<typeof AgentAvailabilitySchema>;
export type AssignmentReason = z.infer<typeof AssignmentReasonSchema>;
export type LeadOutcome = z.infer<typeof LeadOutcomeSchema>;
export type RatingType = z.infer<typeof RatingTypeSchema>;

export type Agent = z.infer<typeof AgentSchema>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
export type AgentDailyMetrics = z.infer<typeof AgentDailyMetricsSchema>;
export type AgentPerformanceSummary = z.infer<typeof AgentPerformanceSummarySchema>;
export type AgentTrendPoint = z.infer<typeof AgentTrendPointSchema>;
export type AgentDetail = z.infer<typeof AgentDetailSchema>;
export type AgentDashboardMetrics = z.infer<typeof AgentDashboardMetricsSchema>;
export type AgentPerformanceDashboardData = z.infer<typeof AgentPerformanceDashboardDataSchema>;
export type AgentPerformanceTimeRange = z.infer<typeof AgentPerformanceTimeRangeSchema>;
export type GetAgentPerformanceRequest = z.infer<typeof GetAgentPerformanceRequestSchema>;

// Wrap-up time tracking types (M8)
export type WrapUpStatus = z.infer<typeof WrapUpStatusSchema>;
export type WrapUpEvent = z.infer<typeof WrapUpEventSchema>;
export type StartWrapUpRequest = z.infer<typeof StartWrapUpRequestSchema>;
export type CompleteWrapUpRequest = z.infer<typeof CompleteWrapUpRequestSchema>;
export type WrapUpStats = z.infer<typeof WrapUpStatsSchema>;
export type WrapUpTrendPoint = z.infer<typeof WrapUpTrendPointSchema>;
export type AgentWrapUpPerformance = z.infer<typeof AgentWrapUpPerformanceSchema>;
export type WrapUpDashboardData = z.infer<typeof WrapUpDashboardDataSchema>;

'use server';

/**
 * @fileoverview Agent Performance Server Actions
 *
 * M7: Agent Performance Dashboard - Individual Metrics
 * Server actions for agent performance data fetching and aggregation.
 *
 * @module actions/agent-performance
 * @security All actions require VIEW_ANALYTICS permission
 */

import type {
  AgentPerformanceSummary,
  AgentTrendPoint,
  AgentDashboardMetrics,
  AgentPerformanceDashboardData,
  AgentPerformanceTimeRange,
  AgentDetail,
  Agent,
} from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';

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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate percentage change between two values
 */
function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Generate mock agent data for development
 * In production, this would be replaced with database queries
 */
function generateMockAgents(timeRange: AgentPerformanceTimeRange): AgentPerformanceSummary[] {
  const mockAgents: AgentPerformanceSummary[] = [
    {
      id: 'agent-1',
      name: 'Maria Popescu',
      avatarUrl: null,
      agentType: 'human',
      role: 'senior_agent',
      status: 'available',
      leadsHandled: 145,
      conversions: 42,
      conversionRate: 29.0,
      avgResponseTime: 2.3,
      satisfaction: 4.7,
      totalCalls: 89,
      talkTimeHours: 24.5,
      revenue: 15200,
      activeLeads: 12,
    },
    {
      id: 'agent-2',
      name: 'Alexandru Ionescu',
      avatarUrl: null,
      agentType: 'human',
      role: 'agent',
      status: 'busy',
      leadsHandled: 98,
      conversions: 31,
      conversionRate: 31.6,
      avgResponseTime: 3.1,
      satisfaction: 4.5,
      totalCalls: 67,
      talkTimeHours: 18.2,
      revenue: 12800,
      activeLeads: 8,
    },
    {
      id: 'agent-3',
      name: 'Elena Stanescu',
      avatarUrl: null,
      agentType: 'human',
      role: 'team_lead',
      status: 'available',
      leadsHandled: 178,
      conversions: 58,
      conversionRate: 32.6,
      avgResponseTime: 1.8,
      satisfaction: 4.9,
      totalCalls: 112,
      talkTimeHours: 31.4,
      revenue: 22400,
      activeLeads: 15,
    },
    {
      id: 'agent-4',
      name: 'Dental AI Assistant',
      avatarUrl: null,
      agentType: 'ai',
      role: 'agent',
      status: 'available',
      leadsHandled: 312,
      conversions: 78,
      conversionRate: 25.0,
      avgResponseTime: 0.1,
      satisfaction: 4.2,
      totalCalls: 245,
      talkTimeHours: 52.3,
      revenue: 8900,
      activeLeads: 45,
    },
    {
      id: 'agent-5',
      name: 'Andrei Popa',
      avatarUrl: null,
      agentType: 'human',
      role: 'agent',
      status: 'away',
      leadsHandled: 67,
      conversions: 15,
      conversionRate: 22.4,
      avgResponseTime: 4.2,
      satisfaction: 4.1,
      totalCalls: 45,
      talkTimeHours: 12.1,
      revenue: 7200,
      activeLeads: 5,
    },
    {
      id: 'agent-6',
      name: 'Diana Marinescu',
      avatarUrl: null,
      agentType: 'human',
      role: 'agent',
      status: 'offline',
      leadsHandled: 89,
      conversions: 28,
      conversionRate: 31.5,
      avgResponseTime: 2.8,
      satisfaction: 4.6,
      totalCalls: 56,
      talkTimeHours: 15.8,
      revenue: 11500,
      activeLeads: 0,
    },
  ];

  // Adjust values based on time range
  const multiplier = TIME_RANGE_DAYS[timeRange] / 30;

  return mockAgents.map((agent) => ({
    ...agent,
    leadsHandled: Math.round(agent.leadsHandled * multiplier),
    conversions: Math.round(agent.conversions * multiplier),
    totalCalls: Math.round((agent.totalCalls ?? 0) * multiplier),
    talkTimeHours: Math.round((agent.talkTimeHours ?? 0) * multiplier * 10) / 10,
    revenue: Math.round((agent.revenue ?? 0) * multiplier),
  }));
}

/**
 * Generate mock trend data for an agent
 */
function generateMockTrend(
  agentId: string,
  timeRange: AgentPerformanceTimeRange
): AgentTrendPoint[] {
  const days = TIME_RANGE_DAYS[timeRange];
  const trend: AgentTrendPoint[] = [];

  // Base values vary by agent
  const baseConversionRate = agentId === 'agent-3' ? 32 : agentId === 'agent-4' ? 25 : 28;
  const baseLeads = agentId === 'agent-4' ? 12 : 5;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';

    // Add some variation
    const variation = Math.sin(i * 0.5) * 3;
    const dailyLeads = Math.max(1, Math.round(baseLeads + Math.random() * 3 - 1));

    trend.push({
      date: dateStr,
      leadsHandled: dailyLeads,
      conversions: Math.round(dailyLeads * (baseConversionRate / 100)),
      conversionRate: Math.round((baseConversionRate + variation) * 10) / 10,
      avgResponseTimeMin: Math.round((2.5 + Math.random() * 1.5) * 10) / 10,
      satisfaction: Math.round((4.3 + Math.random() * 0.6) * 10) / 10,
      revenue: Math.round(dailyLeads * 180 + Math.random() * 200),
    });
  }

  return trend;
}

/**
 * Generate mock performance over time data
 */
function generateMockPerformanceOverTime(
  timeRange: AgentPerformanceTimeRange
): AgentPerformanceDashboardData['performanceOverTime'] {
  const days = TIME_RANGE_DAYS[timeRange];
  const data: AgentPerformanceDashboardData['performanceOverTime'] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';

    // Add some variation
    const variation = Math.sin(i * 0.3) * 2;

    data.push({
      date: dateStr,
      avgConversionRate: Math.round((28 + variation) * 10) / 10,
      avgResponseTime: Math.round((2.5 + Math.random() * 0.5) * 10) / 10,
      totalLeads: Math.round(25 + Math.random() * 10),
    });
  }

  return data;
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get agent performance dashboard data
 *
 * @param timeRange - Time range for analytics (7d, 30d, 90d, 12m)
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Complete dashboard data including metrics, agents, and trends
 */
export async function getAgentPerformanceDashboardAction(
  timeRange: AgentPerformanceTimeRange = '30d'
): Promise<AgentPerformanceDashboardData> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    // Get mock data (replace with database queries in production)
    const agents = generateMockAgents(timeRange);

    // Calculate aggregate metrics
    const totalLeadsHandled = agents.reduce((sum, a) => sum + a.leadsHandled, 0);
    const totalConversions = agents.reduce((sum, a) => sum + a.conversions, 0);
    const avgConversionRate =
      totalLeadsHandled > 0 ? Math.round((totalConversions / totalLeadsHandled) * 1000) / 10 : 0;

    const responseTimeSum = agents.reduce((sum, a) => sum + a.avgResponseTime * a.leadsHandled, 0);
    const avgResponseTime =
      totalLeadsHandled > 0 ? Math.round((responseTimeSum / totalLeadsHandled) * 10) / 10 : 0;

    const satisfactionSum = agents
      .filter((a) => a.satisfaction > 0)
      .reduce((sum, a) => sum + a.satisfaction, 0);
    const satisfactionCount = agents.filter((a) => a.satisfaction > 0).length;
    const avgSatisfaction =
      satisfactionCount > 0 ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : 0;

    const totalRevenue = agents.reduce((sum, a) => sum + (a.revenue ?? 0), 0);
    const activeAgents = agents.filter(
      (a) => a.status === 'available' || a.status === 'busy'
    ).length;

    // Previous period comparison (simulated)
    const previousMultiplier = 0.9 + Math.random() * 0.2;

    const metrics: AgentDashboardMetrics = {
      totalAgents: agents.length,
      activeAgents,
      avgConversionRate,
      avgConversionRateChange: calculatePercentageChange(
        avgConversionRate,
        avgConversionRate * previousMultiplier
      ),
      totalLeadsHandled,
      totalLeadsHandledChange: calculatePercentageChange(
        totalLeadsHandled,
        totalLeadsHandled * previousMultiplier
      ),
      avgResponseTime,
      avgResponseTimeChange: calculatePercentageChange(
        avgResponseTime,
        avgResponseTime * (1 + (1 - previousMultiplier))
      ),
      avgSatisfaction,
      avgSatisfactionChange: calculatePercentageChange(
        avgSatisfaction,
        avgSatisfaction * previousMultiplier
      ),
      totalRevenue,
      totalRevenueChange: calculatePercentageChange(
        totalRevenue,
        totalRevenue * previousMultiplier
      ),
    };

    // Top performers (sorted by conversion rate, min 5 leads)
    const topPerformers = [...agents]
      .filter((a) => a.leadsHandled >= 5)
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5);

    // Needs attention (low conversion or high response time)
    const needsAttention = [...agents]
      .filter((a) => a.leadsHandled >= 3)
      .filter(
        (a) =>
          a.conversionRate < avgConversionRate * 0.7 ||
          a.avgResponseTime > avgResponseTime * 1.5 ||
          (a.satisfaction > 0 && a.satisfaction < 3.5)
      )
      .slice(0, 5);

    const performanceOverTime = generateMockPerformanceOverTime(timeRange);

    return {
      metrics,
      agents,
      topPerformers,
      needsAttention,
      performanceOverTime,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAgentPerformanceDashboardAction] Failed:', error);
    }

    // Return empty data on error
    return {
      metrics: {
        totalAgents: 0,
        activeAgents: 0,
        avgConversionRate: 0,
        avgConversionRateChange: 0,
        totalLeadsHandled: 0,
        totalLeadsHandledChange: 0,
        avgResponseTime: 0,
        avgResponseTimeChange: 0,
        avgSatisfaction: 0,
        avgSatisfactionChange: 0,
        totalRevenue: 0,
        totalRevenueChange: 0,
      },
      agents: [],
      topPerformers: [],
      needsAttention: [],
      performanceOverTime: [],
    };
  }
}

/**
 * Get performance summary for all agents
 *
 * @param timeRange - Time range for analytics
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Array of agent performance summaries
 */
export async function getAgentPerformanceSummaryAction(
  timeRange: AgentPerformanceTimeRange = '30d'
): Promise<AgentPerformanceSummary[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');
    return generateMockAgents(timeRange);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAgentPerformanceSummaryAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Get detailed performance data for a specific agent
 *
 * @param agentId - The agent's ID
 * @param timeRange - Time range for analytics
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Agent detail with summary and trend data
 */
export async function getAgentDetailAction(
  agentId: string,
  timeRange: AgentPerformanceTimeRange = '30d'
): Promise<AgentDetail | null> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const agents = generateMockAgents(timeRange);
    const agentSummary = agents.find((a) => a.id === agentId);

    if (!agentSummary) {
      return null;
    }

    const trend = generateMockTrend(agentId, timeRange);

    // Mock agent entity
    const agent: Agent = {
      id: agentId,
      clinicId: 'clinic-1',
      name: agentSummary.name,
      avatarUrl: agentSummary.avatarUrl,
      agentType: agentSummary.agentType,
      role: agentSummary.role,
      skills: ['dental', 'orthodontics', 'implants'],
      languages: ['ro', 'en'],
      maxConcurrentChats: 3,
      status: 'active',
      available: agentSummary.status === 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      agent,
      currentStatus: agentSummary.status,
      sessionStarted:
        agentSummary.status !== 'offline' ? new Date(Date.now() - 3600000).toISOString() : null,
      summary: agentSummary,
      trend,
      recentLeads: [
        {
          id: 'lead-1',
          name: 'Ion Vasilescu',
          phone: '+40722123456',
          status: 'qualified',
          assignedAt: new Date(Date.now() - 7200000).toISOString(),
          outcome: 'pending',
        },
        {
          id: 'lead-2',
          name: 'Ana Georgescu',
          phone: '+40733987654',
          status: 'contacted',
          assignedAt: new Date(Date.now() - 86400000).toISOString(),
          outcome: 'converted',
        },
        {
          id: 'lead-3',
          name: 'Mihai Dumitrescu',
          phone: '+40744567890',
          status: 'new',
          assignedAt: new Date(Date.now() - 1800000).toISOString(),
          outcome: null,
        },
      ],
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAgentDetailAction] Failed:', error);
    }
    return null;
  }
}

/**
 * Get trend data for a specific agent
 *
 * @param agentId - The agent's ID
 * @param timeRange - Time range for analytics
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Array of trend data points
 */
export async function getAgentTrendAction(
  agentId: string,
  timeRange: AgentPerformanceTimeRange = '30d'
): Promise<AgentTrendPoint[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');
    return generateMockTrend(agentId, timeRange);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAgentTrendAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Get dashboard metrics only
 *
 * @param timeRange - Time range for analytics
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Dashboard aggregate metrics
 */
export async function getAgentDashboardMetricsAction(
  timeRange: AgentPerformanceTimeRange = '30d'
): Promise<AgentDashboardMetrics> {
  const data = await getAgentPerformanceDashboardAction(timeRange);
  return data.metrics;
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  AgentPerformanceSummary,
  AgentTrendPoint,
  AgentDashboardMetrics,
  AgentPerformanceDashboardData,
  AgentPerformanceTimeRange,
  AgentDetail,
} from '@medicalcor/types';

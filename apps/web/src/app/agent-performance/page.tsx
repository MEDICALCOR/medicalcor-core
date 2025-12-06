'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  Users,
  TrendingUp,
  Clock,
  Star,
  Euro,
  Loader2,
  UserCheck,
  Bot,
  AlertTriangle,
  Award,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { MetricCard, LineChart } from '@/components/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportButton } from '@/components/export';
import { cn } from '@/lib/utils';
import {
  getAgentPerformanceDashboardAction,
  type AgentPerformanceDashboardData,
  type AgentPerformanceSummary,
  type AgentPerformanceTimeRange,
  type AgentDashboardMetrics,
} from '@/app/actions/agent-performance';

// ============================================================================
// TYPES
// ============================================================================

type TimeRange = AgentPerformanceTimeRange;

// ============================================================================
// CONSTANTS
// ============================================================================

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 zile' },
  { value: '30d', label: '30 zile' },
  { value: '90d', label: '90 zile' },
  { value: '12m', label: '12 luni' },
];

const defaultMetrics: AgentDashboardMetrics = {
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
};

const defaultData: AgentPerformanceDashboardData = {
  metrics: defaultMetrics,
  agents: [],
  topPerformers: [],
  needsAttention: [],
  performanceOverTime: [],
};

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[220px] w-full" />;
}

// ============================================================================
// AGENT ROW COMPONENT
// ============================================================================

interface AgentRowProps {
  agent: AgentPerformanceSummary;
  showDetails?: boolean;
}

function AgentRow({ agent, showDetails = true }: AgentRowProps) {
  const statusColors: Record<string, string> = {
    available: 'bg-green-500',
    busy: 'bg-yellow-500',
    away: 'bg-orange-500',
    break: 'bg-blue-500',
    training: 'bg-purple-500',
    offline: 'bg-gray-400',
  };

  const roleLabels: Record<string, string> = {
    agent: 'Agent',
    senior_agent: 'Senior',
    team_lead: 'Team Lead',
    supervisor: 'Supervisor',
    manager: 'Manager',
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar with status indicator */}
        <div className="relative">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold',
              agent.agentType === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-primary/20 text-primary'
            )}
          >
            {agent.agentType === 'ai' ? (
              <Bot className="h-5 w-5" />
            ) : (
              agent.name
                .split(' ')
                .map((n) => n[0])
                .join('')
            )}
          </div>
          {agent.status && (
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                statusColors[agent.status] ?? 'bg-gray-400'
              )}
            />
          )}
        </div>

        {/* Name and role */}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{agent.name}</p>
            {agent.agentType === 'ai' && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                AI
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{roleLabels[agent.role] ?? agent.role}</span>
            <span>•</span>
            <span>{agent.leadsHandled} lead-uri</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      {showDetails && (
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center min-w-[60px]">
            <p className="font-semibold">{agent.conversionRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">Conversie</p>
          </div>
          <div className="text-center min-w-[60px]">
            <p className="font-semibold">{agent.avgResponseTime.toFixed(1)}m</p>
            <p className="text-[10px] text-muted-foreground">Răspuns</p>
          </div>
          <div className="text-center min-w-[60px]">
            <Badge
              variant={agent.satisfaction >= 4.5 ? 'success' : agent.satisfaction >= 3.5 ? 'secondary' : 'destructive'}
              className="font-semibold"
            >
              {agent.satisfaction > 0 ? `★ ${agent.satisfaction.toFixed(1)}` : 'N/A'}
            </Badge>
          </div>
          {agent.revenue !== undefined && agent.revenue > 0 && (
            <div className="text-center min-w-[80px]">
              <p className="font-semibold text-emerald-600">
                {new Intl.NumberFormat('ro-RO', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                }).format(agent.revenue)}
              </p>
              <p className="text-[10px] text-muted-foreground">Venituri</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export default function AgentPerformancePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [data, setData] = useState<AgentPerformanceDashboardData>(defaultData);
  const [isPending, startTransition] = useTransition();

  // Fetch data when time range changes
  useEffect(() => {
    startTransition(async () => {
      const fetchedData = await getAgentPerformanceDashboardAction(timeRange);
      setData(fetchedData);
    });
  }, [timeRange]);

  const { metrics, agents, topPerformers, needsAttention, performanceOverTime } = data;

  // Prepare chart data
  const conversionTrendData = useMemo(
    () =>
      performanceOverTime.map((p) => ({
        date: p.date,
        value: p.avgConversionRate,
      })),
    [performanceOverTime]
  );

  const leadsTrendData = useMemo(
    () =>
      performanceOverTime.map((p) => ({
        date: p.date,
        value: p.totalLeads,
      })),
    [performanceOverTime]
  );

  // Prepare export data
  const exportData = agents.map((agent) => ({
    name: agent.name,
    type: agent.agentType,
    role: agent.role,
    status: agent.status ?? 'offline',
    leadsHandled: agent.leadsHandled,
    conversions: agent.conversions,
    conversionRate: agent.conversionRate,
    avgResponseTime: agent.avgResponseTime,
    satisfaction: agent.satisfaction,
    revenue: agent.revenue ?? 0,
  }));

  const exportColumns = [
    { key: 'name' as const, header: 'Agent' },
    { key: 'type' as const, header: 'Tip' },
    { key: 'role' as const, header: 'Rol' },
    { key: 'status' as const, header: 'Status' },
    { key: 'leadsHandled' as const, header: 'Lead-uri' },
    { key: 'conversions' as const, header: 'Conversii' },
    { key: 'conversionRate' as const, header: 'Rată conversie (%)' },
    { key: 'avgResponseTime' as const, header: 'Timp răspuns (min)' },
    { key: 'satisfaction' as const, header: 'Satisfacție' },
    { key: 'revenue' as const, header: 'Venituri (EUR)' },
  ];

  // Calculate human vs AI stats
  const humanAgents = agents.filter((a) => a.agentType === 'human');
  const aiAgents = agents.filter((a) => a.agentType === 'ai');

  return (
    <PagePermissionGate pathname="/analytics">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              Performanță Agenți
              {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">Monitorizează performanța individuală a agenților</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Time range selector */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              {timeRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTimeRange(option.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    timeRange === option.value
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <ExportButton data={exportData} columns={exportColumns} filename={`agent-performance-${timeRange}`} />
          </div>
        </div>

        {/* Metrics Grid */}
        {isPending ? (
          <MetricsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="Total Agenți"
              value={metrics.totalAgents}
              icon={Users}
              suffix={` (${metrics.activeAgents} activi)`}
            />
            <MetricCard
              title="Lead-uri Gestionate"
              value={metrics.totalLeadsHandled}
              change={metrics.totalLeadsHandledChange}
              icon={UserCheck}
            />
            <MetricCard
              title="Rată Conversie"
              value={metrics.avgConversionRate}
              change={metrics.avgConversionRateChange}
              format="percentage"
              icon={TrendingUp}
            />
            <MetricCard
              title="Timp Răspuns Mediu"
              value={metrics.avgResponseTime}
              change={metrics.avgResponseTimeChange}
              format="time"
              icon={Clock}
            />
            <MetricCard
              title="Satisfacție Medie"
              value={metrics.avgSatisfaction}
              change={metrics.avgSatisfactionChange}
              icon={Star}
              iconColor="text-yellow-500"
              prefix="★ "
            />
            <MetricCard
              title="Venituri Totale"
              value={metrics.totalRevenue}
              change={metrics.totalRevenueChange}
              format="currency"
              icon={Euro}
              iconColor="text-emerald-500"
            />
          </div>
        )}

        {/* Charts Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Conversion Rate Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rată Conversie în Timp</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : (
                <LineChart data={conversionTrendData} height={220} color="hsl(var(--primary))" />
              )}
            </CardContent>
          </Card>

          {/* Leads Handled Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lead-uri Gestionate în Timp</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : (
                <LineChart data={leadsTrendData} height={220} color="hsl(142, 76%, 36%)" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Performers & Needs Attention */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top Performers */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                <CardTitle className="text-base">Top Performeri</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <TableSkeleton />
              ) : topPerformers.length > 0 ? (
                <div className="space-y-2">
                  {topPerformers.map((agent, index) => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                          index === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : index === 1
                              ? 'bg-gray-100 text-gray-700'
                              : index === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <AgentRow agent={agent} showDetails={true} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nu sunt date disponibile</p>
              )}
            </CardContent>
          </Card>

          {/* Needs Attention */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-base">Necesită Atenție</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <TableSkeleton />
              ) : needsAttention.length > 0 ? (
                <div className="space-y-2">
                  {needsAttention.map((agent) => (
                    <AgentRow key={agent.id} agent={agent} showDetails={true} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Toți agenții performează bine!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Human vs AI Comparison */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Human Agents */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Agenți Umani</CardTitle>
                </div>
                <Badge variant="secondary">{humanAgents.length} agenți</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <TableSkeleton />
              ) : humanAgents.length > 0 ? (
                <div className="space-y-2">
                  {humanAgents.slice(0, 5).map((agent) => (
                    <AgentRow key={agent.id} agent={agent} showDetails={true} />
                  ))}
                  {humanAgents.length > 5 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      +{humanAgents.length - 5} agenți
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nu sunt agenți umani</p>
              )}
            </CardContent>
          </Card>

          {/* AI Agents */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-base">Agenți AI</CardTitle>
                </div>
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  {aiAgents.length} agenți
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <TableSkeleton />
              ) : aiAgents.length > 0 ? (
                <div className="space-y-2">
                  {aiAgents.map((agent) => (
                    <AgentRow key={agent.id} agent={agent} showDetails={true} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nu sunt agenți AI</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* All Agents Table */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Toți Agenții</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Disponibil</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>Ocupat</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span>Offline</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <TableSkeleton />
            ) : agents.length > 0 ? (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} showDetails={true} />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nu sunt agenți înregistrați</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PagePermissionGate>
  );
}

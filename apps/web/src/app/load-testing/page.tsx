'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Server,
  Loader2,
  Zap,
  Gauge,
} from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import {
  getLoadTestDashboardAction,
  getLoadTestEnvironmentsAction,
  type LoadTestDashboardData,
  type LoadTestTimeRange,
} from '@/app/actions/load-testing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PerformanceChart } from './performance-chart';
import { ScenarioDonut } from './scenario-donut';

const timeRangeOptions: { value: LoadTestTimeRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
];

const defaultDashboardData: LoadTestDashboardData = {
  stats: {
    totalRuns: 0,
    passedRuns: 0,
    failedRuns: 0,
    degradedRuns: 0,
    avgP95Duration: 0,
    avgSuccessRate: 0,
    lastRunAt: null,
  },
  trends: [],
  scenarioBreakdown: [],
  environmentComparison: [],
  recentRuns: [],
};

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[300px] w-full" />;
}

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  iconColor?: string;
  suffix?: string;
  format?: 'number' | 'percentage' | 'time';
}

function MetricCard({ title, value, icon: Icon, iconColor, suffix, format }: MetricCardProps) {
  let displayValue: string;

  if (typeof value === 'string') {
    displayValue = value;
  } else if (format === 'percentage') {
    displayValue = `${value.toFixed(1)}%`;
  } else if (format === 'time') {
    displayValue = `${value.toFixed(0)}ms`;
  } else {
    displayValue = value.toLocaleString();
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">
              {displayValue}
              {suffix && (
                <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
              )}
            </p>
          </div>
          <Icon className={cn('h-8 w-8', iconColor ?? 'text-muted-foreground')} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'passed' | 'failed' | 'degraded' }) {
  const variants = {
    passed: { variant: 'success' as const, icon: CheckCircle2, label: 'Passed', className: '' },
    failed: { variant: 'destructive' as const, icon: XCircle, label: 'Failed', className: '' },
    degraded: { variant: 'warm' as const, icon: AlertTriangle, label: 'Degraded', className: '' },
  };

  const { variant, icon: Icon, label, className } = variants[status];

  return (
    <Badge variant={variant} className={cn('gap-1', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ScenarioBadge({ scenario }: { scenario: string }) {
  const colors: Record<string, string> = {
    smoke: 'bg-green-100 text-green-800',
    load: 'bg-blue-100 text-blue-800',
    stress: 'bg-orange-100 text-orange-800',
    soak: 'bg-purple-100 text-purple-800',
    custom: 'bg-gray-100 text-gray-800',
  };

  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium',
        colors[scenario] ?? colors.custom
      )}
    >
      {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
    </span>
  );
}

// eslint-disable-next-line max-lines-per-function, complexity -- Dashboard page with many sections
export default function LoadTestingPage() {
  const [timeRange, setTimeRange] = useState<LoadTestTimeRange>('30d');
  const [environment, setEnvironment] = useState<string>('');
  const [environments, setEnvironments] = useState<string[]>([]);
  const [data, setData] = useState<LoadTestDashboardData>(defaultDashboardData);
  const [isPending, startTransition] = useTransition();

  // Fetch environments on mount
  useEffect(() => {
    getLoadTestEnvironmentsAction()
      .then(setEnvironments)
      .catch(() => setEnvironments([]));
  }, []);

  // Fetch dashboard data when filters change
  useEffect(() => {
    startTransition(async () => {
      const fetchedData = await getLoadTestDashboardAction(timeRange, environment || undefined);
      setData(fetchedData);
    });
  }, [timeRange, environment]);

  const { stats, trends, scenarioBreakdown, environmentComparison, recentRuns } = data;

  const passRate = stats.totalRuns > 0 ? (stats.passedRuns / stats.totalRuns) * 100 : 0;

  return (
    <PagePermissionGate pathname="/load-testing">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              Load Testing Dashboard
              {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">Monitor K6 performance test results and trends</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Environment selector */}
            {environments.length > 0 && (
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All Environments</option>
                {environments.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            )}

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
          </div>
        </div>

        {/* Metrics Grid */}
        {isPending ? (
          <MetricsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="Total Runs"
              value={stats.totalRuns}
              icon={Activity}
              iconColor="text-blue-500"
            />
            <MetricCard
              title="Passed"
              value={stats.passedRuns}
              icon={CheckCircle2}
              iconColor="text-green-500"
            />
            <MetricCard
              title="Failed"
              value={stats.failedRuns}
              icon={XCircle}
              iconColor="text-red-500"
            />
            <MetricCard
              title="Pass Rate"
              value={passRate}
              format="percentage"
              icon={TrendingUp}
              iconColor={
                passRate >= 90
                  ? 'text-green-500'
                  : passRate >= 70
                    ? 'text-yellow-500'
                    : 'text-red-500'
              }
            />
            <MetricCard
              title="Avg P95"
              value={stats.avgP95Duration}
              format="time"
              icon={Gauge}
              iconColor="text-purple-500"
            />
            <MetricCard
              title="Avg Success Rate"
              value={stats.avgSuccessRate}
              format="percentage"
              icon={Zap}
              iconColor="text-orange-500"
            />
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Performance Trends */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : trends.length > 0 ? (
                <PerformanceChart data={trends} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No performance data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scenario Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Scenario Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : scenarioBreakdown.length > 0 ? (
                <ScenarioDonut data={scenarioBreakdown} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No scenario data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Environment Comparison & Recent Runs */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Environment Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Environment Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : environmentComparison.length > 0 ? (
                <div className="space-y-3">
                  {environmentComparison.map((env) => (
                    <div key={env.environment} className="p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{env.environment}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{env.totalRuns} runs</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">P95</p>
                          <p className="font-semibold">{env.avgP95.toFixed(0)}ms</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">P99</p>
                          <p className="font-semibold">{env.avgP99.toFixed(0)}ms</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Success</p>
                          <p className="font-semibold">{env.avgSuccessRate.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No environment data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Runs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Test Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentRuns.length > 0 ? (
                <div className="space-y-2">
                  {recentRuns.slice(0, 8).map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <StatusBadge status={run.status} />
                        <ScenarioBadge scenario={run.scenario} />
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="font-medium">{run.p95Duration.toFixed(0)}ms</p>
                          <p className="text-xs text-muted-foreground">P95</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{run.successRate.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">Success</p>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.startedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground flex-col gap-2">
                  <Activity className="h-10 w-10" />
                  <p>No test runs recorded yet</p>
                  <p className="text-sm">Run K6 tests with DASHBOARD_API_URL to see results here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Last Run Info */}
        {stats.lastRunAt && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              Last test run:{' '}
              {new Date(stats.lastRunAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>
    </PagePermissionGate>
  );
}

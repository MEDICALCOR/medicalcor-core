'use client';

import { useState, useEffect, useTransition } from 'react';
import { Users, CalendarCheck, TrendingUp, Clock, Euro, Flame, Loader2 } from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import {
  getAnalyticsDataAction,
  type AnalyticsData,
  type AnalyticsMetrics,
} from '@/app/actions/get-patients';
import { MetricCard, LineChart, DonutChart, FunnelChart, BarChart } from '@/components/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportButton } from '@/components/export';
import { cn } from '@/lib/utils';

type TimeRange = '7d' | '30d' | '90d' | '12m';

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 zile' },
  { value: '30d', label: '30 zile' },
  { value: '90d', label: '90 zile' },
  { value: '12m', label: '12 luni' },
];

const defaultMetrics: AnalyticsMetrics = {
  totalLeads: 0,
  totalLeadsChange: 0,
  hotLeads: 0,
  hotLeadsChange: 0,
  appointmentsScheduled: 0,
  appointmentsChange: 0,
  conversionRate: 0,
  conversionRateChange: 0,
  avgResponseTime: 0,
  avgResponseTimeChange: 0,
  revenue: 0,
  revenueChange: 0,
};

const defaultData: AnalyticsData = {
  metrics: defaultMetrics,
  leadsOverTime: [],
  appointmentsOverTime: [],
  leadsBySource: [],
  conversionFunnel: [],
  topProcedures: [],
  operatorPerformance: [],
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
  return <Skeleton className="h-[220px] w-full" />;
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [data, setData] = useState<AnalyticsData>(defaultData);
  const [isPending, startTransition] = useTransition();

  // Fetch analytics data when time range changes
  useEffect(() => {
    startTransition(async () => {
      const fetchedData = await getAnalyticsDataAction(timeRange);
      setData(fetchedData);
    });
  }, [timeRange]);

  const {
    metrics,
    leadsOverTime,
    appointmentsOverTime,
    leadsBySource,
    conversionFunnel,
    topProcedures,
    operatorPerformance,
  } = data;

  // Prepare export data
  const exportData = operatorPerformance.map((op) => ({
    name: op.name,
    leadsHandled: op.leadsHandled,
    conversions: op.conversions,
    conversionRate: op.conversionRate,
    avgResponseTime: op.avgResponseTime,
    satisfaction: op.satisfaction,
  }));

  const exportColumns = [
    { key: 'name' as const, header: 'Operator' },
    { key: 'leadsHandled' as const, header: 'Lead-uri' },
    { key: 'conversions' as const, header: 'Conversii' },
    { key: 'conversionRate' as const, header: 'Rată conversie (%)' },
    { key: 'avgResponseTime' as const, header: 'Timp răspuns (min)' },
    { key: 'satisfaction' as const, header: 'Satisfacție' },
  ];

  return (
    <PagePermissionGate pathname="/analytics">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              Analytics
              {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">Monitorizează performanța și tendințele</p>
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

            <ExportButton
              data={exportData}
              columns={exportColumns}
              filename={`analytics-${timeRange}`}
            />
          </div>
        </div>

        {/* Metrics Grid */}
        {isPending ? (
          <MetricsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="Total Lead-uri"
              value={metrics.totalLeads}
              change={metrics.totalLeadsChange}
              icon={Users}
            />
            <MetricCard
              title="Lead-uri HOT"
              value={metrics.hotLeads}
              change={metrics.hotLeadsChange}
              icon={Flame}
              iconColor="text-orange-500"
            />
            <MetricCard
              title="Programări"
              value={metrics.appointmentsScheduled}
              change={metrics.appointmentsChange}
              icon={CalendarCheck}
            />
            <MetricCard
              title="Rată Conversie"
              value={metrics.conversionRate}
              change={metrics.conversionRateChange}
              format="percentage"
              icon={TrendingUp}
            />
            <MetricCard
              title="Timp Răspuns"
              value={metrics.avgResponseTime}
              change={metrics.avgResponseTimeChange}
              format="time"
              icon={Clock}
            />
            <MetricCard
              title="Venituri"
              value={metrics.revenue}
              change={metrics.revenueChange}
              format="currency"
              icon={Euro}
              iconColor="text-emerald-500"
            />
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Leads Over Time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lead-uri în timp</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? <ChartSkeleton /> : <LineChart data={leadsOverTime} height={220} />}
            </CardContent>
          </Card>

          {/* Appointments Over Time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Programări în timp</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : (
                <LineChart data={appointmentsOverTime} height={220} color="hsl(142, 76%, 36%)" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Leads by Source */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lead-uri pe sursă</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : (
                <DonutChart
                  data={leadsBySource.map((s) => ({
                    label: s.source,
                    value: s.count,
                    color: s.color,
                  }))}
                  centerValue={metrics.totalLeads}
                  centerLabel="Total"
                />
              )}
            </CardContent>
          </Card>

          {/* Conversion Funnel */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Funnel Conversie</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? <ChartSkeleton /> : <FunnelChart data={conversionFunnel} />}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 3 */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top Procedures */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Proceduri</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <ChartSkeleton />
              ) : (
                <BarChart
                  data={topProcedures.map((p) => ({
                    label: p.procedure,
                    value: p.count,
                    secondaryValue: p.revenue,
                  }))}
                  valueLabel="interesați"
                  secondaryLabel="EUR"
                  formatSecondary={(v) => new Intl.NumberFormat('ro-RO').format(v)}
                />
              )}
            </CardContent>
          </Card>

          {/* Operator Performance */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Performanță Operatori</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {operatorPerformance.map((op) => (
                    <div
                      key={op.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">
                          {op.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{op.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {op.leadsHandled} lead-uri
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="font-semibold">{op.conversionRate.toFixed(1)}%</p>
                          <p className="text-[10px] text-muted-foreground">Conversie</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold">{op.avgResponseTime.toFixed(1)}m</p>
                          <p className="text-[10px] text-muted-foreground">Răspuns</p>
                        </div>
                        <Badge variant={op.satisfaction >= 4.5 ? 'success' : 'secondary'}>
                          ★ {op.satisfaction.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PagePermissionGate>
  );
}

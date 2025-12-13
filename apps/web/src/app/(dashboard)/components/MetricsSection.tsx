/**
 * @fileoverview Metrics Section Server Component
 *
 * Displays key performance metrics for the dashboard.
 * Server component for optimal performance.
 *
 * @module web/app/(dashboard)/components/MetricsSection
 */

interface MetricCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly change?: number;
  readonly trend?: 'up' | 'down' | 'neutral';
}

function MetricCard({ title, value, change, trend }: MetricCardProps) {
  const trendColor =
    trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {change !== undefined && (
        <p className={`mt-1 text-sm ${trendColor}`}>
          {change > 0 ? '+' : ''}
          {change}% from last period
        </p>
      )}
    </div>
  );
}

async function fetchMetrics() {
  // In production, fetch from API
  return {
    totalLeads: 1247,
    leadChange: 12.5,
    hotLeads: 89,
    hotLeadChange: 8.3,
    conversionRate: 23.4,
    conversionChange: 2.1,
    avgResponseTime: '4.2 min',
    responseChange: -15.2,
  };
}

export async function MetricsSection() {
  const metrics = await fetchMetrics();

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Leads"
        value={metrics.totalLeads.toLocaleString()}
        change={metrics.leadChange}
        trend="up"
      />
      <MetricCard
        title="HOT Leads"
        value={metrics.hotLeads}
        change={metrics.hotLeadChange}
        trend="up"
      />
      <MetricCard
        title="Conversion Rate"
        value={`${metrics.conversionRate}%`}
        change={metrics.conversionChange}
        trend="up"
      />
      <MetricCard
        title="Avg Response Time"
        value={metrics.avgResponseTime}
        change={metrics.responseChange}
        trend="up"
      />
    </section>
  );
}

export function MetricsSectionSkeleton() {
  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-6 shadow-sm animate-pulse">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="mt-2 h-8 w-16 bg-gray-200 rounded" />
          <div className="mt-1 h-4 w-32 bg-gray-200 rounded" />
        </div>
      ))}
    </section>
  );
}

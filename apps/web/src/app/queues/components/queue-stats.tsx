'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  PhoneCall,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueDashboardStats } from '../actions';

interface QueueStatsProps {
  stats: QueueDashboardStats;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  status?: 'ok' | 'warning' | 'critical';
  subLabel?: string;
}

function StatCard({ label, value, icon, trend, trendValue, status, subLabel }: StatCardProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden',
        status === 'critical' && 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20',
        status === 'warning' && 'border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              {trend && trendValue && (
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' && 'text-emerald-600 dark:text-emerald-400',
                    trend === 'down' && 'text-red-600 dark:text-red-400',
                    trend === 'neutral' && 'text-muted-foreground'
                  )}
                >
                  {trend === 'up' && '+'}
                  {trendValue}
                </span>
              )}
            </div>
            {subLabel && <p className="text-[10px] text-muted-foreground">{subLabel}</p>}
          </div>
          <div
            className={cn(
              'p-2 rounded-lg',
              status === 'critical'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                : status === 'warning'
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'
                  : 'bg-primary/10 text-primary'
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function QueueStats({ stats }: QueueStatsProps) {
  const getComplianceStatus = (rate: number): 'ok' | 'warning' | 'critical' => {
    if (rate >= 95) return 'ok';
    if (rate >= 85) return 'warning';
    return 'critical';
  };

  const getBreachStatus = (count: number): 'ok' | 'warning' | 'critical' => {
    if (count === 0) return 'ok';
    if (count < 5) return 'warning';
    return 'critical';
  };

  const getServiceLevelStatus = (level: number): 'ok' | 'warning' | 'critical' => {
    if (level >= 80) return 'ok';
    if (level >= 70) return 'warning';
    return 'critical';
  };

  function formatWaitTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={cn(
            stats.complianceRate >= 95
              ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
              : stats.complianceRate >= 85
                ? 'border-orange-500/50 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                : 'border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
          )}
        >
          {stats.complianceRate >= 95 ? (
            <CheckCircle2 className="h-3 w-3 mr-1" />
          ) : (
            <AlertTriangle className="h-3 w-3 mr-1" />
          )}
          {stats.complianceRate}% Compliance
        </Badge>

        {stats.criticalBreaches > 0 && (
          <Badge variant="destructive" className="animate-pulse">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {stats.criticalBreaches} Critical
          </Badge>
        )}

        {stats.activeQueues > 0 && (
          <Badge variant="secondary">
            <Activity className="h-3 w-3 mr-1" />
            {stats.activeQueues} Active Queues
          </Badge>
        )}
      </div>

      {/* Stats Grid - Horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 min-w-[500px] sm:min-w-0">
          <StatCard
            label="Total Queues"
            value={stats.totalQueues}
            icon={<PhoneCall className="h-4 w-4" />}
            subLabel={`${stats.activeQueues} active`}
          />

          <StatCard
            label="Available Agents"
            value={stats.availableAgents}
            icon={<UserCheck className="h-4 w-4" />}
            subLabel={`${stats.totalAgents} total / ${stats.busyAgents} busy`}
          />

          <StatCard
            label="Avg Wait Time"
            value={formatWaitTime(stats.averageWaitTime)}
            icon={<Clock className="h-4 w-4" />}
            status={
              stats.averageWaitTime > 120
                ? 'warning'
                : stats.averageWaitTime > 300
                  ? 'critical'
                  : 'ok'
            }
          />

          <StatCard
            label="Service Level"
            value={`${stats.serviceLevel}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            status={getServiceLevelStatus(stats.serviceLevel)}
            subLabel="Calls answered within target"
          />
        </div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Calls Today"
          value={stats.totalCallsToday}
          icon={<PhoneCall className="h-4 w-4" />}
        />

        <StatCard
          label="SLA Compliance"
          value={`${stats.complianceRate}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          status={getComplianceStatus(stats.complianceRate)}
        />

        <StatCard
          label="Breaches (24h)"
          value={stats.breachesLast24h}
          icon={<AlertTriangle className="h-4 w-4" />}
          status={getBreachStatus(stats.breachesLast24h)}
          subLabel={stats.criticalBreaches > 0 ? `${stats.criticalBreaches} critical` : undefined}
        />

        <StatCard
          label="Total Agents"
          value={stats.totalAgents}
          icon={<Users className="h-4 w-4" />}
          subLabel={`${Math.round((stats.busyAgents / (stats.totalAgents || 1)) * 100)}% utilization`}
        />
      </div>
    </div>
  );
}

export function QueueStatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="h-6 w-32 bg-muted animate-pulse rounded-full" />
        <div className="h-6 w-24 bg-muted animate-pulse rounded-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

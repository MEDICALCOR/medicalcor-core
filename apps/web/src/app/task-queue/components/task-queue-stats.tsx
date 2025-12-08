'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, Loader2, XCircle, Activity, Zap } from 'lucide-react';
import type { TaskQueueStats as TaskQueueStatsType } from '../actions';

interface TaskQueueStatsProps {
  stats: TaskQueueStatsType;
}

export function TaskQueueStats({ stats }: TaskQueueStatsProps) {
  const statCards = [
    {
      label: 'Total Tasks (24h)',
      value: stats.totalTasks.toLocaleString(),
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    },
    {
      label: 'Pending',
      value: stats.pendingTasks.toLocaleString(),
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    },
    {
      label: 'Running',
      value: stats.runningTasks.toLocaleString(),
      icon: Loader2,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950/40',
      animate: stats.runningTasks > 0,
    },
    {
      label: 'Completed',
      value: stats.completedTasks.toLocaleString(),
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      label: 'Failed',
      value: stats.failedTasks.toLocaleString(),
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-950/40',
    },
    {
      label: 'Success Rate',
      value: `${stats.successRate}%`,
      icon: Zap,
      color:
        stats.successRate >= 95
          ? 'text-emerald-500'
          : stats.successRate >= 90
            ? 'text-amber-500'
            : 'text-red-500',
      bgColor:
        stats.successRate >= 95
          ? 'bg-emerald-50 dark:bg-emerald-950/40'
          : stats.successRate >= 90
            ? 'bg-amber-50 dark:bg-amber-950/40'
            : 'bg-red-50 dark:bg-red-950/40',
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {statCards.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon
                  className={`h-4 w-4 ${stat.color} ${stat.animate ? 'animate-spin' : ''}`}
                />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold">{stat.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TaskQueueStatsSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted animate-pulse">
                <div className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <div className="h-5 w-12 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

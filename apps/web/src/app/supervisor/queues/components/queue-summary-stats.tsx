'use client';

/**
 * Queue Summary Stats Component
 *
 * Displays high-level summary statistics for all queues.
 * Mobile-first design with horizontal scroll on mobile.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Phone,
  Users,
  TrendingUp,
} from 'lucide-react';
import type { QueueSummary } from '../actions';
import { cn } from '@/lib/utils';

interface QueueSummaryStatsProps {
  summary: QueueSummary;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  alert?: boolean;
  subtext?: string;
  iconColor?: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  alert,
  subtext,
  iconColor = 'text-muted-foreground',
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'min-w-[140px] flex-shrink-0',
        alert && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', iconColor)} aria-hidden="true" />
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden="true" />}
        </div>
        <div className="mt-2">
          <p className={cn('text-xl sm:text-2xl font-bold', alert && 'text-destructive')}>
            {value}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
          {subtext && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function QueueSummaryStats({ summary }: QueueSummaryStatsProps) {
  return (
    <div className="space-y-4">
      {/* Primary stats - horizontal scroll on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-4 sm:overflow-visible scrollbar-hide">
        <StatCard label="Total Queues" value={summary.totalQueues} icon={LayoutGrid} />
        <StatCard
          label="Calls In Queue"
          value={summary.totalCallsInQueue}
          icon={Phone}
          alert={summary.totalCallsInQueue > 20}
        />
        <StatCard
          label="Available Agents"
          value={`${summary.totalAvailableAgents}/${summary.totalAvailableAgents + summary.totalBusyAgents}`}
          icon={Users}
          alert={summary.totalAvailableAgents === 0 && summary.totalCallsInQueue > 0}
        />
        <StatCard
          label="Avg Service Level"
          value={`${Math.round(summary.averageServiceLevel)}%`}
          icon={TrendingUp}
          trend={summary.averageServiceLevel >= 80 ? 'up' : 'neutral'}
          iconColor={
            summary.averageServiceLevel >= 80 ? 'text-emerald-500' : 'text-muted-foreground'
          }
        />
      </div>

      {/* Status distribution */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Compliant</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-emerald-600">
                {summary.compliantQueues}
              </span>
              {summary.compliantQueues === summary.totalQueues && summary.totalQueues > 0 && (
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">
                  All Clear
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'border-l-4 border-l-amber-500',
            summary.warningQueues > 0 && 'bg-amber-50/30'
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-4 w-4',
                  summary.warningQueues > 0 ? 'text-amber-500' : 'text-muted-foreground'
                )}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">Warning</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={cn(
                  'text-lg font-semibold',
                  summary.warningQueues > 0 && 'text-amber-600'
                )}
              >
                {summary.warningQueues}
              </span>
              {summary.warningQueues > 0 && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">
                  Attention
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'border-l-4 border-l-red-500',
            summary.criticalQueues > 0 && 'bg-red-50/30'
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <XCircle
                className={cn(
                  'h-4 w-4',
                  summary.criticalQueues > 0 ? 'text-red-500' : 'text-muted-foreground'
                )}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={cn(
                  'text-lg font-semibold',
                  summary.criticalQueues > 0 && 'text-red-600'
                )}
              >
                {summary.criticalQueues}
              </span>
              {summary.criticalQueues > 0 && (
                <Badge variant="hot" className="text-[10px]">
                  Action Required
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active breaches alert */}
      {summary.activeBreaches > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {summary.activeBreaches} Active SLA Breach{summary.activeBreaches > 1 ? 'es' : ''}
              </p>
              <p className="text-xs text-red-600">
                Immediate attention required to maintain service levels
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function QueueSummaryStatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-4 sm:overflow-visible">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="min-w-[140px] flex-shrink-0">
            <CardContent className="p-3 sm:p-4">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              <div className="mt-2 space-y-2">
                <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <div className="h-12 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

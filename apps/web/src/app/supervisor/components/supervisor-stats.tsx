'use client';

/**
 * Supervisor Stats Cards Component
 *
 * Mobile-first stats display for supervisor dashboard.
 * Shows key metrics in a scrollable horizontal layout on mobile.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  Users,
  Clock,
  AlertTriangle,
  Bot,
  TrendingUp,
  PhoneIncoming,
  CheckCircle2,
} from 'lucide-react';
import type { SupervisorDashboardStats } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface SupervisorStatsProps {
  stats: SupervisorDashboardStats;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  alert?: boolean;
  subtext?: string;
}

function StatCard({ label, value, icon: Icon, trend, alert, subtext }: StatCardProps) {
  return (
    <Card
      className={cn(
        'min-w-[140px] flex-shrink-0',
        alert && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <Icon
            className={cn(
              'h-4 w-4 sm:h-5 sm:w-5',
              alert ? 'text-destructive' : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
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

export function SupervisorStats({ stats }: SupervisorStatsProps) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="space-y-4">
      {/* Primary stats - horizontal scroll on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-4 sm:overflow-visible scrollbar-hide">
        <StatCard
          label="Apeluri Active"
          value={stats.activeCalls}
          icon={Phone}
          alert={stats.activeCalls > 10}
        />
        <StatCard
          label="În Coadă"
          value={stats.callsInQueue}
          icon={PhoneIncoming}
          alert={stats.callsInQueue > 5}
          subtext={
            stats.callsInQueue > 0 ? `~${formatTime(stats.averageWaitTime)} așteptare` : undefined
          }
        />
        <StatCard
          label="Agenți Disponibili"
          value={`${stats.agentsAvailable}/${stats.agentsAvailable + stats.agentsBusy}`}
          icon={Users}
          alert={stats.agentsAvailable === 0}
        />
        <StatCard
          label="Nivel Serviciu"
          value={`${stats.serviceLevelPercent}%`}
          icon={CheckCircle2}
          trend={stats.serviceLevelPercent >= 90 ? 'up' : 'neutral'}
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-1">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">AI</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-semibold">{stats.aiHandledCalls}</span>
              <span className="text-[10px] text-muted-foreground">apeluri</span>
            </div>
            <Badge variant="outline" className="mt-1 text-[10px]">
              {stats.averageAiConfidence}% confidence
            </Badge>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Timp Mediu</span>
            </div>
            <div className="mt-1">
              <span className="text-lg font-semibold">{formatTime(stats.averageHandleTime)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">per apel</p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'col-span-1',
            stats.activeAlerts > 0 && 'border-amber-500/50 bg-amber-500/5'
          )}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-4 w-4',
                  stats.activeAlerts > 0 ? 'text-amber-500' : 'text-muted-foreground'
                )}
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">Alerte</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={cn('text-lg font-semibold', stats.activeAlerts > 0 && 'text-amber-600')}
              >
                {stats.activeAlerts}
              </span>
              {stats.activeAlerts > 0 && (
                <Badge variant="hot" className="text-[10px]">
                  Active
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Azi</span>
            </div>
            <div className="mt-1">
              <span className="text-lg font-semibold">{stats.callsHandledToday}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {stats.abandonedCalls} abandonate
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SupervisorStatsSkeleton() {
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <div className="h-16 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

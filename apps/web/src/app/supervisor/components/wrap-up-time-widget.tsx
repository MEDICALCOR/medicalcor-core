'use client';

/**
 * Wrap-Up Time Widget Component
 *
 * M10: Agent Wrap-Up Time Tracking UI
 * Displays wrap-up time metrics in the supervisor dashboard.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, Users, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import type { SupervisorDashboardStats } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface WrapUpTimeWidgetProps {
  stats: SupervisorDashboardStats;
}

type WrapUpSeverity = 'normal' | 'warning' | 'critical';

/**
 * Format seconds to human-readable time
 */
function formatDuration(seconds: number): string {
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

/**
 * Get wrap-up status severity based on duration
 */
function getWrapUpSeverity(seconds: number | undefined): WrapUpSeverity {
  if (!seconds) return 'normal';
  if (seconds > 300) return 'critical'; // > 5 minutes
  if (seconds > 180) return 'warning'; // > 3 minutes
  return 'normal';
}

/**
 * Get card border/background classes based on severity
 */
function getCardClasses(severity: WrapUpSeverity): string {
  const classes: Record<WrapUpSeverity, string> = {
    critical: 'border-destructive/50 bg-destructive/5',
    warning: 'border-amber-500/50 bg-amber-500/5',
    normal: '',
  };
  return classes[severity];
}

/**
 * Get icon color classes based on severity
 */
function getIconClasses(severity: WrapUpSeverity): string {
  const classes: Record<WrapUpSeverity, string> = {
    critical: 'text-destructive',
    warning: 'text-amber-500',
    normal: 'text-muted-foreground',
  };
  return classes[severity];
}

/**
 * Get text color classes based on severity
 */
function getTextClasses(severity: WrapUpSeverity): string {
  const classes: Record<WrapUpSeverity, string> = {
    critical: 'text-destructive',
    warning: 'text-amber-600',
    normal: '',
  };
  return classes[severity];
}

export function WrapUpTimeWidget({ stats }: WrapUpTimeWidgetProps) {
  const { agentsInWrapUp, wrapUpsToday, averageWrapUpTime, longestCurrentWrapUp } = stats;

  const severity = getWrapUpSeverity(longestCurrentWrapUp);
  const hasAgentsInWrapUp = agentsInWrapUp > 0;
  const showLongestWrapUp = longestCurrentWrapUp !== undefined && longestCurrentWrapUp > 0;

  return (
    <Card className={cn('transition-colors', getCardClasses(severity))}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Wrap-Up Time
          {hasAgentsInWrapUp && (
            <Badge
              variant={severity === 'critical' ? 'destructive' : 'outline'}
              className="ml-auto text-[10px]"
            >
              {agentsInWrapUp} {agentsInWrapUp === 1 ? 'agent' : 'agenți'} activi
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary metrics row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Agents in wrap-up */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" aria-hidden="true" />
              <span>În wrap-up</span>
            </div>
            <p className={cn('text-xl font-bold', hasAgentsInWrapUp && 'text-amber-600')}>
              {agentsInWrapUp}
            </p>
          </div>

          {/* Average wrap-up time */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>Timp mediu</span>
            </div>
            <p className="text-xl font-bold">{formatDuration(averageWrapUpTime)}</p>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Wrap-ups azi:</span>
            <span className="text-sm font-medium">{wrapUpsToday}</span>
          </div>

          {showLongestWrapUp && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className={cn('h-3 w-3', getIconClasses(severity))} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Max:</span>
              <span className={cn('text-sm font-medium', getTextClasses(severity))}>
                {formatDuration(longestCurrentWrapUp)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function WrapUpTimeWidgetSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-muted rounded animate-pulse" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            <div className="h-6 w-8 bg-muted rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            <div className="h-6 w-12 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

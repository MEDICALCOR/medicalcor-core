'use client';

/**
 * Breach Timeline Component
 *
 * Displays a timeline of SLA breaches for a queue.
 * Shows breach type, severity, duration, and resolution status.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Users,
  Phone,
  TrendingDown,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { SLABreachEvent } from '@medicalcor/types';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface BreachTimelineProps {
  breaches: SLABreachEvent[];
  showAll?: boolean;
}

export function BreachTimeline({ breaches, showAll = false }: BreachTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const displayedBreaches = showAll || expanded ? breaches : breaches.slice(0, 5);
  const hasMore = !showAll && breaches.length > 5;

  if (breaches.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Breach History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
            <p className="text-lg font-medium text-emerald-600">No Breaches</p>
            <p className="text-sm text-muted-foreground">
              This queue has maintained SLA compliance
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    }).format(date);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      return `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const getBreachIcon = (breachType: string) => {
    switch (breachType) {
      case 'wait_time_exceeded':
        return Clock;
      case 'queue_size_exceeded':
        return Phone;
      case 'abandon_rate_exceeded':
        return TrendingDown;
      case 'agent_availability_low':
        return Users;
      case 'service_level_missed':
        return Timer;
      default:
        return AlertTriangle;
    }
  };

  const getBreachLabel = (breachType: string) => {
    switch (breachType) {
      case 'wait_time_exceeded':
        return 'Wait Time Exceeded';
      case 'queue_size_exceeded':
        return 'Queue Size Exceeded';
      case 'abandon_rate_exceeded':
        return 'Abandon Rate High';
      case 'agent_availability_low':
        return 'Low Agent Availability';
      case 'service_level_missed':
        return 'Service Level Missed';
      default:
        return breachType;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Breach History
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {breaches.length} breach{breaches.length !== 1 ? 'es' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayedBreaches.map((breach) => {
            const Icon = getBreachIcon(breach.breachType);
            const isResolved = Boolean(breach.resolvedAt);
            const resolvedTime = breach.resolvedAt
              ? new Date(breach.resolvedAt).getTime()
              : Date.now();
            const duration =
              breach.durationSeconds ??
              Math.floor((resolvedTime - new Date(breach.detectedAt).getTime()) / 1000);

            return (
              <div
                key={breach.eventId}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  breach.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200',
                  isResolved && 'opacity-70'
                )}
              >
                <div
                  className={cn(
                    'p-2 rounded-full',
                    breach.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      breach.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{getBreachLabel(breach.breachType)}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        breach.severity === 'critical'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-amber-100 text-amber-700 border-amber-200'
                      )}
                    >
                      {breach.severity}
                    </Badge>
                    {isResolved && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200"
                      >
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{formatTime(new Date(breach.detectedAt))}</span>
                    <span>|</span>
                    <span>
                      {breach.currentValue.toFixed(1)} / {breach.threshold} threshold
                    </span>
                    {duration > 0 && (
                      <>
                        <span>|</span>
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatDuration(duration)}
                        </span>
                      </>
                    )}
                  </div>
                  {breach.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{breach.notes}</p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  {breach.alertSent && (
                    <Badge variant="outline" className="text-[10px]">
                      Alert Sent
                    </Badge>
                  )}
                  {breach.escalated && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700">
                      Escalated
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show All ({breaches.length - 5} more)
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function BreachTimelineSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-5 w-16 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-3 w-48 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

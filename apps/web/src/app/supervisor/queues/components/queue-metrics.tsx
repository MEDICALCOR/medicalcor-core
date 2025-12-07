'use client';

/**
 * Queue Metrics Component
 *
 * Displays detailed real-time metrics for a queue.
 * Shows SLA status, wait times, agent utilization, and service level.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Phone,
  Users,
  Clock,
  Activity,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Timer,
} from 'lucide-react';
import type { QueueSLAStatus, QueueSLAConfig } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface QueueMetricsProps {
  status: QueueSLAStatus;
  config: QueueSLAConfig;
}

export function QueueMetrics({ status, config }: QueueMetricsProps) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const getProgressColor = (value: number, warningThreshold: number, criticalThreshold: number) => {
    if (value >= criticalThreshold) return '[&>div]:bg-red-500';
    if (value >= warningThreshold) return '[&>div]:bg-amber-500';
    return '[&>div]:bg-emerald-500';
  };

  const waitTimePercent = Math.min(100, (status.longestWaitTime / config.criticalWaitTime) * 100);
  const queueSizePercent = Math.min(
    100,
    (status.currentQueueSize / config.criticalQueueSize) * 100
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Queue Status */}
      <Card
        className={cn(
          'border-l-4',
          status.severity === 'ok' && 'border-l-emerald-500',
          status.severity === 'warning' && 'border-l-amber-500',
          status.severity === 'critical' && 'border-l-red-500'
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {status.severity === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {status.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {status.severity === 'critical' && <XCircle className="h-4 w-4 text-red-500" />}
            Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {status.isCompliant ? 'Compliant' : 'Non-Compliant'}
              </span>
              <Badge
                variant={
                  status.severity === 'ok'
                    ? 'default'
                    : status.severity === 'warning'
                      ? 'outline'
                      : 'destructive'
                }
                className={cn(
                  status.severity === 'ok' && 'bg-emerald-100 text-emerald-700',
                  status.severity === 'warning' && 'bg-amber-100 text-amber-700 border-amber-200'
                )}
              >
                {status.severity.toUpperCase()}
              </Badge>
            </div>
            {status.breaches.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {status.breaches.map((breach) => (
                  <Badge key={breach} variant="outline" className="text-xs bg-red-50 text-red-700">
                    {formatBreachLabel(breach)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue Size */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Calls in Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span
                className={cn(
                  'text-3xl font-bold',
                  status.currentQueueSize > config.criticalQueueSize && 'text-red-600',
                  status.currentQueueSize > config.maxQueueSize &&
                    status.currentQueueSize <= config.criticalQueueSize &&
                    'text-amber-600'
                )}
              >
                {status.currentQueueSize}
              </span>
              <span className="text-sm text-muted-foreground">Max: {config.criticalQueueSize}</span>
            </div>
            <div className="space-y-1">
              <Progress
                value={queueSizePercent}
                className={cn(
                  'h-2',
                  getProgressColor(
                    status.currentQueueSize,
                    config.maxQueueSize,
                    config.criticalQueueSize
                  )
                )}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Warning: {config.maxQueueSize}</span>
                <span>Critical: {config.criticalQueueSize}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wait Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Longest Wait Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span
                className={cn(
                  'text-3xl font-bold',
                  status.longestWaitTime > config.criticalWaitTime && 'text-red-600',
                  status.longestWaitTime > config.maxWaitTime &&
                    status.longestWaitTime <= config.criticalWaitTime &&
                    'text-amber-600'
                )}
              >
                {formatTime(status.longestWaitTime)}
              </span>
              <span className="text-sm text-muted-foreground">
                Target: {formatTime(config.targetAnswerTime)}
              </span>
            </div>
            <div className="space-y-1">
              <Progress
                value={waitTimePercent}
                className={cn(
                  'h-2',
                  getProgressColor(
                    status.longestWaitTime,
                    config.maxWaitTime,
                    config.criticalWaitTime
                  )
                )}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Warning: {formatTime(config.maxWaitTime)}</span>
                <span>Critical: {formatTime(config.criticalWaitTime)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Availability */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Agent Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-3xl font-bold',
                  status.availableAgents < config.minAvailableAgents && 'text-amber-600'
                )}
              >
                {status.availableAgents}
              </span>
              <span className="text-lg text-muted-foreground">/ {status.totalAgents}</span>
              <span className="text-sm text-muted-foreground">available</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-emerald-50 rounded">
                <p className="text-lg font-semibold text-emerald-600">{status.availableAgents}</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div className="p-2 bg-amber-50 rounded">
                <p className="text-lg font-semibold text-amber-600">{status.busyAgents}</p>
                <p className="text-xs text-muted-foreground">Busy</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-lg font-semibold">
                  {status.totalAgents - status.availableAgents - status.busyAgents}
                </p>
                <p className="text-xs text-muted-foreground">Other</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Utilization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Agent Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span
                className={cn(
                  'text-3xl font-bold',
                  status.agentUtilization > 95 && 'text-red-600',
                  status.agentUtilization > config.targetAgentUtilization &&
                    status.agentUtilization <= 95 &&
                    'text-amber-600'
                )}
              >
                {Math.round(status.agentUtilization)}%
              </span>
              <span className="text-sm text-muted-foreground">
                Target: {config.targetAgentUtilization}%
              </span>
            </div>
            <Progress
              value={status.agentUtilization}
              className={cn(
                'h-3',
                status.agentUtilization <= config.targetAgentUtilization
                  ? '[&>div]:bg-emerald-500'
                  : status.agentUtilization <= 95
                    ? '[&>div]:bg-amber-500'
                    : '[&>div]:bg-red-500'
              )}
            />
            <p className="text-xs text-muted-foreground">
              {status.agentUtilization > config.targetAgentUtilization
                ? 'Consider adding more agents to handle load'
                : 'Utilization within target range'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Service Level */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Service Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span
                className={cn(
                  'text-3xl font-bold',
                  status.serviceLevel >= config.serviceLevelTarget && 'text-emerald-600',
                  status.serviceLevel < config.serviceLevelTarget &&
                    status.serviceLevel >= 60 &&
                    'text-amber-600',
                  status.serviceLevel < 60 && 'text-red-600'
                )}
              >
                {Math.round(status.serviceLevel)}%
              </span>
              <span className="text-sm text-muted-foreground">
                Target: {config.serviceLevelTarget}%
              </span>
            </div>
            <Progress
              value={status.serviceLevel}
              className={cn(
                'h-3',
                status.serviceLevel >= config.serviceLevelTarget
                  ? '[&>div]:bg-emerald-500'
                  : status.serviceLevel >= 60
                    ? '[&>div]:bg-amber-500'
                    : '[&>div]:bg-red-500'
              )}
            />
            <p className="text-xs text-muted-foreground">
              Calls answered within {formatTime(config.targetAnswerTime)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Daily Performance */}
      <Card className="sm:col-span-2 lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            Today's Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{status.callsHandledToday}</p>
              <p className="text-xs text-muted-foreground">Calls Handled</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p
                className={cn(
                  'text-2xl font-bold',
                  status.callsAbandonedToday > 0 && 'text-amber-600'
                )}
              >
                {status.callsAbandonedToday}
              </p>
              <p className="text-xs text-muted-foreground">Abandoned</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p
                className={cn(
                  'text-2xl font-bold',
                  status.abandonRate > config.maxAbandonRate && 'text-red-600'
                )}
              >
                {status.abandonRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">Abandon Rate</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{formatTime(status.averageWaitTime)}</p>
              <p className="text-xs text-muted-foreground">Avg Wait Time</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBreachLabel(breach: string): string {
  switch (breach) {
    case 'wait_time_exceeded':
      return 'Wait Time';
    case 'queue_size_exceeded':
      return 'Queue Size';
    case 'abandon_rate_exceeded':
      return 'Abandon Rate';
    case 'agent_availability_low':
      return 'Low Agents';
    case 'service_level_missed':
      return 'Service Level';
    default:
      return breach;
  }
}

export function QueueMetricsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              <div className="h-2 w-full bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
      <Card className="sm:col-span-2 lg:col-span-3">
        <CardHeader className="pb-2">
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="h-8 w-12 bg-muted rounded animate-pulse mx-auto" />
                <div className="h-3 w-16 bg-muted rounded animate-pulse mx-auto mt-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Clock,
  Users,
  TrendingDown,
  PhoneOff,
  Timer,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SLABreachEvent, BreachSummary, DailyBreachStats } from '../actions';
import { formatDistanceToNow } from 'date-fns';
import { ro } from 'date-fns/locale';

interface BreachAlertsProps {
  breaches: SLABreachEvent[];
}

interface BreachSummaryProps {
  summary: BreachSummary[];
}

interface BreachTrendChartProps {
  stats: DailyBreachStats[];
}

const BREACH_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; description: string }
> = {
  wait_time_exceeded: {
    label: 'Wait Time',
    icon: <Clock className="h-4 w-4" />,
    description: 'Customer wait time exceeded threshold',
  },
  queue_size_exceeded: {
    label: 'Queue Size',
    icon: <PhoneOff className="h-4 w-4" />,
    description: 'Queue size exceeded maximum capacity',
  },
  abandon_rate_exceeded: {
    label: 'Abandon Rate',
    icon: <TrendingDown className="h-4 w-4" />,
    description: 'Call abandonment rate too high',
  },
  agent_availability_low: {
    label: 'Agent Availability',
    icon: <Users className="h-4 w-4" />,
    description: 'Insufficient agents available',
  },
  service_level_missed: {
    label: 'Service Level',
    icon: <Timer className="h-4 w-4" />,
    description: 'Service level target not met',
  },
};

function formatTimeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: ro });
}

function BreachCard({ breach }: { breach: SLABreachEvent }) {
  const config = BREACH_TYPE_CONFIG[breach.breachType] ?? {
    label: breach.breachType,
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'SLA threshold exceeded',
  };

  const isResolved = !!breach.resolvedAt;

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-colors',
        isResolved
          ? 'bg-muted/50 border-muted'
          : breach.severity === 'critical'
            ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
            : 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'p-2 rounded-lg shrink-0',
            isResolved
              ? 'bg-muted text-muted-foreground'
              : breach.severity === 'critical'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                : 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400'
          )}
        >
          {isResolved ? <CheckCircle2 className="h-4 w-4" /> : config.icon}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{breach.queueName}</span>
            <Badge
              variant={isResolved ? 'secondary' : 'destructive'}
              className={cn(
                'text-[10px] shrink-0',
                !isResolved &&
                  breach.severity === 'warning' &&
                  'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
              )}
            >
              {isResolved ? 'Resolved' : breach.severity}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">{config.label}</p>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              Threshold: <span className="font-medium text-foreground">{breach.threshold}</span>
            </span>
            <span className="text-muted-foreground">
              Actual:{' '}
              <span
                className={cn(
                  'font-medium',
                  !isResolved && breach.currentValue > breach.threshold ? 'text-red-600' : ''
                )}
              >
                {breach.currentValue}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">
              {formatTimeAgo(breach.detectedAt)}
            </span>
            {breach.escalated && (
              <Badge variant="outline" className="text-[10px]">
                Escalated
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BreachAlerts({ breaches }: BreachAlertsProps) {
  const activeBreaches = breaches.filter((b) => !b.resolvedAt);
  const resolvedBreaches = breaches.filter((b) => b.resolvedAt);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Breach Alerts</CardTitle>
            {activeBreaches.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {activeBreaches.length} active
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            View All
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-y-auto pr-4">
          <div className="space-y-3">
            {activeBreaches.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active
                </p>
                {activeBreaches.map((breach) => (
                  <BreachCard key={breach.eventId} breach={breach} />
                ))}
              </div>
            )}

            {resolvedBreaches.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recently Resolved
                </p>
                {resolvedBreaches.slice(0, 5).map((breach) => (
                  <BreachCard key={breach.eventId} breach={breach} />
                ))}
              </div>
            )}

            {breaches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium">No SLA Breaches</p>
                <p className="text-xs text-muted-foreground">All queues are within SLA thresholds</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BreachSummaryPanel({ summary }: BreachSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Breach Summary (24h)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {summary.length > 0 ? (
            summary.map((item) => {
              const config = BREACH_TYPE_CONFIG[item.breachType] ?? {
                label: item.breachType,
                icon: <AlertTriangle className="h-4 w-4" />,
              };

              return (
                <div
                  key={item.breachType}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-background">{config.icon}</div>
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{item.count}</span>
                    {item.criticalCount > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {item.criticalCount} critical
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1" />
              <p className="text-xs text-muted-foreground">No breaches in the last 24 hours</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function BreachTrendChart({ stats }: BreachTrendChartProps) {
  const maxBreaches = Math.max(...stats.map((s) => s.totalBreaches), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Breach Trend (7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stats.map((day) => {
            const percentage = (day.totalBreaches / maxBreaches) * 100;
            const dateLabel = new Date(day.date).toLocaleDateString('ro-RO', {
              weekday: 'short',
              day: 'numeric',
            });

            return (
              <div key={day.date} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16 shrink-0">{dateLabel}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-red-500 h-full transition-all"
                      style={{ width: `${(day.criticalBreaches / maxBreaches) * 100}%` }}
                    />
                    <div
                      className="bg-orange-400 h-full transition-all"
                      style={{ width: `${(day.warningBreaches / maxBreaches) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-medium w-8 text-right">{day.totalBreaches}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-muted-foreground">Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-orange-400" />
            <span className="text-muted-foreground">Warning</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BreachAlertsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 rounded-lg border">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BreachSummarySkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-5 w-36 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 bg-muted animate-pulse rounded" />
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-6 w-8 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BreachTrendSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              <div className="flex-1 h-6 bg-muted animate-pulse rounded-full" />
              <div className="h-4 w-8 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

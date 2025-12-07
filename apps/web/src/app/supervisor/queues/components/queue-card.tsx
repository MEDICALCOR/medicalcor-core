'use client';

/**
 * Queue Card Component
 *
 * Displays a single queue's SLA status in a card format.
 * Shows key metrics and severity indicators.
 */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Phone,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import type { QueueSLAStatus } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface QueueCardProps {
  queue: QueueSLAStatus;
}

export function QueueCard({ queue }: QueueCardProps) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const getSeverityStyles = (severity: 'ok' | 'warning' | 'critical') => {
    switch (severity) {
      case 'ok':
        return {
          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          icon: CheckCircle2,
          iconColor: 'text-emerald-500',
          border: 'border-l-emerald-500',
        };
      case 'warning':
        return {
          badge: 'bg-amber-100 text-amber-700 border-amber-200',
          icon: AlertTriangle,
          iconColor: 'text-amber-500',
          border: 'border-l-amber-500',
        };
      case 'critical':
        return {
          badge: 'bg-red-100 text-red-700 border-red-200',
          icon: XCircle,
          iconColor: 'text-red-500',
          border: 'border-l-red-500',
        };
      default:
        return {
          badge: 'bg-muted text-muted-foreground border-muted',
          icon: CheckCircle2,
          iconColor: 'text-muted-foreground',
          border: 'border-l-muted',
        };
    }
  };

  const styles = getSeverityStyles(queue.severity);
  const StatusIcon = styles.icon;

  return (
    <Link href={`/supervisor/queues/${queue.queueSid}`}>
      <Card
        className={cn('hover:shadow-md transition-shadow cursor-pointer border-l-4', styles.border)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={cn('h-5 w-5', styles.iconColor)} aria-hidden="true" />
              <CardTitle className="text-base font-medium">{queue.queueName}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={styles.badge}>
                {queue.severity === 'ok'
                  ? 'Compliant'
                  : queue.severity === 'warning'
                    ? 'Warning'
                    : 'Critical'}
              </Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Queue Size */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" aria-hidden="true" />
                <span>In Queue</span>
              </div>
              <p className="text-lg font-semibold">{queue.currentQueueSize}</p>
            </div>

            {/* Wait Time */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>Longest Wait</span>
              </div>
              <p
                className={cn(
                  'text-lg font-semibold',
                  queue.longestWaitTime > 120 && 'text-amber-600',
                  queue.longestWaitTime > 300 && 'text-red-600'
                )}
              >
                {formatTime(queue.longestWaitTime)}
              </p>
            </div>

            {/* Agents */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" />
                <span>Agents</span>
              </div>
              <p className="text-lg font-semibold">
                <span className="text-emerald-600">{queue.availableAgents}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span>{queue.totalAgents}</span>
              </p>
            </div>

            {/* Service Level */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>Service Level</span>
              </div>
              <div className="flex items-center gap-2">
                <Progress
                  value={queue.serviceLevel}
                  className={cn(
                    'h-2 flex-1',
                    queue.serviceLevel >= 80
                      ? '[&>div]:bg-emerald-500'
                      : queue.serviceLevel >= 60
                        ? '[&>div]:bg-amber-500'
                        : '[&>div]:bg-red-500'
                  )}
                />
                <span className="text-sm font-medium">{Math.round(queue.serviceLevel)}%</span>
              </div>
            </div>
          </div>

          {/* Breach indicators */}
          {queue.breaches.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex flex-wrap gap-1">
                {queue.breaches.map((breach) => (
                  <Badge
                    key={breach}
                    variant="outline"
                    className="text-xs bg-red-50 text-red-700 border-red-200"
                  >
                    {formatBreachType(breach)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function formatBreachType(breach: string): string {
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

export function QueueCardSkeleton() {
  return (
    <Card className="border-l-4 border-l-muted">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-5 w-20 bg-muted rounded animate-pulse" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              <div className="h-6 w-12 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

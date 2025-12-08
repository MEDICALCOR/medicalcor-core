'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  PhoneCall,
  Clock,
  Users,
  AlertTriangle,
  ChevronRight,
  Activity,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueStatusWithAlerts } from '../actions';

interface QueueStatusListProps {
  queues: QueueStatusWithAlerts[];
}

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-300';
    case 'warning':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-orange-300';
    default:
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-300';
  }
}

function QueueDetailDialog({ queue }: { queue: QueueStatusWithAlerts }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {queue.queueName}
            <Badge className={getSeverityColor(queue.severity)}>
              {queue.severity === 'ok' ? 'Compliant' : queue.severity}
            </Badge>
          </DialogTitle>
          <DialogDescription>Queue SLA details and metrics</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 mt-4">
          {/* Current Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Queue Size</p>
              <p className="text-lg font-semibold">{queue.currentQueueSize}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Longest Wait</p>
              <p className="text-lg font-semibold">{formatWaitTime(queue.longestWaitTime)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Wait</p>
              <p className="text-lg font-semibold">
                {formatWaitTime(Math.round(queue.averageWaitTime))}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Service Level</p>
              <p className="text-lg font-semibold">{queue.serviceLevel}%</p>
            </div>
          </div>

          {/* Agent Metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Agent Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm">Available: {queue.availableAgents}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-sm">Busy: {queue.busyAgents}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-sm">Total: {queue.totalAgents}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm">
                    Utilization: {Math.round(queue.agentUtilization)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Today's Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Calls Handled</p>
                  <p className="text-lg font-semibold">{queue.callsHandledToday}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Calls Abandoned</p>
                  <p className="text-lg font-semibold text-red-600">{queue.callsAbandonedToday}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Abandon Rate</p>
                  <p
                    className={cn(
                      'text-lg font-semibold',
                      queue.abandonRate > 5 ? 'text-red-600' : 'text-emerald-600'
                    )}
                  >
                    {queue.abandonRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Breaches */}
          {queue.breaches.length > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Active SLA Breaches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {queue.breaches.map((breach) => (
                    <Badge key={breach} variant="destructive">
                      {breach.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QueueStatusList({ queues }: QueueStatusListProps) {
  const [sortBy, setSortBy] = useState<'severity' | 'queueSize' | 'waitTime'>('severity');

  const sortedQueues = [...queues].sort((a, b) => {
    if (sortBy === 'severity') {
      const severityOrder = { critical: 0, warning: 1, ok: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    if (sortBy === 'queueSize') {
      return b.currentQueueSize - a.currentQueueSize;
    }
    return b.longestWaitTime - a.longestWaitTime;
  });

  const criticalCount = queues.filter((q) => q.severity === 'critical').length;
  const warningCount = queues.filter((q) => q.severity === 'warning').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Queue Status</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {queues.length} queues
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-orange-500/50 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
              >
                {warningCount} warning
              </Badge>
            )}
            <div className="flex gap-1">
              <Button
                variant={sortBy === 'severity' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy('severity')}
              >
                Severity
              </Button>
              <Button
                variant={sortBy === 'queueSize' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy('queueSize')}
              >
                Queue Size
              </Button>
              <Button
                variant={sortBy === 'waitTime' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy('waitTime')}
              >
                Wait Time
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Queue Size</TableHead>
                <TableHead className="text-center">Wait Time</TableHead>
                <TableHead className="text-center">Agents</TableHead>
                <TableHead className="text-center">SL %</TableHead>
                <TableHead className="text-center">Alerts</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedQueues.length > 0 ? (
                sortedQueues.map((queue) => (
                  <TableRow
                    key={queue.queueSid}
                    className={cn(
                      queue.severity === 'critical' && 'bg-red-50/50 dark:bg-red-950/20',
                      queue.severity === 'warning' && 'bg-orange-50/50 dark:bg-orange-950/20'
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            queue.severity === 'critical'
                              ? 'bg-red-500 animate-pulse'
                              : queue.severity === 'warning'
                                ? 'bg-orange-500'
                                : 'bg-emerald-500'
                          )}
                        />
                        <span className="truncate max-w-[150px]">{queue.queueName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px]', getSeverityColor(queue.severity))}>
                        {queue.isCompliant ? 'Compliant' : queue.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <PhoneCall className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={cn(
                            'font-medium',
                            queue.currentQueueSize > 10 ? 'text-red-600' : ''
                          )}
                        >
                          {queue.currentQueueSize}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={cn(
                            'font-medium',
                            queue.longestWaitTime > 300
                              ? 'text-red-600'
                              : queue.longestWaitTime > 120
                                ? 'text-orange-600'
                                : ''
                          )}
                        >
                          {formatWaitTime(queue.longestWaitTime)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-emerald-600">{queue.availableAgents}</span>
                        <span className="text-muted-foreground">/</span>
                        <span>{queue.totalAgents}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {queue.serviceLevel >= 80 ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <span
                          className={cn(
                            'font-medium',
                            queue.serviceLevel >= 80 ? 'text-emerald-600' : 'text-red-600'
                          )}
                        >
                          {queue.serviceLevel}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {queue.alertCount > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {queue.alertCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <QueueDetailDialog queue={queue} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No queues configured
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function QueueStatusListSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-24 bg-muted animate-pulse rounded" />
            <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          </div>
          <div className="flex gap-1">
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
            <div className="h-7 w-20 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-0">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
              <div className="h-4 w-8 bg-muted animate-pulse rounded" />
              <div className="h-4 w-12 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              <div className="h-4 w-10 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

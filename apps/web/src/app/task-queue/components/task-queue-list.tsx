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
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  RotateCcw,
  Ban,
  PauseCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskQueueItem } from '../actions';
import { retryTaskAction, cancelTaskAction } from '../actions';

interface TaskQueueListProps {
  tasks: TaskQueueItem[];
  total: number;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatTime(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusConfig(status: TaskQueueItem['status']) {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        label: 'Pending',
        color: 'text-amber-500',
        bgColor: 'bg-amber-100 dark:bg-amber-900/40',
        borderColor: 'border-amber-300',
      };
    case 'running':
      return {
        icon: Loader2,
        label: 'Running',
        color: 'text-purple-500',
        bgColor: 'bg-purple-100 dark:bg-purple-900/40',
        borderColor: 'border-purple-300',
        animate: true,
      };
    case 'completed':
      return {
        icon: CheckCircle2,
        label: 'Completed',
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
        borderColor: 'border-emerald-300',
      };
    case 'failed':
      return {
        icon: XCircle,
        label: 'Failed',
        color: 'text-red-500',
        bgColor: 'bg-red-100 dark:bg-red-900/40',
        borderColor: 'border-red-300',
      };
    case 'cancelled':
      return {
        icon: PauseCircle,
        label: 'Cancelled',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100 dark:bg-gray-900/40',
        borderColor: 'border-gray-300',
      };
  }
}

function TaskDetailDialog({ task }: { task: TaskQueueItem }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const statusConfig = getStatusConfig(task.status);

  async function handleRetry() {
    setIsRetrying(true);
    await retryTaskAction(task.id);
    setIsRetrying(false);
  }

  async function handleCancel() {
    setIsCancelling(true);
    await cancelTaskAction(task.id);
    setIsCancelling(false);
  }

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
            <span className="font-mono text-sm">{task.id}</span>
            <Badge
              className={cn(statusConfig.bgColor, statusConfig.color, statusConfig.borderColor)}
            >
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>Task details and payload</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 mt-4">
          {/* Task Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Task Type</p>
              <p className="text-sm font-medium font-mono">{task.taskType}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Correlation ID</p>
              <p className="text-sm font-medium font-mono truncate">{task.correlationId}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-medium">{formatDuration(task.processingTimeMs)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Retry Count</p>
              <p className="text-sm font-medium">{task.retryCount}</p>
            </div>
          </div>

          {/* Timestamps */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Timestamps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-mono">{formatTime(task.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Started:</span>
                  <p className="font-mono">{formatTime(task.startedAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed:</span>
                  <p className="font-mono">{formatTime(task.completedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payload */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payload</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
                {JSON.stringify(task.payload, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Error */}
          {task.error && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600 dark:text-red-400">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-600 dark:text-red-400 font-mono">{task.error}</p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {task.status === 'failed' && (
              <Button onClick={handleRetry} disabled={isRetrying} size="sm">
                <RotateCcw className={cn('h-4 w-4 mr-2', isRetrying && 'animate-spin')} />
                {isRetrying ? 'Retrying...' : 'Retry Task'}
              </Button>
            )}
            {(task.status === 'pending' || task.status === 'running') && (
              <Button
                onClick={handleCancel}
                disabled={isCancelling}
                variant="destructive"
                size="sm"
              >
                <Ban className="h-4 w-4 mr-2" />
                {isCancelling ? 'Cancelling...' : 'Cancel Task'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskQueueList({ tasks, total }: TaskQueueListProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Recent Tasks</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {total} total
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Task ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Duration</TableHead>
                <TableHead className="text-center">Retries</TableHead>
                <TableHead className="text-center">Time</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length > 0 ? (
                tasks.map((task) => {
                  const statusConfig = getStatusConfig(task.status);
                  return (
                    <TableRow
                      key={task.id}
                      className={cn(
                        task.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20',
                        task.status === 'running' && 'bg-purple-50/50 dark:bg-purple-950/20'
                      )}
                    >
                      <TableCell className="font-mono text-xs">{task.id}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs truncate max-w-[180px] block">
                          {task.taskType}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={cn(
                            'text-[10px] gap-1',
                            statusConfig.bgColor,
                            statusConfig.color,
                            statusConfig.borderColor
                          )}
                        >
                          <statusConfig.icon
                            className={cn('h-3 w-3', statusConfig.animate && 'animate-spin')}
                          />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {formatDuration(task.processingTimeMs)}
                      </TableCell>
                      <TableCell className="text-center">
                        {task.retryCount > 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            {task.retryCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {formatTime(task.createdAt)}
                      </TableCell>
                      <TableCell>
                        <TaskDetailDialog task={task} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No tasks found
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

export function TaskQueueListSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="space-y-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
              <div className="h-4 w-12 bg-muted animate-pulse rounded" />
              <div className="h-4 w-8 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

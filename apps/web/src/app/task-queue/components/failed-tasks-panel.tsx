'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Clock, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { TaskQueueItem } from '../actions';
import { retryTaskAction } from '../actions';

interface FailedTasksPanelProps {
  tasks: TaskQueueItem[];
}

export function FailedTasksPanel({ tasks }: FailedTasksPanelProps) {
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (taskId: string) => {
    setRetrying(taskId);
    try {
      await retryTaskAction(taskId);
    } finally {
      setRetrying(null);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  };

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <CardTitle className="text-sm">Failed Tasks</CardTitle>
          <Badge variant="destructive" className="ml-auto text-[10px]">
            {tasks.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No failed tasks</p>
        ) : (
          <div className="h-[300px] overflow-y-auto pr-2 space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate" title={task.taskType}>
                      {task.taskType}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimeAgo(task.createdAt)}</span>
                      <span className="text-red-500">{task.retryCount} retries</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle className="font-mono text-sm">{task.taskType}</DialogTitle>
                          <DialogDescription>Task ID: {task.id}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Error</h4>
                            <pre className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs overflow-x-auto whitespace-pre-wrap">
                              {task.error ?? 'No error message available'}
                            </pre>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium mb-2">Payload</h4>
                            <pre className="p-3 rounded bg-muted text-xs overflow-x-auto">
                              {JSON.stringify(task.payload, null, 2)}
                            </pre>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Created: {task.createdAt.toLocaleString()}</span>
                            <span>Retry count: {task.retryCount}</span>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRetry(task.id)}
                      disabled={retrying === task.id}
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${retrying === task.id ? 'animate-spin' : ''}`}
                      />
                    </Button>
                  </div>
                </div>
                {task.error && (
                  <p className="mt-2 text-[10px] text-red-600 dark:text-red-400 line-clamp-2">
                    {task.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FailedTasksPanelSkeleton() {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-4 w-6 bg-muted animate-pulse rounded-full ml-auto" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-muted bg-muted/20">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-2 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="flex gap-1">
                  <div className="h-7 w-7 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-7 bg-muted animate-pulse rounded" />
                </div>
              </div>
              <div className="h-2 w-full bg-muted animate-pulse rounded mt-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

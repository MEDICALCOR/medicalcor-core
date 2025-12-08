'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { TaskTypeBreakdown as TaskTypeBreakdownType } from '../actions';

interface TaskTypeBreakdownProps {
  breakdown: TaskTypeBreakdownType[];
}

export function TaskTypeBreakdown({ breakdown }: TaskTypeBreakdownProps) {
  const maxTotal = Math.max(...breakdown.map((b) => b.total), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Task Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.slice(0, 8).map((item) => {
          const successRate =
            item.completed + item.failed > 0
              ? Math.round((item.completed / (item.completed + item.failed)) * 100)
              : 100;

          return (
            <div key={item.taskType} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono truncate max-w-[160px]" title={item.taskType}>
                  {item.taskType}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.total}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      successRate >= 95
                        ? 'border-emerald-500/50 text-emerald-600'
                        : successRate >= 90
                          ? 'border-amber-500/50 text-amber-600'
                          : 'border-red-500/50 text-red-600'
                    }`}
                  >
                    {successRate}%
                  </Badge>
                </div>
              </div>
              <div className="relative">
                <Progress value={(item.total / maxTotal) * 100} className="h-2" />
                {item.failed > 0 && (
                  <div
                    className="absolute top-0 h-2 bg-red-500 rounded-full"
                    style={{
                      width: `${(item.failed / maxTotal) * 100}%`,
                      left: `${((item.total - item.failed) / maxTotal) * 100}%`,
                    }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {item.completed} completed
                  {item.failed > 0 && (
                    <span className="text-red-500 ml-2">{item.failed} failed</span>
                  )}
                </span>
                <span>~{item.avgDurationMs}ms avg</span>
              </div>
            </div>
          );
        })}

        {breakdown.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No tasks processed</p>
        )}
      </CardContent>
    </Card>
  );
}

export function TaskTypeBreakdownSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              <div className="flex items-center gap-2">
                <div className="h-4 w-8 bg-muted animate-pulse rounded-full" />
                <div className="h-4 w-10 bg-muted animate-pulse rounded-full" />
              </div>
            </div>
            <div className="h-2 bg-muted animate-pulse rounded-full" />
            <div className="flex justify-between">
              <div className="h-2 w-20 bg-muted animate-pulse rounded" />
              <div className="h-2 w-16 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

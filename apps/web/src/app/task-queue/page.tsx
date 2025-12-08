import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Zap } from 'lucide-react';
import {
  getTaskQueueStatsAction,
  getTaskQueueItemsAction,
  getTaskTypeBreakdownAction,
  getFailedTasksAction,
} from './actions';
import { TaskQueueStats, TaskQueueStatsSkeleton } from './components/task-queue-stats';
import { TaskQueueList, TaskQueueListSkeleton } from './components/task-queue-list';
import { TaskTypeBreakdown, TaskTypeBreakdownSkeleton } from './components/task-type-breakdown';
import { FailedTasksPanel, FailedTasksPanelSkeleton } from './components/failed-tasks-panel';
import { TaskFilters } from './components/task-filters';

/**
 * Task Queue Management Dashboard (H9)
 *
 * Provides visibility and control over background job processing.
 * Monitors Trigger.dev tasks including:
 * - Embedding generation
 * - Payment attribution
 * - Lead scoring
 * - Notification dispatch
 * - GDPR erasure processing
 *
 * Features:
 * - Real-time task status monitoring
 * - Task type breakdown with success rates
 * - Failed task retry management
 * - Task filtering and search
 */

// =============================================================================
// Async Components for Streaming
// =============================================================================

async function StatsSection() {
  const stats = await getTaskQueueStatsAction();
  return <TaskQueueStats stats={stats} />;
}

async function TaskListSection({ status, taskType }: { status?: string; taskType?: string }) {
  const { items, total } = await getTaskQueueItemsAction({
    status: status as 'pending' | 'running' | 'completed' | 'failed' | 'all' | undefined,
    taskType,
    limit: 20,
  });
  return <TaskQueueList tasks={items} total={total} />;
}

async function TypeBreakdownSection() {
  const breakdown = await getTaskTypeBreakdownAction();
  return <TaskTypeBreakdown breakdown={breakdown} />;
}

async function FailedTasksSection() {
  const failedTasks = await getFailedTasksAction(5);
  return <FailedTasksPanel tasks={failedTasks} />;
}

// =============================================================================
// Page Component
// =============================================================================

interface PageProps {
  searchParams: Promise<{ status?: string; taskType?: string }>;
}

export default async function TaskQueuePage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Task Queue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor and manage background job processing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Zap className="h-3 w-3 text-amber-500" />
            <span className="hidden sm:inline">Trigger.dev</span>
          </Badge>
          <Badge variant="secondary" className="gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">30s refresh</span>
          </Badge>
        </div>
      </div>

      {/* Stats Overview */}
      <Suspense fallback={<TaskQueueStatsSkeleton />}>
        <StatsSection />
      </Suspense>

      {/* Filters */}
      <TaskFilters />

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Task List - Full width on mobile, 2/3 on desktop */}
        <div className="lg:col-span-2 space-y-4">
          <Suspense fallback={<TaskQueueListSkeleton />}>
            <TaskListSection status={params.status} taskType={params.taskType} />
          </Suspense>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Suspense fallback={<FailedTasksPanelSkeleton />}>
            <FailedTasksSection />
          </Suspense>

          <Suspense fallback={<TaskTypeBreakdownSkeleton />}>
            <TypeBreakdownSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Metadata
// =============================================================================

export const metadata = {
  title: 'Task Queue | MedicalCor Cortex',
  description: 'Background job monitoring and management dashboard',
};

// Enable dynamic rendering for real-time data
export const dynamic = 'force-dynamic';

'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server actions for Task Queue Management (H9)
 *
 * This module provides actions to monitor and manage Trigger.dev background tasks.
 * It integrates with the domain_events table to show task history and status.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TaskQueueStats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTimeMs: number;
  successRate: number;
}

export interface TaskQueueItem {
  id: string;
  taskType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  correlationId: string;
  payload: Record<string, unknown>;
  startedAt: Date | null;
  completedAt: Date | null;
  processingTimeMs: number | null;
  error: string | null;
  retryCount: number;
  createdAt: Date;
}

export interface TaskTypeBreakdown {
  taskType: string;
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
}

// ============================================================================
// MOCK DATA (For demo - in production this would query Trigger.dev API)
// ============================================================================

const TASK_TYPES = [
  'embed-content',
  'embed-batch',
  'payment-attribution-resolve',
  'ltv-record-payment-to-case',
  'lead-score-calculate',
  'whatsapp-message-handler',
  'voice-call-handler',
  'urgent-case-handler',
  'notification-dispatcher',
  'gdpr-erasure-process',
] as const;

const STATUSES: TaskQueueItem['status'][] = [
  'completed',
  'completed',
  'completed',
  'completed',
  'running',
  'pending',
  'failed',
];

const ERRORS = [
  'Connection timeout',
  'Rate limit exceeded',
  'Invalid payload',
  'Service unavailable',
] as const;

function generateMockTasks(count: number): TaskQueueItem[] {
  const tasks: TaskQueueItem[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const taskTypeIndex = Math.floor(Math.random() * TASK_TYPES.length);
    const statusIndex = Math.floor(Math.random() * STATUSES.length);
    const taskType = TASK_TYPES[taskTypeIndex] ?? 'embed-content';
    const status = STATUSES[statusIndex] ?? 'completed';
    const createdAt = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    const processingTime = Math.floor(Math.random() * 5000) + 100;

    tasks.push({
      id: `task_${crypto.randomUUID().slice(0, 8)}`,
      taskType,
      status,
      correlationId: `corr_${crypto.randomUUID().slice(0, 8)}`,
      payload: {
        leadId: `lead_${Math.random().toString(36).slice(2, 10)}`,
        clinicId: `clinic_${Math.random().toString(36).slice(2, 10)}`,
      },
      startedAt: status !== 'pending' ? new Date(createdAt.getTime() + 100) : null,
      completedAt:
        status === 'completed' || status === 'failed'
          ? new Date(createdAt.getTime() + processingTime)
          : null,
      processingTimeMs: status === 'completed' || status === 'failed' ? processingTime : null,
      error:
        status === 'failed'
          ? (ERRORS[Math.floor(Math.random() * ERRORS.length)] ?? 'Unknown error')
          : null,
      retryCount: status === 'failed' ? Math.floor(Math.random() * 3) + 1 : 0,
      createdAt,
    });
  }

  return tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Cache for demo data
let cachedTasks: TaskQueueItem[] | null = null;

function getTasks(): TaskQueueItem[] {
  cachedTasks ??= generateMockTasks(100);
  return cachedTasks;
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Get overall task queue statistics
 */
export function getTaskQueueStatsAction(): Promise<TaskQueueStats> {
  const tasks = getTasks();

  const completed = tasks.filter((t) => t.status === 'completed');
  const failed = tasks.filter((t) => t.status === 'failed');

  const totalProcessingTime = [...completed, ...failed].reduce(
    (sum, t) => sum + (t.processingTimeMs ?? 0),
    0
  );
  const processedCount = completed.length + failed.length;

  return Promise.resolve({
    totalTasks: tasks.length,
    pendingTasks: tasks.filter((t) => t.status === 'pending').length,
    runningTasks: tasks.filter((t) => t.status === 'running').length,
    completedTasks: completed.length,
    failedTasks: failed.length,
    avgProcessingTimeMs: processedCount > 0 ? Math.round(totalProcessingTime / processedCount) : 0,
    successRate:
      processedCount > 0 ? Math.round((completed.length / processedCount) * 100 * 10) / 10 : 100,
  });
}

/**
 * Get task queue items with filtering and pagination
 */
export function getTaskQueueItemsAction(options?: {
  status?: TaskQueueItem['status'] | 'all';
  taskType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: TaskQueueItem[]; total: number }> {
  let tasks = getTasks();

  // Filter by status
  if (options?.status && options.status !== 'all') {
    tasks = tasks.filter((t) => t.status === options.status);
  }

  // Filter by task type
  if (options?.taskType && options.taskType !== 'all') {
    tasks = tasks.filter((t) => t.taskType === options.taskType);
  }

  const total = tasks.length;
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  return Promise.resolve({
    items: tasks.slice(offset, offset + limit),
    total,
  });
}

/**
 * Get breakdown by task type
 */
export function getTaskTypeBreakdownAction(): Promise<TaskTypeBreakdown[]> {
  const tasks = getTasks();
  const breakdown = new Map<string, TaskTypeBreakdown>();

  for (const task of tasks) {
    const existing = breakdown.get(task.taskType) ?? {
      taskType: task.taskType,
      total: 0,
      completed: 0,
      failed: 0,
      avgDurationMs: 0,
    };

    existing.total++;
    if (task.status === 'completed') {
      existing.completed++;
      existing.avgDurationMs += task.processingTimeMs ?? 0;
    } else if (task.status === 'failed') {
      existing.failed++;
    }

    breakdown.set(task.taskType, existing);
  }

  // Calculate averages
  for (const item of breakdown.values()) {
    if (item.completed > 0) {
      item.avgDurationMs = Math.round(item.avgDurationMs / item.completed);
    }
  }

  return Promise.resolve(Array.from(breakdown.values()).sort((a, b) => b.total - a.total));
}

/**
 * Get failed tasks for retry management
 */
export function getFailedTasksAction(limit = 10): Promise<TaskQueueItem[]> {
  return Promise.resolve(
    getTasks()
      .filter((t) => t.status === 'failed')
      .slice(0, limit)
  );
}

/**
 * Retry a failed task (mock action)
 */
export function retryTaskAction(taskId: string): Promise<{ success: boolean; message: string }> {
  // In production, this would call Trigger.dev API to retry the task

  // Simulate retry
  const task = cachedTasks?.find((t) => t.id === taskId);
  if (task?.status === 'failed') {
    task.status = 'pending';
    task.retryCount++;
    task.error = null;
  }

  revalidatePath('/task-queue');

  return Promise.resolve({
    success: true,
    message: `Task ${taskId} queued for retry`,
  });
}

/**
 * Cancel a pending/running task (mock action)
 */
export function cancelTaskAction(taskId: string): Promise<{ success: boolean; message: string }> {
  // In production, this would call Trigger.dev API to cancel the task

  // Simulate cancel
  const task = cachedTasks?.find((t) => t.id === taskId);
  if (task && (task.status === 'pending' || task.status === 'running')) {
    task.status = 'cancelled';
  }

  revalidatePath('/task-queue');

  return Promise.resolve({
    success: true,
    message: `Task ${taskId} cancelled`,
  });
}

/**
 * Get list of available task types
 */
export function getTaskTypesAction(): Promise<string[]> {
  return Promise.resolve([...TASK_TYPES]);
}

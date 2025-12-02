/**
 * Worker/Trigger.dev Instrumentation Utilities
 *
 * Provides instrumentation helpers for Trigger.dev tasks and workflows.
 * Records metrics for task execution, queue depth, and workflow steps.
 */

import {
  workerTasksTotal,
  workerTaskDuration,
  workerTaskRetries,
  workerQueueDepth,
  workerQueueWaitTime,
  workerWorkflowsTotal,
  workerWorkflowDuration,
  workerWorkflowSteps,
  workerCronJobsTotal,
  workerCronJobDuration,
  workerActiveJobs,
  workerConcurrency,
  errorsTotal,
} from './metrics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskMetricsContext {
  taskName: string;
  startTime: number;
  queuedAt?: number;
}

export interface WorkflowMetricsContext {
  workflowName: string;
  startTime: number;
  steps: Map<string, number>;
}

// ============================================================================
// TASK INSTRUMENTATION
// ============================================================================

/**
 * Create a task metrics context to track task execution
 */
export function startTaskMetrics(taskName: string, queuedAt?: number): TaskMetricsContext {
  workerActiveJobs.inc({ worker: 'trigger' });

  // Record queue wait time if we know when it was queued
  if (queuedAt) {
    const waitTime = (Date.now() - queuedAt) / 1000;
    workerQueueWaitTime.observe(waitTime, { queue: 'default' });
  }

  return {
    taskName,
    startTime: performance.now(),
    queuedAt,
  };
}

/**
 * Complete task metrics recording
 */
export function completeTaskMetrics(
  ctx: TaskMetricsContext,
  status: 'success' | 'failure'
): number {
  const duration = (performance.now() - ctx.startTime) / 1000;

  workerTasksTotal.inc({ task: ctx.taskName, status });
  workerTaskDuration.observe(duration, { task: ctx.taskName });
  workerActiveJobs.dec({ worker: 'trigger' });

  return duration;
}

/**
 * Record a task retry
 */
export function recordTaskRetry(taskName: string, reason: string): void {
  workerTaskRetries.inc({ task: taskName, reason });
  workerTasksTotal.inc({ task: taskName, status: 'retry' });
}

/**
 * Higher-order function to wrap a task with metrics
 */
export function withTaskMetrics<T, P>(
  taskName: string,
  fn: (payload: P) => Promise<T>
): (payload: P & { _queuedAt?: number }) => Promise<T> {
  return async (payload: P & { _queuedAt?: number }) => {
    const ctx = startTaskMetrics(taskName, payload._queuedAt);

    try {
      const result = await fn(payload);
      completeTaskMetrics(ctx, 'success');
      return result;
    } catch (error) {
      completeTaskMetrics(ctx, 'failure');
      errorsTotal.inc({
        category: 'task',
        code: error instanceof Error ? error.name : 'UnknownError',
        service: 'trigger',
      });
      throw error;
    }
  };
}

// ============================================================================
// WORKFLOW INSTRUMENTATION
// ============================================================================

/**
 * Create a workflow metrics context
 */
export function startWorkflowMetrics(workflowName: string): WorkflowMetricsContext {
  return {
    workflowName,
    startTime: performance.now(),
    steps: new Map(),
  };
}

/**
 * Record the start of a workflow step
 */
export function startWorkflowStep(ctx: WorkflowMetricsContext, stepName: string): void {
  ctx.steps.set(stepName, performance.now());
}

/**
 * Complete a workflow step
 */
export function completeWorkflowStep(
  ctx: WorkflowMetricsContext,
  stepName: string,
  status: 'success' | 'failure'
): number {
  const startTime = ctx.steps.get(stepName);
  const duration = startTime ? (performance.now() - startTime) / 1000 : 0;

  workerWorkflowSteps.inc({
    workflow: ctx.workflowName,
    step: stepName,
    status,
  });

  return duration;
}

/**
 * Complete workflow metrics recording
 */
export function completeWorkflowMetrics(
  ctx: WorkflowMetricsContext,
  status: 'success' | 'failure'
): number {
  const duration = (performance.now() - ctx.startTime) / 1000;

  workerWorkflowsTotal.inc({ workflow: ctx.workflowName, status });
  workerWorkflowDuration.observe(duration, { workflow: ctx.workflowName });

  return duration;
}

/**
 * Higher-order function to wrap a workflow with metrics
 */
export function withWorkflowMetrics<T, P>(
  workflowName: string,
  fn: (payload: P, ctx: WorkflowMetricsContext) => Promise<T>
): (payload: P) => Promise<T> {
  return async (payload: P) => {
    const ctx = startWorkflowMetrics(workflowName);

    try {
      const result = await fn(payload, ctx);
      completeWorkflowMetrics(ctx, 'success');
      return result;
    } catch (error) {
      completeWorkflowMetrics(ctx, 'failure');
      errorsTotal.inc({
        category: 'workflow',
        code: error instanceof Error ? error.name : 'UnknownError',
        service: 'trigger',
      });
      throw error;
    }
  };
}

// ============================================================================
// CRON JOB INSTRUMENTATION
// ============================================================================

/**
 * Record cron job execution
 */
export function recordCronJobExecution(
  jobName: string,
  duration: number,
  status: 'success' | 'failure'
): void {
  workerCronJobsTotal.inc({ job: jobName, status });
  workerCronJobDuration.observe(duration, { job: jobName });
}

/**
 * Higher-order function to wrap a cron job with metrics
 */
export function withCronMetrics<T>(jobName: string, fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const startTime = performance.now();

    try {
      const result = await fn();
      const duration = (performance.now() - startTime) / 1000;
      recordCronJobExecution(jobName, duration, 'success');
      return result;
    } catch (error) {
      const duration = (performance.now() - startTime) / 1000;
      recordCronJobExecution(jobName, duration, 'failure');
      errorsTotal.inc({
        category: 'cron',
        code: error instanceof Error ? error.name : 'UnknownError',
        service: 'trigger',
      });
      throw error;
    }
  };
}

// ============================================================================
// QUEUE METRICS
// ============================================================================

/**
 * Update queue depth metrics
 */
export function updateQueueDepth(queue: string, priority: string, depth: number): void {
  workerQueueDepth.set(depth, { queue, priority });
}

/**
 * Update worker concurrency metrics
 */
export function updateWorkerConcurrency(worker: string, current: number, limit: number): void {
  workerConcurrency.set(current, { worker, type: 'current' });
  workerConcurrency.set(limit, { worker, type: 'limit' });
}

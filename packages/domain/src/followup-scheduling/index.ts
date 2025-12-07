/**
 * @fileoverview Follow-up Scheduling Module
 *
 * M9 Feature: Automated follow-up task creation after call dispositions.
 * Provides post-disposition follow-up task scheduling and management.
 *
 * @module domain/followup-scheduling
 */

// Domain Errors
export {
  FollowUpTaskNotFoundError,
  SnoozeNotAllowedError,
  MaxAttemptsReachedError,
  InvalidTaskStateError,
} from './followup-scheduling-service.js';

// Port Interface (Hexagonal Architecture)
export { type IFollowUpSchedulingRepository } from './followup-scheduling-service.js';

// Input Types
export {
  type ScheduleFromDispositionInput,
  type ScheduleManualFollowUpInput,
  type ProcessDueFollowUpsResult,
} from './followup-scheduling-service.js';

// Service Configuration
export {
  type FollowUpSchedulingServiceConfig,
  type FollowUpSchedulingServiceDeps,
  type FollowUpSchedulingLogger,
} from './followup-scheduling-service.js';

// Domain Service
export {
  FollowUpSchedulingService,
  createFollowUpSchedulingService,
} from './followup-scheduling-service.js';

// ============================================================================
// RE-EXPORTS FROM TYPES PACKAGE
// ============================================================================
// These are re-exported for convenience so consumers can import everything
// from the domain package.

export type {
  FollowUpTaskStatus,
  FollowUpTaskType,
  FollowUpTaskPriority,
  FollowUpChannel,
  FollowUpTask,
  CreateFollowUpTask,
  UpdateFollowUpTask,
  SnoozeFollowUpTask,
  CompleteFollowUpTask,
  RecordFollowUpAttempt,
  FollowUpSchedulingConfig,
  FollowUpTaskFilters,
  FollowUpTaskPagination,
  FollowUpTaskPaginatedResult,
  FollowUpTaskCreationPayload,
  FollowUpReminderPayload,
  ProcessDueFollowUpsPayload,
  FollowUpTaskCreatedEvent,
  FollowUpTaskCompletedEvent,
  FollowUpTaskOverdueEvent,
  FollowUpTaskSnoozedEvent,
  FollowUpReminderSentEvent,
  FollowUpTaskSummary,
  AgentFollowUpPerformance,
} from '@medicalcor/types';

// ============================================================================
// INFRASTRUCTURE ADAPTER NOTE
// ============================================================================
// The PostgresFollowUpSchedulingRepository implementation should be created
// in the infrastructure package (@medicalcor/infrastructure) following the
// Hexagonal Architecture pattern.
//
// Example:
// import { PostgresFollowUpSchedulingRepository } from '@medicalcor/infrastructure';
//
// This separation ensures domain logic remains independent of infrastructure.

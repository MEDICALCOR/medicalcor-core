/**
 * @fileoverview Follow-up Task Automation Module (M13)
 *
 * Domain module for automated follow-up task management in lead nurturing.
 * Provides task creation, scheduling, escalation, and lifecycle management.
 *
 * @module domain/follow-up
 *
 * @example
 * ```typescript
 * import {
 *   createFollowUpService,
 *   type IFollowUpService,
 *   type FollowUpTask,
 * } from '@medicalcor/domain/follow-up';
 *
 * const service = createFollowUpService({
 *   taskRepository,
 *   templateRepository,
 *   ruleRepository,
 * });
 *
 * // Create task from template
 * const result = await service.createFromTemplate('hot_lead_initial', {
 *   phone: '+40700000001',
 *   classification: 'HOT',
 *   score: 5,
 * });
 * ```
 */

// Events
export * from './events/index.js';

// Repositories
export * from './repositories/index.js';

// Service
export {
  createFollowUpService,
  DEFAULT_CONFIG as FOLLOW_UP_DEFAULT_CONFIG,
  type FollowUpServiceConfig,
  type FollowUpServiceDependencies,
  type LeadContext,
  type AutomationTriggerContext,
  type CreateTaskResult,
  type AutomationResult,
  type EscalationResult,
  type IFollowUpService,
  type FollowUpService,
} from './follow-up-service.js';
